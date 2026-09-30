import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "./server.js";

describe("Robust Static File Server with Flow Control & Range Support", () => {
  let server;
  const PORT = 8089;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    server = createServer({ rootDir: path.resolve(__dirname), port: PORT });
    await new Promise((resolve) => server.listen(PORT, resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("serves static HTML file with correct MIME type and CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/04_custom_triage_demo/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  it("supports HTTP Range requests (206 Partial Content)", async () => {
    const res = await fetch(`${BASE_URL}/04_custom_triage_demo/index.html`, {
      headers: { Range: "bytes=0-99" }
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    const text = await res.text();
    expect(text.length).toBe(100);
  });

  it("supports HEAD requests with valid Content-Length", async () => {
    const res = await fetch(`${BASE_URL}/index.html`, { method: "HEAD" });
    expect(res.status).toBe(200);
    const length = Number(res.headers.get("content-length"));
    expect(length).toBeGreaterThan(0);

    // If local compiled binary model exists, verify it as well
    const litertPath = path.join(__dirname, "dist_litert", "model.litertlm");
    if (fs.existsSync(litertPath)) {
      const modelRes = await fetch(`${BASE_URL}/dist_litert/model.litertlm`, { method: "HEAD" });
      expect(modelRes.status).toBe(200);
      const modelLength = Number(modelRes.headers.get("content-length"));
      expect(modelLength).toBeGreaterThan(500 * 1024 * 1024);
    }
  });
});
