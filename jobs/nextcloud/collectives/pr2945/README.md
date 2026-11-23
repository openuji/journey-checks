# Collectives sharing permissions

The mesh builds the current Collectives PR head, installs it into a fresh,
digest-pinned Nextcloud 35.0.2 instance, and records the verified installed SHA.
The repository and PR are declared once, in `collectives-source`.

```sh
SKIP_SETUP=1 scripts/run-job.sh nextcloud/collectives/pr2945
```

Requires a journey-mesh release with:
- UJG 1.0 RC4 models and declared Operability steps
- service composition and the HTTP environment plugin

Release that prerequisite before publishing these jobs to the daily workflow.
For a development checkout, build and install it as described in the repository
README. Docker and `host.docker.internal` must be reachable.

The ten UJG JSON-LD documents (RC4) are the behavioral source of truth. Each
defines login and sharing journeys, observable states, command surfaces, input
modalities and effect identities. Both interaction profiles execute those
compiled journeys.

Every command declares its Operability steps:
- **pointer:** point at it and press
- **keyboard:** the Tab, Shift+Tab or arrow-key stops, then the activation
- **text fields that need focus first:** their Tab stops

The keyboard paths were taken from Collectives at `6236504` on Nextcloud 35.0.2,
and the report's **Input steps** page lists them with the keys used. Opening the
sidebar leaves no element focused, so the path to its Sharing tab runs backwards
through the page from where the Open sidebar button was. A change in tab order
fails the first step that no longer matches, and the error names the focused
object.
The mesh supplies credentials/input values, runtime bindings, fixtures, and effect
readbacks. It contains no independent browser test or test-action script.

Each document explicitly catalogues its entries and labels its touchpoint and
steps. The mesh's `report.excludedPhaseIds` hides the setup phase from the journey
map; login still executes and its evidence remains available. Scenario nodes show
the recorded axe page/surface counts, alongside touchpoint and persona chips.

Coverage, for both collective and page links:

- Eligible owners create, customize, and revoke links.
- Members see other members' attributed, read-only links without management actions.
- Collective administrators can revoke another member's link but cannot customize it.
- Sharing restrictions hide the Sharing tab and limit returned shares to the owner.
- Editing restrictions remove customization while preserving revocation.
- Revocation removes the listing and blocks both Collectives and underlying public URLs.

HTTP setup creates ordinary owner/admin/member accounts, memberships, a page, and
labeled links. The instance administrator only provisions accounts. HTTP effect
checks are read-only and verify capability flags and persisted effects declared
in the UJG. This job does not attempt forbidden API writes independently of the
model. Screenshots and axe findings accompany functional results; axe is non-strict.

Cleanup removes each profile's fixtures, then the managed stack removes its owned
containers and volumes. Working directories and reports are gitignored.

The mesh explicitly disables brute-force protection on this disposable stack:
checking revoked public URLs intentionally generates many invalid-token requests
from one runner. This fixture setting prevents later checks from receiving 429
instead of observing the modeled revoked-link result. It applies only to the
owned test instance. `NEXTCLOUD_COLLECTIVES_PORT` overrides its default port 18445.
