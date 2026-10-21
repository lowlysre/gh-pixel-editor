import { DEFAULT_LIGHTING, TRANSPARENT, expandRows } from "./render.js";

const clone = (v) => JSON.parse(JSON.stringify(v));

export function blankState(w = 16, h = 16) {
  return {
    name: "sprite",
    mirror: false,
    grid: Array.from({ length: h }, () => Array(w).fill(TRANSPARENT)),
    legend: { B: [23, 30, 37, 44, 50, 86], E: 232 },
    lighting: { ...DEFAULT_LIGHTING },
    tiers: {},
  };
}

// The editor always works on the fully expanded grid.
export function fromSprite(sprite) {
  return {
    name: sprite.name,
    mirror: sprite.mirror === true,
    grid: expandRows(sprite),
    legend: clone(sprite.legend),
    lighting: { ...DEFAULT_LIGHTING, ...(sprite.lighting ?? {}) },
    tiers: clone(sprite.tiers ?? {}),
  };
}

export function toSprite(state) {
  const w = state.grid[0].length;
  const cols = state.mirror ? Math.floor(w / 2) : w;
  const sprite = { version: 1, name: state.name };
  if (state.mirror) sprite.mirror = true;
  sprite.rows = state.grid.map((r) => r.slice(0, cols).join(""));
  sprite.legend = clone(state.legend);
  const { dither, rim } = state.lighting;
  if (dither !== DEFAULT_LIGHTING.dither || rim !== DEFAULT_LIGHTING.rim) sprite.lighting = { dither, rim };
  if (Object.keys(state.tiers).length) sprite.tiers = clone(state.tiers);
  return sprite;
}

export function setPixel(grid, x, y, ch, mirrorDraw = false) {
  const w = grid[0].length;
  if (y < 0 || y >= grid.length || x < 0 || x >= w) return;
  grid[y][x] = ch;
  if (mirrorDraw) grid[y][w - 1 - x] = ch;
}

export function floodFill(grid, x, y, ch, mirrorDraw = false) {
  const from = grid[y]?.[x];
  if (from === undefined || from === ch) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (grid[cy]?.[cx] !== from) continue;
    setPixel(grid, cx, cy, ch, mirrorDraw);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

// Crops or pads (transparent) anchored at the top left.
export function resizeGrid(grid, w, h) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => grid[y]?.[x] ?? TRANSPARENT),
  );
}

export class History {
  constructor(limit = 200) {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = limit;
  }
  // Call with the snapshot taken before a change.
  push(before) {
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }
}

export const snapshot = (state) => JSON.stringify(state);
export const restore = (snap) => JSON.parse(snap);
