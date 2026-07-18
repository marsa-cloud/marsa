// Single cutout hexagon — the reduced / favicon mark.
// node gen-single.mjs single-berth.svg
import { writeFileSync } from 'node:fs';

const P = { R: 50, RI: 33, pad: 10 };
const COLOR = process.argv[3] || '#1C4EBF'; // deep blue — the primary logo colour

const D = Math.PI / 180;
const hexVert = (c, R, i) => {
  const th = i * 60 * D;
  return { x: c.x + R * Math.sin(th), y: c.y - R * Math.cos(th) };
};
const hexPts = (c, R) => [0, 1, 2, 3, 4, 5].map((i) => hexVert(c, R, i));
const path = (pts) => 'M ' + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';

// hole = inner hexagon minus the rhombus at corner A (that face stays solid = docked ship)
const holePts = (c, R, A) => {
  const pts = [{ ...c }];
  for (let k = 1; k <= 5; k++) pts.push(hexVert(c, R, (A + k) % 6));
  return pts;
};

const c = { x: 0, y: 0 };
const R = P.R;
const berth = path(hexPts(c, R)) + ' ' + path(holePts(c, P.RI, 2)); // filled face bottom-right

const min = -R - P.pad, size = 2 * (R + P.pad);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${min} ${min} ${size} ${size}" width="${size}" height="${size}">
  <path d="${berth}" fill="${COLOR}" fill-rule="evenodd"/>
</svg>
`;
writeFileSync(process.argv[2] || '/dev/stdout', svg);
