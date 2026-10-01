/**
 * Transformers.js vs LiteRT-LM 比較 Arena ロジック
 * 
 * 公平な比較のため、同一の Gemma Tokenizer による正確なトークン数計測と
 * 文字数（char/s）の併記を行います。
 */
import { pipeline, TextStreamer, AutoTokenizer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";
import { Engine } from "https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm";
import { calculateTokenSpeed } from "../shared/llm_utils.js";
import { prepareChatInputs, createTextGenerator, generateTextStreaming, formatTransformersProgress } from "../01_transformers_js/transformers_runner.js";

// DOM 要素
const promptInput = document.getElementById("promptInput");
const maxTokensInput = document.getElementById("maxTokensInput");
const benchmarkStatus = document.getElementById("benchmarkStatus");
const runSequentialBtn = document.getElementById("runSequentialBtn");

function getMaxTokens() {
  if (!maxTokensInput) return 2048;
  const val = parseInt(maxTokensInput.value, 10);
  return isNaN(val) || val <= 0 ? 2048 : val;
}

// Transformers.js DOM
const loadTfBtn = document.getElementById("loadTfBtn");
const runTfBtn = document.getElementById("runTfBtn");
const tfStatus = document.getElementById("tfStatus");
const tfOutput = document.getElementById("tfOutput");
const tfSpeed = document.getElementById("tfSpeed");
const tfTtft = document.getElementById("tfTtft");
const tfTokens = document.getElementById("tfTokens");
const tfTime = document.getElementById("tfTime");

// LiteRT-LM DOM
const loadLiteRtBtn = document.getElementById("loadLiteRtBtn");
const runLiteRtBtn = document.getElementById("runLiteRtBtn");
const litertStatus = document.getElementById("litertStatus");
const litertOutput = document.getElementById("litertOutput");
const litertSpeed = document.getElementById("litertSpeed");
const litertTtft = document.getElementById("litertTtft");
const litertTokens = document.getElementById("litertTokens");
const litertTime = document.getElementById("litertTime");

// モデル設定 (ローカル優先、フォールバックリモート)
const TF_MODEL_ID = "../dist_onnx";
const TF_REMOTE_ID = "onnx-community/gemma-4-E2B-it-ONNX";

const LITERT_LOCAL_URL = "../dist_litert/model.litertlm";
const LITERT_REMOTE_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm";

let tfGenerator = null;
let litertEngine = null;
let sharedTokenizer = null;

// 共通トークナイザ取得
export async function getSharedTokenizer() {
  if (sharedTokenizer) return sharedTokenizer;
  if (tfGenerator && tfGenerator.tokenizer) {
    sharedTokenizer = tfGenerator.tokenizer;
    return sharedTokenizer;
  }
  try {
    sharedTokenizer = await AutoTokenizer.from_pretrained(TF_MODEL_ID);
  } catch (e) {
    try {
      sharedTokenizer = await AutoTokenizer.from_pretrained(TF_REMOTE_ID);
    } catch (err) {
      console.warn("トークナイザの事前ロード失敗:", err);
    }
  }
  return sharedTokenizer;
}

// 正確なトークン数 & 文字数カウント
export async function countTokensAndChars(text) {
  const charCount = text ? text.length : 0;
  if (!text || !text.trim()) {
    return { tokenCount: 0, charCount: 0 };
  }

  const tokenizer = await getSharedTokenizer();
  if (tokenizer) {
    try {
      const encoded = await tokenizer(text);
      const tokenCount = encoded.input_ids?.dims
        ? encoded.input_ids.dims[1]
        : (encoded.input_ids?.length || encoded.input_ids?.size || 0);
      return { tokenCount, charCount };
    } catch (e) {
      console.warn("トークナイズエラー、言語平均推計値を使用:", e);
    }
  }

  // フォールバック: Gemma 日本語では 1トークンあたり約 1.5文字
  const tokenCount = Math.max(1, Math.round(charCount / 1.5));
  return { tokenCount, charCount };
}

// プリセットボタン
document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    promptInput.value = btn.getAttribute("data-text");
  });
});

