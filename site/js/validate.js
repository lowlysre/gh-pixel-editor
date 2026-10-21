import { isColor } from "./xterm.js";
import { TRANSPARENT, expandRows, effectiveLegend, lookup } from "./render.js";

const NAME = /^[a-z][a-z0-9-]*$/;
const TIER_KEY = /^[1-9][0-9]*$/;
const LEGEND_KEY = /^[^\s.]$/;
const ROW = /^[^\s]+$/;
const TOP_LEVEL = ["version", "name", "mirror", "rows", "legend", "lighting", "tiers"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkLegend(legend, path, errs) {
  if (!isObj(legend)) return errs.push({ path, msg: "must be an object" });
  for (const [ch, v] of Object.entries(legend)) {
    const p = `${path}.${ch}`;
    if (!LEGEND_KEY.test(ch)) errs.push({ path: p, msg: "key must be one non-space char other than '.'" });
    if (Array.isArray(v)) {
      if (v.length < 1 || v.length > 16) errs.push({ path: p, msg: "ramp needs 1-16 colours" });
      v.forEach((c, i) => isColor(c) || errs.push({ path: `${p}[${i}]`, msg: "colour must be an integer 0-255" }));
    } else if (!isColor(v)) errs.push({ path: p, msg: "must be an integer 0-255 or a ramp array" });
  }
}

// Mirrors schema/sprite.schema.json (JSON Schema 2020-12) without a runtime dependency.
export function validateSchema(s) {
  const errs = [];
  if (!isObj(s)) return [{ path: "$", msg: "sprite must be an object" }];
  for (const k of Object.keys(s)) if (!TOP_LEVEL.includes(k)) errs.push({ path: k, msg: "unknown top-level field" });
  for (const k of ["version", "name", "rows", "legend"]) if (!(k in s)) errs.push({ path: k, msg: "required" });
  if ("version" in s && s.version !== 1) errs.push({ path: "version", msg: "must be 1" });
  if ("name" in s && !(typeof s.name === "string" && NAME.test(s.name)))
    errs.push({ path: "name", msg: "must be lowercase kebab-case" });
  if ("mirror" in s && typeof s.mirror !== "boolean") errs.push({ path: "mirror", msg: "must be a boolean" });
  if ("rows" in s) {
    if (!Array.isArray(s.rows) || s.rows.length < 1) errs.push({ path: "rows", msg: "must be a non-empty array" });
    else
      s.rows.forEach(
        (r, i) =>
          (typeof r === "string" && r.length > 0 && ROW.test(r)) ||
          errs.push({ path: `rows[${i}]`, msg: "must be a non-empty string without whitespace" }),
      );
  }
  if ("legend" in s) checkLegend(s.legend, "legend", errs);
  if ("lighting" in s) {
    if (!isObj(s.lighting)) errs.push({ path: "lighting", msg: "must be an object" });
    else
      for (const [k, v] of Object.entries(s.lighting)) {
        if (k !== "dither" && k !== "rim") errs.push({ path: `lighting.${k}`, msg: "unknown field" });
        else if (typeof v !== "number" || !(v >= 0)) errs.push({ path: `lighting.${k}`, msg: "must be a number >= 0" });
      }
  }
  if ("tiers" in s) {
    if (!isObj(s.tiers)) errs.push({ path: "tiers", msg: "must be an object" });
    else
      for (const [k, v] of Object.entries(s.tiers)) {
        if (!TIER_KEY.test(k)) errs.push({ path: `tiers.${k}`, msg: "tier key must be a positive integer" });
        checkLegend(v, `tiers.${k}`, errs);
      }
  }
  return errs;
}

// Authoring rules from the spec. Returns {level: "error"|"warn", msg, x?, y?}.
export function lint(sprite) {
  const schema = validateSchema(sprite);
  if (schema.length) return schema.map((e) => ({ level: "error", msg: `schema: ${e.path}: ${e.msg}` }));

  const issues = [];
  const grid = expandRows(sprite);
  const h = grid.length;
  const w = grid[0].length;

  if (h % 2) issues.push({ level: "warn", msg: `Odd row count (${h}); keep the height even.` });

  const tiers = [0, ...Object.keys(sprite.tiers ?? {}).map(Number)];
  const used = new Set(grid.flat().filter((c) => c !== TRANSPARENT));
  for (const tier of tiers) {
    const legend = effectiveLegend(sprite, tier);
    for (const ch of used)
      if (lookup(legend, ch) === undefined)
        issues.push({ level: "error", msg: `'${ch}' is not in the legend${tier ? ` (tier ${tier})` : ""} and there is no 'B' fallback.` });
  }

  grid.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (/\s/.test(ch)) issues.push({ level: "error", msg: `Bare-space pixel at (${x}, ${y}); log viewers drop its background.`, x, y });
    }),
  );

  for (const ch of ["E", "T", "M"]) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (grid[y][x] !== ch || (y > 0 && grid[y - 1][x] === ch)) continue;
        let end = y;
        while (end + 1 < h && grid[end + 1][x] === ch) end++;
        const len = end - y + 1;
        if (len < 2 || y % 2 || len % 2)
          issues.push({
            level: "warn",
            msg: `'${ch}' at column ${x}, rows ${y}-${end}: must be at least 2 tall, start on an even row, and cover whole row pairs.`,
            x,
            y,
          });
      }
    }
  }

  return issues;
}

// Editor-only check: exporting with mirror on drops the right half.
export function mirrorIssues(grid) {
  const w = grid[0].length;
  if (w % 2) return [{ level: "error", msg: "Mirror export needs an even width." }];
  const asym = grid.some((row) => row.some((ch, x) => ch !== row[w - 1 - x]));
  return asym ? [{ level: "warn", msg: "Grid is not symmetric; mirror export keeps only the left half." }] : [];
}
