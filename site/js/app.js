import { toAnsi, toPlainText, toSvg } from "./export.js";
import { History, blankState, floodFill, fromSprite, resizeGrid, restore, setPixel, snapshot, toSprite } from "./editor.js";
import { TRANSPARENT, effectiveLegend, renderHalf, renderPlain, renderSolid, shadeGrid } from "./render.js";
import { lint, mirrorIssues } from "./validate.js";
import { PALETTE } from "./xterm.js";

const $ = (id) => document.getElementById(id);

let state = blankState();
const hist = new History();
const ui = { tool: "pencil", brush: "B", color: 0, colorBrush: false, mirrorDraw: false, tier: 0, hl: null, importErrors: null };
const settings = { cellW: 8, lineH: 16, ratio: 0.8, ...JSON.parse(localStorage.getItem("ghpe.settings") ?? "{}") };

const gridCv = $("grid");
const ctx = gridCv.getContext("2d");

// ---- state changes --------------------------------------------------------
function commit(fn) {
  const before = snapshot(state);
  fn();
  if (snapshot(state) !== before) hist.push(before);
  refreshAll();
}

function undoRedo(redo) {
  const snap = redo ? hist.redo(snapshot(state)) : hist.undo(snapshot(state));
  if (snap === null) return;
  state = restore(snap);
  refreshAll();
}

const renderSprite = () => ({
  version: 1,
  name: state.name,
  rows: state.grid.map((r) => r.join("")),
  legend: state.legend,
  lighting: state.lighting,
  tiers: state.tiers,
});

// ---- grid canvas ----------------------------------------------------------
let zoom = 16;

function drawGrid() {
  const h = state.grid.length;
  const w = state.grid[0].length;
  zoom = Math.max(8, Math.min(28, Math.floor(560 / Math.max(w, h))));
  gridCv.width = w * zoom;
  gridCv.height = h * zoom;
  const { px } = shadeGrid(renderSprite(), ui.tier);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px[y][x];
      ctx.fillStyle = p ? PALETTE[p.color] : (x + y) % 2 ? "#1b2028" : "#232a33";
      ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  for (let x = 1; x < w; x++) (ctx.moveTo(x * zoom + 0.5, 0), ctx.lineTo(x * zoom + 0.5, h * zoom));
  for (let y = 1; y < h; y += 2) (ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(w * zoom, y * zoom + 0.5));
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.beginPath();
  for (let y = 2; y < h; y += 2) (ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(w * zoom, y * zoom + 0.5));
  ctx.stroke();
  if (ui.mirrorDraw) {
    ctx.strokeStyle = "#2f81f7";
    ctx.beginPath();
    ctx.moveTo((w * zoom) / 2 + 0.5, 0);
    ctx.lineTo((w * zoom) / 2 + 0.5, h * zoom);
    ctx.stroke();
  }
  if (ui.hl) {
    ctx.strokeStyle = "#f85149";
    ctx.lineWidth = 2;
    ctx.strokeRect(ui.hl.x * zoom + 1, ui.hl.y * zoom + 1, zoom - 2, zoom - 2);
  }
}

// ---- previews -------------------------------------------------------------
// Models GitHub's log: background fills the whole line, glyph only a (ratio * line) tall box.
function drawCells(canvas, cells, { cellW, lineH, ratio }, fitPx = 480) {
  const cols = cells[0].length;
  canvas.width = cols * cellW;
  canvas.height = cells.length * lineH;
  const c = canvas.getContext("2d");
  const glyphH = lineH * ratio;
  const top = (lineH - glyphH) / 2;
  const half = glyphH / 2;
  cells.forEach((row, r) =>
    row.forEach((cell, i) => {
      const x = i * cellW;
      const y = r * lineH;
      if (cell.bg !== null) {
        c.fillStyle = PALETTE[cell.bg];
        c.fillRect(x, y, cellW, lineH);
      }
      if (cell.glyph === " ") return;
      c.fillStyle = PALETTE[cell.fg];
      const gy = y + top + (cell.glyph === "▄" ? half : 0);
      c.fillRect(x, Math.round(gy), cellW, Math.max(1, Math.round(half)));
    }),
  );
  const s = Math.max(1, Math.floor(fitPx / canvas.width));
  canvas.style.width = `${canvas.width * s}px`;
  canvas.style.height = `${canvas.height * s}px`;
}

