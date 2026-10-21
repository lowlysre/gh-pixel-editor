import { PALETTE } from "./xterm.js";

const SVG_PX = 10;

// 256-colour escapes only. Consecutive cells with the same style share one escape.
export function toAnsi(cells) {
  const out = [];
  for (const row of cells) {
    let line = "";
    let style = "";
    for (const c of row) {
      const next =
        (c.fg === null ? "" : `\x1b[38;5;${c.fg}m`) + (c.bg === null ? "" : `\x1b[48;5;${c.bg}m`);
      if (next !== style) {
        line += "\x1b[0m" + next;
        style = next;
      }
      line += c.glyph;
    }
    out.push(line + "\x1b[0m");
  }
  return out.join("\n") + "\n";
}

export const toPlainText = (lines) => lines.join("\n") + "\n";

// One <rect> per horizontal run of the same colour.
export function toSvg({ w, h, px }, name = "sprite") {
  const rects = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const p = px[y][x];
      if (!p) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < w && px[y][end] && px[y][end].color === p.color) end++;
      rects.push(
        `<rect x="${x * SVG_PX}" y="${y * SVG_PX}" width="${(end - x) * SVG_PX}" height="${SVG_PX}" fill="${PALETTE[p.color]}"/>`,
      );
      x = end;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * SVG_PX} ${h * SVG_PX}" width="${w * SVG_PX}" height="${h * SVG_PX}" shape-rendering="crispEdges" role="img" aria-label="${name}">\n` +
    rects.map((r) => "  " + r).join("\n") +
    "\n</svg>\n"
  );
}
