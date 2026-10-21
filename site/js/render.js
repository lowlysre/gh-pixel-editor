export const TRANSPARENT = ".";
export const DEFAULT_LIGHTING = { dither: 0.9, rim: 1.6 };
const BAYER = [[0.0, 0.5], [0.75, 0.25]];
const SHADES = "░░▒▒▓█";
export const KIND_ORDER = ["E", "T", "M", "plain"];

export const kindOf = (ch) => (ch === "E" || ch === "T" || ch === "M" ? ch : "plain");

// Python round(): half to even.
export function roundHalfEven(v) {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

// Grid rule 1: pad short rows with their last char, then mirror.
export function expandRows(sprite) {
  const rows = sprite.rows.map((r) => [...r]);
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const padded = r.concat(Array(w - r.length).fill(r[r.length - 1]));
    return sprite.mirror ? padded.concat([...padded].reverse()) : padded;
  });
}

// Grid rule 2: odd row count gets one transparent row.
export const evenRows = (grid) =>
  grid.length % 2 ? [...grid, Array(grid[0].length).fill(TRANSPARENT)] : grid;

export const effectiveLegend = (sprite, tier) => ({ ...sprite.legend, ...(sprite.tiers?.[tier] ?? {}) });

// Grid rule 3: missing chars fall back to the B entry.
export const lookup = (legend, ch) => (ch in legend ? legend[ch] : legend.B);

// Resolves each pixel to {ch, kind, color, level}. level is the ramp level, shade the 0-5 plain index.
export function shadeGrid(sprite, tier = 0) {
  const grid = evenRows(expandRows(sprite));
  const legend = effectiveLegend(sprite, tier);
  const dither = sprite.lighting?.dither ?? DEFAULT_LIGHTING.dither;
  const rim = sprite.lighting?.rim ?? DEFAULT_LIGHTING.rim;
  const h = grid.length;
  const w = grid[0].length;
  const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== TRANSPARENT;

  const px = grid.map((row, y) =>
    row.map((ch, x) => {
      if (ch === TRANSPARENT) return null;
      const entry = lookup(legend, ch);
      if (entry === undefined) return null;
      const kind = kindOf(ch);
      if (!Array.isArray(entry)) return { ch, kind, color: entry, level: null, shade: 5 };
      const n = entry.length;
      const t = 0.5 * (1 - x / w) + 0.5 * (1 - y / h);
      let level = t * (n - 1) + (BAYER[y % 2][x % 2] - 0.5) * dither;
      if (!(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) level -= rim;
      level = Math.min(Math.max(roundHalfEven(level), 0), n - 1);
      const shade = n === 1 ? 5 : roundHalfEven((level * 5) / (n - 1));
      return { ch, kind, color: entry[level], level, shade };
    }),
  );
  return { w, h, px };
}

// Solid mode pairs two pixels per cell; the higher-priority kind wins, the top pixel wins ties.
function pickSolid(top, bottom) {
  if (!top || !bottom) return top ?? bottom;
  return KIND_ORDER.indexOf(bottom.kind) < KIND_ORDER.indexOf(top.kind) ? bottom : top;
}

export function renderSolid({ w, h, px }) {
  const rows = [];
  for (let y = 0; y < h; y += 2) {
    rows.push(
      Array.from({ length: w }, (_, x) => {
        const p = pickSolid(px[y][x], px[y + 1][x]);
        return p ? { glyph: "▀", fg: p.color, bg: p.color } : { glyph: " ", fg: null, bg: null };
      }),
    );
  }
  return rows;
}

export function renderHalf({ w, h, px }) {
  const rows = [];
  for (let y = 0; y < h; y += 2) {
    rows.push(
      Array.from({ length: w }, (_, x) => {
        const top = px[y][x];
        const bottom = px[y + 1][x];
        if (top) return { glyph: "▀", fg: top.color, bg: bottom ? bottom.color : null };
        if (bottom) return { glyph: "▄", fg: bottom.color, bg: null };
        return { glyph: " ", fg: null, bg: null };
      }),
    );
  }
  return rows;
}

const plainGlyph = (p) => (!p ? " " : p.kind === "E" ? "@" : p.kind === "T" ? "v" : p.kind === "M" ? " " : SHADES[p.shade]);

export const renderPlain = ({ px }) => px.map((row) => row.map(plainGlyph).join(""));
