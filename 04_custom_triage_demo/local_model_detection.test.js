import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Local Compiled Models Detection & Placement", () => {
  const rootDir = path.resolve(__dirname, "..");
  const distLitertDir = path.join(rootDir, "dist_litert");
  const litertModelFile = path.join(distLitertDir, "model.litertlm");

  const distOnnxDir = path.join(rootDir, "dist_onnx");
  const onnxConfigFile = path.join(distOnnxDir, "config.json");
  const onnxTokenizerFile = path.join(distOnnxDir, "tokenizer.json");
  const onnxModelFile = path.join(distOnnxDir, "onnx", "decoder_model_merged_q4f16.onnx");

  it("verifies LiteRT-LM local compiled model exists and has valid size (> 500MB)", () => {
    expect(fs.existsSync(litertModelFile), `Expected ${litertModelFile} to exist`).toBe(true);
    const stats = fs.statSync(litertModelFile);
    const sizeMb = stats.size / (1024 * 1024);
    expect(sizeMb).toBeGreaterThan(500);
  });

  it("verifies Transformers.js ONNX local compiled model and configs exist", () => {
    expect(fs.existsSync(onnxConfigFile), `Expected ${onnxConfigFile} to exist`).toBe(true);
    expect(fs.existsSync(onnxTokenizerFile), `Expected ${onnxTokenizerFile} to exist`).toBe(true);
    expect(fs.existsSync(onnxModelFile), `Expected ${onnxModelFile} to exist`).toBe(true);
  });

  it("verifies local models are served over HTTP server with 200 OK", async () => {
    const litertRes = await fetch("http://localhost:8080/dist_litert/model.litertlm", { method: "HEAD" });
    expect(litertRes.status).toBe(200);

    const onnxRes = await fetch("http://localhost:8080/dist_onnx/config.json", { method: "GET" });
    expect(onnxRes.status).toBe(200);
    const configData = await onnxRes.json();
    expect(configData.model_type || configData.architectures).toBeDefined();
  });

  it("verifies index.html has Constrained Decoding enabled by default with contrast descriptions", () => {
    const htmlPath = path.join(__dirname, "index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Must be checked by default
    expect(html).toContain('id="constrainedDecodingToggle" checked');
    expect(html).toContain("推奨・デフォルト");
    expect(html).toContain("ON（推奨・デフォルト）");
    expect(html).toContain("OFF（自由生成）");
    expect(html).toContain("StructuredOutputProcessor");
    expect(html).toContain('value="nano"');
  });

  it("verifies index.html inline ES module script has no syntax errors", () => {
    const htmlPath = path.join(__dirname, "index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(scriptMatch).toBeTruthy();

    const tmpFile = path.join(__dirname, "temp_syntax_check.mjs");
    fs.writeFileSync(tmpFile, scriptMatch[1], "utf-8");
    try {
      const { execSync } = require("child_process");
      execSync(`node --check "${tmpFile}"`, { stdio: "pipe" });
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it("verifies index.html uses isolated session with getCleanNanoSession and destroy for Gemini Nano", () => {
    const htmlPath = path.join(__dirname, "index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    expect(html).toContain("getCleanNanoSession");
    expect(html).toContain("activeSession = await getCleanNanoSession(nanoSession");
    expect(html).toContain("activeSession.destroy()");
  });
});




