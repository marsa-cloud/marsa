// Three-hex cluster — the compact harbour. Edge-sharing honeycomb, NO connectors.
// One hexagon of each state: filled control plane, cube-cutout berth, empty berth.
// node gen-cluster.mjs cluster.svg
import { writeFileSync } from 'node:fs'

const P = { R: 50, RI: 33, pad: 12, overlap: 0.75 }
const C = {
  deep: '#1C4EBF', // filled — control plane
  cyan: '#10A5C4', // cutout — docked berth
  light: '#7ED0E5', // outline — empty berth
}

const D = Math.PI / 180
const A = Math.sqrt(3) / 2
const hexVert = (c, R, i) => {
  const th = i * 60 * D
  return { x: c.x + R * Math.sin(th), y: c.y - R * Math.cos(th) }
}
const hexPts = (c, R) => [0, 1, 2, 3, 4, 5].map((i) => hexVert(c, R, i))
const path = (pts) =>
  'M ' + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z'
// cutout hole = inner hexagon minus the rhombus at corner A (that face stays solid)
const holePts = (c, R, Acorner) => {
  const pts = [{ ...c }]
  for (let k = 1; k <= 5; k++) pts.push(hexVert(c, R, (Acorner + k) % 6))
  return pts
}

const R = P.R
// triangular trefoil: control plane on top, two berths below — all edge-sharing
const TOP = { x: 0, y: -1.5 * R }
const BL = { x: -A * R, y: 0 }
const BR = { x: A * R, y: 0 }

// slightly grow each hex so touching edges overlap a hair (kills antialias seams)
const Rg = R + P.overlap

const filled = `<polygon points="${hexPts(TOP, Rg)
  .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  .join(' ')}" fill="${C.deep}"/>`
const cutout = `<path d="${path(hexPts(BL, Rg))} ${path(holePts(BL, P.RI, 2))}" fill="${C.cyan}" fill-rule="evenodd"/>`
// empty berth = inside-aligned ring (outer hex minus inner hex at RI) so wall matches the cutout wall
const empty = `<path d="${path(hexPts(BR, Rg))} ${path(hexPts(BR, P.RI))}" fill="${C.light}" fill-rule="evenodd"/>`

const cs = [TOP, BL, BR]
const xs = cs.flatMap((c) => [c.x - R * A, c.x + R * A])
const ys = cs.flatMap((c) => [c.y - R, c.y + R])
const minX = Math.min(...xs) - P.pad,
  minY = Math.min(...ys) - P.pad
const W = Math.max(...xs) - minX + P.pad,
  H = Math.max(...ys) - minY + P.pad

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}">
  ${filled}
  ${cutout}
  ${empty}
</svg>
`
writeFileSync(process.argv[2] || '/dev/stdout', svg)