function updateReadyState() {
  if (tfGenerator && litertEngine) {
    benchmarkStatus.textContent = "両モデルのロード完了！順次ベンチマークを実行できます。";
    runSequentialBtn.disabled = false;
  } else if (tfGenerator) {
    benchmarkStatus.textContent = "Transformers.js のみ準備完了（LiteRT-LM をロードしてください）";
  } else if (litertEngine) {
    benchmarkStatus.textContent = "LiteRT-LM のみ準備完了（Transformers.js をロードしてください）";
  }
}

// -------------------------------------------------------------
// [A] Transformers.js ロード & 実行
// -------------------------------------------------------------
loadTfBtn.addEventListener("click", async () => {
  loadTfBtn.disabled = true;
  tfStatus.textContent = "ロード中 (WebGPU)...";

  try {
    let modelPath = TF_MODEL_ID;
    try {
      tfGenerator = await createTextGenerator(pipeline, modelPath, {
        onProgress: (p) => {
          const formatted = formatTransformersProgress(p);
          tfStatus.textContent = `ローカル: ${formatted.text}`;
        }
      });
    } catch (e) {
      console.warn("ローカル ONNX ロード失敗、リモートにフォールバック:", e);
      modelPath = TF_REMOTE_ID;
      tfGenerator = await createTextGenerator(pipeline, modelPath, {
        onProgress: (p) => {
          const formatted = formatTransformersProgress(p);
          tfStatus.textContent = `リモート: ${formatted.text}`;
        }
      });
    }

    if (tfGenerator.tokenizer) {
      sharedTokenizer = tfGenerator.tokenizer;
    }

    tfStatus.textContent = "✅ ロード完了 (WebGPU Ready)";
    loadTfBtn.textContent = "ロード済み";
    runTfBtn.disabled = false;
    updateReadyState();
  } catch (err) {
    tfStatus.textContent = "❌ ロード失敗: " + err.message;
    loadTfBtn.disabled = false;
  }
});

export async function executeTransformers(promptText) {
  if (!tfGenerator) return null;
  runTfBtn.disabled = true;
  tfOutput.textContent = "";
  tfStatus.textContent = "推論中 (WebGPU)...";

  const startTime = performance.now();
  let firstTokenTime = null;

  try {
    const messages = prepareChatInputs(promptText);

    const { fullText } = await generateTextStreaming(
      tfGenerator,
      TextStreamer,
      messages,
      (text) => {
        if (firstTokenTime === null) {
          firstTokenTime = performance.now();
          const ttftMs = Math.round(firstTokenTime - startTime);
          tfTtft.textContent = `${ttftMs} ms`;
        }
        tfOutput.textContent += text;
      },
      { maxNewTokens: getMaxTokens() }
    );

    const finalText = tfOutput.textContent || fullText || "";
    const elapsedMs = performance.now() - startTime;
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

    // 正確なトークン数 & 文字数を算出
    const { tokenCount, charCount } = await countTokensAndChars(finalText);
    const speed = calculateTokenSpeed(tokenCount, elapsedMs);
    const charSpeed = elapsedMs > 0 ? (charCount / (elapsedMs / 1000)).toFixed(1) : "0.0";

    tfSpeed.textContent = `${speed} tok/s`;
    tfTokens.textContent = `${tokenCount}`;
    tfTime.textContent = `${(elapsedMs / 1000).toFixed(2)} s`;
    tfStatus.textContent = `✅ 完了 (${speed} tok/s)`;

    return { speed, ttft, tokenCount, elapsedMs };
  } catch (err) {
    tfOutput.textContent = "エラー: " + err.message;
    tfStatus.textContent = "❌ エラー発生";
    return null;
  } finally {
    runTfBtn.disabled = false;
  }
}

runTfBtn.addEventListener("click", () => {
  executeTransformers(promptInput.value);
});


