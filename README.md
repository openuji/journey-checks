# journey-checks

Runs journey checks against things we don't control (for example an open pull request of another project), using the **latest tagged release of [journey-mesh](https://github.com/openuji/journey-mesh)**, and publishes one brutally simple JSON per check:

```
https://openuji.github.io/journey-checks/<owner>/<repo>/<pr>.json
https://openuji.github.io/journey-checks/index.json            # every job in one file
```

```json
{
  "job": "nextcloud/server/pr66147",
  "succeeded": false,
  "finishedAt": "2026-11-18T03:21:07Z",
  "run": "https://github.com/openuji/journey-checks/actions/runs/123",
  "journeyMesh": { "ref": "v0.2.0", "sha": "…" },
  "target": { "pullRequest": 66147, "sourceSha": "…", "version": "36.0.0 dev" },
  "error": "only present when journey-mesh produced no usable result"
}
```

`succeeded` is `true` only if `journey-mesh test` exited `0` **and** its completed report says `ok: true`. The runner reads `manifest.json` and decodes the summary it references, including summaries split across files. A failing check is a published result (`succeeded: false`), not a crash. The workflow run is also marked red in that case. The full report (`index.html`, `manifest.json`, `data/`, and screenshots) is the `evidence-<job>` artifact of the run.

## How a run works

`.github/workflows/check.yml` runs daily and on demand (`workflow_dispatch`, optionally with a `journey_mesh_ref` to run a specific journey-mesh tag, branch or SHA).

1. **plan** lists every job (`jobs/**/job.json`) and resolves the journey-mesh version once: the input, else the newest `vX.Y.Z` tag (`scripts/latest-tag.sh`), else `main` with a warning.
2. **check** (one per job) checks out journey-mesh at that version and runs `scripts/run-job.sh <job>`. The script builds the checkout (`pnpm install && pnpm build`), runs `pnpm install` here to link it, then `journey-mesh test jobs/<job>/<mesh> --test <test>` with the mesh **in place**, then `scripts/write-result.mjs`.
3. **publish** collects every result and deploys them to GitHub Pages.

The mesh composes the subject from reusable services: Git source → build → installation. Each source declares its repository and PR once; every run resolves the current head and passes the same identity to its dependents. `target` selects a verified installed identity for the published result. This works for both the Nextcloud server PR and the Collectives app PR.

These composed jobs require the journey-mesh service-input/output, HTTP-environment, and report updates included in [journey-mesh PR #16](https://github.com/openuji/journey-mesh/pull/16). All browser behavior comes from the UJG JSON-LD models; HTTP effect checks only read back their declared effects. Report phase exclusions are declared explicitly in each mesh.

## Add a job

Use the [journey-checks-job skill](.agents/skills/journey-checks-job/SKILL.md) to author and verify a job from its user goal and UJG model through execution evidence and the rendered report.

A job is a directory under `jobs/` containing a `job.json`. Its id is the path below `jobs/`, by convention `<owner>/<repo>/<pr>`.

```
jobs/nextcloud/server/pr66147/
├─ job.json                   {"mesh": "pr66147.mesh.yaml", "test": "browser-sharing"}
├─ pr66147.mesh.yaml          the mesh; every path in it is inside this folder
├─ ujg/                       the journeys it runs
└─ deployment/                compose files, environment defaults, fixtures
```

**A job is self-contained.** Its mesh names only files in its own folder, so the job runs from where it lies and no job files are copied into the journey-mesh checkout. Services manage their own temporary build copies and container artifacts. Run state (`out/`, `.runtime/`, `.tmp/`) is written inside the job folder and is gitignored.

journey-mesh is only the **tool**. This repo's `package.json` links its CLI and plugin packages from a checkout at `./journey-mesh`. That is how the mesh's `use: "@openuji/…"` entries resolve. If a new job needs another plugin package, add it there.

- `mesh`: the mesh file, relative to the job folder.
- `test`: optional `--test` id.

## Run a job locally

This is the exact script CI runs.

```sh
git clone --depth 1 --branch <release-with-service-composition> https://github.com/openuji/journey-mesh.git journey-mesh   # gitignored
JOURNEY_MESH_REF=<release-with-service-composition> scripts/run-job.sh nextcloud/server/pr66147
```

Needs Docker, Node 22, pnpm, jq, and `127.0.0.1 host.docker.internal` in `/etc/hosts`. The result lands in `site-part/<job>.json`, the report in `jobs/<job>/out/index.html`. Set `SKIP_SETUP=1` to skip install and build on repeat runs.

After building the journey-mesh checkout, run `pnpm test` to check result extraction and the runner's success and failure exit statuses.
