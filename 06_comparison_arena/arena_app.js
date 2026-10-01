/**
 * Transformers.js vs LiteRT-LM 比較 Arena ロジック
 * 
 * 公平な比較のため、同一の Gemma Tokenizer による正確なトークン数計測と
 * 初回応答時間 (TTFT)、リアルタイムのプログレス表示を行います。
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
const tfProgressContainer = document.getElementById("tfProgressContainer");
const tfProgressBar = document.getElementById("tfProgressBar");

// LiteRT-LM DOM
const loadLiteRtBtn = document.getElementById("loadLiteRtBtn");
const runLiteRtBtn = document.getElementById("runLiteRtBtn");
const litertStatus = document.getElementById("litertStatus");
const litertOutput = document.getElementById("litertOutput");
const litertSpeed = document.getElementById("litertSpeed");
const litertTtft = document.getElementById("litertTtft");
const litertTokens = document.getElementById("litertTokens");
const litertTime = document.getElementById("litertTime");
const litertProgressContainer = document.getElementById("litertProgressContainer");
const litertProgressBar = document.getElementById("litertProgressBar");

// 環境判定（ローカルサーバー vs GitHub Pages / リモートホスティング）
export const isLocalEnv = typeof window !== "undefined" && 
  (window.location.hostname === "localhost" || 
   window.location.hostname === "127.0.0.1" || 
   window.location.protocol === "file:");

// モデル設定 (ローカル優先、フォールバックリモート)
const TF_MODEL_ID = "../dist_onnx";
const TF_REMOTE_ID = "onnx-community/gemma-4-E2B-it-ONNX";

const LITERT_LOCAL_URL = "../dist_litert/model.litertlm";
const LITERT_REMOTE_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm";

let tfGenerator = null;
let litertEngine = null;
let sharedTokenizer = null;

// ヘルパー: ローカルモデルの存在確認（GitHub Pages 上で 404 を出さない）
export async function checkLocalModel(url) {
  if (!isLocalEnv) return false;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// 共通トークナイザ取得
export async function getSharedTokenizer() {
  if (sharedTokenizer) return sharedTokenizer;
  if (tfGenerator && tfGenerator.tokenizer) {
    sharedTokenizer = tfGenerator.tokenizer;
    return sharedTokenizer;
  }
  const hasLocal = await checkLocalModel(`${TF_MODEL_ID}/config.json`);
  const modelId = hasLocal ? TF_MODEL_ID : TF_REMOTE_ID;
  try {
    sharedTokenizer = await AutoTokenizer.from_pretrained(modelId);
  } catch (e) {
    console.warn("トークナイザの事前ロード失敗:", e);
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

function updateTfProgress(text, percent = null) {
  if (tfStatus) tfStatus.textContent = text;
  if (tfProgressContainer && tfProgressBar) {
    if (percent !== null && percent >= 0 && percent <= 100) {
      tfProgressContainer.style.display = "block";
      tfProgressBar.style.width = `${percent}%`;
    } else if (percent === null) {
      tfProgressContainer.style.display = "none";
    }
  }
}

function updateLiteRtProgress(text, percent = null) {
  if (litertStatus) litertStatus.textContent = text;
  if (litertProgressContainer && litertProgressBar) {
    if (percent !== null && percent >= 0 && percent <= 100) {
      litertProgressContainer.style.display = "block";
      litertProgressBar.style.width = `${percent}%`;
    } else if (percent === null) {
      litertProgressContainer.style.display = "none";
    }
  }
}

// -------------------------------------------------------------
// [A] Transformers.js ロード & 実行
// -------------------------------------------------------------
loadTfBtn.addEventListener("click", async () => {
  loadTfBtn.disabled = true;
  updateTfProgress("ロード準備中...", 0);

  try {
    const hasLocal = await checkLocalModel(`${TF_MODEL_ID}/config.json`);
    const modelPath = hasLocal ? TF_MODEL_ID : TF_REMOTE_ID;

    if (!hasLocal) {
      updateTfProgress("Hugging Face からダウンロード中 (約1.5GB)...", 0);
    } else {
      updateTfProgress("ローカルモデルからロード中...", 50);
    }

    tfGenerator = await createTextGenerator(pipeline, modelPath, {
      onProgress: (p) => {
        const formatted = formatTransformersProgress(p);
        const percent = p.progress ? Math.round(p.progress) : null;
        updateTfProgress(formatted.text, percent);
      }
    });

    if (tfGenerator.tokenizer) {
      sharedTokenizer = tfGenerator.tokenizer;
    }

    updateTfProgress("✅ ロード完了 (WebGPU Ready)", 100);
    loadTfBtn.textContent = "ロード済み";
    runTfBtn.disabled = false;
    updateReadyState();

    setTimeout(() => {
      if (tfProgressContainer) tfProgressContainer.style.display = "none";
    }, 1500);
  } catch (err) {
    updateTfProgress("❌ ロード失敗: " + err.message, null);
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
    const fullText = await generateTextStreaming(
      tfGenerator,
      messages,
      (text) => {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
          const ttft = Math.round(firstTokenTime - startTime);
          tfTtft.textContent = `${ttft} ms`;
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
  updateLiteRtProgress("ロード準備中...", 0);

  try {
    const hasLocal = await checkLocalModel(LITERT_LOCAL_URL);
    
    if (hasLocal) {
      updateLiteRtProgress("ローカルモデルから即時ロード中 (WebGPU)...", 50);
      litertEngine = await Engine.create({ model: LITERT_LOCAL_URL });
    } else {
      // リモート Hugging Face からプログレスストリーミングでダウンロード
      updateLiteRtProgress("Hugging Face に接続中 (約1.9GB)...", 0);
      const response = await fetch(LITERT_REMOTE_URL);
      if (!response.ok) {
        throw new Error(`リモートモデルの取得に失敗しました (HTTP ${response.status}: ${response.statusText})`);
      }

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 2008432640;

      let loadedBytes = 0;
      let lastTimestamp = performance.now();
      let lastLoaded = 0;

      // TransformStream でダウンロード進捗を監視しながらそのまま LiteRT Engine に渡す
      const progressStream = new TransformStream({
        transform(chunk, controller) {
          loadedBytes += chunk.length;
          const now = performance.now();
          const elapsed = (now - lastTimestamp) / 1000;
          if (elapsed >= 0.25) {
            const speedMb = ((loadedBytes - lastLoaded) / elapsed / 1024 / 1024).toFixed(1);
            lastLoaded = loadedBytes;
            lastTimestamp = now;
            const loadedMb = (loadedBytes / 1024 / 1024).toFixed(1);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            const percent = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
            updateLiteRtProgress(`DL中: ${loadedMb}/${totalMb}MB (${percent}%) [${speedMb}MB/s]`, percent);
          }
          controller.enqueue(chunk);
        },
        flush() {
          updateLiteRtProgress("ダウンロード完了！WebGPU 初期化中...", 100);
        }
      });

      const streamedBody = response.body.pipeThrough(progressStream);
      litertEngine = await Engine.create({ model: streamedBody });
    }

    updateLiteRtProgress("✅ ロード完了 (WebGPU Ready)", 100);
    loadLiteRtBtn.textContent = "ロード済み";
    runLiteRtBtn.disabled = false;
    updateReadyState();

    setTimeout(() => {
      if (litertProgressContainer) litertProgressContainer.style.display = "none";
    }, 1500);
  } catch (err) {
    updateLiteRtProgress("❌ ロード失敗: " + err.message, null);
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
    const conversation = await litertEngine.createConversation();
    const stream = conversation.sendMessageStreaming(promptText);

    for await (const chunk of stream) {
      const text = chunk.content?.[0]?.text ?? "";
      if (text) {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
          const ttft = Math.round(firstTokenTime - startTime);
          litertTtft.textContent = `${ttft} ms`;
        }
        litertOutput.textContent += text;
      }
    }

    const finalText = litertOutput.textContent || "";
    const elapsedMs = performance.now() - startTime;
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

    // 正確なトークン数 & 文字数を算出
    const { tokenCount, charCount } = await countTokensAndChars(finalText);
    const speed = calculateTokenSpeed(tokenCount, elapsedMs);

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
// [C] 順次（Sequential）公平ベンチマーク実行
// -------------------------------------------------------------
runSequentialBtn.addEventListener("click", async () => {
  if (!tfGenerator || !litertEngine) return;

  const promptText = promptInput.value.trim();
  if (!promptText) {
    alert("プロンプトを入力してください");
    return;
  }

  runSequentialBtn.disabled = true;
  runTfBtn.disabled = true;
  runLiteRtBtn.disabled = true;

  try {
    // 1. Transformers.js 実行
    benchmarkStatus.textContent = "⏳ [1/2] Transformers.js ベンチマーク実行中...";
    const tfResult = await executeTransformers(promptText);

    // GPU クールダウン（リソース競合・排熱安定化のためのインターバル）
    benchmarkStatus.textContent = "☕️ GPU クールダウン中 (500ms)...";
    await new Promise(r => setTimeout(r, 500));

    // 2. LiteRT-LM 実行
    benchmarkStatus.textContent = "⏳ [2/2] LiteRT-LM ベンチマーク実行中...";
    const litertResult = await executeLiteRT(promptText);

    if (tfResult && litertResult) {
      benchmarkStatus.textContent = `🏁 完了！ Transformers: ${tfResult.speed} tok/s | LiteRT: ${litertResult.speed} tok/s`;
    } else {
      benchmarkStatus.textContent = "ベンチマーク終了（一部でエラーが発生しました）";
    }
  } catch (err) {
    benchmarkStatus.textContent = "ベンチマーク中断: " + err.message;
  } finally {
    runSequentialBtn.disabled = false;
    runTfBtn.disabled = false;
    runLiteRtBtn.disabled = false;
  }
});
