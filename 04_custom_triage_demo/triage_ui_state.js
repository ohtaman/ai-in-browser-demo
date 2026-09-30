/**
 * 実行エンジン (Transformers.js / LiteRT-LM.js / WebLLM / Gemini Nano) のUIステートマシン
 * @param {Object} params
 * @param {'transformers' | 'litert' | 'webllm' | 'nano'} params.selectedEngine
 * @param {boolean} params.tfLoaded
 * @param {boolean} params.litertLoaded
 * @param {boolean} [params.webllmLoaded=false]
 * @param {boolean} [params.nanoLoaded=false]
 * @param {boolean} params.isLoading
 * @returns {{ canLoad: boolean, canRun: boolean, statusText: string, isLoaded: boolean, loadBtnText: string, constrainedDecodingAvailable: boolean }}
 */
export function getEngineUIState({ selectedEngine, tfLoaded, litertLoaded, webllmLoaded = false, nanoLoaded = false, isLoading }) {
  let engineName = "Transformers.js";
  let isLoaded = tfLoaded;
  // LiteRT-LM Web SDK は現在テキスト生成向けの制約デコーディング API を公開していない
  const constrainedDecodingAvailable = selectedEngine !== "litert";

  if (selectedEngine === "litert") {
    engineName = "LiteRT-LM.js";
    isLoaded = litertLoaded;
  } else if (selectedEngine === "webllm") {
    engineName = "WebLLM (MLC-LLM)";
    isLoaded = webllmLoaded;
  } else if (selectedEngine === "nano") {
    engineName = "Gemini Nano (Prompt API)";
    isLoaded = nanoLoaded;
  }

  if (isLoading) {
    return {
      canLoad: false,
      canRun: false,
      isLoaded,
      constrainedDecodingAvailable,
      loadBtnText: "ロード中...",
      statusText: `${engineName} をロード中...`
    };
  }

  if (isLoaded) {
    return {
      canLoad: false,
      canRun: true,
      isLoaded: true,
      constrainedDecodingAvailable,
      loadBtnText: "ロード完了",
      statusText: `${engineName} 準備完了！トリアージ判定を実行できます。`
    };
  }

  return {
    canLoad: true,
    canRun: false,
    isLoaded: false,
    constrainedDecodingAvailable,
    loadBtnText: "モデルロード",
    statusText: `待機中：「モデルロード」を押して ${engineName} を読み込んでください。`
  };
}

/**
 * 制約デコーディングのON/OFF状態に応じた表示ラベル
 * @param {boolean} useConstrainedDecoding
 * @returns {string}
 */
export function getDecodingModeLabel(useConstrainedDecoding) {
  return useConstrainedDecoding
    ? "制約デコーディング適用 (Structured Output)"
    : "制約なし (自由生成)";
}
