// xterm-256 palette: 0-15 system, 16-231 6x6x6 cube, 232-255 grayscale ramp.
const SYSTEM = [
  "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
  "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
];
const CUBE = [0, 95, 135, 175, 215, 255];
const hex = (n) => n.toString(16).padStart(2, "0");

export const PALETTE = Array.from({ length: 256 }, (_, i) => {
  if (i < 16) return SYSTEM[i];
  if (i < 232) {
    const n = i - 16;
    return "#" + [CUBE[Math.floor(n / 36)], CUBE[Math.floor(n / 6) % 6], CUBE[n % 6]].map(hex).join("");
  }
  const v = 8 + 10 * (i - 232);
  return "#" + hex(v).repeat(3);
});

export const isColor = (n) => Number.isInteger(n) && n >= 0 && n <= 255;
