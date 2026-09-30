/**
 * Chrome Prompt API (Gemini Nano) - Latest Spec Implementation (Chrome 148+)
 * 
 * Supports:
 * - Modern W3C Standard: globalThis.LanguageModel
 * - Legacy / Transition: globalThis.ai.languageModel
 */

/**
 * Prompt API のプロバイダオブジェクト（LanguageModel または ai.languageModel）を取得
 */
export function getNanoProvider() {
  if (typeof globalThis !== "undefined" && globalThis.LanguageModel) {
    return { provider: globalThis.LanguageModel, engine: "LanguageModel" };
  }
  if (typeof window !== "undefined" && window.LanguageModel) {
    return { provider: window.LanguageModel, engine: "LanguageModel" };
  }
  if (typeof globalThis !== "undefined" && globalThis.ai?.languageModel) {
    return { provider: globalThis.ai.languageModel, engine: "ai.languageModel" };
  }
  if (typeof window !== "undefined" && window.ai?.languageModel) {
    return { provider: window.ai.languageModel, engine: "ai.languageModel" };
  }
  return null;
}

/**
 * 端末およびブラウザでの Gemini Nano の利用可否状態を判定
 */
export async function checkNanoAvailability() {
  const result = getNanoProvider();
  if (!result) {
    return {
      status: "unsupported",
      message: "お使いのブラウザでは LanguageModel API が見つかりません。Chrome 148+ または対応ブラウザが必要です。",
    };
  }

  const { provider, engine } = result;

  try {
    const caps = typeof provider.capabilities === "function" ? await provider.capabilities() : {};
    const availability = caps.available ?? (typeof caps.availability === "string" ? caps.availability : "readily");

    if (availability === "readily" || availability === "available") {
      return {
        status: "available",
        engine,
        message: "Gemini Nano は即時利用可能です。",
        capabilities: caps,
      };
    } else if (availability === "after-download" || availability === "downloadable") {
      return {
        status: "downloadable",
        engine,
        message: "Gemini Nano モデルのダウンロードが必要です（初回のみ）。",
        capabilities: caps,
      };
    } else {
      return {
        status: "unavailable",
        engine,
        message: "Gemini Nano は現在この端末環境でサポートされていません（ハードウェア要件等）。",
        capabilities: caps,
      };
    }
  } catch (err) {
    return {
      status: "error",
      engine,
      message: `利用可否チェック中にエラーが発生しました: ${err.message}`,
    };
  }
}

/**
 * Gemini Nano セッションの初期化
 */
export async function createNanoSession(options = {}) {
  const availability = await checkNanoAvailability();
  if (availability.status === "unsupported") {
    throw new Error(availability.message);
  }
  if (availability.status === "unavailable") {
    throw new Error("Gemini Nano は現在この端末でサポートされていません（RAM, VRAM, ストレージ等の要件を満たしていない可能性があります）。");
  }

  const { provider } = getNanoProvider();
  const createOptions = {};

  if (options.systemPrompt) {
    createOptions.systemPrompt = options.systemPrompt;
  }

  if (options.responseConstraint) {
    createOptions.responseConstraint = options.responseConstraint;
  }

  if (options.onProgress) {
    createOptions.monitor = (m) => {
      m.addEventListener("downloadprogress", (e) => {
        options.onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: e.total > 0 ? (e.loaded / e.total) * 100 : 0,
        });
      });
    };
  }

  return await provider.create(createOptions);
}

/**
 * プロンプトのストリーミング実行（Structured Output / responseConstraint に対応）
 */
export async function runNanoPrompt(session, promptText, onChunk, options = {}) {
  if (!session || typeof session.promptStreaming !== "function") {
    if (session && typeof session.prompt === "function") {
      const fullText = await session.prompt(promptText, options);
      if (onChunk) onChunk(fullText);
      return fullText;
    }
    throw new Error("有効な Gemini Nano セッションではありません。");
  }

  const stream = session.promptStreaming(promptText, options);
  let accumulated = "";

  for await (const chunk of stream) {
    accumulated += chunk;
    if (onChunk) {
      onChunk(chunk);
    }
  }

  return accumulated;
}

/**
 * クリーンな単発推論用セッションを取得（ベースセッションの clone、または新規作成）
 * Chrome Prompt API ではマルチターン会話履歴や文法制約ステートがセッション内に蓄積されるため、
 * 患者ごとの独立したトリアージ等のタスクでは、セッションを分離することで kErrorUnknown や履歴汚染を防ぐ。
 */
export async function getCleanNanoSession(baseSession, options = {}) {
  if (baseSession && typeof baseSession.clone === "function") {
    try {
      return await baseSession.clone();
    } catch (err) {
      console.warn("baseSession.clone() 失敗、新規セッション作成へフォールバック:", err);
    }
  }
  return await createNanoSession(options);
}

