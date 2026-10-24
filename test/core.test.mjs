import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildFixtures } from "../scripts/gen-fixtures.mjs";
import { buildPage, renderMarkdown } from "../scripts/build-spec.mjs";
import { toAnsi, toSvg } from "../site/js/export.js";
import { History, blankState, floodFill, fromSprite, setPixel, toSprite } from "../site/js/editor.js";
import { renderHalf, renderSolid, roundHalfEven, shadeGrid } from "../site/js/render.js";
import { lint, validateSchema } from "../site/js/validate.js";
import { PALETTE } from "../site/js/xterm.js";

const spec = (p) => join(import.meta.dirname, "..", "site", "spec", p);
const slime = JSON.parse(readFileSync(spec("examples/slime.json"), "utf8"));

test("spec homepage is generated from the current Markdown", () => {
  const md = readFileSync(spec("sprite-format.md"), "utf8");
  const page = readFileSync(join(import.meta.dirname, "..", "site", "index.html"), "utf8");
  assert.equal(page, buildPage(md), "site/index.html is stale; run npm run build-spec");
});

test("spec Markdown renderer covers the constructs the spec uses", () => {
  const { title, toc, body } = renderMarkdown(
    "# T `x`\n\nPara [l](a.json) <b> https://e.com/x\n\n## Sec\n\n| a | b |\n|---|---|\n| `c`1 | **2** |\n\n1. one\n2. two\n\n- u\n\n```\n<x>\n```\n",
  );
  assert.equal(title, "T <code>x</code>");
  assert.deepEqual(toc, [{ id: "sec", html: "Sec" }]);
  assert.match(body, /<a href="spec\/a\.json">l<\/a> &lt;b&gt; <a href="https:\/\/e\.com\/x">/);
  assert.match(body, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(body, /<pre><code>&lt;x&gt;<\/code><\/pre>/);
  assert.match(body, /<strong>2<\/strong>/);
});

test("schema $id points at the published spec", () => {
  const schema = JSON.parse(readFileSync(spec("sprite.schema.json"), "utf8"));
  assert.equal(schema.$id, "https://lowlysre.github.io/gh-pixel-editor/spec/sprite.schema.json");
});

test("validator constants match the schema", () => {
  const schema = JSON.parse(readFileSync(spec("sprite.schema.json"), "utf8"));
  assert.deepEqual(Object.keys(schema.properties).sort(), ["legend", "lighting", "mirror", "name", "rows", "tiers", "version"]);
  assert.equal(schema.properties.name.pattern, "^[a-z][a-z0-9-]*$");
  assert.equal(schema.$defs.color.maximum, 255);
  assert.equal(schema.$defs.legend.additionalProperties.oneOf[1].maxItems, 16);
});

test("slime example validates and lints clean", () => {
  assert.deepEqual(validateSchema(slime), []);
  assert.deepEqual(lint(slime), []);
});

test("schema rejects bad sprites", () => {
  const bad = (patch) => validateSchema({ ...slime, ...patch }).length > 0;
  assert.ok(bad({ version: 2 }));
  assert.ok(bad({ name: "Slime" }));
  assert.ok(bad({ extra: 1 }));
  assert.ok(bad({ rows: ["a b"] }));
  assert.ok(bad({ rows: [] }));
  assert.ok(bad({ legend: { B: 256 } }));
  assert.ok(bad({ legend: { B: [] } }));
  assert.ok(bad({ legend: { ".": 1 } }));
  assert.ok(bad({ legend: { BB: 1 } }));
  assert.ok(bad({ lighting: { rim: -1 } }));
  assert.ok(bad({ tiers: { 0: {} } }));
  assert.ok(bad({ tiers: { 1: { B: 300 } } }));
});

test("lint authoring rules", () => {
  const base = { version: 1, name: "t", rows: ["BB", "BB"], legend: { B: 1, E: 2 } };
  assert.ok(lint({ ...base, rows: ["BB", "BB", "BB"] }).some((i) => /Odd row/.test(i.msg)));
  assert.ok(lint({ ...base, rows: ["BE", "BB"] }).some((i) => /'E'/.test(i.msg)));
  assert.ok(lint({ ...base, rows: ["BB", "EB", "EB", "BB"] }).some((i) => /'E'/.test(i.msg)));
  assert.ok(lint({ ...base, rows: ["EB", "EB"] }).length === 0);
  assert.ok(lint({ ...base, rows: ["BX", "BB"] }).length === 0);
  assert.ok(lint({ ...base, rows: ["BX", "BB"], legend: { E: 2 } }).some((i) => i.level === "error"));
});

test("round half to even", () => {
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, 2.4, 2.6].map(roundHalfEven), [0, 2, 2, 0, 2, 3]);
});

