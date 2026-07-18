# Marsa logo — working exploration (temp)

Scratch space for iterating the Marsa mark. **Not final** — this is where the
geometry is being tuned before a settled version is promoted out of `temp/`.

## Files

| File                           | What it is                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gen-logo.mjs`                 | Source of truth for the **full mark**. All geometry (sizes, cube, connectors, colours, spacing) lives in the `P` / `C` objects at the top.                                                                                                                |
| `gen-single.mjs`               | Generates the **single cutout hexagon** — the reduced / favicon mark. `node gen-single.mjs single-berth.svg [#hex]`.                                                                                                                                      |
| `gen-cluster.mjs`              | Generates the **three-hex cluster** — a compact honeycomb trefoil (no connectors) showing one hexagon of each state: filled control plane, cube-cutout berth, empty berth. Serves as the secondary / system lockup; the single berth is the primary logo. |
| `marsa-logo.svg`               | Current full mark.                                                                                                                                                                                                                                        |
| `single-berth.svg`             | Current reduced mark.                                                                                                                                                                                                                                     |
| `cluster.svg`                  | Current cluster.                                                                                                                                                                                                                                          |
| `versions/`                    | **Frozen iterations** — `v1-full-mark.svg`, `v2-…`, so we can compare and roll back visually (git history is the real record; these are for eyeballing).                                                                                                  |
| `preview.html` / `preview.png` | Renders all marks on light + dark + a small-size ramp.                                                                                                                                                                                                    |

## Versioning convention

Each time the full mark reaches a state worth keeping, snapshot it:

```bash
node gen-logo.mjs versions/vN-<label>.svg
```

Leave older `vN` files in place — the point is to browse the progression at a
glance. When one is chosen as final, promote it out of `temp/` (e.g. to
`wiki/logo/marsa-logo.svg`) and delete the scratch.

## Regenerate after editing a generator

```bash
node gen-logo.mjs   marsa-logo.svg     # full mark
node gen-single.mjs single-berth.svg   # reduced / favicon
node gen-cluster.mjs cluster.svg       # honeycomb cluster
```

Preview it in a browser (`preview.html`), or re-render the snapshot headless:

```bash
google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=720,570 --screenshot=preview.png "file://$PWD/preview.html"
```

## The mark, in one paragraph

Four **identical** regular hexagons (circumradius 50) in a branching "harbour"
arrangement, encoding a semantic system:

- **Solid hexagon** = the control plane.
- **Hexagon with a cube cutout** = a berth with an app docked. The cube is an
  inner hexagon (RI=33) with one face filled; the two berths carry the filled
  face on **opposite** sides.
- **Outline hexagon** = an empty berth. It shares the _same_ inner hexagon (RI)
  as the occupied berths, so its wall thickness matches theirs exactly — an
  empty berth is literally an occupied one with the docked face removed.
- **Gradient connectors** interpolate between the two hexagons they join and sit
  flush against the vertices ("edge of the edge"), not centred on a face.

## Geometry notes worth keeping

- Hexagons are **pointy-top**; every centre sits on a 60° face-normal from its
  neighbour, which is what makes the connectors weld to faces squarely instead
  of slicing across them.
- Regular by construction: width = (√3/2)·height = 0.866·height. (Building this
  in Figma is error-prone — its polygon tool inscribes vertices on an inner
  ellipse and silently squashes the shape ~13%. Generating the SVG directly
  avoids that entirely.)
- SVG strokes are centred by default, which inflates a stroked hexagon's true
  size. The empty berth is therefore drawn as a **filled ring** (outer hex minus
  inner hex), so its outer edge is exactly R=50 like the others.

## Open items (not yet done)

- **Dark-background variant** — the cube cutouts are real holes, so on a dark UI
  the "occupied" state fades. A dark variant would give the cutout an explicit
  light fill instead of a true hole.
- **Reduced favicon mark** — four hexagons + connectors turn to mush below ~24px.
  A single-hexagon-with-cube reduction is the plan (also avoids an unfortunate
  two-hexagons-side-by-side crop).
