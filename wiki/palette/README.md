# Marsa colour palette (FE)

Draft brand palette for the frontend. **Iterate freely** — this is generated
from a handful of anchors, so tuning is a one-line change + re-run.

## Files

| File                           | What it is                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `gen-palette.mjs`              | Source of truth. Brand anchors + lightness ramp at the top; emits the three files below.                  |
| `palette.json`                 | Machine-readable palette — `brand` + `primary/accent/neutral/success/warning/error/info` scales (50–950). |
| `palette.css`                  | CSS custom properties: `--marsa-deep`, `--color-primary-500`, …                                           |
| `preview.html` / `preview.png` | Swatch board.                                                                                             |

## Regenerate

```bash
node gen-palette.mjs        # writes palette.json, palette.css, preview.html
```

## Using it in the FE (Nuxt 4 + Tailwind 4 + Nuxt UI)

The CSS var names follow Tailwind 4's `--color-<name>-<shade>` convention, so
they drop into a Tailwind `@theme` block and Nuxt UI picks them up as colour
aliases:

```css
/* app/assets/css/main.css */
@import 'tailwindcss';
@theme {
  --color-primary-50: #f3f6fb;
  /* … paste from palette.css … */
  --color-primary-950: #0c1a3c;
}
```

Then point Nuxt UI at it (`app.config.ts`): `ui: { colors: { primary: 'primary', neutral: 'neutral' } }`.

## Open decision — which blue is "the" primary?

`brand.deep` (`#1C4EBF`) is the **exact logo colour**. In the generated
`primary` scale it lands around **primary-700**, while `primary-500` (the
Nuxt UI default weight) is a brighter `#2e65e0`.

So decide, before wiring this in:

- **Keep the conventional ramp** (bright 500, logo sits at ~700) — good for UI
  affordances that want a punchy mid-weight primary; or
- **Re-anchor** so `primary-600`/`700` = the exact logo blue and the default
  weight matches the mark. One tweak to the `LIGHT` map / anchor in the
  generator.

Left as-is for now (conventional ramp). Flagging because "the brand blue" and
"primary-500" not being the same value trips people up.

## Semantic colours

`success / warning / error / info` are conventional green/amber/red/sky ramps,
included so the FE has a complete set. They're not part of the logo identity —
retune hues to taste.
