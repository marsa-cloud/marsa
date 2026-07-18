// Honeycomb cluster — best-effort reproduction of the 2026-07-18 screenshot.
// A tight pointy-top hex grid (shared edges), outlined, with small solid inner
// hexagons ("dots") in some cells, on a dark ground. LOW-RES SOURCE — this is an
// interpretation; tune CELLS / DOTS below.
// node gen-cluster.mjs cluster.svg
import { writeFileSync } from 'node:fs';

const P = {
  R: 40,       // cell circumradius
  SW: 9,       // outline thickness (inside-aligned via ring)
  RI: 15,      // inner-dot circumradius
  pad: 10,
  bg: '#0F1729',
  ink: '#FFFFFF',
};

const D = Math.PI / 180;
const A = Math.sqrt(3) / 2;             // apothem factor
const hexVert = (c, R, i) => {
  const th = i * 60 * D;
  return { x: c.x + R * Math.sin(th), y: c.y - R * Math.cos(th) };
};
const hexPts = (c, R) => [0, 1, 2, 3, 4, 5].map((i) => hexVert(c, R, i));
const path = (pts) => 'M ' + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';

// pointy-top hex-grid neighbour offsets (edge-sharing): horiz = √3R, diag = (√3R/2, 1.5R)
const w = Math.sqrt(3) * P.R, vy = 1.5 * P.R;
const cell = (col, row) => ({ x: col * (w / 2), y: row * vy });

// cluster: a centre + ring of 6 (flower), plus the two upper cells cropped like the source
// axial-ish placement via (col,row) where col steps half-width, row steps 1.5R
const CELLS = [
  cell(0, 0),   // centre
  cell(2, 0),   // right
  cell(-2, 0),  // left
  cell(1, 1),   // lower-right
  cell(-1, 1),  // lower-left
  cell(1, -1),  // upper-right
  cell(-1, -1), // upper-left
];
const DOTS = [0, 3, 4, 6]; // which cells get an inner-hex dot

// inside-aligned outline = outer hex minus inner hex (evenodd)
const ring = (c) => path(hexPts(c, P.R)) + ' ' + path(hexPts(c, P.R - P.SW / A));

const rings = CELLS.map((c) => `<path d="${ring(c)}" fill="${P.ink}" fill-rule="evenodd"/>`).join('\n  ');
const dots = DOTS.map((i) => `<path d="${path(hexPts(CELLS[i], P.RI))}" fill="${P.ink}"/>`).join('\n  ');

const xs = CELLS.flatMap((c) => [c.x - P.R * A, c.x + P.R * A]);
const ys = CELLS.flatMap((c) => [c.y - P.R, c.y + P.R]);
const minX = Math.min(...xs) - P.pad, minY = Math.min(...ys) - P.pad;
const W = Math.max(...xs) - minX + P.pad, H = Math.max(...ys) - minY + P.pad;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}">
  <rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="${P.bg}"/>
  ${rings}
  ${dots}
</svg>
`;
writeFileSync(process.argv[2] || '/dev/stdout', svg);
