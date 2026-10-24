// Dev-only static server: node scripts/serve.mjs [port]. Serves ./site.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown", ".svg": "image/svg+xml" };
const port = Number(process.argv[2] ?? 8080);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\]\.\.)+/, "");
  try {
    const file = join(root, path.endsWith("/") || path.endsWith("\\") ? path + "index.html" : path);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
