// Builds the documentation site from Markdown: site/docs/*.md and the spec
// (site/spec/sprite-format.md) become HTML pages in site/.
// The renderer handles only what these docs use: headings, paragraphs, lists,
// tables, fenced code, raw HTML blocks, inline code, bold, links and bare URLs.
// Usage: node scripts/build-site.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { shadeGrid } from "../site/js/render.js";
import { toSvg } from "../site/js/export.js";
import { PALETTE } from "../site/js/xterm.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://lowlysre.github.io/gh-pixel-editor/";

// src is relative to site/; out is the page written to site/.
export const PAGES = [
  { src: "docs/index.md", out: "index.html", nav: null, landing: true },
  { src: "docs/tutorial.md", out: "tutorial.html", nav: "Tutorial" },
  { src: "docs/how-to.md", out: "how-to.html", nav: "How-to guides" },
  { src: "spec/sprite-format.md", out: "spec.html", nav: "Reference" },
  { src: "docs/explanation.md", out: "explanation.html", nav: "Explanation" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Links are written relative to the Markdown file so they work on GitHub too.
// On the site they resolve from site/, and links to another page's .md become its .html.
function rebase(href, srcDir) {
  if (/^([a-z]+:|#|\/)/.test(href)) return href;
  const [path, hash = ""] = href.split("#");
  const resolved = posix.normalize(posix.join(srcDir, path));
  const page = PAGES.find((p) => p.src === resolved);
  return (page ? page.out : resolved) + (hash ? `#${hash}` : "");
}

function inline(text, srcDir) {
  const code = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${rebase(h, srcDir)}">${t}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(code[i])}</code>`);
}

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const BLOCK_START = /^(#|```|\||- |\d+\. |<)/;

export function renderMarkdown(md, srcDir = "spec") {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const toc = [];
  let title = "";
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(body.join("\n"))}</code></pre>`);
    } else if (line.startsWith("<")) {
      const raw = [];
      for (; i < lines.length && lines[i].trim(); i++) raw.push(lines[i]);
      out.push(raw.join("\n").replace(/href="([^"]+)"/g, (_, h) => `href="${rebase(h, srcDir)}"`));
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const html = inline(line.slice(level + 1), srcDir);
      if (level === 1) {
        title = html;
        out.push(`<h1>${html}</h1>`);
      } else {
        const id = slug(html);
        if (level === 2) toc.push({ id, html });
        out.push(`<h${level} id="${id}"><a href="#${id}">${html}</a></h${level}>`);
      }
      i++;
    } else if (line.startsWith("|")) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].startsWith("|"); i++) rows.push(cells(lines[i]));
      const tr = (r, tag) => `<tr>${r.map((c) => `<${tag}>${inline(c, srcDir)}</${tag}>`).join("")}</tr>`;
      out.push(`<table><thead>${tr(head, "th")}</thead><tbody>${rows.map((r) => tr(r, "td")).join("")}</tbody></table>`);
    } else if (/^(- |\d+\. )/.test(line)) {
      const tag = line.startsWith("- ") ? "ul" : "ol";
      const items = [];
      for (; i < lines.length && /^(- |\d+\. )/.test(lines[i]); i++) items.push(lines[i].replace(/^(- |\d+\. )/, ""));
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, srcDir)}</li>`).join("")}</${tag}>`);
    } else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]); i++) para.push(lines[i].trim());
      out.push(`<p>${inline(para.join(" "), srcDir)}</p>`);
    }
  }
  return { title, toc, body: out.join("\n") };
}

// ---- pixel-art wordmark ----------------------------------------------------
// 5x7 glyphs, shaded top to bottom with a teal ramp and a one-pixel drop shadow.
export const FONT = {
  A: ".###.#...##...#######...##...##...#",
  B: "####.#...##...#####.#...##...#####.",
  C: ".#####....#....#....#....#.....####",
  E: "######....#....####.#....#....#####",
  F: "######....#....####.#....#....#....",
  G: ".#####....#....#.####...##...#.####",
  H: "#...##...##...#######...##...##...#",
  I: "#####..#....#....#....#....#..#####",
  L: "#....#....#....#....#....#....#####",
  M: "#...###.###.#.##.#.##...##...##...#",
  N: "#...###..##.#.##.#.##..###...##...#",
  O: ".###.#...##...##...##...##...#.###.",
  P: "####.#...##...#####.#....#....#....",
  R: "####.#...##...#####.#.#..#..#.#...#",
  S: ".#####....#.....###.....#....#####.",
  T: "#####..#....#....#....#....#....#..",
  U: "#...##...##...##...##...##...#.###.",
  X: "#...##...#.#.#...#...#.#.#...##...#",
};
export const TEAL = [86, 50, 44, 43, 37, 30, 23];
export const GREY = [255, 253, 251, 250, 249, 248, 247];
const SHADOW = 236;

export function wordmark(text, px, ramp = TEAL) {
  const glyphs = [...text.toUpperCase()];
  const cols = glyphs.length * 6 - 1;
  const rects = [];
  const at = (gx, x, y, fill) =>
    rects.push(`<rect x="${(gx + x) * px}" y="${y * px}" width="${px}" height="${px}" fill="${fill}"/>`);
  for (const pass of ["shadow", "face"]) {
    glyphs.forEach((ch, i) => {
      const bits = FONT[ch];
      if (!bits) return;
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++) {
          if (bits[y * 5 + x] !== "#") continue;
          if (pass === "shadow") at(i * 6 + 1, x, y + 1, PALETTE[SHADOW]);
          else at(i * 6, x, y, PALETTE[ramp[y]]);
        }
    });
  }
  return `<svg class="wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(cols + 1) * px} ${8 * px}" width="${(cols + 1) * px}" height="${8 * px}" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`;
}

function heroSprite() {
  const slime = JSON.parse(readFileSync(join(root, "site", "spec", "examples", "slime.json"), "utf8"));
  return toSvg(shadeGrid(slime, 0), "slime, the example sprite").replace("<svg ", '<svg class="hero-sprite" ').trim();
}

// ---- page shell -------------------------------------------------------------
export function buildPage(page, md) {
  const srcDir = posix.dirname(page.src);
  const { title, toc, body } = renderMarkdown(md, srcDir);
  const plainTitle = title.replace(/<[^>]+>/g, "");
  const docTitle = page.landing ? `${plainTitle} for GitHub Actions` : `${plainTitle} · Pixel sprite format for GitHub Actions`;
  const nav = PAGES.filter((p) => p.nav)
    .map((p) => `    <a href="${p.out}"${p === page ? ' aria-current="page"' : ""}>${p.nav}</a>`)
    .join("\n");
  const main = page.landing
    ? body.replace(
        `<h1>${title}</h1>`,
        `<div class="hero">\n<h1><span class="sr-only">${plainTitle} for GitHub Actions</span>${wordmark(plainTitle, 6)}${wordmark("for GitHub Actions", 3, GREY)}</h1>\n${heroSprite()}\n</div>`,
      )
    : body;
  const tocHtml =
    !page.landing && toc.length > 1
      ? `<nav class="toc" aria-label="On this page">\n<ul>\n${toc.map((t) => `<li><a href="#${t.id}">${t.html.replace(/<\/?code>/g, "")}</a></li>`).join("\n")}\n</ul>\n</nav>\n`
      : "";
  return `<!doctype html>
<!-- Generated by scripts/build-site.mjs from site/${page.src}. Do not edit. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docTitle}</title>
<meta name="description" content="Pixel-art sprites for GitHub Actions logs: a JSON format, a browser editor, and ANSI output that prints cleanly in the GitHub Actions log viewer.">
<meta property="og:type" content="website">
<meta property="og:title" content="${docTitle}">
<meta property="og:description" content="Pixel-art sprites that print cleanly in GitHub Actions logs.">
<meta property="og:url" content="${SITE_URL}${page.out === "index.html" ? "" : page.out}">
<meta name="theme-color" content="#0d1117">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body class="doc${page.landing ? " landing" : ""}">
<header>
  <a class="brand" href="./" aria-label="Pixel sprite format for GitHub Actions: home"><img src="favicon.svg" alt="" width="20" height="20">${wordmark("Pixel sprite format", 2)}<span class="brand-sub">for GitHub Actions</span></a>
  <nav aria-label="Site">
${nav}
    <a class="cta" href="editor.html">Open editor</a>
    <a href="https://github.com/lowlysre/gh-pixel-editor">GitHub</a>
  </nav>
</header>
<div class="docwrap${tocHtml ? "" : " notoc"}">
${tocHtml}<main>
${main}
</main>
</div>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = [];
  for (const page of PAGES) {
    const html = buildPage(page, readFileSync(join(root, "site", page.src), "utf8"));
    const out = join(root, "site", page.out);
    if (!process.argv.includes("--check")) writeFileSync(out, html);
    else if (readFileSync(out, "utf8").replace(/\r\n/g, "\n") !== html) stale.push(page.out);
  }
  if (stale.length) {
    console.error(`stale: ${stale.join(", ")}; run npm run build-site`);
    process.exit(1);
  }
}
