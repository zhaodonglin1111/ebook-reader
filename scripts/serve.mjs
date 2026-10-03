// 零依赖本地静态服务器：ES Module 在 file:// 下会被浏览器 CORS 拦截，本地开一个 http 口即可。
// 用法：node scripts/serve.mjs   （浏览器访问 http://127.0.0.1:8642/）
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const ROOT = normalize(join(import.meta.dirname, ".."));
const PORT = 8642;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const rel = urlPath === "/" ? "index.html" : urlPath.slice(1);
    const file = normalize(join(ROOT, rel));
    // 目录穿越防护：解析后必须仍在仓库根内
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error("out of root");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`电子书阅读器：http://127.0.0.1:${PORT}/`);
});
