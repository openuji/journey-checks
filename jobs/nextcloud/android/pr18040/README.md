# Android Teams

Checks [nextcloud/android#18040](https://github.com/nextcloud/android/pull/18040),
which adds Teams screens, team creation, invitations and navigation to team
resources, as a two-person journey on two Android emulators against a
digest-pinned Nextcloud 35.0.2.

```sh
JAVA_HOME=<JDK 21> JAVA_HOME_17_ARM64=<JDK 17> SKIP_SETUP=1 scripts/run-job.sh nextcloud/android/pr18040
```

## What is built

The app PR includes the library PR through `includeBuild("../android-library")`,
so neither builds alone. Two Git sources resolve both PR heads on every run:
`app-source` ([nextcloud/android#18040](https://github.com/nextcloud/android/pull/18040))
and `library-source` ([nextcloud/android-library#2209](https://github.com/nextcloud/android-library/pull/2209)).
`app-build` lays them out side by side and runs the app's Gradle wrapper
(`assembleGenericDebug`). The app needs JDK 21 (`JAVA_HOME`); the library's
Gradle toolchain needs JDK 17 (`JAVA_HOME_17_X64` or `JAVA_HOME_17_ARM64`). The
result's `target` is the built APK's identity: the app PR head and its
`versionName`. Provenance separates the current app/library selection from the historical build.
It records resolved JDKs, the actual Gradle/JVM and executed JavaCompile task
compilers, and the signed APK checksum. Cache reuse is explicit and includes the
resolved tool fingerprints. Other task toolchains remain unknown.

For this locally managed device pool, Appium preserves the APK signature. Before
the first modeled interaction on each device, an ADB inspection pulls the installed
base APK and compares its bytes, package and version with the built APK. The
comparison is recorded as execution-scoped evidence; a mismatch fails the run.

The server is Nextcloud 35.0.2 with groupfolders 23.0.1, built from its pinned
commit and installed by the existing app services, so creating a team also
creates its team folder.

## Journey

The UJG documents in `ujg/` are the behavioral source of truth. Setup logs both
people in through the app's browser login (phase `setup`, hidden from the map).
Each journey opens its modeled entry by activating the app:

| Phase | Journey | Effect read back from the server |
| --- | --- | --- |
| Create | Alice creates "Journey Team" | Alice owns it (level 9), config 0 |
| Invite | Alice turns on "Members need to accept invitation" in the team settings page the app opens | config 32 (Circles `CFG_INVITE`) |
| Invite | Alice adds Bob from the Members tab | Bob's membership is `Invited` |
| Accept | Bob accepts under Teams → Invitations | Bob's membership is `Member`, level 1 |
| Verify | Alice sees Bob on the Members tab | none; the readbacks above are the state |
| Access | Bob opens the team folder from Resources; Files shows it | none |

HTTP setup only creates the two accounts. Effect checks are read-only.

## Runtime

Each person has an emulator from the `devices` pool. One Appium server drives
both. `adb reverse` makes each device reach the stack as its own
`localhost:18447`, the same URL the server generates, so no host address has
to be configured. `NEXTCLOUD_TEAMS_PORT` and `APPIUM_PORT` override the ports.

Two settings adapt the test environment, not the product:

- `no_unsupported_browser_warning`: the API 35 image ships Android System
  WebView 124, below Nextcloud 35's supported browsers, so the in-app team
  settings page would otherwise only show a warning.
- `allowInvisibleElements` on both devices: the settings page's displayed "Open
  navigation" button sits under an off-screen ancestor, which Appium's default
  traversal skips. Locators still require `@displayed='true'`.

## Current result

With activation-only entry navigation, the latest local validation passes 49 of
104 steps and fails at "Files are shown" after Alice creates the team. The app
remains on the Teams screen when activated; the old generic cold restart had
hidden this entry-state assumption. The modeled invitation and acceptance steps
remain unexecuted in this run. No restart workaround was added to the adapter.

Both devices' installed APKs matched the built APK's package, version code,
version name and SHA-256. The target was app head `b2582a1`, "35.2.0 Alpha 51";
provenance retained the actual Gradle/JVM and JavaCompile compiler observations
from the build. Debug APKs are not byte-reproducible across rebuilds.

This host needed `WDIO_USE_NATIVE_FETCH=1` for WebdriverIO's transport; the
ordinary transport also failed against an isolated local mock. This was a local
validation setting, not a mesh or product change.

## Findings encoded in the model

- "Create team" and "Add member" have no accessible name. Both are drawn, but
  their labels are absent from the Android accessibility tree, and they are
  missing from the default tree altogether. "Create team" is located
  structurally as the only button of the Teams content. "Add member" is
  modeled by its intended name; it is one of three identical unnamed buttons
  on the Members tab, so the journey stops there until the app exposes it.
- After Alice invites Bob, the app's Members tab labels him "Member" while the
  server reports `Invited`; the model only checks that Bob is listed.
- The team settings dialog renders its switches outside a phone-width viewport,
  also in current Chromium. Alice turns the setting on through its label.
