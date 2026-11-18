---
name: journey-checks-job
description: Create or update user-experience test jobs in journey-checks using UJG JSON-LD and declarative journey-mesh configuration, and verify their execution evidence and reports.
---

# Create a journey-checks job

Start with the experience a person needs to complete, then produce a repeatable job and inspectable evidence.

## Define the experience

Read the [repository README](../../../README.md), job runner, and relevant product sources. Establish the user goal, personas, touchpoints, interaction modes, and observable success criteria within the requested scope. Trace expected behavior to the request, PR, or authoritative documentation. Ask about unresolved behavior instead of inventing additional requirements or checks.

## Model before execution

Use UJG JSON-LD as the behavioral source of truth. Apply the matching UJG modeling skill for the specification version supported by the installed compiler; if unavailable, consult that version's authoritative specification.

Model intended topology, observable states, command surfaces, input requirements, and effects before wiring execution. Keep identifiers traceable through the model, operations, and evidence. Distinguish setup from the experience being evaluated. Check that discovery and persona/touchpoint metadata survive the renderer contract. Execution order and screenshots must not invent graph edges.

## Check capabilities and compose

Inspect installed mesh schemas and reusable plugins before choosing configuration fields. When a required abstraction is missing, plan its journey-mesh update first. Put shared implementation in the actual tool source checkout, resolving symlinks rather than editing a shadow copy.

Compose source, build, installation, services, fixtures, profiles, observers, and cleanup explicitly through supported mesh configuration. Declare the target repository and PR once. Keep reusable executable routines in plugins; do not add independent job-local action or assertion scripts. Effect readbacks only verify modeled effects; fixture mutations belong in explicit setup and cleanup.

Keep the job self-contained under `jobs/`. Follow repository conventions for dependencies, relative paths, and ignored run artifacts.

## Verify and deliver

Run supported validation, then `scripts/run-job.sh <job-id>`. Rebuild the tool after source changes. Exercise relevant interaction profiles and available observers, checking observable goal completion as well as step outcomes.

Inspect the generated report itself: intended journeys, setup separation, layout on relevant viewports, modeled persona/touchpoint metadata, and configured observer evidence. Check displayed metrics against the saved bundle; expose rendering failures rather than accepting a silent fallback. Run relevant tool tests, including browser tests when rendering changes.

Deliver the repeat command, coverage and its sources, evidence location, tool prerequisites, and unresolved limitations. Distinguish functional outcomes, accessibility findings, and reporting failures; a successful process exit alone is insufficient.
