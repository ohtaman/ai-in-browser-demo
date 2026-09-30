/**
 * Transformers.js (WebGPU) LLM 実行ヘルパー
 * 
 * pipeline API を使用し、トークナイズ・チャットテンプレート・テンソル構築 (input_ids.dims)
 * を自動処理することで、低レベル API での `null (reading 'dims')` エラーを防止します。
 */

export function prepareChatInputs(userText, systemPrompt = "") {
  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  if (userText) {
    messages.push({ role: "user", content: userText });
  }
  return messages;
}

export function createGenerationOptions({ maxNewTokens = 300, onToken } = {}) {
  return {
    max_new_tokens: maxNewTokens,
    onTokenCallback: onToken || (() => {}),
  };
}

export function createStreamerConfig(onChunk) {
  return {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      if (onChunk && text) {
        onChunk(text);
      }
    }
  };
}

/**
 * 堅牢な TextStreamer を生成
 * 内部実装が callback_function を呼ぶ形式でも、on_finalized_text を呼ぶ形式でも、
 * 確実に onChunk コールバックが発火するように両方をトラップします。
 */
export function createRobustStreamer(TextStreamerClass, tokenizer, onChunk) {
  let calledInThisTurn = false;

  const handleChunk = (text) => {
    if (onChunk && text) {
      calledInThisTurn = true;
      onChunk(text);
    }
  };

  const options = {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      handleChunk(text);
    }
  };

  const streamer = new TextStreamerClass(tokenizer, options);

  const originalFinalize = streamer.on_finalized_text ? streamer.on_finalized_text.bind(streamer) : null;
  streamer.on_finalized_text = function (text, stream_end) {
    calledInThisTurn = false;
    if (originalFinalize) {
      originalFinalize(text, stream_end);
    }
    // originalFinalize が callback_function を呼ばなかった場合のみフォールバックとして呼ぶ
    if (!calledInThisTurn && onChunk && text) {
      onChunk(text);
    }
  };

  return streamer;
}

/**
 * generator(...) の戻り値オブジェクトから生成テキストを柔軟に抽出
 */
export function extractGeneratedText(output) {
  if (!output) return "";
  if (typeof output === "string") return output;

  const first = Array.isArray(output) ? output[0] : output;
  if (!first) return "";
  if (typeof first === "string") return first;

  const generated = first.generated_text;
  if (typeof generated === "string") {
    return generated;
  }

  if (Array.isArray(generated)) {
    // [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
    const assistantMsg = [...generated].reverse().find(m => m.role === "assistant" || m.role === "model");
    if (assistantMsg && typeof assistantMsg.content === "string") {
      return assistantMsg.content;
    }
  }

  return "";
}

/**
 * Transformers.js の text-generation pipeline を安全に初期化
 */
export async function createTextGenerator(pipelineFn, modelId, options = {}) {
  return await pipelineFn("text-generation", modelId, {
    device: "webgpu",
    dtype: "q4f16",
    progress_callback: options.onProgress,
  });
}

/**
 * ストリーミング付きでテキスト生成を実行
 */
export async function generateTextStreaming(generator, TextStreamerClass, messages, onChunk, options = {}) {
  let accumulated = "";

  // 重複通知を防ぐためのフィルタリング
  const safeOnChunk = (chunk) => {
    accumulated += chunk;
    if (onChunk) {
      onChunk(chunk);
    }
  };

  const streamer = createRobustStreamer(TextStreamerClass, generator.tokenizer, safeOnChunk);

  const generateParams = {
    max_new_tokens: options.maxNewTokens || 300,
    streamer: streamer,
  };
  if (options.logits_processor) {
    generateParams.logits_processor = options.logits_processor;
  }

  const output = await generator(messages, generateParams);

  const extracted = extractGeneratedText(output);
  const finalResult = accumulated || extracted;

  return { output, fullText: finalResult };
}

/**
 * Transformers.js の progress_callback ペイロードを整形してパーセンテージとステータス文を返す
 */
export function formatTransformersProgress(p) {
  if (!p) {
    return { text: "準備中...", percent: 0 };
  }

  const fileName = p.file ? p.file.split("/").pop() : "";

  if (p.status === "progress" || p.status === "progress_total") {
    const percent = Math.min(100, Math.max(0, Math.round(p.progress ?? 0)));
    const targetLabel = fileName ? fileName : "モデルデータ";
    let text = `読込中: ${targetLabel} (${percent}%)`;
    if (typeof p.loaded === "number" && typeof p.total === "number" && p.total > 0) {
      const loadedMb = (p.loaded / 1024 / 1024).toFixed(1);
      const totalMb = (p.total / 1024 / 1024).toFixed(1);
      text = `読込中: ${targetLabel} (${loadedMb}MB / ${totalMb}MB, ${percent}%)`;
    }
    return { text, percent };
  }

  if (p.status === "done") {
    return { text: `ロード完了: ${fileName || "ファイル"}`, percent: 100 };
  }

  if (p.status === "ready") {
    return { text: "準備完了", percent: 100 };
  }

  if (p.status === "initiate") {
    return { text: `ダウンロード準備中: ${fileName || "ファイル"}`, percent: 0 };
  }

  if (p.status === "download") {
    return { text: `ダウンロード開始: ${fileName || "ファイル"}`, percent: 0 };
  }

  return { text: fileName || "処理中...", percent: 0 };
}

