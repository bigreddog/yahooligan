import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(
  project,
  process.argv.includes("--dist") ? "dist" : ".",
);
const port = Number(process.env.PORT || 8000);
const host =
  process.argv.find((arg) => arg.startsWith("--host="))?.slice(7) ||
  "127.0.0.1";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (
      (!relative.startsWith("js/") &&
        !relative.startsWith("css/") &&
        !relative.startsWith("assets/") &&
        relative !== "index.html") ||
      !file.startsWith(root + path.sep)
    ) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "text/plain",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(port, host, () =>
  console.log(
    `Yahooligan: http://${host}:${port}${process.argv.includes("--dist") ? " (production build)" : ""}`,
  ),
);
