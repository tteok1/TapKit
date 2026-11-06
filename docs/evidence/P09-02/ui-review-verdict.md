## verdict

- Material fix 1 — resolved. Reopened all six original authoritative capture paths; each is a valid updated full-window capture. Complete rightmost Chinese glyphs and the bottom grid row are now visible in `window-light.png` and `window-dark.png`. Updated TerminalSurface measures xterm's rendered cells and usable inner viewport instead of a separate canvas estimate. The supplied metrics corroborate screen bounds: 843×293 inside 849×306 at client width 1347, and 558×293 inside 565×306 at client width 967; wrapper overflow remains zero. The supplied `e2e-review-fix.log` records the complete tagged desktop case passing; this reviewer did not run tests.
- Fix-batch regression 1 — open. Both lower window captures and both failed-language captures now expose a solid black strip beneath the shorter terminal grid, including on the light theme. The roughly 13px unused height matches the new 306px available viewport minus the 293px grid. The geometry correction exposed an unthemed lower viewport/gutter; paint that whole area and its scrollbar track with the incumbent terminal surface tokens. The output itself must remain fully visible.

## remaining

Regression 1 remains: remove the newly exposed black terminal gutter in both themes and recapture the same paths. This pass scores the single original grid-fitting fix and regressions introduced by its correction; it does not reopen the broader surface review. Historical `first-*` and `pre-review-*` captures were excluded.

disposition: fix