function drawPreviews() {
  const g = shadeGrid(renderSprite(), ui.tier);
  const ideal = { ...settings, ratio: 1 };
  const solid = renderSolid(g);
  drawCells($("pvSolid"), solid, settings);
  drawCells($("pvMini"), solid, settings, 240);
  drawCells($("pvHalf"), renderHalf(g), ideal);
  drawCells($("pvSmear"), renderHalf(g), settings);
  $("pvPlain").textContent = renderPlain(g).join("\n");
}

// ---- lint -----------------------------------------------------------------
function drawLint() {
  const list = $("lint");
  list.replaceChildren();
  const issues = ui.importErrors ?? [...lint(toSprite(state)), ...(state.mirror ? mirrorIssues(state.grid) : [])];
  for (const i of issues) {
    const li = document.createElement("li");
    li.className = i.level;
    li.textContent = i.msg;
    if (i.fix === "mirror-off") {
      const b = document.createElement("button");
      b.className = "fix";
      b.textContent = "Store both halves";
      b.onclick = () => commit(() => (state.mirror = false));
      li.append(" ", b);
    }
    if (i.x !== undefined) {
      li.style.cursor = "pointer";
      li.onclick = () => {
        ui.hl = { x: i.x, y: i.y };
        drawGrid();
      };
    }
    list.append(li);
  }
  if (!issues.length) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = "No issues";
    list.append(li);
  }
  $("lintCount").textContent = issues.length ? `(${issues.length})` : "";
}

// ---- legend ---------------------------------------------------------------
const tierLegend = () => (ui.tier ? state.tiers[ui.tier] : state.legend);

function setEntry(ch, value) {
  commit(() => {
    tierLegend()[ch] = value;
  });
}

function swatchButton(ch, step, value, onSet) {
  const sw = document.createElement("button");
  sw.className = "sw";
  sw.style.background = PALETTE[value] ?? "#000";
  sw.title = `Colour ${value}. Click to use the selected colour (${ui.color}).`;
  sw.setAttribute("aria-label", `${ch}${step === null ? "" : ` step ${step + 1}`}: colour ${value}. Set to colour ${ui.color}`);
  sw.onclick = () => onSet(ui.color);
  return sw;
}

