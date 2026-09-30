import { describe, it, expect } from "vitest";
import { getEngineUIState, getDecodingModeLabel } from "./triage_ui_state.js";

describe("Triage Engine UI State Machine", () => {
  it("initial state: engine not loaded, can load, cannot run", () => {
    const state = getEngineUIState({
      selectedEngine: "transformers",
      tfLoaded: false,
      litertLoaded: false,
      isLoading: false,
    });

    expect(state.canLoad).toBe(true);
    expect(state.canRun).toBe(false);
    expect(state.loadBtnText).toBe("モデルロード");
    expect(state.statusText).toContain("モデルロード");
  });

  it("after transformers loaded: can run, load button disabled", () => {
    const state = getEngineUIState({
      selectedEngine: "transformers",
      tfLoaded: true,
      litertLoaded: false,
      isLoading: false,
    });

    expect(state.canLoad).toBe(false);
    expect(state.canRun).toBe(true);
    expect(state.loadBtnText).toBe("ロード完了");
    expect(state.statusText).toContain("準備完了");
  });

  it("switch to un-loaded LiteRT: load button becomes enabled again", () => {
    const state = getEngineUIState({
      selectedEngine: "litert",
      tfLoaded: true,
      litertLoaded: false,
      isLoading: false,
    });

    expect(state.canLoad).toBe(true);
    expect(state.canRun).toBe(false);
    expect(state.loadBtnText).toBe("モデルロード");
    expect(state.statusText).toContain("モデルロード");
  });

  it("both engines loaded: switching toggles ready state without reloading", () => {
    const stateTf = getEngineUIState({
      selectedEngine: "transformers",
      tfLoaded: true,
      litertLoaded: true,
      isLoading: false,
    });
    expect(stateTf.canLoad).toBe(false);
    expect(stateTf.canRun).toBe(true);

    const stateLite = getEngineUIState({
      selectedEngine: "litert",
      tfLoaded: true,
      litertLoaded: true,
      isLoading: false,
    });
    expect(stateLite.canLoad).toBe(false);
    expect(stateLite.canRun).toBe(true);
  });

  it("during loading: both buttons disabled and button text shows loading", () => {
    const state = getEngineUIState({
      selectedEngine: "litert",
      tfLoaded: true,
      litertLoaded: false,
      isLoading: true,
    });

    expect(state.canLoad).toBe(false);
    expect(state.canRun).toBe(false);
    expect(state.loadBtnText).toBe("ロード中...");
    expect(state.statusText).toContain("LiteRT-LM.js をロード中...");
  });

  it("gemini nano state: manages load/ready transitions accurately", () => {
    const uninit = getEngineUIState({
      selectedEngine: "nano",
      tfLoaded: false,
      litertLoaded: false,
      nanoLoaded: false,
      isLoading: false,
    });
    expect(uninit.canLoad).toBe(true);
    expect(uninit.canRun).toBe(false);
    expect(uninit.statusText).toContain("Gemini Nano");

    const ready = getEngineUIState({
      selectedEngine: "nano",
      tfLoaded: false,
      litertLoaded: false,
      nanoLoaded: true,
      isLoading: false,
    });
    expect(ready.canLoad).toBe(false);
    expect(ready.canRun).toBe(true);
    expect(ready.statusText).toContain("準備完了");
  });

  describe("getDecodingModeLabel", () => {
    it("returns Structured Output label when ON", () => {
      expect(getDecodingModeLabel(true)).toBe("制約デコーディング適用 (Structured Output)");
    });

    it("returns free generation label when OFF", () => {
      expect(getDecodingModeLabel(false)).toBe("制約なし (自由生成)");
    });
  });

  describe("constrainedDecodingAvailable", () => {
    it("is true for transformers engine", () => {
      const state = getEngineUIState({
        selectedEngine: "transformers",
        tfLoaded: false,
        litertLoaded: false,
        isLoading: false,
      });
      expect(state.constrainedDecodingAvailable).toBe(true);
    });

    it("is false for litert engine", () => {
      const state = getEngineUIState({
        selectedEngine: "litert",
        tfLoaded: false,
        litertLoaded: false,
        isLoading: false,
      });
      expect(state.constrainedDecodingAvailable).toBe(false);
    });

    it("is true for nano engine", () => {
      const state = getEngineUIState({
        selectedEngine: "nano",
        tfLoaded: false,
        litertLoaded: false,
        nanoLoaded: false,
        isLoading: false,
      });
      expect(state.constrainedDecodingAvailable).toBe(true);
    });

    it("is false for litert even when loaded", () => {
      const state = getEngineUIState({
        selectedEngine: "litert",
        tfLoaded: false,
        litertLoaded: true,
        isLoading: false,
      });
      expect(state.constrainedDecodingAvailable).toBe(false);
      expect(state.canRun).toBe(true);
    });

    it("is true for webllm engine", () => {
      const state = getEngineUIState({
        selectedEngine: "webllm",
        tfLoaded: false,
        litertLoaded: false,
        webllmLoaded: false,
        isLoading: false,
      });
      expect(state.constrainedDecodingAvailable).toBe(true);
      expect(state.statusText).toContain("WebLLM");
    });

    it("handles webllm loaded ready state", () => {
      const state = getEngineUIState({
        selectedEngine: "webllm",
        tfLoaded: false,
        litertLoaded: false,
        webllmLoaded: true,
        isLoading: false,
      });
      expect(state.canLoad).toBe(false);
      expect(state.canRun).toBe(true);
      expect(state.loadBtnText).toBe("ロード完了");
      expect(state.statusText).toContain("WebLLM (MLC-LLM) 準備完了");
    });
  });
});
