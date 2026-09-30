import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".onnx_data": "application/octet-stream",
  ".litertlm": "application/octet-stream",
  ".spiece": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

export function createHandler({ rootDir = process.cwd(), port = 8080 } = {}) {
  return (req, res) => {
    // Enable CORS and Cross-Origin Isolation for WebGPU & SharedArrayBuffer
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Accept-Ranges", "bytes");

    res.on("finish", () => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${res.statusCode}`);
    });

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    try {
      const parsedUrl = new URL(req.url, `http://localhost:${port}`);
      let pathname = decodeURIComponent(parsedUrl.pathname);

      if (pathname.endsWith("/")) {
        pathname += "index.html";
      }

      // Prevent directory traversal
      const safePath = path.normalize(path.join(rootDir, pathname));
      if (!safePath.startsWith(rootDir)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(safePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(safePath, "index.html");
        if (fs.existsSync(indexPath)) {
          serveFile(req, res, indexPath, fs.statSync(indexPath));
          return;
        }
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Directory listing forbidden");
        return;
      }

      serveFile(req, res, safePath, stat);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Internal Server Error: ${err.message}`);
      }
    }
  };
}

export function createServer({ rootDir = process.cwd(), port = 8080 } = {}) {
  return http.createServer(createHandler({ rootDir, port }));
}

export function createHttpsServer({ rootDir = process.cwd(), port = 8443, key, cert } = {}) {
  return https.createServer({ key, cert }, createHandler({ rootDir, port }));
}

function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const totalSize = stat.size;

  const range = req.headers.range;

  if (range && req.method === "GET") {
    // Parse Range header: bytes=start-end
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
      res.end();
      return;
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
      res.end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Content-Length": chunkSize,
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
    return;
  }

  // Normal Full File or HEAD request
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": totalSize,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

// Standalone execution: node server.js [port]
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const port = parseInt(process.env.PORT || process.argv[2] || "8080", 10);
  const httpsPort = parseInt(process.env.HTTPS_PORT || "8443", 10);
  const rootDir = process.cwd();

  const server = createServer({ rootDir, port });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Static Server] HTTP serving on http://localhost:${port} and http://0.0.0.0:${port}`);
    console.log(`[Static Server] WebGPU & Range requests enabled with native stream backpressure.`);
  });

  const keyPath = path.join(rootDir, "certs", "key.pem");
  const certPath = path.join(rootDir, "certs", "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    const httpsServer = createHttpsServer({ rootDir, port: httpsPort, key, cert });
    httpsServer.listen(httpsPort, "0.0.0.0", () => {
      console.log(`[Static Server] HTTPS serving on https://localhost:${httpsPort} and https://0.0.0.0:${httpsPort}`);
      console.log(`[Static Server] (Use HTTPS for mobile WebGPU testing: https://192.168.0.17:${httpsPort})`);
    });
  }
}