function iconButton(text, title, onClick, disabled = false) {
  const b = document.createElement("button");
  b.className = "icon";
  b.textContent = text;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

// A flat entry is a ramp of one in the UI: "+" turns it into a ramp, removing
// the second-to-last step turns it back into a flat colour.
function drawLegend() {
  const root = $("legend");
  root.replaceChildren();
  const eff = effectiveLegend({ legend: state.legend, tiers: state.tiers }, ui.tier);
  for (const ch of Object.keys(eff)) {
    const v = eff[ch];
    const steps = Array.isArray(v) ? v : [v];
    const overridden = ui.tier && ch in state.tiers[ui.tier];
    const row = document.createElement("div");
    row.className = "lrow" + (overridden ? " ovr" : "");

    const b = document.createElement("button");
    b.className = "ch" + (ui.brush === ch && !ui.colorBrush ? " brush" : "");
    b.textContent = ch;
    b.title = `Paint with '${ch}'`;
    b.setAttribute("aria-pressed", String(ui.brush === ch && !ui.colorBrush));
    b.onclick = () => {
      ui.brush = ch;
      ui.colorBrush = false;
      ui.tool = ui.tool === "erase" ? "pencil" : ui.tool;
      drawLegend();
      drawTools();
    };

    const strip = document.createElement("span");
    strip.className = "strip";
    steps.forEach((c, i) =>
      strip.append(
        swatchButton(ch, Array.isArray(v) ? i : null, c, (n) =>
          setEntry(ch, Array.isArray(v) ? v.map((x, j) => (j === i ? n : x)) : n),
        ),
      ),
    );

    const add = iconButton("+", `Add a shade to '${ch}'`, () => setEntry(ch, [...steps, steps[steps.length - 1]]), steps.length >= 16);
    const del = iconButton("−", `Remove a shade from '${ch}'`, () => setEntry(ch, steps.length === 2 ? steps[1] : steps.slice(0, -1)), !Array.isArray(v) || steps.length <= 1);
    const rm = ui.tier
      ? iconButton("↺", `Use the base colour for '${ch}' in this variant`, () => commit(() => delete tierLegend()[ch]), !overridden)
      : iconButton("×", `Remove '${ch}' from the legend`, () => commit(() => delete tierLegend()[ch]));
    row.append(b, strip, add, del, rm);
    root.append(row);
  }
}

function drawTierSelect() {
  const sel = $("tier");
  sel.replaceChildren(new Option("Base colours", "0"));
  const tiers = Object.keys(state.tiers).map(Number).sort((a, b) => a - b);
  for (const t of tiers) sel.append(new Option(`Variant ${t}`, String(t)));
  if (!(ui.tier === 0 || ui.tier in state.tiers)) ui.tier = 0;
  sel.value = String(ui.tier);
  $("delTier").disabled = !ui.tier;
  $("tierCount").textContent = tiers.length ? `(${tiers.length})` : "";
  if (tiers.length) $("variants").open = true;
}

// ---- chrome ---------------------------------------------------------------
function drawTools() {
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("on", b.dataset.tool === ui.tool);
    b.setAttribute("aria-pressed", String(b.dataset.tool === ui.tool));
  });
  $("mirrorDraw").classList.toggle("on", ui.mirrorDraw);
  $("mirrorDraw").setAttribute("aria-pressed", String(ui.mirrorDraw));
  const chip = document.createElement("span");
  chip.className = "chip";
  if (ui.colorBrush) {
    chip.style.background = PALETTE[ui.color];
    $("selInfo").replaceChildren(chip, `Colour ${ui.color}`);
  } else {
    const v = effectiveLegend({ legend: state.legend, tiers: state.tiers }, ui.tier)[ui.brush];
    const top = Array.isArray(v) ? v[v.length - 1] : v;
    chip.style.background = PALETTE[top] ?? "transparent";
    $("selInfo").replaceChildren(chip, `Legend '${ui.brush}'${Array.isArray(v) ? " (shaded)" : ""}`);
  }
  swatches.forEach((b, i) => {
    b.classList.toggle("sel", i === ui.color);
    b.setAttribute("aria-pressed", String(i === ui.color));
    b.tabIndex = i === ui.color ? 0 : -1;
  });
}

function refreshPixels() {
  drawGrid();
  drawPreviews();
  drawLint();
  const h = state.grid.length;
  $("dims").textContent = `${state.grid[0].length}×${h} px · ${Math.ceil(h / 2)} text rows`;
}

let msgTimer;
function flash(text) {
  $("msg").textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => ($("msg").textContent = ""), 3000);
}

const SAVE_KEY = "ghpe.sprite";
function save() {
  try {
    localStorage.setItem(SAVE_KEY, snapshot(state));
  } catch {
    flash("Autosave failed: browser storage unavailable");
  }
}

function refreshAll() {
  ui.importErrors = null;
  $("name").value = state.name;
  $("mirrorExport").checked = state.mirror;
  $("dither").value = state.lighting.dither;
  $("rim").value = state.lighting.rim;
  $("gw").value = state.grid[0].length;
  $("gh").value = state.grid.length;
  $("undo").disabled = !hist.undoStack.length;
  $("redo").disabled = !hist.redoStack.length;
  drawTierSelect();
  drawLegend();
  drawTools();
  refreshPixels();
  save();
}

// ---- pointer --------------------------------------------------------------
let stroke = null;

