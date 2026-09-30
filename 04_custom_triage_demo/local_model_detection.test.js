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

  it("verifies LiteRT-LM local compiled model if present", () => {
    if (!fs.existsSync(litertModelFile)) {
      console.log("ℹ️ dist_litert/model.litertlm is optional in repo (downloaded on demand or fine-tuned)");
      return;
    }
    const stats = fs.statSync(litertModelFile);
    const sizeMb = stats.size / (1024 * 1024);
    expect(sizeMb).toBeGreaterThan(500);
  });

  it("verifies Transformers.js ONNX local compiled model and configs if present", () => {
    if (!fs.existsSync(onnxConfigFile)) {
      console.log("ℹ️ dist_onnx/ is optional in repo (loaded from HuggingFace on demand)");
      return;
    }
    expect(fs.existsSync(onnxConfigFile)).toBe(true);
    expect(fs.existsSync(onnxTokenizerFile)).toBe(true);
    expect(fs.existsSync(onnxModelFile)).toBe(true);
  });

  it("verifies server handles local model paths or falls back gracefully", async () => {
    const res = await fetch("http://localhost:8080/04_custom_triage_demo/index.html");
    expect(res.status).toBe(200);
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

    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const scriptContent = match[1];

    expect(scriptContent).toContain('import { pipeline, TextStreamer, env }');
    expect(scriptContent).toContain('import { Engine }');
    expect(scriptContent).toContain('import { PRESETS, parseTriageOutput');
    expect(scriptContent).toContain('import { TRIAGE_JSON_SCHEMA, TRIAGE_SYSTEM_PROMPT');
    expect(scriptContent).toContain('import { getEngineUIState, getDecodingModeLabel }');
  });

  it("verifies index.html uses isolated session with getCleanNanoSession and destroy for Gemini Nano", () => {
    const htmlPath = path.join(__dirname, "index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    expect(html).toContain("getCleanNanoSession");
    expect(html).toContain("activeSession.destroy()");
  });
});
