/**
 * START式トリアージ判定のスキーマ定義および制約プロセッサ
 * CoT (Chain-of-Thought) のため、judgment_reason を判定カテゴリの前に配置
 */

export const TRIAGE_ALLOWED_CATEGORIES = ["RED", "YELLOW", "GREEN", "BLACK"];

export const TRIAGE_ALLOWED_PRIORITIES = [
  "最優先治療群",
  "待機的治療群",
  "保留群（軽症）",
  "不処置（死亡・救命不能）"
];

export const TRIAGE_SYSTEM_PROMPT = `あなたは災害医療のSTART式トリアージ判定スペシャリストAIです。
入力された傷病者のバイタル・身体状況に基づき、START基準に従って判定を行い、以下の JSON Schema に厳密に従った JSON のみを出力してください。
JSON 以外のテキスト（前置き、解説、マークダウン装飾など）は一切出力しないでください。

## 出力 JSON Schema
{
  "judgment_reason": "(string) START基準に基づく判定根拠。CoT思考プロセスとして最初に記述",
  "vital_assessment": {
    "walkable": "(boolean) 自力歩行が可能か",
    "respiratory_rate": "(number) 1分間あたりの呼吸数",
    "radial_pulse": "(string) present | weak | absent | none",
    "obeys_commands": "(boolean) 簡単な指示に従えるか"
  },
  "triage_category": "(string) RED | YELLOW | GREEN | BLACK のいずれか",
  "priority": "(string) 最優先治療群 | 待機的治療群 | 保留群（軽症） | 不処置（死亡・救命不能）",
  "immediate_action": "(string) 現場で直ちに行うべき推奨処置"
}

## 出力例
入力: 24歳男性。自力で安全ゾーンまで歩行して集合。前腕に軽微な擦過傷あり。
出力:
{"judgment_reason":"自力歩行が可能であるため、START基準のステップ①により緑（軽症群）と判定。","vital_assessment":{"walkable":true,"respiratory_rate":18,"radial_pulse":"present","obeys_commands":true},"triage_category":"GREEN","priority":"保留群（軽症）","immediate_action":"擦過傷の洗浄・被覆。経過観察エリアへ誘導。"}`;


/**
 * Transformers.js (StructuredOutputProcessor) 用の JSON Schema 定義
 * CoT (Chain-of-Thought) を有効にするため、judgment_reason を最初に生成させる
 */
export const TRIAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    judgment_reason: { 
      type: "string",
      description: "START基準に基づく判定根拠（CoT思考プロセス）" 
    },
    vital_assessment: {
      type: "object",
      properties: {
        walkable: { 
          type: "boolean", 
          description: "自力歩行が可能か" 
        },
        respiratory_rate: { 
          type: "number", 
          description: "1分間あたりの呼吸数" 
        },
        radial_pulse: { 
          type: "string", 
          enum: ["present", "weak", "absent", "none"], 
          description: "橈骨動脈の触知状況" 
        },
        obeys_commands: { 
          type: "boolean", 
          description: "簡単な指示に従えるか（意識レベル）" 
        }
      },
      required: ["walkable", "obeys_commands"],
      additionalProperties: false
    },
    triage_category: {
      type: "string",
      enum: TRIAGE_ALLOWED_CATEGORIES,
      description: "START式トリアージ判定結果。必ず RED, YELLOW, GREEN, BLACK のいずれか"
    },
    priority: {
      type: "string",
      enum: TRIAGE_ALLOWED_PRIORITIES,
      description: "傷病者の優先区分"
    },
    immediate_action: { 
      type: "string", 
      description: "現場で直ちに行うべき推奨処置" 
    }
  },
  required: [
    "judgment_reason",
    "vital_assessment",
    "triage_category",
    "priority",
    "immediate_action"
  ],
  additionalProperties: false
};

/**
 * カテゴリが定義済みの4区分（RED, YELLOW, GREEN, BLACK）のいずれかであるか検証
 */
export function validateTriageCategory(category) {
  if (!category || typeof category !== "string") return false;
  return TRIAGE_ALLOWED_CATEGORIES.includes(category.trim().toUpperCase());
}

/**
 * Transformers.js の StructuredOutputProcessor インスタンスを生成
 */
export function createTriageConstraintProcessor(tokenizer, StructuredOutputProcessorClass) {
  return new StructuredOutputProcessorClass(tokenizer, {
    type: "json_schema",
    json_schema: TRIAGE_JSON_SCHEMA
  });
}