// -------------------------------------------------------------
// [B] LiteRT-LM ロード & 実行
// -------------------------------------------------------------
loadLiteRtBtn.addEventListener("click", async () => {
  loadLiteRtBtn.disabled = true;
  litertStatus.textContent = "ロード中 (WebGPU)...";

  try {
    let modelUrl = LITERT_LOCAL_URL;
    try {
      litertEngine = await Engine.create({ model: modelUrl });
    } catch (e) {
      console.warn("ローカル LiteRT ロード失敗、リモートにフォールバック:", e);
      modelUrl = LITERT_REMOTE_URL;
      litertEngine = await Engine.create({ model: modelUrl });
    }

    litertStatus.textContent = "✅ ロード完了 (WebGPU Ready)";
    loadLiteRtBtn.textContent = "ロード済み";
    runLiteRtBtn.disabled = false;
    updateReadyState();
  } catch (err) {
    litertStatus.textContent = "❌ ロード失敗: " + err.message;
    loadLiteRtBtn.disabled = false;
  }
});

export async function executeLiteRT(promptText) {
  if (!litertEngine) return null;
  runLiteRtBtn.disabled = true;
  litertOutput.textContent = "";
  litertStatus.textContent = "推論中 (WebGPU)...";

  const startTime = performance.now();
  let firstTokenTime = null;

  try {
    const chat = await litertEngine.createConversation({
      sessionConfig: {
        maxOutputTokens: getMaxTokens()
      }
    });
    const stream = chat.sendMessageStreaming(promptText);

    for await (const chunk of stream) {
      const text = chunk.content?.[0]?.text;
      if (text) {
        if (firstTokenTime === null) {
          firstTokenTime = performance.now();
          const ttftMs = Math.round(firstTokenTime - startTime);
          litertTtft.textContent = `${ttftMs} ms`;
        }
        litertOutput.textContent += text;
      }
    }

    const finalText = litertOutput.textContent || "";
    const elapsedMs = performance.now() - startTime;
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

    // 正確なトークン数 & 文字数を算出（Transformers.js と同一の Gemma Tokenizer 基準）
    const { tokenCount, charCount } = await countTokensAndChars(finalText);
    const speed = calculateTokenSpeed(tokenCount, elapsedMs);
    const charSpeed = elapsedMs > 0 ? (charCount / (elapsedMs / 1000)).toFixed(1) : "0.0";

    litertSpeed.textContent = `${speed} tok/s`;
    litertTokens.textContent = `${tokenCount}`;
    litertTime.textContent = `${(elapsedMs / 1000).toFixed(2)} s`;
    litertStatus.textContent = `✅ 完了 (${speed} tok/s)`;

    return { speed, ttft, tokenCount, elapsedMs };
  } catch (err) {
    litertOutput.textContent = "エラー: " + err.message;
    litertStatus.textContent = "❌ エラー発生";
    return null;
  } finally {
    runLiteRtBtn.disabled = false;
  }
}

runLiteRtBtn.addEventListener("click", () => {
  executeLiteRT(promptInput.value);
});


// -------------------------------------------------------------
// [C] 順次ベンチマーク実行 (Sequential Benchmark)
// -------------------------------------------------------------
runSequentialBtn.addEventListener("click", async () => {
  const prompt = promptInput.value;
  runSequentialBtn.disabled = true;
  runTfBtn.disabled = true;
  runLiteRtBtn.disabled = true;

  benchmarkStatus.textContent = "⏳ [Step 1/2] Transformers.js で推論中...";
  const tfResult = await executeTransformers(prompt);

  benchmarkStatus.textContent = "⏳ GPU クールダウン待機中 (500ms)...";
  await new Promise(r => setTimeout(r, 500));

  benchmarkStatus.textContent = "⏳ [Step 2/2] LiteRT-LM で推論中...";
  const litertResult = await executeLiteRT(prompt);

  if (tfResult && litertResult) {
    benchmarkStatus.textContent = `🏁 完了！ Transformers: ${tfResult.speed} tok/s | LiteRT: ${litertResult.speed} tok/s`;
  } else {
    benchmarkStatus.textContent = "ベンチマーク終了（一部でエラーが発生しました）";
  }

  runSequentialBtn.disabled = false;
  runTfBtn.disabled = false;
  runLiteRtBtn.disabled = false;
});
