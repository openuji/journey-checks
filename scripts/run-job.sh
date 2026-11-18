#!/usr/bin/env bash
# Run one job end to end and write its result. CI and local runs use this same script.
#
#   scripts/run-job.sh <job-id>            e.g. nextcloud/server/pr66147
#
# A job is self-contained: jobs/<job-id>/ holds the mesh and every file it uses (journeys,
# compose files, env, fixtures). journey-mesh is only the tool: a checkout at ./journey-mesh
# whose packages this repo links in package.json. The mesh is run in place; nothing is copied.
#
# What it does:
#   1. builds journey-mesh (pnpm install + build), installs Chromium, then pnpm install here
#   2. journey-mesh test jobs/<job-id>/<mesh> [--test <test>] --output <OUT>
#   3. writes RESULT (always, even when 1 or 2 failed)
#
# job.json: { "mesh": "<mesh file in the job folder>", "test": "<optional --test id>" }
#
# Environment (all optional):
#   JOURNEY_MESH_REF   ref recorded in the result      default: git describe of ./journey-mesh
#   OUT                report and evidence directory    default: jobs/<job-id>/out
#   RESULT             result JSON                      default: site-part/<job-id>.json
#   SKIP_SETUP=1       skip the installs and the build (already done)
#
# Exit status: 0 if the job succeeded, 1 if it did not, 2 if the job is misconfigured.
set -uo pipefail

die() { echo "run-job: $*" >&2; exit 2; }

job="${1:-}"
[ -n "$job" ] || die "usage: run-job.sh <job-id>"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
jobdir="$root/jobs/$job"
spec="$jobdir/job.json"
[ -f "$spec" ] || die "no such job: $job (missing $spec)"

mesh="$(jq -er '.mesh' "$spec")" || die "$spec needs a \"mesh\" (the mesh file in the job folder)"
test_id="$(jq -r '.test // empty' "$spec")"
[ -f "$jobdir/$mesh" ] || die "mesh file not found: $jobdir/$mesh"

mesh_dir="$root/journey-mesh"
[ -d "$mesh_dir" ] || die "journey-mesh checkout not found at $mesh_dir (see README: Run a job locally)"
out="${OUT:-$jobdir/out}"
mkdir -p "$out" && out="$(cd "$out" && pwd)"
result="${RESULT:-$root/site-part/$job.json}"
ref="${JOURNEY_MESH_REF:-$(git -C "$mesh_dir" describe --tags --always 2>/dev/null || echo unknown)}"

echo "run-job: $job with journey-mesh $ref"

setup() {
  (
    set -e
    cd "$mesh_dir"
    pnpm install --frozen-lockfile
    pnpm build
    pnpm --filter @openuji/journey-adapter-playwright exec playwright install ${CI:+--with-deps} chromium
    cd "$root"
    pnpm install --frozen-lockfile
  )
}

# A stale bundle must never be mistaken for this run's.
rm -f "$out/bundle.json"

exit_code=""
if [ -n "${SKIP_SETUP:-}" ] || setup; then
  args=(test "jobs/$job/$mesh" --output "$out")
  [ -z "$test_id" ] || args+=(--test "$test_id")
  (cd "$root" && pnpm exec journey-mesh "${args[@]}")
  exit_code=$?
else
  echo "run-job: setup failed, journey-mesh did not run" >&2
fi

result_args=(--job "$job" --exit "$exit_code" --bundle "$out/bundle.json" --out "$result" --ref "$ref"
  --sha "$(git -C "$mesh_dir" rev-parse HEAD 2>/dev/null || true)")
[ -z "${GITHUB_RUN_ID:-}" ] || result_args+=(--run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID")
node "$root/scripts/write-result.mjs" "${result_args[@]}" || die "could not write the result"

echo "run-job: result $result"
cat "$result"
jq -e '.succeeded == true' "$result" >/dev/null
