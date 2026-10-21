// Vendors the sprite spec from a local quest-ops checkout into site/spec and
// pins it to that checkout's commit SHA. Usage: node scripts/sync-spec.mjs <quest-ops-path>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) {
  console.error("usage: node scripts/sync-spec.mjs <quest-ops-path>");
  process.exit(2);
}
const src = resolve(process.argv[2]);
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "spec");
// Optional 2nd arg: git checkout to read the commit from, when <quest-ops-path> has no .git.
const gitDir = resolve(process.argv[3] ?? src);
const git = (...args) =>
  execFileSync("git", ["-C", gitDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const files = [
  ["docs/sprite-format.md", "sprite-format.md"],
  ["schema/sprite.schema.json", "sprite.schema.json"],
  ...readdirSync(join(src, "schema", "examples"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [`schema/examples/${f}`, `examples/${f}`]),
];

rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, "examples"), { recursive: true });
const sha256 = {};
for (const [from, to] of files) {
  cpSync(join(src, from), join(dest, to));
  sha256[to] = createHash("sha256").update(readFileSync(join(dest, to))).digest("hex");
}

const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};
const dirty = files.some(([from]) => tryGit("rev-parse", `HEAD:${from}`) !== git("hash-object", join(src, from)));
const source = {
  repo: "lowlydba/quest-ops",
  baseCommit: git("rev-parse", "HEAD"),
  uncommittedAtSync: dirty,
  sha256,
};
writeFileSync(join(dest, "SOURCE.json"), JSON.stringify(source, null, 2) + "\n");
console.log(`synced ${files.length} files from ${source.repo}@${source.baseCommit.slice(0, 12)}${dirty ? " (uncommitted)" : ""}`);
