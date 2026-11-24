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
  "journeyMesh": { "ref": "v0.3.0", "sha": "…" },
  "target": { "pullRequest": 66147, "sourceSha": "…", "version": "36.0.0 dev" },
  "error": "only present when journey-mesh produced no usable result"
}
```

`succeeded` is `true` only if `journey-mesh test` exited `0` **and** its completed run record says `ok: true`. The runner uses journey-mesh's run-record reader to load `run.json` and its referenced test records. A failing check is a published result (`succeeded: false`), not a crash. The workflow run is also marked red in that case. The run record, derived report (`report/report.json`), and evidence files are the `evidence-<job>` artifact of the run.

## How a run works

`.github/workflows/check.yml` runs daily and on demand (`workflow_dispatch`, optionally with a `journey_mesh_ref` to run a specific journey-mesh tag, branch or SHA).

1. **plan** discovers job directories from `jobs/**/*.mesh.yaml` and resolves the journey-mesh version once: the input, else the newest `vX.Y.Z` tag (`scripts/latest-tag.sh`), else `main` with a warning.
2. **check** (one per job) checks out journey-mesh at that version and runs `scripts/run-job.sh <job>`. The script builds the checkout (`pnpm install && pnpm build`), runs `pnpm install` here to link it, then `journey-mesh test jobs/<job>/<mesh>` with the mesh **in place**, running every test in its suite, then `scripts/write-result.mjs`.
3. **publish** collects every result and deploys them to GitHub Pages.

The mesh composes the subject from reusable services: Git source → build → installation. Each source declares its repository and PR once; every run resolves the current head and passes the same identity to its dependents. `target` selects a verified installed identity for the published result. This works for both the Nextcloud server PR and the Collectives app PR.

The jobs need a journey-mesh release with all of the following:
- UJG 1.0 RC4 models
- declared Operability steps
- the operability observer and report (`@openuji/journey-observer-operability`, `@openuji/journey-report-operability`)
- the app-build options `composerScripts` and `composerIgnorePlatformReqs`, which the Tables job uses

All browser behavior comes from the UJG JSON-LD models. HTTP effect checks only read back their declared effects. Each mesh declares its report phase exclusions explicitly.

**Keyboard and pointer paths are declared, not inferred.** Every keyboard or pointer transition in a web model carries a `TransitionMaterialization`:
- the Tab, Shift+Tab or arrow-key stops, or the pointer target, leading to the control
- then the activation

The Playwright adapter performs exactly these steps, and the report's **Input steps** page shows them. A profile fails before any service starts when a transition it runs has no steps. To find the stops, run the test on a running stack with `journey-mesh discover`. It reports each missing path, and `--apply` declares the reviewed paths in the model:

```sh
node_modules/.bin/journey-mesh discover jobs/<owner>/<repo>/<pr>/<pr>.mesh.yaml --test <id>           # report
node_modules/.bin/journey-mesh discover jobs/<owner>/<repo>/<pr>/<pr>.mesh.yaml --test <id> --apply   # declare
```

Discovery is an authoring aid and never runs in CI. It is Web only: a test with a journey on another adapter, such as the Android job's Appium journeys, is rejected before anything starts. See the [Playwright adapter](https://github.com/openuji/journey-mesh/blob/main/packages/journey-adapter-playwright/README.md#finding-paths). Android models declare no steps, and their touch profile sets `requireMaterialization: false`.

## Add a job

Use the [journey-checks-job skill](.agents/skills/journey-checks-job/SKILL.md) to author and verify a job, from its user goal and UJG model to the execution evidence and the rendered report. The skill works for any product journey-mesh can drive.

A job is a directory under `jobs/` containing one `*.mesh.yaml`. The mesh defines the suite and all tests to run. Its job id is the directory path below `jobs/`, by convention `<owner>/<repo>/<pr>`.

```
jobs/nextcloud/server/pr66147/
├─ pr66147.mesh.yaml          the mesh; every path in it is inside this folder
├─ ujg/                       the journeys it runs
└─ deployment/                compose files, environment defaults, fixtures
```

**A job is self-contained.** Its mesh names only files in its own folder, so the job runs from where it lies and no job files are copied into the journey-mesh checkout. Services manage their own temporary build copies and container artifacts. Run state (`out/`, `.runtime/`, `.tmp/`) is written inside the job folder and is gitignored.

journey-mesh is only the **tool**. This repo's `package.json` links its CLI and plugin packages from a checkout at `./journey-mesh`. That is how the mesh's `use: "@openuji/…"` entries resolve. If a new job needs another plugin package, add it there.

## Run a job locally

This is the exact script CI runs.

```sh
git clone --depth 1 --branch <release-with-service-composition> https://github.com/openuji/journey-mesh.git journey-mesh   # gitignored
JOURNEY_MESH_REF=<release-with-service-composition> scripts/run-job.sh nextcloud/server/pr66147
```

Needs Docker, Node 22, pnpm, jq, and `127.0.0.1 host.docker.internal` in `/etc/hosts`. The result lands in `site-part/<job>.json`, the run record and report in `jobs/<job>/out/`. View them with `pnpm --dir journey-mesh --filter @openuji/report-renderer serve "$PWD/jobs/<job>/out"`. Set `SKIP_SETUP=1` to skip install and build on repeat runs.

After building the journey-mesh checkout, run `pnpm test` to check result extraction and the runner's success and failure exit statuses.
