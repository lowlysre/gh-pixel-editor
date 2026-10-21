// Generates provisional fixtures from THIS editor's renderer. They are not the quest-ops
// reference output; parity stays unverified until quest-ops supplies Python renderer output.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHalf, renderPlain, renderSolid, shadeGrid } from "../site/js/render.js";
import { toAnsi, toPlainText, toSvg } from "../site/js/export.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildFixtures(sprite) {
  const out = {};
  const tiers = [0, ...Object.keys(sprite.tiers ?? {}).map(Number)];
  for (const tier of tiers) {
    const sfx = tier ? `.tier${tier}` : "";
    const g = shadeGrid(sprite, tier);
    out[`${sprite.name}${sfx}.solid.ansi`] = toAnsi(renderSolid(g));
    out[`${sprite.name}${sfx}.half.ansi`] = toAnsi(renderHalf(g));
    out[`${sprite.name}${sfx}.plain.txt`] = toPlainText(renderPlain(g));
    out[`${sprite.name}${sfx}.svg`] = toSvg(g, sprite.name);
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`) {
  const sprite = JSON.parse(readFileSync(join(root, "site/spec/examples/slime.json"), "utf8"));
  mkdirSync(join(root, "fixtures"), { recursive: true });
  for (const [name, body] of Object.entries(buildFixtures(sprite))) writeFileSync(join(root, "fixtures", name), body);
  console.log("fixtures written");
}
