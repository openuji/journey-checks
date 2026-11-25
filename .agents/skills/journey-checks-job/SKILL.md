---
name: journey-checks-job
description: Create or update user-experience test jobs in journey-checks for any product journey-mesh can drive, using UJG JSON-LD and declarative journey-mesh configuration. Covers modeling the experience, discovering and declaring input steps, composing services and executors, and verifying execution evidence and reports.
---

# Create a journey-checks job

Start with the experience a person needs to complete, then produce a repeatable job and inspectable evidence.

## Define the experience

Read the [repository README](../../../README.md), job runner, and relevant product sources. Establish the user goal, personas, touchpoints, interaction modes, and observable success criteria within the requested scope. Trace expected behavior to the request, PR, or authoritative documentation. Ask about unresolved behavior instead of inventing additional requirements or checks.

## Model before execution

Use UJG JSON-LD as the behavioral source of truth. Apply the matching UJG modeling skill for the specification version supported by the installed compiler; if unavailable, consult that version's authoritative specification.

Model intended topology, observable states, command surfaces, input requirements, and effects before wiring execution. Keep identifiers traceable through the model, operations, and evidence. Distinguish setup from the experience being evaluated. Check that discovery and persona/touchpoint metadata survive the renderer contract. Execution order and screenshots must not invent graph edges.

Use the documents of an existing job under `jobs/` as a reference for document layout and naming, not for product behavior. You may write a throwaway generator or probe to produce the documents. It stays outside the repository: the committed JSON-LD is the source of truth, and later changes edit it directly.

## Check capabilities and compose

Inspect the installed tool before choosing configuration: its CLI help, its mesh schema, and the plugins and vendor packages it ships. The schema rejects unknown and renamed keys, so validate early and let its errors correct you. Take current configuration from the tool's examples, which its CI runs. An existing job shows layout, not necessarily the current keys.

When a required abstraction is missing, plan its journey-mesh update first. Integration that every job of a product reuses, such as its client and its build, stack and installation services, belongs in that product's vendor package. Capabilities that hold across products belong in the generic packages. Respect the tool's layer boundaries, and edit the actual source checkout, resolving symlinks rather than editing a shadow copy.

Compose source, build, installation, services, executors with their clients and observers, fixtures, profiles, and cleanup explicitly through supported mesh configuration. Declare the target repository and PR once. Keep reusable executable routines in plugins; do not add independent job-local action or assertion scripts. Effect readbacks only verify modeled effects; fixture mutations belong in explicit setup and cleanup.

Keep the job self-contained under `jobs/`. Follow repository conventions for dependencies, relative paths, and ignored run artifacts. Facts about this job stay in its mesh.yaml and README, never in journey-mesh: executor options such as keys or transient interface, build options, and fixtures.

## Declare input steps

Executors perform only the input steps the model declares, and strict profiles reject a transition without them in preflight. Never guess steps; find them on the running product.

1. Model the journeys, states and bindings first.
2. Where the test's executors have a discovery mode, run `journey-mesh discover`; see the [README](../../../README.md) and `journey-mesh --help`. Elsewhere, probe the running product.
3. Review every proposed path before declaring it: where it starts, what it passes, and whether a user would take it. Discovery proposes; it does not judge. If a path differs between profiles or between runs, the starting state is not repeatable. Fix the model or the executor configuration, not the count. A path that is not found can be a model binding error as well as a product defect; check which before reporting it.
4. Declare the reviewed paths, and add by hand what discovery cannot find. Repeat until preflight accepts every transition the profiles run.
5. When the product changes, measure declared paths again rather than editing them by hand.

Configure the observers and report interpreters that put the performed steps into the report. Where an executor cannot perform declared steps, record the lost coverage as a limitation in the job README and the delivery.

## Report defects, don't hide them

Model the intended behavior. When the product deviates, let the evaluated journey fail and report the failure as a finding. Workarounds belong only in setup journeys. Never change a step, a wait or a locator to make a check pass without naming the defect it would hide.

## Verify and deliver

Run supported validation, then `scripts/run-job.sh <job-id>`; the [README](../../../README.md) lists its prerequisites and how to view the report. Rebuild the tool after source changes. Exercise relevant interaction profiles and available observers, checking observable goal completion as well as step outcomes.

Inspect the generated report itself: intended journeys, setup separation, layout on relevant viewports, modeled persona/touchpoint metadata, and configured observer evidence. Check displayed metrics against the saved bundle; expose rendering failures rather than accepting a silent fallback. After changing the tool, run its own checks: types, architecture lint, and tests, including browser tests when rendering changes.

Deliver the repeat command, coverage and its sources, evidence location, tool prerequisites, and unresolved limitations. Distinguish functional outcomes, accessibility findings, and reporting failures; a successful process exit alone is insufficient.
