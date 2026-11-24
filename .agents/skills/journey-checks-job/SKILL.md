---
name: journey-checks-job
description: Create or update user-experience test jobs in journey-checks for any product journey-mesh can drive, using UJG JSON-LD and declarative journey-mesh configuration. Covers modeling the experience, declaring input steps, composing the mesh, and verifying execution evidence and reports.
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

Inspect installed mesh schemas and reusable plugins before choosing configuration fields. When a required abstraction is missing, plan its journey-mesh update first. Put shared implementation in the actual tool source checkout, resolving symlinks rather than editing a shadow copy.

Compose source, build, installation, services, fixtures, profiles, observers, and cleanup explicitly through supported mesh configuration. Declare the target repository and PR once. Keep reusable executable routines in plugins; do not add independent job-local action or assertion scripts. Effect readbacks only verify modeled effects; fixture mutations belong in explicit setup and cleanup.

Keep the job self-contained under `jobs/`. Follow repository conventions for dependencies, relative paths, and ignored run artifacts. Product knowledge belongs in the job's mesh.yaml and README, never in journey-mesh. That includes adapter options such as keys or transient interface, build options, and fixtures.

## Declare input steps

Adapters perform only the input steps the model declares, and strict profiles reject a transition without them in preflight. Never guess steps; find them on the running product.

1. Model the journeys, states and bindings first.
2. Where the test's adapters support discovery, run `journey-mesh discover`; see the [README](../../../README.md) and `journey-mesh --help`. Elsewhere, probe the running product.
3. Review every proposed path before declaring it: where it starts, what it passes, and whether a user would take it. If a path differs between profiles or between runs, the starting state is not repeatable. Fix the model or the adapter configuration, not the count.
4. Declare the reviewed paths, and add by hand what discovery cannot find. Repeat until preflight accepts every transition the profiles run.

Configure the observers and report interpreters that put the performed steps into the report.

## Report defects, don't hide them

Model the intended behavior. When the product deviates, let the evaluated journey fail and report the failure as a finding. Workarounds belong only in setup journeys. Never change a step, a wait or a locator to make a check pass without naming the defect it would hide.

## Verify and deliver

Run supported validation, then `scripts/run-job.sh <job-id>`. Rebuild the tool after source changes. Exercise relevant interaction profiles and available observers, checking observable goal completion as well as step outcomes.

Inspect the generated report itself: intended journeys, setup separation, layout on relevant viewports, modeled persona/touchpoint metadata, and configured observer evidence. Check displayed metrics against the saved bundle; expose rendering failures rather than accepting a silent fallback. Run relevant tool tests, including browser tests when rendering changes.

Deliver the repeat command, coverage and its sources, evidence location, tool prerequisites, and unresolved limitations. Distinguish functional outcomes, accessibility findings, and reporting failures; a successful process exit alone is insufficient.