function cellAt(e) {
  const r = gridCv.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) * gridCv.width) / r.width / zoom), Math.floor(((e.clientY - r.top) * gridCv.height) / r.height / zoom)];
}

function apply(x, y, first) {
  const { grid } = state;
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;
  if (ui.tool === "pencil") setPixel(grid, x, y, ui.brush, ui.mirrorDraw);
  else if (ui.tool === "erase") setPixel(grid, x, y, TRANSPARENT, ui.mirrorDraw);
  else if (!first) return;
  else if (ui.tool === "fill") floodFill(grid, x, y, ui.brush, ui.mirrorDraw);
  else if (ui.tool === "pick") {
    const ch = grid[y][x];
    if (ch !== TRANSPARENT) {
      ui.brush = ch;
      ui.colorBrush = false;
      const p = shadeGrid(renderSprite(), ui.tier).px[y][x];
      if (p) ui.color = p.color;
      ui.tool = "pencil";
      drawLegend();
      drawTools();
    }
  }
}

// Palette colours paint through a flat legend entry: reuse one with that colour,
// else add one. E, T and M are never reused because they change solid ranking.
const RESERVED = "BETM";
const NEW_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789ACDFGHIJKLNOPQRSUVWXYZ";
function colorChar() {
  const eff = effectiveLegend({ legend: state.legend, tiers: state.tiers }, ui.tier);
  const hit = Object.keys(eff).find((ch) => eff[ch] === ui.color && !"ETM".includes(ch));
  if (hit) return hit;
  const used = new Set([...Object.keys(state.legend), ...Object.values(state.tiers).flatMap(Object.keys)]);
  const ch = [...NEW_CHARS].find((c) => !used.has(c) && !RESERVED.includes(c));
  if (!ch) return null;
  state.legend[ch] = ui.color;
  if (ui.tier) state.tiers[ui.tier][ch] = ui.color;
  return ch;
}

gridCv.addEventListener("pointerdown", (e) => {
  gridCv.setPointerCapture(e.pointerId);
  ui.hl = null;
  stroke = { before: snapshot(state), last: null };
  if (ui.colorBrush && (ui.tool === "pencil" || ui.tool === "fill")) {
    const ch = colorChar();
    if (!ch) {
      stroke = null;
      return flash("Legend is full; reuse an existing entry");
    }
    ui.brush = ch;
  }
  const [x, y] = cellAt(e);
  stroke.last = `${x},${y}`;
  apply(x, y, true);
  refreshPixels();
});
gridCv.addEventListener("pointermove", (e) => {
  const [x, y] = cellAt(e);
  const ch = state.grid[y]?.[x];
  $("coords").textContent = ch === undefined ? "" : `x ${x}, y ${y} · '${ch}'`;
  if (!stroke) return;
  if (stroke.last === `${x},${y}`) return;
  stroke.last = `${x},${y}`;
  apply(x, y, false);
  refreshPixels();
});
gridCv.addEventListener("pointerleave", () => ($("coords").textContent = ""));
const endStroke = () => {
  if (!stroke) return;
  const changed = snapshot(state) !== stroke.before;
  if (changed) hist.push(stroke.before);
  stroke = null;
  if (changed) refreshAll();
};
gridCv.addEventListener("pointerup", endStroke);
gridCv.addEventListener("pointercancel", endStroke);

// ---- wiring ---------------------------------------------------------------
// xterm-256 laid out by structure: 16 system colours, the 6x6x6 cube as six
// 6x6 blocks (one per red level; green down, blue across), then the grey ramp.
const swatches = [];
function swatch(i) {
  const b = document.createElement("button");
  b.style.background = PALETTE[i];
  b.title = `${i} ${PALETTE[i]}`;
  b.setAttribute("aria-label", `colour ${i}`);
  b.onclick = () => {
    ui.color = i;
    ui.colorBrush = true;
    if (ui.tool === "erase" || ui.tool === "pick") ui.tool = "pencil";
    drawLegend();
    drawTools();
  };
  swatches[i] = b;
  return b;
}
function palGroup(label, cls, children) {
  const h = document.createElement("div");
  h.className = "pal-label";
  h.textContent = label;
  const g = document.createElement("div");
  g.className = `pal ${cls}`;
  g.append(...children);
  $("palette").append(h, g);
}
const range = (a, n) => Array.from({ length: n }, (_, k) => a + k);
palGroup("System", "pal-sys", range(0, 16).map(swatch));
palGroup(
  "Colour cube",
  "pal-cube",
  range(0, 6).map((r) => {
    const block = document.createElement("div");
    block.className = "pal-block";
    block.append(...range(16 + 36 * r, 36).map(swatch));
    return block;
  }),
);
palGroup("Greys", "pal-grey", range(232, 24).map(swatch));

