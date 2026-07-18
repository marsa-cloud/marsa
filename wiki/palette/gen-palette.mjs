// Marsa FE colour palette — generated from brand anchors.
// Emits: palette.json (source of truth), palette.css (CSS custom properties),
// preview.html (swatch board). Iterate by editing ANCHORS / LIGHTNESS below.
// node gen-palette.mjs
import { writeFileSync } from 'node:fs';

// ---- brand anchors (exact logo palette) ----
const BRAND = {
  deep:  '#1C4EBF', // primary — the logo colour
  mid:   '#3568D4',
  cyan:  '#10A5C4', // accent
  light: '#7ED0E5',
};

// scales are built by hue+saturation from an anchor, with a fixed lightness ramp
const ANCHORS = {
  primary: '#1C4EBF', // deep blue
  accent:  '#10A5C4', // cyan
  success: '#16A34A',
  warning: '#D97706',
  error:   '#DC2626',
  info:    '#0EA5E9',
};
// neutral is a lightly blue-tinted gray (hue from primary, low saturation)
const NEUTRAL = { h: 223, s: 9 };

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const LIGHT = { 50: 97, 100: 93, 200: 85, 300: 75, 400: 63, 500: 53, 600: 45, 700: 37, 800: 29, 900: 22, 950: 14 };

// ---- colour math ----
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexToRgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => v * 255);
}
const hslHex = (h, s, l) => rgbToHex(...hslToRgb(h, s, l));

// build a 50..950 scale from a hue+saturation, easing saturation down at the light end
function scaleFromHS(h, s) {
  const out = {};
  for (const step of STEPS) {
    const l = LIGHT[step];
    const sat = step <= 100 ? s * 0.72 : step >= 900 ? s * 0.9 : s;
    out[step] = hslHex(h, clamp(sat, 0, 100), l);
  }
  return out;
}
const scaleFromAnchor = (hex) => { const [h, s] = rgbToHsl(...hexToRgb(hex)); return scaleFromHS(h, s); };

// ---- assemble palette ----
const palette = { brand: { ...BRAND } };
for (const [name, hex] of Object.entries(ANCHORS)) palette[name] = scaleFromAnchor(hex);
palette.neutral = scaleFromHS(NEUTRAL.h, NEUTRAL.s);

// ---- emit palette.json ----
writeFileSync('palette.json', JSON.stringify(palette, null, 2) + '\n');

// ---- emit palette.css (CSS custom properties) ----
let css = ':root {\n  /* brand */\n';
for (const [k, v] of Object.entries(palette.brand)) css += `  --marsa-${k}: ${v};\n`;
for (const [name, scale] of Object.entries(palette)) {
  if (name === 'brand') continue;
  css += `\n  /* ${name} */\n`;
  for (const [step, hex] of Object.entries(scale)) css += `  --color-${name}-${step}: ${hex};\n`;
}
css += '}\n';
writeFileSync('palette.css', css);

// ---- emit preview.html (swatch board) ----
const textOn = (hex) => (rgbToHsl(...hexToRgb(hex))[2] < 55 ? '#fff' : '#111');
const swatchRow = (label, scale) => {
  const cells = STEPS.map((s) => `<div class="sw" style="background:${scale[s]};color:${textOn(scale[s])}"><b>${s}</b><span>${scale[s]}</span></div>`).join('');
  return `<div class="scale"><div class="name">${label}</div><div class="cells">${cells}</div></div>`;
};
const brandCells = Object.entries(palette.brand).map(([k, hex]) => `<div class="sw big" style="background:${hex};color:${textOn(hex)}"><b>${k}</b><span>${hex}</span></div>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#111;padding:24px}
  h1{font-size:18px;margin:0 0 2px} p.sub{color:#666;margin:0 0 20px;font-size:13px}
  .name{font-size:12px;font-weight:600;color:#444;margin:14px 0 6px;text-transform:capitalize}
  .cells{display:flex;border-radius:8px;overflow:hidden}
  .sw{flex:1;height:60px;display:flex;flex-direction:column;justify-content:flex-end;padding:6px 8px;font-size:10px}
  .sw b{font-size:11px}.sw span{opacity:.8}
  .brand .cells{display:flex;gap:0}.sw.big{height:88px;font-size:12px}
</style></head><body>
  <h1>Marsa — colour palette</h1>
  <p class="sub">Generated from brand anchors. Primary = the deep-blue logo colour. Draft — iterate in <code>gen-palette.mjs</code>.</p>
  <div class="scale brand"><div class="name">Brand (exact logo colours)</div><div class="cells">${brandCells}</div></div>
  ${['primary', 'accent', 'neutral', 'success', 'warning', 'error', 'info'].map((n) => swatchRow(n, palette[n])).join('\n  ')}
</body></html>
`;
writeFileSync('preview.html', html);

console.log('wrote palette.json, palette.css, preview.html');
