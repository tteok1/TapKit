## verdict

Reopened all six original authoritative captures: `terminal-light.png`, `window-light.png`, `terminal-dark.png`, `window-dark.png`, `failed-node.png`, and `failed-python.png`. All are valid updated full-window captures; historical captures were excluded.

- Original clipping — resolved. The lower light/dark captures show complete rightmost Chinese glyphs and a complete bottom output row. The actual-cell fitting correction remains in source. Recorded grid bounds remain 843×293 within 849×306 and 558×293 within 565×306, with zero wrapper overflow.
- Introduced black gutter — resolved. The black strip is absent in both lower window captures and both failed-language captures. Terminal CSS now themes the whole xterm viewport with `--code-surface`; recorded viewport and surface colors agree in light (`rgb(246, 248, 246)`) and dark (`rgb(21, 27, 23)`). No regression from this gutter correction was observed.

## remaining

Clear. This ship covers the scored fixes, not the whole surface. The supplied focused final E2E log records one passing complete desktop case, and metrics record visible/focused state and a 26.6ms two-frame interval; this reviewer did not run tests or reassess the earlier timing failure.

disposition: ship