// Arrow keys move to the nearest swatch on screen in that direction.
$("palette").addEventListener("keydown", (e) => {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!dir) return;
  e.preventDefault();
  const centre = (b) => {
    const r = b.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const [cx, cy] = centre(swatches[ui.color]);
  let best = null;
  let bestScore = Infinity;
  swatches.forEach((b, i) => {
    const [x, y] = centre(b);
    const along = (x - cx) * dir[0] + (y - cy) * dir[1];
    if (along < 1) return;
    const across = Math.abs(dir[0] ? y - cy : x - cx);
    const score = along + across * 4;
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  if (best === null) return;
  ui.color = best;
  drawTools();
  swatches[best].focus();
});

document.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => ((ui.tool = b.dataset.tool), drawTools())));
$("mirrorDraw").onclick = () => ((ui.mirrorDraw = !ui.mirrorDraw), drawTools(), drawGrid());
$("undo").onclick = () => undoRedo(false);
$("redo").onclick = () => undoRedo(true);
$("name").onchange = (e) => commit(() => (state.name = e.target.value.trim()));
$("mirrorExport").onchange = (e) => commit(() => (state.mirror = e.target.checked));
$("tier").onchange = (e) => ((ui.tier = Number(e.target.value)), drawTierSelect(), drawLegend(), refreshPixels());
$("addTier").onclick = () =>
  commit(() => {
    const next = Math.max(0, ...Object.keys(state.tiers).map(Number)) + 1;
    state.tiers[next] = {};
    ui.tier = next;
  });
$("delTier").onclick = () =>
  commit(() => {
    delete state.tiers[ui.tier];
    ui.tier = 0;
  });
$("addChar").onclick = () => {
  const ch = $("newChar").value;
  if (!ch || /\s/.test(ch) || ch === TRANSPARENT) return;
  commit(() => {
    if (!(ch in effectiveLegend({ legend: state.legend, tiers: state.tiers }, ui.tier))) tierLegend()[ch] = ui.color;
    ui.brush = ch;
  });
  $("newChar").value = "";
};
for (const k of ["dither", "rim"])
  $(k).onchange = (e) => {
    const n = Number(e.target.value);
    if (n >= 0) commit(() => (state.lighting[k] = n));
    else e.target.value = state.lighting[k];
  };
$("resize").onclick = () => {
  const w = Math.min(64, Math.max(2, Number($("gw").value) | 0));
  const h = Math.min(64, Math.max(2, Number($("gh").value) | 0));
  commit(() => (state.grid = resizeGrid(state.grid, w, h)));
};
$("newBtn").onclick = () => {
  const w = Math.min(64, Math.max(2, Number($("gw").value) | 0));
  const h = Math.min(64, Math.max(2, Number($("gh").value) | 0));
  commit(() => (state = blankState(w, h)));
};

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const ansiText = (target) => {
  const g = shadeGrid(renderSprite(), ui.tier);
  return toAnsi(target === "half" ? renderHalf(g) : renderSolid(g));
};
const exporters = {
  "ansi-solid": () => download(`${state.name}.ans`, ansiText("solid"), "text/plain"),
  "ansi-half": () => download(`${state.name}.half.ans`, ansiText("half"), "text/plain"),
  json: () => download(`${state.name}.json`, JSON.stringify(toSprite(state), null, 2) + "\n", "application/json"),
  svg: () => download(`${state.name}.svg`, toSvg(shadeGrid(renderSprite(), ui.tier), state.name), "image/svg+xml"),
  "copy-solid": async () => {
    try {
      await navigator.clipboard.writeText(ansiText("solid"));
      flash("ANSI copied");
    } catch {
      flash("Clipboard unavailable");
    }
  },
};
document.querySelectorAll("[data-export]").forEach((b) => (b.onclick = () => exporters[b.dataset.export]()));

