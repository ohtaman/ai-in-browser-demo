import { describe, it, expect, vi } from "vitest";
import { 
  prepareChatInputs, 
  createGenerationOptions, 
  createStreamerConfig, 
  createRobustStreamer,
  extractGeneratedText,
  formatTransformersProgress,
  generateTextStreaming
} from "./transformers_runner.js";

describe("Transformers.js Input Preparation & Runner Logic", () => {
  it("formats progress callback payload with percentage and MBs", () => {
    const res = formatTransformersProgress({
      status: "progress",
      file: "onnx/model_q4f16.onnx",
      progress: 45.3,
      loaded: 450000000,
      total: 1000000000,
    });
    expect(res.percent).toBe(45);
    expect(res.text).toContain("model_q4f16.onnx");
    expect(res.text).toContain("45%");
    expect(res.text).toContain("MB");

    const doneRes = formatTransformersProgress({
      status: "done",
      file: "tokenizer.json",
    });
    expect(doneRes.percent).toBe(100);
    expect(doneRes.text).toContain("tokenizer.json");

    const initRes = formatTransformersProgress({
      status: "initiate",
      file: "model.onnx",
    });
    expect(initRes.percent).toBe(0);

    const downloadRes = formatTransformersProgress({
      status: "download",
      file: "onnx/embed_tokens_q4f16.onnx_data",
    });
    expect(downloadRes.text).toContain("embed_tokens_q4f16.onnx_data");

    const totalRes = formatTransformersProgress({
      status: "progress_total",
      progress: 62.4,
      loaded: 1800000000,
      total: 3000000000,
    });
    expect(totalRes.percent).toBe(62);
    expect(totalRes.text).toContain("62%");
    expect(totalRes.text).toContain("1716.6MB");

    const readyRes = formatTransformersProgress({
      status: "ready",
    });
    expect(readyRes.percent).toBe(100);
    expect(readyRes.text).toContain("準備完了");

    const nullRes = formatTransformersProgress(null);
    expect(nullRes.percent).toBe(0);
  });
  it("formats user input string into valid chat messages array", () => {
    const messages = prepareChatInputs("患者: 38歳女性、歩行不可", "あなたはトリアージ判定スペシャリストです");
    expect(messages).toEqual([
      { role: "system", content: "あなたはトリアージ判定スペシャリストです" },
      { role: "user", content: "患者: 38歳女性、歩行不可" }
    ]);
  });

  it("handles empty system prompt gracefully", () => {
    const messages = prepareChatInputs("患者: 38歳女性、歩行不可", "");
    expect(messages).toEqual([
      { role: "user", content: "患者: 38歳女性、歩行不可" }
    ]);
  });

  it("creates robust streamer without duplicating chunk callbacks", () => {
    const onChunk = vi.fn();

    // Transformers.js 実装: on_finalized_text が callback_function を呼ぶ形式
    class RealTransformersStreamer {
      constructor(tokenizer, options) {
        this.tokenizer = tokenizer;
        this.options = options;
        this.callback_function = options.callback_function;
      }
      on_finalized_text(text) {
        if (text && this.callback_function) {
          this.callback_function(text);
        }
      }
    }

    const streamer = createRobustStreamer(RealTransformersStreamer, {}, onChunk);
    streamer.on_finalized_text("chunk 1");
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith("chunk 1");

    // フォールバック実装: on_finalized_text が callback_function を呼ばない形式
    const onChunkFallback = vi.fn();
    class FallbackStreamer {
      constructor(tokenizer, options) {
        this.tokenizer = tokenizer;
        this.options = options;
      }
      on_finalized_text(text) {
        // 何もしない基底
      }
    }

    const fallbackStreamer = createRobustStreamer(FallbackStreamer, {}, onChunkFallback);
    fallbackStreamer.on_finalized_text("chunk 2");
    expect(onChunkFallback).toHaveBeenCalledTimes(1);
    expect(onChunkFallback).toHaveBeenCalledWith("chunk 2");
  });

  it("extracts text correctly from generator output in various formats", () => {
    // 形式1: 単純な文字列
    expect(extractGeneratedText([{ generated_text: "判定結果A" }])).toBe("判定結果A");

    // 形式2: Chat形式の配列
    expect(extractGeneratedText([{
      generated_text: [
        { role: "user", content: "入力" },
        { role: "assistant", content: "判定結果B" }
      ]
    }])).toBe("判定結果B");

    // 形式3: role: 'model' (Gemma仕様)
    expect(extractGeneratedText([{
      generated_text: [
        { role: "user", content: "入力" },
        { role: "model", content: "判定結果C" }
      ]
    }])).toBe("判定結果C");

    // 形式4: 直接文字列
    expect(extractGeneratedText("直接文字列")).toBe("直接文字列");
  });

  it("forwards logits_processor parameter to generator when specified", async () => {
    let capturedOptions = null;
    const mockGenerator = vi.fn().mockImplementation((messages, opts) => {
      capturedOptions = opts;
      return Promise.resolve([{ generated_text: "output" }]);
    });
    mockGenerator.tokenizer = {};

    class DummyStreamer {
      constructor(tokenizer, options) {
        this.options = options;
      }
    }

    const dummyLogitsProcessor = [{ process: vi.fn() }];
    await generateTextStreaming(
      mockGenerator,
      DummyStreamer,
      [{ role: "user", content: "hello" }],
      () => {},
      { maxNewTokens: 150, logits_processor: dummyLogitsProcessor }
    );

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.max_new_tokens).toBe(150);
    expect(capturedOptions.logits_processor).toBe(dummyLogitsProcessor);
  });
});
