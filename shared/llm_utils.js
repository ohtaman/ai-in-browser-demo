/**
 * ブラウザ上でのLLM実行共通ユーティリティ
 */

/**
 * 生成トークン数と所要時間(ms)から tok/s を計算
 */
export function calculateTokenSpeed(tokenCount, elapsedMs) {
  if (!elapsedMs || elapsedMs <= 0 || !tokenCount || tokenCount <= 0) {
    return "0.0";
  }
  const sec = elapsedMs / 1000;
  return (tokenCount / sec).toFixed(1);
}

/**
 * システムプロンプトとユーザー入力をチャットメッセージ配列に整形
 */
export function formatSystemPrompt(systemPrompt, userText) {
  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  if (userText) {
    messages.push({ role: "user", content: userText });
  }
  return messages;
}
