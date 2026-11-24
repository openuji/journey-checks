---
name: journey-checks-job
description: Create or update user-experience test jobs in journey-checks for any product journey-mesh can drive, using UJG JSON-LD and declarative journey-mesh configuration. Covers declaring keyboard and pointer paths with `journey-mesh discover`, and verifying execution evidence and reports.
---

# Create a journey-checks job

Start with the experience a person needs to complete, then produce a repeatable job and inspectable evidence.

## Define the experience

Read the [repository README](../../../README.md), job runner, and relevant product sources. Establish the user goal, personas, touchpoints, interaction modes, and observable success criteria within the requested scope. Trace expected behavior to the request, PR, or authoritative documentation. Ask about unresolved behavior instead of inventing additional requirements or checks.

## Model before execution

Use UJG JSON-LD as the behavioral source of truth. Apply the matching UJG modeling skill for the specification version supported by the installed compiler; if unavailable, consult that version's authoritative specification.

Model intended topology, observable states, command surfaces, input requirements, and effects before wiring execution. Keep identifiers traceable through the model, operations, and evidence. Distinguish setup from the experience being evaluated. Check that discovery and persona/touchpoint metadata survive the renderer contract. Execution order and screenshots must not invent graph edges.

Use the documents of an existing job under `jobs/` as the reference for layout and naming. You may write a throwaway generator or probe to produce the documents. It stays outside the repository: the committed JSON-LD is the source of truth, and later changes edit it directly.

## Check capabilities and compose

Inspect installed mesh schemas and reusable plugins before choosing configuration fields. When a required abstraction is missing, plan its journey-mesh update first. Put shared implementation in the actual tool source checkout, resolving symlinks rather than editing a shadow copy.

Compose source, build, installation, services, fixtures, profiles, observers, and cleanup explicitly through supported mesh configuration. Declare the target repository and PR once. Keep reusable executable routines in plugins; do not add independent job-local action or assertion scripts. Effect readbacks only verify modeled effects; fixture mutations belong in explicit setup and cleanup.

Keep the job self-contained under `jobs/`. Follow repository conventions for dependencies, relative paths, and ignored run artifacts. Product knowledge (keys that differ from the defaults, `transientUi`, build options, fixtures) belongs in the job's mesh.yaml and README, never in journey-mesh.

## Declare input paths

Every keyboard, pointer and text-entry transition a web profile runs needs a `TransitionMaterialization`. The Playwright adapter performs only declared steps, and a profile fails preflight when steps are missing. Find the steps on the running product; never guess a count.

1. Model the journeys, states and bindings without materializations.
2. Run `node_modules/.bin/journey-mesh discover jobs/<owner>/<repo>/<pr>/<pr>.mesh.yaml --test <id>`, for example `jobs/nextcloud/tables/pr3215/pr3215.mesh.yaml`. Optionally add `--profile <combination>`. It runs the test in the discovery mode of its adapter. The job's own browser, viewport, `keyboard` and `transientUi` options apply. Profiles don't require steps during the run, and observers are left out. It reports:
   - the shortest Tab or Shift+Tab walk to each bound object, with arrow keys inside tab lists, menus, listboxes, trees and radio groups
   - point-and-press for pointer transitions
   - which objects could not be reached, and which paths differ between profiles

   The findings are written to `<outputDir>/discover/materializations.json`.
3. Review every path before declaring it: where focus started, the objects walked past, and whether a keyboard user would take that walk. A path that differs between profiles, or crosses a notification, means the starting state is not repeatable. Fix the model or declare `transientUi`; don't adjust the count.
4. Run discover again with `--apply`. It declares the paths through the suite's model plugin, which writes them into the test's UJG documents, then runs preflight again. Repeat until nothing is undeclared, then run the job.
5. Declare by hand what discovery cannot know, such as an Escape `ShortcutStep` that closes a menu, or a `materializationStartLocatorRef`. Discovery performs declared steps as declared and finds only the missing ones.
6. When the product changes its tab order, `--rediscover` measures the declared paths again. With `--apply`, it replaces them.

Discovery is Web only: only the Playwright adapter has a discovery mode. A test with any journey on another adapter is rejected with a configuration error (exit 2) before any service starts. That includes Appium on Android, even when the test also has Web journeys, so select Web tests with `--test`. Android touch profiles set `requireMaterialization: false`. For the Web journeys of a mixed test, probe the running stack and declare their steps by hand. Configure `@openuji/journey-observer-operability` and `@openuji/journey-report-operability` so the report shows the steps performed.

## Report defects, don't hide them

Model the intended behavior. When the product deviates, let the evaluated journey fail and report the failure as a finding. Examples: a garbled or internal accessible name, focus lost after an action, a control missing from the tab order. Workarounds, such as selecting an option by CSS when its accessible name is broken, belong only in setup journeys. Never change a count, a wait or a locator to make a check pass without naming the defect it would hide.

## Verify and deliver

Run supported validation, then `scripts/run-job.sh <job-id>`. Rebuild the tool after source changes. Exercise relevant interaction profiles and available observers, checking observable goal completion as well as step outcomes.

Inspect the generated report itself: intended journeys, setup separation, layout on relevant viewports, modeled persona/touchpoint metadata, and configured observer evidence. Check displayed metrics against the saved bundle; expose rendering failures rather than accepting a silent fallback. Run relevant tool tests, including browser tests when rendering changes.

Deliver the repeat command, coverage and its sources, evidence location, tool prerequisites, and unresolved limitations. Distinguish functional outcomes, accessibility findings, and reporting failures; a successful process exit alone is insufficient.
