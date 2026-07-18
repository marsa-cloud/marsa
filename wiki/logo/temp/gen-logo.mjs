// Marsa mark generator — pure SVG, regular hexagons by construction.
// Tweak PARAMS, re-run: node gen-logo.mjs > marsa.svg
import { writeFileSync } from 'node:fs'

const P = {
  R_cp: 50, // all four hexagons identical outer size
  R_berth: 50, // mid berths
  R_empty: 50, // empty berth
  RI: 33, // inner hexagon — cutout hole AND empty-berth hole (shared => equal wall)
  W: 20, // connector width
  OFF: 15, // connector perpendicular offset (vertex-flush)
  // center distances along face normals
  d_cp_lb: 118,
  d_cp_rb: 134,
  d_rb_eb: 125,
}

const C = {
  deep: '#1C4EBF',
  mid: '#3568D4',
  cyan: '#10A5C4',
  light: '#7ED0E5',
}

const D = Math.PI / 180
const step = (p, deg, d) => ({ x: p.x + Math.cos(deg * D) * d, y: p.y + Math.sin(deg * D) * d })
const apothem = (R) => (R * Math.sqrt(3)) / 2

// pointy-top hexagon vertex at index i (0..5) -> angles 0,60,120,180,240,300 from top
const hexVert = (c, R, i) => {
  const th = i * 60 * D
  return { x: c.x + R * Math.sin(th), y: c.y - R * Math.cos(th) }
}
const hexPts = (c, R) => [0, 1, 2, 3, 4, 5].map((i) => hexVert(c, R, i))
const poly = (pts) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
const pathFromPts = (pts, close = true) =>
  'M ' + pts.map((p, i) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + (close ? ' Z' : '')

// hole polygon = inner hexagon minus the rhombus whose outer corner is vertex A (0..5)
// -> filled face at that corner; hole = center + the 5 non-A vertices in order
const holePts = (c, R, A) => {
  const pts = [{ ...c }]
  for (let k = 1; k <= 5; k++) pts.push(hexVert(c, R, (A + k) % 6))
  return pts
}

// layout
const CP = { x: 200, y: 150 }
const LB = step(CP, 120, P.d_cp_lb)
const RB = step(CP, 60, P.d_cp_rb)
const EB = step(RB, 120, P.d_rb_eb)

// connector as a rect (4 corners) from face to face, offset perpendicular for vertex-flush
function connector(a, Ra, b, Rb, deg, sgn, id) {
  const start = step(a, deg, apothem(Ra)) // a's face midpoint
  const end = step(b, deg + 180, apothem(Rb)) // b's face midpoint
  const nx = Math.cos(deg * D),
    ny = Math.sin(deg * D) // axis
  const px = -ny,
    py = nx // perpendicular
  const o = sgn * P.OFF,
    hw = P.W / 2
  const corner = (pt, s) => ({ x: pt.x + px * (o + s * hw), y: pt.y + py * (o + s * hw) })
  const pts = [corner(start, +1), corner(end, +1), corner(end, -1), corner(start, -1)]
  return {
    pts,
    start: { x: start.x + px * o, y: start.y + py * o },
    end: { x: end.x + px * o, y: end.y + py * o },
    id,
  }
}

const cn = [
  { ...connector(CP, P.R_cp, LB, P.R_berth, 120, +1, 'g1'), c0: C.deep, c1: C.mid },
  { ...connector(CP, P.R_cp, RB, P.R_berth, 60, -1, 'g2'), c0: C.deep, c1: C.cyan },
  { ...connector(RB, P.R_berth, EB, P.R_empty, 120, +1, 'g3'), c0: C.cyan, c1: C.light },
]

// berth path: outer hexagon + hole (evenodd)
const berthPath = (c, R, A) => pathFromPts(hexPts(c, R)) + ' ' + pathFromPts(holePts(c, P.RI, A))

const defs = cn
  .map(
    (k) =>
      `<linearGradient id="${k.id}" gradientUnits="userSpaceOnUse" ` +
      `x1="${k.start.x.toFixed(2)}" y1="${k.start.y.toFixed(2)}" ` +
      `x2="${k.end.x.toFixed(2)}" y2="${k.end.y.toFixed(2)}">` +
      `<stop offset="0" stop-color="${k.c0}"/><stop offset="1" stop-color="${k.c1}"/></linearGradient>`,
  )
  .join('\n    ')

// bounds
const allX = [CP, LB, RB, EB].flatMap((c, i) => {
  const R = [P.R_cp, P.R_berth, P.R_berth, P.R_empty][i]
  return [c.x - R, c.x + R]
})
const allY = [CP, LB, RB, EB].flatMap((c, i) => {
  const R = [P.R_cp, P.R_berth, P.R_berth, P.R_empty][i]
  return [c.y - R, c.y + R]
})
const pad = 16
const minX = Math.min(...allX) - pad,
  minY = Math.min(...allY) - pad
const w = Math.max(...allX) - minX + pad,
  h = Math.max(...allY) - minY + pad

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}">
  <defs>
    ${defs}
  </defs>
  <!-- connectors (behind) -->
  ${cn.map((k) => `<polygon points="${poly(k.pts)}" fill="url(#${k.id})"/>`).join('\n  ')}
  <!-- control plane: solid -->
  <polygon points="${poly(hexPts(CP, P.R_cp))}" fill="${C.deep}"/>
  <!-- occupied berths: filled face on opposite sides -->
  <path d="${berthPath(LB, P.R_berth, 4)}" fill="${C.mid}" fill-rule="evenodd"/>
  <path d="${berthPath(RB, P.R_berth, 2)}" fill="${C.cyan}" fill-rule="evenodd"/>
  <!-- empty berth: same outer hex (R=50) minus same inner hex (RI) => wall matches
       the occupied berths' wall exactly; inside-aligned so outer edge = 50 like the rest -->
  <path d="${pathFromPts(hexPts(EB, P.R_empty))} ${pathFromPts(hexPts(EB, P.RI))}" fill="${C.light}" fill-rule="evenodd"/>
</svg>
`

const out = process.argv[2] || '/dev/stdout'
writeFileSync(out, svg)
