# Tables grid pages

Checks [nextcloud/tables#3215](https://github.com/nextcloud/tables/pull/3215).
The PR adds grid pages to Tables applications:
- a page bar that follows the WAI-ARIA tabs pattern
- an Add page form with slug rules
- an edit mode for widgets: add, configure, move and resize, Save and Cancel, and a guard on unsaved changes
- page details and page deletion
- a read-only view for sharees

Each claim runs as a user journey in a default (pointer) profile and a keyboard-only
profile, against a digest-pinned Nextcloud 35.0.2.

```sh
SKIP_SETUP=1 scripts/run-job.sh nextcloud/tables/pr3215
```

It needs a journey-mesh release with:
- UJG RC4 models and declared Operability steps
- the operability observer and report
- the app-build options `composerScripts` and `composerIgnorePlatformReqs`

## What is built

`tables-source` resolves the PR head on every run. The PR is stacked on
#3214 → #3213 → … → #3133, all branches of `nextcloud/tables` itself, so building
the head builds the whole stack. Its `appinfo/info.xml` version is
`2.5.0-dev.2`, for Nextcloud 33–36.

`tables-build` needs two app-build options. Without them the app can't install or run:
- **`composerIgnorePlatformReqs: [ext-gd]`.** The locked PhpSpreadsheet 5.11.0
  requires `ext-gd`. The composer build image doesn't have it; the Nextcloud
  runtime image does. Without the option, `composer install` fails.
- **`composerScripts: true`.** Tables writes its scoped dependencies to `lib/Vendor/`
  (`OCA\Tables\Vendor\…`) with php-scoper, in composer `post-install-cmd`. That
  folder is gitignored. Without scripts, creating a table returns 500 and
  `nextcloud.log` says
  `Class "OCA\Tables\Vendor\Symfony\Component\Uid\Uuid" not found in …/lib/Db/Table.php`.
  Reproduced on the PR head `101ff07` before the option existed. Tables' own
  packaging (`krankerl.toml`) runs `composer install --no-dev` with scripts too.

## Journeys

The UJG documents in `ujg/` are the behavioral source of truth, one per test.
Each document holds:
- a setup login journey (phase `setup`, hidden from the report)
- for `page-viewer` and `page-missing-source`, a setup seed journey, in which the owner
  adds a data widget through the UI (the API can't address data sources)
- the evaluated journey

HTTP setup creates:
- the accounts
- the table `Tasks` with a `Title` column and the row "Write the report"
- the application `Team board`
- the grid pages the test needs

Cleanup deletes them all. Effect checks only read back.

| Test | Journey | Effect read back |
| --- | --- | --- |
| `page-add` | Open Team board from the navigation. Add page: title "Overview", slug `page_7` (invalid: the `page_N` form is reserved), then `page_7_overview`, the Person icon, a description. Submit. Overview is selected. Select Home, then Overview again. | Page `page_7_overview` has its title, description and icon `account` |
| `page-arrange` | Select Drafts (empty). Edit page. Add a header widget "Welcome". Add a "Table or view" widget: only Tasks is offered, not the table Archive outside the application. Open Actions for Tasks, then Make narrower and Move right. Close the menu, Save. Select Home, then Drafts again: both widgets show the row. | Drafts has 2 widgets: the header "Welcome", and the data widget at `gridX` 1 with `gridWidth` 11 |
| `page-cancel` | Select Drafts. Edit page, add a header widget, Cancel: empty again. Edit page, add a widget, select Home: "Discard unsaved changes?". Keep editing. Select Home again, then Discard changes: the start page shows. | Drafts has no widgets, after Cancel and after Discard |
| `page-manage` | Select Drafts. Page actions → Edit page details (slug read-only). Title "Drafts archive", Save. The tab and heading show it. Page actions → Delete page, then confirm. | The title is stored and the slug kept. After the deletion: page 404, table 200 |
| `page-viewer` | Setup: the owner puts a Tasks widget on "Shared overview". The application is shared read-only. The viewer opens it: the page bar has no Add page. Select Shared overview: the widget shows the row, and there is no Edit page and no Page actions. | none (read-only) |
| `page-missing-source` | Setup: the owner puts a "Gone soon" Tasks widget on Board. Select Board: the row shows. Open the navigation, then the application's Actions → Edit application. Remove Tasks from the resources and Save. The widget says "No table or view to show". In edit mode it asks to "Pick a table or view in the widget settings". | The widget keeps its title and has no source |

Seed journeys always use the default profile. Only the evaluated journeys vary by profile.

## Keyboard paths

Every keyboard and pointer transition declares its UJG RC4 Operability steps:
- **keyboard:** the Tab, Shift+Tab or arrow-key stops to the control, then the activation
- **pointer:** point at the control, then press
- **text fields** that don't already have focus: their Tab stops

The Playwright adapter performs exactly these steps, and the report's **Input
steps** page lists them with the keys used. The paths were taken from Tables at
`101ff07` on Nextcloud 35.0.2. If the PR changes a page's tab order, the first
step that no longer matches fails, and the error names the object that has focus.

The page bar uses the tabs pattern. Opening the application moves focus to the
main region, and one Tab reaches the selected tab. The paths use ArrowRight
(Drafts, Shared overview, Board), Home (back to the start page) and End (the last
tab, Overview).

Some steps use CSS locators where no accessible object identifies the target:
- the invalid slug field (`aria-invalid="true"`)
- the application's Actions button in the navigation: its accessible name is
  only "Actions"
- the "Pick a table or view" hint, which is a plain paragraph
- the viewer's read-only page: no Edit page and no Page actions, plus the row
- in the setup seeds only, the "Table or view" option, selected by its visible
  title (see the findings)

## Runtime

- Port `NEXTCLOUD_TABLES_PORT` (default 18446), Chromium at 1600×1000, locale en-US.
  The grid only offers move and resize at 12 columns, and the PR's own e2e uses
  this viewport.
- The owner and the viewer have separate touchpoints, so they get separate
  browser contexts.

## Current result

Local runs at `101ff07` (2026-11-23), with both profiles each:

- **Pass:** `page-add`, `page-cancel`, `page-manage`, `page-viewer`, `page-missing-source`.
- **Fail:** `page-arrange`, at "Choose Table or view" (finding 1). The
  remaining claims depend on that option, so they show as not reached:
  - move and resize
  - Save
  - the readback

A one-off verification run selected the option by its visible title instead.
With that, the rest of `page-arrange` passed in both profiles, including the
keyboard paths and the readback (`gridX` 1, `gridWidth` 11). Once the option
names are fixed, the job should pass unchanged.

## Findings

1. **Garbled option names in the Add widget dialog.** The "Widget type" options
   are named "Table o r view" and "Tables a nd views" in Chrome's accessibility
   tree, and screen readers would announce them that way. NcSelect splits each
   label into two spans for middle ellipsis. `page-arrange` names the intended
   option "Table or view" and fails there. The setup seeds select it by its
   visible title so the other tests can check their own claims.
2. **Icon button name.** After choosing the Person icon, the Icon button is named
   "Icon: account": the internal icon name, not the label the picker showed.
3. **Focus lost after Move right.** In Actions for a widget, "Move right" becomes
   disabled once used, and focus drops to the document while the menu stays open.
   Escape still closes the menu.
4. **Focus not returned after dialogs.** Saving Edit page details, and saving Edit
   application, leave no element focused. Keyboard users start again from the
   top of the page.
5. Opening an application collapses the app navigation, even at 1600 px. Reaching
   Edit application needs "Open navigation" first. This is recorded as
   observed; it may be intended.

## Not covered

- the 409 conflict on concurrent save
- right-to-left layouts in the product
- the `beforeunload` guard when closing the tab
- pointer drag and resize
- phone viewports and tab wrapping
- server-side 403 for sharees (part of #3133; this job makes no forbidden writes)
- these PR e2e cases: editing the application while a page is in edit mode, rows
  opened from a data widget, and the standalone `/apps/tables/app/{id}` address
