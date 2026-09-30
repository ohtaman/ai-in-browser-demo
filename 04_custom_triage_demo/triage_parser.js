/**
 * START式トリアージ判定の解析およびプリセットデータモジュール
 */

export const PRESETS = {
  red: "45歳男性。家屋倒壊現場から救出。自力歩行不可。呼吸数36回/分。橈骨動脈は微弱に触知。呼びかけに対してうめき声のみで従命不能。",
  yellow: "52歳男性。落下物により右下腿変形・激痛。自力歩行不可。呼吸数20回/分。橈骨動脈正常に触知。意識清明、「痛くて立てない」と明確に受け答え可能。",
  green: "24歳男性。「歩ける方はこちらへ移動してください」の呼びかけに対し、自力で安全ゾーンまで歩行して集合。前腕に軽微な擦過傷あり。",
  black: "55歳男性。コンクリート下敷き。自力歩行不可。自発呼吸なし。気道確保を実施したが、呼吸の再開なし。頸動脈・橈骨動脈ともに触知せず。"
};

export function getPresetList() {
  return { ...PRESETS };
}

/**
 * モデルが出力した純粋な JSON 文字列をパースしてトリアージ結果を判定
 * ※ 制約デコーディングにより純粋な JSON が保証されるため、マークダウン除去や正規表現による
 *    泥臭い切り出し・推測フォールバックは行わず、JSON.parse のみで判定します。
 */
export function parseTriageOutput(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { 
      category: "NONE", 
      label: "判定待機中", 
      className: "triage-tag-display tag-none",
      formattedJson: "" 
    };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { 
      category: "NONE", 
      label: "判定待機中", 
      className: "triage-tag-display tag-none",
      formattedJson: "" 
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const rawCat = (parsed.triage_category || "").trim().toUpperCase();
    const formattedJson = JSON.stringify(parsed, null, 2);

    if (rawCat === "RED") {
      return { category: "RED", label: "🟥 RED（最優先治療群）", className: "triage-tag-display tag-red", parsed, formattedJson };
    } else if (rawCat === "YELLOW") {
      return { category: "YELLOW", label: "🟨 YELLOW（待機的治療群）", className: "triage-tag-display tag-yellow", parsed, formattedJson };
    } else if (rawCat === "GREEN") {
      return { category: "GREEN", label: "🟩 GREEN（軽症保留群）", className: "triage-tag-display tag-green", parsed, formattedJson };
    } else if (rawCat === "BLACK") {
      return { category: "BLACK", label: "⬛ BLACK（不処置群）", className: "triage-tag-display tag-black", parsed, formattedJson };
    }

    // スキーマ定義（RED, YELLOW, GREEN, BLACK）外の値は隠蔽せずそのまま表示
    return { 
      category: "UNKNOWN", 
      label: `⚠️ 不明カテゴリ: ${rawCat || "未指定"}`, 
      className: "triage-tag-display tag-none", 
      parsed, 
      formattedJson 
    };
  } catch {
    // ストリーミング生成中（未完了JSON）または非JSON出力
    return { 
      category: "NONE", 
      label: "生成中...", 
      className: "triage-tag-display tag-none", 
      formattedJson: trimmed 
    };
  }
}

/**
 * JSON 文字列を安全にシンタックスハイライト（HTMLタグを付与）
 * キー、文字列、数値、真偽値、null に対応し、XSSを防止
 */
export function highlightJson(json) {
  if (!json || typeof json !== "string") return "";
  const safe = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return safe.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match.trim())) {
          const colonIdx = match.lastIndexOf(":");
          const keyPart = match.slice(0, colonIdx);
          const afterPart = match.slice(colonIdx);
          return `<span class="json-key">${keyPart}</span>${afterPart}`;
        } else {
          return `<span class="json-string">${match}</span>`;
        }
      } else if (/^(true|false)$/.test(match)) {
        return `<span class="json-boolean">${match}</span>`;
      } else if (match === "null") {
        return `<span class="json-null">${match}</span>`;
      } else {
        return `<span class="json-number">${match}</span>`;
      }
    }
  );
}
