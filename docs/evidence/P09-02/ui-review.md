disposition: fix

Inputs unavailable or inapplicable: PRODUCT.md is absent under the explicitly quoted incumbent-extension allowance; no approved comp, comp-diff packet, new-world quality card or concept seed applies. No detector ran after launcher `cache_directory_failed`; this review inspected the actual source and final captures.

## persistence

Pass for this narrow extension. Existing DESIGN.md supplies the green/neutral tokens, Chinese system typography, navigation, rounded controls and light/dark behavior. P09-02.md supplies the product scope. The parent explicitly cites the governing skill allowance: “a narrow refinement of existing code proceeds on the incumbent implementation”; PRODUCT absence does not require product init here. No replacement world, comp election or new identity was claimed.

Evidence check passed: opened all six authoritative captures in `docs/evidence/P09-02/desktop/`: `terminal-light.png`, `window-light.png`, `terminal-dark.png`, `window-dark.png`, `failed-node.png`, `failed-python.png`. They are valid full-window captures of the declared desktop client widths, with upper/lower scroll positions rather than stitched full-page claims. No missing, blank or malformed required capture was found. Superseded `first-*.png` files were excluded. No mobile or iOS/Android target applies.

## fidelity

No approved comp applies; the matrix evaluates the incumbent DESIGN.md and task promises.

| Element or promise | Verdict | Evidence |
| --- | --- | --- |
| TYPE | match | Chinese labels inherit the incumbent system family and scale. Monospace is used for commands and actual output, with Chinese fallback in TerminalSurface; no decorative display face was introduced. |
| MATERIAL | match | Flat application surfaces, fine dividers and existing focus treatment agree with DESIGN.md. No photographic, painted or physical material was promised or imitated. |
| GROUND | match | Light and dark captures retain the incumbent white/green and dark green grounds. Terminal CSS and xterm theme reference `--code-surface`, `--ink`, `--accent-surface` and `--focus` rather than a separate palette. |
| Existing shell and reading order | match | Navigation remains intact. Environment, command/copy-relative directory, actions, history and selected output follow the task's operational order. |
| Environment preparation and recovery | match | Named preparation action, visible version/status, disabled execution until ready, dependency/license disclosure, and specific localized cache/download/lock/permission recovery are present in source. Preparation failure was not captured, so this row is source-reviewed. |
| Real checks and retained failure history | match | Both failed-language captures show nonzero exit codes and assertion traces. Later captures retain failed and cancelled records alongside successful records. The supplied E2E source and completed log support the demonstrated fixture flow; this frontend review does not independently certify backend isolation. |
| Compact history and meaningful controls | match | Rows use one command and a separate state/exit code, with selected background and red failed-history text. Run, language terminal, test presets, stop and log-page actions have real handlers and availability conditions. |
| Readable output at the narrower desktop width | contradicted | The rightmost Chinese glyphs are visibly cut by the output boundary in both dark captures. The lower capture also shows a partially cut bottom output row. Wrapper overflow is zero, but this does not establish that the terminal's cell grid fits inside it. See material fix 1. |
| Keyboard, input and accessible states | match | Native field labels/button semantics, `aria-pressed` history selection, live status/error regions, xterm screen-reader mode and named input are present. Theme focus, selection and caret treatment are supplied. The E2E source exercises actual Python input and stop; this reviewer did not run it. |
| Truth | match | Captures are identifiable P09-02 test-fixture work, with real process states and logs rather than fabricated success. No commercial claims or new raster assets were introduced. |

## ceiling

The incumbent Windows application language is the appropriate ceiling for this extension: native form semantics, restrained palette, compact records and direct output. No extra ornament, display treatment or concept motion is required. The terminal's own measured cell geometry remains unused in its fitting calculation; the resulting cropped output is below that ceiling. No added kicker, gradient text, decorative glass, heavy side stripe, glyph icon substitute or hard shadow was found in the reviewed extension.

## material_fixes

1. Fix the terminal grid fit, then recapture the same light/dark upper/lower paths: `packages/ui/src/terminal.tsx:53–64` estimates cells from a separate canvas and the host's client box, while `terminal.css:99–114` adds 12px vertical padding on each side and clips overflow; the row calculation subtracts only 12px, and the column calculation does not reserve xterm's scrollbar. Fit against xterm's actual cell dimensions and usable viewport, including padding and scrollbar space, so complete rightmost glyphs and the bottom row are visible at both required widths. Verify terminal screen/canvas bounds as well as wrapper overflow; `metrics.json`'s current zero wrapper overflow cannot detect this clipping. [Fidelity: readable real logs; floor: real content/responsive composition.]

## keep

Keep the incumbent shell/tokens, compact selectable history, explicit nonzero failures, real isolated-process controls, and bounded log paging while correcting terminal geometry.