// Menus close after a choice, on Escape, or on a click outside.
const menus = [...document.querySelectorAll("details.menu")];
for (const m of menus) {
  m.addEventListener("click", (e) => e.target.closest(".menu-items button") && (m.open = false));
  m.addEventListener("toggle", () => m.open && menus.forEach((o) => o !== m && (o.open = false)));
}
document.addEventListener("click", (e) => menus.forEach((m) => !m.contains(e.target) && (m.open = false)));
document.addEventListener("keydown", (e) => e.key === "Escape" && menus.forEach((m) => (m.open = false)));

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) loadText(await file.text());
};
function loadText(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    ui.importErrors = [{ level: "error", msg: `Import failed: ${err.message}` }];
    return drawLint();
  }
  const errs = lint(obj).filter((i) => i.level === "error" && /^schema:/.test(i.msg));
  if (errs.length) {
    ui.importErrors = [{ level: "error", msg: "Import rejected: not a valid sprite." }, ...errs];
    return drawLint();
  }
  commit(() => {
    state = fromSprite(obj);
    ui.tier = 0;
    ui.brush = "B" in state.legend ? "B" : Object.keys(state.legend)[0] ?? "B";
  });
}
const hasFiles = (e) => e.dataTransfer?.types.includes("Files");
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (hasFiles(e)) document.body.classList.add("dragging");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) document.body.classList.remove("dragging");
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (file) loadText(await file.text());
});

for (const k of ["cellW", "lineH", "ratio"]) {
  $(k).value = settings[k];
  $(k).onchange = (e) => {
    const n = Number(e.target.value);
    if (n > 0) settings[k] = n;
    e.target.value = settings[k];
    localStorage.setItem("ghpe.settings", JSON.stringify(settings));
    drawPreviews();
  };
}

document.addEventListener("keydown", (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "?") return toggleHelp();
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "y")) {
    e.preventDefault();
    undoRedo(k === "y" || e.shiftKey);
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const tool = { p: "pencil", e: "erase", f: "fill", i: "pick" }[k];
    if (tool) ui.tool = tool;
    else if (k === "m") ui.mirrorDraw = !ui.mirrorDraw;
    else return;
    drawTools();
    drawGrid();
  }
});

// ---- help -----------------------------------------------------------------
const help = $("help");
function toggleHelp() {
  if (help.open) help.close();
  else help.showModal();
}
$("helpBtn").onclick = toggleHelp;

// ---- boot -----------------------------------------------------------------
function loadExample() {
  return fetch("spec/examples/slime.json")
    .then((r) => r.json())
    .then((s) =>
      commit(() => {
        state = fromSprite(s);
        ui.tier = 0;
        ui.brush = "B";
        ui.color = 86;
      }),
    )
    .catch(() => flash("Example failed to load"));
}
$("exampleBtn").onclick = loadExample;

const saved = (() => {
  try {
    const s = restore(localStorage.getItem(SAVE_KEY));
    return Array.isArray(s?.grid?.[0]) ? s : null;
  } catch {
    return null;
  }
})();
if (saved) {
  state = saved;
  refreshAll();
} else {
  refreshAll();
  loadExample().then(() => {
    hist.undoStack.length = 0;
    refreshAll();
  });
}
if (!localStorage.getItem("ghpe.tipDismissed")) $("tip").hidden = false;
$("tipClose").onclick = () => {
  $("tip").hidden = true;
  localStorage.setItem("ghpe.tipDismissed", "1");
};