test("grid rules: pad, mirror, even row", () => {
  const g = shadeGrid({ version: 1, name: "t", mirror: true, rows: ["AB", "A"], legend: { A: 1, B: 2 } });
  assert.equal(g.w, 4);
  assert.equal(g.h, 2);
  assert.deepEqual(g.px[1].map((p) => p.color), [1, 1, 1, 1]);
  assert.deepEqual(g.px[0].map((p) => p.color), [1, 2, 2, 1]);
  const odd = shadeGrid({ version: 1, name: "t", rows: ["A"], legend: { A: 1 } });
  assert.equal(odd.h, 2);
  assert.equal(odd.px[1][0], null);
});

test("lighting: top-left bright, rim darkens, flat as-is", () => {
  const s = { version: 1, name: "t", rows: ["AAAA", "AAAA", "AAAA", "AAAA"], legend: { A: [0, 1, 2, 3, 4, 5] }, lighting: { dither: 0, rim: 1.6 } };
  const g = shadeGrid(s);
  assert.equal(g.px[1][1].level, roundHalfEven(5 * (0.5 * (1 - 1 / 4) + 0.5 * (1 - 1 / 4))));
  assert.ok(g.px[0][0].level < g.px[1][1].level);
  const flat = shadeGrid({ version: 1, name: "t", rows: ["E", "E"], legend: { E: 9 } });
  assert.equal(flat.px[0][0].color, 9);
  assert.equal(flat.px[0][0].shade, 5);
});

test("solid mode: fg equals bg, kind priority E > T > M > plain", () => {
  const s = { version: 1, name: "t", rows: ["B", "M", "T", "E", "M", "B", "M", "T"], legend: { B: 1, M: 2, T: 3, E: 4 } };
  const cells = renderSolid(shadeGrid(s));
  assert.deepEqual(cells.map((r) => r[0].fg), [2, 4, 2, 3]);
  for (const r of cells) assert.equal(r[0].fg, r[0].bg);
  assert.equal(cells[0][0].glyph, "▀");
});

test("half mode: top fg, bottom bg", () => {
  const cells = renderHalf(shadeGrid({ version: 1, name: "t", rows: ["A", "B"], legend: { A: 1, B: 2 } }));
  assert.deepEqual(cells[0][0], { glyph: "▀", fg: 1, bg: 2 });
});

test("ANSI output uses 256-colour escapes only", () => {
  const out = toAnsi(renderSolid(shadeGrid(slime)));
  const codes = [...out.matchAll(/\x1b\[([0-9;]*)m/g)].map((m) => m[1]);
  for (const c of codes) assert.match(c, /^(0|38;5;\d{1,3}|48;5;\d{1,3})$/);
  assert.ok(!/38;2|48;2/.test(out));
});

test("SVG: crispEdges, merged runs, palette colours", () => {
  const svg = toSvg(shadeGrid({ version: 1, name: "t", rows: ["AAB", "AAB"], legend: { A: 196, B: 21 } }));
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.equal((svg.match(/<rect/g) ?? []).length, 4);
  assert.ok(svg.includes(PALETTE[196]));
});

test("palette spot checks", () => {
  assert.equal(PALETTE.length, 256);
  assert.equal(PALETTE[16], "#000000");
  assert.equal(PALETTE[196], "#ff0000");
  assert.equal(PALETTE[231], "#ffffff");
  assert.equal(PALETTE[232], "#080808");
  assert.equal(PALETTE[255], "#eeeeee");
});

test("editor: sprite round trip, mirror, fill, history", () => {
  const st = fromSprite(slime);
  assert.equal(st.grid[0].length, 24);
  assert.deepEqual(toSprite(st), slime);
  const g = blankState(4, 4).grid;
  setPixel(g, 0, 0, "B", true);
  assert.equal(g[0][3], "B");
  floodFill(g, 1, 1, "X");
  assert.equal(g[0][0], "B");
  assert.equal(g[3][3], "X");
  const h = new History();
  h.push("a");
  assert.equal(h.undo("b"), "a");
  assert.equal(h.redo("a"), "b");
});

test("fixtures match renderer (provisional; quest-ops parity unverified)", () => {
  const dir = join(import.meta.dirname, "..", "fixtures");
  const expected = buildFixtures(slime);
  for (const [name, body] of Object.entries(expected)) {
    assert.ok(existsSync(join(dir, name)), `missing ${name}`);
    assert.equal(readFileSync(join(dir, name), "utf8"), body, name);
  }
  assert.ok(readdirSync(dir).filter((f) => f !== "README.md").length === Object.keys(expected).length);
});
