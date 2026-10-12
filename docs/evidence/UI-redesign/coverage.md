# UI-01 coverage and verification

Baseline main: `5268fc03c822388d26cd0a4cf7f157f9a6b3ae1c`. Branch: `codex/ui-redesign`. All captures use isolated synthetic profiles; no real model requests or personal profile data. The original P00–P04 implementation/live statuses are unchanged.

| Surface | Preserved interaction coverage | Actual visual evidence |
| --- | --- | --- |
| Home and shell | new chat/work/project/temporary, examples, navigation configuration, sidebar resize/collapse, search, profile/settings, connection status, forward/back/home | home-light-1440, navigation-0..4, search-dialog |
| Conversation | send, stop, queue, drafts, paste/import, fixed references, copy/quote, branches, regenerate/edit, notes/feedback, memory scope, checkpoint, recovery | conversation-light-1440, workbench-light-1440; existing P02/P04 regression captures |
| Input | mode/model, attachments/references, expand/collapse/clear, limits/tool information, snippets, keyboard/IME and draft preservation | input-actions-menu, composer-input-960-200, composer-light-960-200 |
| History | pinned/recent list, groups, drag/reorder, metadata, archive/trash, pagination/search, batch/deletion/export/new-window | navigation-0, regression/P02-03/branches-and-feedback, archived-search-location |
| Projects | list/create, six tabs (sessions/tasks/materials/sources/outputs/settings), project-only scope, material/index states, deletion and export | project-0..5, regression/P03-03/settings/materials/scope/deletion |
| File library | list/grid/filter/sort, folders/scopes, import/cancel/retry/recovery, version/detail, originals, storage, batch operations | navigation-3, viewer captures, regression/P03-01/import-recovery/scoped-pinned-library/generated-note-library |
| Workbench/viewer | persistent fixed-version tabs, full screen, content/source/diff, PDF/Office/page/selection/annotations, sheet/image/ZIP, download/share/external copy | viewer-pdf/markdown/code/sheet/image/zip, workbench-1200/960, existing native PDF/Office regression captures |
| Settings and diagnostics | personal/general/personalization/connections/models/privacy/agreement, every field/save/reload, API and subscription accounts, reasoning/routing/usage/probes | settings-0..5, models-usage, api-accounts, subscription-accounts, settings-dark-1440, settings-controls-960-200 |
| Memory/checkpoints | filled entries, search/edit/delete/clear/undo, policy scope, source deletion/retention, summary correction/continuation | regression/P04-03/memory-management/automatic-memory/session-deletion-impact/temporary-scope, regression/P04-02/summary-corrected |

## Source boundary

`source-boundary.json` compares Babel AST inventories with the baseline: all original routes, interactive controls and event handlers retained; command literals unchanged; no modified main/preload/Core/Storage/providers/contracts/context/retrieval/tools/network/workflow/native source. Shared Markdown changes only choose light/dark syntax colors. Existing rendering sanitizers and sandbox behavior are unchanged.

## Actual checks

- `pnpm build:desktop`: first production build exit 0; all later Electron test runs restore production output after fixture builds.
- `pnpm check`: source type/format/boundary/manifest checks exit 0. Final documentation synchronization is checked separately at handoff.
- `pnpm test:unit`: 293/293, exit 0.
- `pnpm test:integration P02-01.desktop P03-02.artifacts P03-03.projects P04-03.memory`: 45/45, exit 0.
- First full `pnpm test:e2e`: 64/66. Old tests had ambiguous project text after adding the full project list, and assumed Home on restored account windows. Precise main-region locator and explicit Home navigation corrected; original assertions retained. Targeted repeat 2/2, exit 0.
- Final compact-composer subset: three full UI surface cases plus existing two-turn/history/safe Markdown cases 6/6, exit 0.
- Production-only input-menu and filled 200% draft case: 1/1, exit 0.
- Final full `pnpm test:e2e`: 67/67, exit 0, on the compact-composer version. After the three pure visual review corrections, `pnpm test:e2e -- --grep 'P02-01 UI'` passed all four cases, including normal/200% dialog geometry, exit 0. The additional primary-action hover correction then passed all five UI cases, including actual hover/keyboard contrast and successful Save (`ui-final.log`, exit 0). Source boundary and retained handlers were rechecked.
- Visual review: new full review plus one correction batch scored three findings resolved; the additional Save hover finding was corrected, recaptured and independently scored resolved. Ship verdicts cover the named fix scopes. See [review](review.md).

## Failures retained

`visual-first.log` records the initial 1/3 UI run (route-mount race and thumbnail canvas selector). `visual-confirm.log` records 3/3 after corrections. First captures exposed legacy stylesheet order, corrected by importing the final design sheet after structural styles in main.tsx. `zoom-recapture.log` records a failed 200% visibility assertion; compact input disclosures corrected the actual layout, and `composer-final.log` plus `input-controls.log` verify it. The original incorrectly framed zoom capture was superseded rather than counted as valid evidence.

Impeccable's context launcher failed (missing batch label), so project context was read directly. First finish review returned `recapture`; a new full review receives the corrected full packet, not a verdict-only pass. The current Electron icon is reused unchanged with MIT provenance and license beside the asset.

No commit/push/merge, no external CI polling, no capability/live-state upgrades, and no later-stage implementation are included in this work.

This page records the validation snapshot. The later user-authorized commit/push handoff is recorded in [UI-01](../../progress/UI-01.md). Captured text logs have only line-ending/trailing whitespace normalized for Git delivery; command output, failing runs and recorded outcomes are retained.
