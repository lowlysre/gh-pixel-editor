import { toAnsi, toPlainText, toSvg } from "./export.js";
import { History, blankState, floodFill, fromSprite, resizeGrid, restore, setPixel, snapshot, toSprite } from "./editor.js";
import { TRANSPARENT, effectiveLegend, renderHalf, renderPlain, renderSolid, shadeGrid } from "./render.js";
import { lint, mirrorIssues } from "./validate.js";
import { PALETTE, isColor } from "./xterm.js";

const $ = (id) => document.getElementById(id);

let state = blankState();
const hist = new History();
const ui = { tool: "pencil", brush: "B", color: 0, mirrorDraw: false, tier: 0, hl: null, importErrors: null };
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

function slot(value, onSet) {
  const wrap = document.createElement("span");
  wrap.className = "slot";
  const sw = document.createElement("button");
  sw.style.background = PALETTE[value] ?? "#000";
  sw.title = "Set to the selected palette colour";
  sw.onclick = () => onSet(ui.color);
  const num = document.createElement("input");
  num.type = "number";
  num.min = 0;
  num.max = 255;
  num.value = value;
  num.setAttribute("aria-label", "xterm colour index");
  num.onchange = () => {
    const n = Number(num.value);
    if (isColor(n)) onSet(n);
    else num.value = value;
  };
  wrap.append(sw, num);
  return wrap;
}

function drawLegend() {
  const root = $("legend");
  root.replaceChildren();
  const eff = effectiveLegend({ legend: state.legend, tiers: state.tiers }, ui.tier);
  for (const ch of Object.keys(eff)) {
    const v = eff[ch];
    const overridden = ui.tier && ch in state.tiers[ui.tier];
    const row = document.createElement("div");
    row.className = "lrow";

    const b = document.createElement("button");
    b.className = "ch" + (ui.brush === ch ? " brush" : "");
    b.textContent = ch;
    b.title = "Use as brush";
    b.onclick = () => {
      ui.brush = ch;
      ui.tool = ui.tool === "erase" ? "pencil" : ui.tool;
      drawLegend();
      drawTools();
    };

    const type = document.createElement("select");
    type.setAttribute("aria-label", "colour type");
    type.innerHTML = '<option value="flat">flat</option><option value="ramp">ramp</option>';
    type.value = Array.isArray(v) ? "ramp" : "flat";
    type.onchange = () => setEntry(ch, type.value === "ramp" ? (Array.isArray(v) ? v : [v]) : Array.isArray(v) ? v[v.length - 1] : v);

    row.append(b, type);
    const slots = document.createElement("span");
    slots.className = Array.isArray(v) ? "slots ramp" : "slots";
    if (Array.isArray(v)) {
      v.forEach((c, i) => slots.append(slot(c, (n) => setEntry(ch, v.map((x, j) => (j === i ? n : x))))));
      const add = document.createElement("button");
      add.textContent = "+";
      add.title = "Add ramp step";
      add.disabled = v.length >= 16;
      add.onclick = () => setEntry(ch, [...v, v[v.length - 1]]);
      const del = document.createElement("button");
      del.textContent = "−";
      del.title = "Remove last ramp step";
      del.disabled = v.length <= 1;
      del.onclick = () => setEntry(ch, v.slice(0, -1));
      row.append(add, del);
    } else slots.append(slot(v, (n) => setEntry(ch, n)));

    const rm = document.createElement("button");
    rm.textContent = ui.tier ? "reset" : "×";
    rm.title = ui.tier ? "Drop this tier override" : "Remove legend entry";
    rm.disabled = ui.tier && !overridden;
    rm.onclick = () =>
      commit(() => {
        delete tierLegend()[ch];
      });
    row.append(rm);
    if (overridden) {
      const dot = document.createElement("span");
      dot.className = "ovr";
      dot.textContent = "●";
      dot.title = "Overridden in this tier";
      row.append(dot);
    }
    row.append(slots);
    root.append(row);
  }
}

function drawTierSelect() {
  const sel = $("tier");
  sel.replaceChildren(new Option("Base", "0"));
  for (const t of Object.keys(state.tiers).map(Number).sort((a, b) => a - b)) sel.append(new Option(`Tier ${t}`, String(t)));
  if (!(ui.tier === 0 || ui.tier in state.tiers)) ui.tier = 0;
  sel.value = String(ui.tier);
  $("delTier").disabled = !ui.tier;
}

// ---- chrome ---------------------------------------------------------------
function drawTools() {
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("on", b.dataset.tool === ui.tool);
    b.setAttribute("aria-pressed", String(b.dataset.tool === ui.tool));
  });
  $("mirrorDraw").textContent = `Mirror: ${ui.mirrorDraw ? "on" : "off"}`;
  $("mirrorDraw").classList.toggle("on", ui.mirrorDraw);
  $("mirrorDraw").setAttribute("aria-pressed", String(ui.mirrorDraw));
  $("selInfo").textContent = `Colour ${ui.color} ${PALETTE[ui.color]} · brush '${ui.brush}'`;
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
      const p = shadeGrid(renderSprite(), ui.tier).px[y][x];
      if (p) ui.color = p.color;
      ui.tool = "pencil";
      drawLegend();
      drawTools();
    }
  }
}

gridCv.addEventListener("pointerdown", (e) => {
  gridCv.setPointerCapture(e.pointerId);
  ui.hl = null;
  stroke = { before: snapshot(state), last: null };
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
$("exportJson").onclick = () => download(`${state.name}.json`, JSON.stringify(toSprite(state), null, 2) + "\n", "application/json");
$("exportSvg").onclick = () => download(`${state.name}.svg`, toSvg(shadeGrid(renderSprite(), ui.tier), state.name), "image/svg+xml");
$("copyAnsi").onclick = async () => {
  const g = shadeGrid(renderSprite(), ui.tier);
  const text = toAnsi($("ansiTarget").value === "half" ? renderHalf(g) : renderSolid(g));
  try {
    await navigator.clipboard.writeText(text);
    flash("ANSI copied");
  } catch {
    flash("Clipboard unavailable");
  }
};

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
if (!localStorage.getItem("ghpe.seenHelp")) {
  localStorage.setItem("ghpe.seenHelp", "1");
  help.showModal();
}
