# UI redesign — confirmed direction

## Direction contract

- THESIS: TapKit is a local agent client. Preserve every existing page, input, action, list and backend contract while replacing the visual hierarchy. Operate and Read are the visitor modes.
- OWN-WORLD: White content surfaces, pale desaturated green frame/sidebar and user bubbles; charcoal text, restrained green active states. One system font family, consistent controls, quiet dividers and visible keyboard focus. Dark and system themes use the same semantic tokens.
- STORY: Pick or create a conversation from a full sidebar, read the answer, compose a follow-up, and open a fixed-version file or result beside it when needed. All existing settings and advanced operations remain reachable.
- FIRST VIEWPORT: Product icon and TapKit identity at the top of a resizable 260px sidebar containing projects, pinned/recent conversations and navigation. Main content is white with a quiet header and centered reading column. Composer anchors the conversation. Optional right panel becomes a workbench without replacing the conversation.
- FORM: User selected lightweight conversation plus expandable workbench, using the uploaded Codex screenshot as a layout reference. User-pinned direction; no random concept selection. Code-led implementation. Existing browser-operation capabilities remain at their actual development status.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope and evidence

- Baseline: main `5268fc03c822388d26cd0a4cf7f157f9a6b3ae1c`; clean workspace. Branch `codex/ui-redesign`.
- Editable product code: renderer presentation, renderer styles/locales/assets and shared UI rendering only. No main/preload, Core, Storage, providers, contracts, native code, schemas or IPC changes.
- Preserve actual content and all handlers, validation, visibility conditions, pending/unavailable states and permission boundaries.
- Coverage: home; chat/work; history/pin/group/archive/trash/search; six project views; library/import/details/version/folder/storage dialogs; all viewer formats/annotations; personal/general/personalization/connections/models/privacy/agreement; memory and checkpoint views; developer diagnostics; all errors/empty/loading/confirmations.
- Visual verification: real isolated Electron app captures at 1440/1200/960, light/dark, expanded panel and 200% zoom. Use existing functional E2E regressions, plus presentation coverage assertions. Synthetic profiles only.
- Product icon: user identified the current Electron window icon in a screenshot. Reused the unchanged icon from the pinned Electron 44.3.0 distribution; source/license recorded beside the asset. No T placeholder remains in application chrome.
- Sources read: AGENTS; CURRENT/INDEX/P04-03; 02-decisions; P02-01 task; 12-interaction-details §§1–4; 08-quality-and-tests §§1–3. Impeccable context launcher failed (exit 1, missing batch label), so repository context is read directly.
