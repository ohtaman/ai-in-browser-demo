/**
 * START法 決定木対話推論コアモジュール (Interactive Triage Agent Engine)
 * 救急・災害トリアージの公式決定木アルゴリズムに準拠し、
 * 自然言語（口語・現場無線報告）からの臨床エンティティ抽出と動的ショートカット推論を行う。
 */

export const STEP_CONFIG = {
  1: {
    nodeId: 'step1',
    title: 'Step 1: 歩行の可否',
    question: "多数傷病者トリアージを開始します。患者は自力で歩行して安全な場所まで移動できますか？",
    buttons: [
      { text: "自力歩行できる (歩行可)", value: "自力で歩行できます。立ち上がって移動可能です。", style: "success" },
      { text: "歩行できない (歩行不能)", value: "歩行できません。倒れたままで自力移動は不可能です。", style: "danger" },
    ]
  },
  2: {
    nodeId: 'step2',
    title: 'Step 2: 自発呼吸の有無と気道確保',
    question: "患者の自発呼吸は確認できますか？（息をしているか、または気道確保後の反応）",
    buttons: [
      { text: "自発呼吸あり", value: "自発呼吸があります。胸が上下して息をしています。", style: "success" },
      { text: "気道確保で再開した", value: "当初は無呼吸でしたが、気道確保（頭部後屈顎先挙上）を行ったら自発呼吸が再開しました。", style: "danger" },
      { text: "気道確保後も無呼吸", value: "気道確保を行いましたが自発呼吸は全く再開しません。息をしていません。", style: "danger" },
    ]
  },
  3: {
    nodeId: 'step3',
    title: 'Step 3: 呼吸数の評価',
    question: "1分間の呼吸数を確認してください。呼吸数は正常範囲（10〜29回/分）ですか？",
    buttons: [
      { text: "10〜29回/分 (正常)", value: "呼吸数は1分間に18回で、正常範囲内です。", style: "success" },
      { text: "30回/分以上 (頻呼吸)", value: "呼吸が極めて荒く速いです。1分間に36回あります。", style: "danger" },
      { text: "10回未満 (徐呼吸/あえぎ)", value: "呼吸が非常に浅く弱いです。1分間に6回しかありません。", style: "danger" },
    ]
  },
  4: {
    nodeId: 'step4',
    title: 'Step 4: 循環動態の評価 (橈骨動脈・CRT)',
    question: "循環動態を確認します。手首の橈骨動脈の脈拍は触知できますか？ または爪床圧迫テスト(CRT)は何秒ですか？",
    buttons: [
      { text: "脈触知あり / CRT≦2秒", value: "手首の橈骨動脈を明瞭に触知できます。爪床圧迫(CRT)も1.5秒で良好です。", style: "success" },
      { text: "脈触知なし / 弱小", value: "橈骨動脈の脈拍が触知できません。脈が非常に弱いです。", style: "danger" },
      { text: "CRT > 2秒 (遅延)", value: "爪床圧迫テスト(CRT)が3秒以上かかり、明らかな毛細血管再充満遅延を認めます。", style: "danger" },
    ]
  },
  5: {
    nodeId: 'step5',
    title: 'Step 5: 意識・簡単な従命反応',
    question: "意識状態と従命反応を確認します。「手を握ってください」などの簡単な指示に従えますか？",
    buttons: [
      { text: "指示に従える (従命可)", value: "「手を握ってください」という指示を理解し、しっかりと握り返すことができます。従命良好です。", style: "success" },
      { text: "指示に従えない (従命不可)", value: "呼びかけに開眼せず、手を握るなどの簡単な指示に全く従えません。意識障害があります。", style: "danger" },
    ]
  }
};

export const CATEGORY_DETAILS = {
  RED: {
    label: "最優先治療群 (Category I)",
    class: "RED",
    badge: "赤 (RED)",
    tagClass: "tag-red",
    instructions: "直ちに赤タッグを装着し、救護所へ最優先搬送してください。気道確保の継続、大量出血に対する直接圧迫止血または止血帯（ターニケット）の適応を確認してください。"
  },
  YELLOW: {
    label: "待機的治療群 (Category II)",
    class: "YELLOW",
    badge: "黄 (YELLOW)",
    tagClass: "tag-yellow",
    instructions: "黄タッグを装着し、二次トリアージポストへ搬送してください。バイタルの急変（ショック・気道狭窄）に留意し、容態変化時は再トリアージを行ってください。"
  },
  GREEN: {
    label: "軽症・保留群 (Category III)",
    class: "GREEN",
    badge: "緑 (GREEN)",
    tagClass: "tag-green",
    instructions: "緑タッグを装着し、救護エリアへ誘導・待機させてください。歩行可能者も後から挫傷や気胸・頭部外傷の症状が出現することがあるため定期巡回を指示してください。"
  },
  BLACK: {
    label: "不処置・死亡群 (Category 0)",
    class: "BLACK",
    badge: "黒 (BLACK)",
    tagClass: "tag-black",
    instructions: "黒タッグを装着してください。現時点での心肺蘇生（CPR）は行わず、他の生存救命可能な傷病者の救命処置を最優先してください。遺体安置エリアへ搬送手配。"
  }
};

/**
 * 現場のリアルな無線報告シナリオ（自然言語プリセット）
 * if/else では解釈できない、口語・複合所見を含む報告例
 */
export const PRESET_SCENARIOS = [
  {
    id: "compound_shortcut",
    title: "複合報告: 瓦礫挟まり＋頻呼吸 (ショートカット)",
    text: "倒壊家屋から救出。両足を挟まれ自力歩行不可！呼吸が1分間に36回と異常に荒く、肩でゼーゼー息をしています！",
    desc: "歩行不能と呼吸数異常(36回)が同時に報告され、AIが一撃でREDショートカット判定"
  },
  {
    id: "airway_resumed",
    title: "気道確保: 無呼吸から呼吸再開 (RED)",
    text: "当初は息をしていませんでしたが、頭部後屈顎先挙上で気道確保したところ大きく息を吸い込み始めました！",
    desc: "「気道確保による再開」を文脈から読み取り、即座にRED判定"
  },
  {
    id: "apnea_black",
    title: "心肺停止: 気道確保後も無呼吸 (BLACK)",
    text: "頭部外傷あり。気道確保を行いましたが自発呼吸は全く再開しません。息をしておらず脈もありません。",
    desc: "気道確保後の無呼吸持続から、START基準通りBLACK判定"
  },
  {
    id: "pulse_failure",
    title: "循環不全: 脈拍消失・CRT遅延 (RED)",
    text: "歩行できず呼吸は24回ですが、手首が冷たくなっており橈骨動脈の脈が取れません。爪床圧迫も3秒以上かかります。",
    desc: "正常呼吸の裏にある循環性ショック（橈骨動脈消失）を検知してRED判定"
  },
  {
    id: "walking_green",
    title: "自力歩行: 最速軽症選別 (GREEN)",
    text: "頭部から少量の出血がありますが、意識清明で自分でスタスタ歩いて救護テントまで来られました。",
    desc: "「自分で歩いて来られた」から即座にGREEN確定（最速ショートカット）"
  },
  {
    id: "stable_yellow",
    title: "待機群: 歩行不可だが全バイタル安定 (YELLOW)",
    text: "骨盤骨折の疑いで立ち上がれませんが、呼吸18回、脈拍しっかり触れ、手を握る指示にも即座に応じられます。",
    desc: "歩行不可・呼吸正常・循環良好・従命可をすべて満たしYELLOW判定"
  }
];

/**
 * 自然言語入力から臨床エンティティ（所見・バイタル情報）を抽出する
 * @param {string} text 隊員の入力テキスト
 * @returns {object} 抽出結果とファクトリスト
 */
export function extractClinicalEntities(text) {
  const t = (text || "").toLowerCase();
  const facts = [];

  // 1. 歩行
  let walking = "unknown";
  const isWalking = t.includes("自力") || t.includes("歩行でき") || t.includes("歩ける") || t.includes("歩いて") || t.includes("スタスタ") || t.includes("歩行可");
  const isNotWalking = t.includes("歩行不可") || t.includes("歩行できな") || t.includes("歩けない") || t.includes("倒れたまま") || t.includes("立ち上がれ") || t.includes("挟まれ") || t.includes("動け") || t.includes("うずくま");

  if (isWalking && !isNotWalking) {
    walking = "can_walk";
    facts.push({ key: "walking", label: "自力歩行", value: "可能 (移動可)", status: "success" });
  } else if (isNotWalking) {
    walking = "cannot_walk";
    facts.push({ key: "walking", label: "自力歩行", value: "不能 (移動困難/倒過)", status: "danger" });
  }

  // 2. 自発呼吸 & 気道確保
  let breathing = "unknown";
  if (t.includes("気道確保後も無") || t.includes("全く再開") || t.includes("息をしていない") || (t.includes("気道確保") && t.includes("呼吸なし")) || t.includes("再開せず")) {
    breathing = "none_after_airway";
    facts.push({ key: "breathing", label: "自発呼吸", value: "気道確保後も停止 (無呼吸)", status: "danger" });
  } else if (t.includes("気道確保") && (t.includes("再開") || t.includes("吸い込み") || t.includes("息をし始め"))) {
    breathing = "resumed_airway";
    facts.push({ key: "breathing", label: "自発呼吸", value: "気道確保で再開 (気道狭窄リスク)", status: "warning" });
  } else if (t.includes("呼吸あり") || t.includes("息をして") || t.includes("自発呼吸") || t.includes("息はして")) {
    breathing = "present";
    facts.push({ key: "breathing", label: "自発呼吸", value: "自発呼吸あり", status: "success" });
  }

  // 3. 呼吸数 (回/分)
  let rateValue = null;
  let rateStatus = "unknown";
  const rateMatch = t.match(/(\d+)\s*(?:回\/分|回|bpm)/) || t.match(/(?:呼吸数|換気数)\s*[:：は]?\s*(\d+)/) || t.match(/分間に\s*(\d+)\s*回/);
  if (rateMatch) {
    rateValue = parseInt(rateMatch[1], 10);
    if (rateValue < 10 || rateValue >= 30) {
      rateStatus = "abnormal";
      facts.push({ key: "rate", label: "呼吸数", value: `${rateValue}回/分 (異常: <10 または ≧30)`, status: "danger" });
    } else {
      rateStatus = "normal";
      facts.push({ key: "rate", label: "呼吸数", value: `${rateValue}回/分 (正常範囲: 10〜29)`, status: "success" });
    }
  } else if (t.includes("30回以上") || t.includes("頻呼吸") || t.includes("10回未満") || t.includes("徐呼吸") || t.includes("あえぎ") || t.includes("ゼーゼー")) {
    rateStatus = "abnormal";
    facts.push({ key: "rate", label: "呼吸数", value: "異常頻呼吸・あえぎ", status: "danger" });
  }

  // 4. 循環動態 (橈骨動脈 / CRT)
  let circulation = "unknown";
  if (t.includes("脈触知なし") || t.includes("脈なし") || t.includes("触れない") || t.includes("取れません") || t.includes("crt > 2") || t.includes("crt>2") || t.includes("遅延") || t.includes("微弱") || t.includes("3秒")) {
    circulation = "failed";
    facts.push({ key: "circulation", label: "循環動態", value: "橈骨動脈触知不能 / CRT>2秒", status: "danger" });
  } else if (t.includes("脈触知あり") || t.includes("しっかり触れ") || t.includes("脈拍良好") || t.includes("crt≦2") || t.includes("明瞭")) {
    circulation = "good";
    facts.push({ key: "circulation", label: "循環動態", value: "橈骨動脈触知良好 / CRT≦2秒", status: "success" });
  }

  // 5. 意識・従命
  let mental = "unknown";
  if (t.includes("従えない") || t.includes("従命不可") || t.includes("従命不能") || t.includes("意識障害") || t.includes("反応なし") || t.includes("開眼しない") || t.includes("目を開けず") || t.includes("通じていない") || t.includes("通じない") || t.includes("握れません") || t.includes("呻く")) {
    mental = "cannot_obey";
    facts.push({ key: "mental", label: "意識・従命", value: "従命不能 / 意識障害あり", status: "danger" });
  } else if (t.includes("従える") || t.includes("従命可") || t.includes("従命良好") || t.includes("握り返す") || t.includes("指示に従") || t.includes("問題なく応じ")) {
    mental = "can_obey";
    facts.push({ key: "mental", label: "意識・従命", value: "簡単な指示に従える (従命良好)", status: "success" });
  }

  return {
    walking,
    breathing,
    rateValue,
    rateStatus,
    circulation,
    mental,
    facts
  };
}

/**
 * START決定木 対話推論エンジン（自然言語・複合報告対応）
 * @param {number} currentStep 現在の決定木ステップ (1..5)
 * @param {string} userText ユーザーの入力テキスト
 * @returns {object} { thought, reply, action, nextStep?, category?, rationale?, extractedFacts, isShortcut }
 */
export function evaluateTriageStep(currentStep, userText) {
  const text = userText || "";
  const entities = extractClinicalEntities(text);

  // === 1. 複合報告・早期ショートカット判定（AIの真骨頂） ===
  // ユーザーが一度に複数の所見を喋った場合、下流の所見から即座に判定を下す
  
  // (A) 自力歩行可能 ➔ 即 GREEN
  if (entities.walking === "can_walk") {
    return {
      action: "finalize",
      category: "GREEN",
      thought: "【AI決定木推論: Step 1 ショートカット】報告から「自力歩行可能」を抽出。START法のファストトラック規則に基づき、呼吸数や脈拍測定を省略して即座に軽症群(GREEN)として完了する。",
      reply: "【判定確定: GREEN (緑 / 軽症群)】自力歩行が可能です。緑タッグを適用し、軽症救護エリアへ誘導してください。",
      rationale: "自力歩行可能（START法 Step 1 最速ショートカット完了）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 1
    };
  }

  // (B) 気道確保後も無呼吸 ➔ 即 BLACK
  if (entities.breathing === "none_after_airway") {
    return {
      action: "finalize",
      category: "BLACK",
      thought: "【AI決定木推論: Step 2 ショートカット】気道確保（頭部後屈顎先挙上）を実施しても自発呼吸が再開しないことを確認。START法規定により不処置・死亡群(BLACK)を確定する。",
      reply: "【判定確定: BLACK (黒 / 死亡・不処置群)】気道確保後も呼吸が再開しません。黒タッグを適用し、生存救命可能な他傷病者の救命を優先してください。",
      rationale: "気道確保後も自発呼吸の再開なし（START法 Step 2 規定）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 2
    };
  }

  // (C) 気道確保で呼吸再開 ➔ 即 RED
  if (entities.breathing === "resumed_airway") {
    return {
      action: "finalize",
      category: "RED",
      thought: "【AI決定木推論: Step 2 ショートカット】当初無呼吸であったが気道確保により呼吸再開。重篤な気道閉塞リスクがあり、直ちに最優先治療群(RED)として確定する。",
      reply: "【判定確定: RED (赤 / 最優先治療群)】気道確保により呼吸が再開しました。気道閉塞の危険があるため赤タッグを適用し、気道維持を行いながら最優先搬送してください。",
      rationale: "気道確保による自発呼吸再開（START法 Step 2 規定）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 2
    };
  }

  // (D) 呼吸数異常 (<10 または >=30) ➔ 即 RED
  if (entities.rateStatus === "abnormal") {
    return {
      action: "finalize",
      category: "RED",
      thought: `【AI決定木推論: Step 3 ショートカット】入力テキストから呼吸数異常 (<10 または ≧30回/分) を抽出。急性換気不全の緊急事態と判断し、脈拍・意識評価を省略して直ちに最優先治療群(RED)を確定する。`,
      reply: "【判定確定: RED (赤 / 最優先治療群)】呼吸数が異常です。急性換気不全の恐れがあるため赤タッグを適用し、酸素投与・最優先搬送を行ってください。",
      rationale: "呼吸数異常 (10回/分未満 または 30回/分以上)。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 3
    };
  }

  // (E) 循環不全 (橈骨動脈消失 / CRT>2秒) ➔ 即 RED
  if (entities.circulation === "failed") {
    return {
      action: "finalize",
      category: "RED",
      thought: "【AI決定木推論: Step 4 ショートカット】橈骨動脈触知不可またはCRT>2秒の毛細血管再充満遅延を抽出。循環性ショックの危険があり、意識評価を省略して直ちに最優先治療群(RED)を確定する。",
      reply: "【判定確定: RED (赤 / 最優先治療群)】橈骨動脈の脈拍消失またはCRT遅延（>2秒）を認めます。循環性ショックの危険があるため赤タッグを適用し、圧迫止血・保温・最優先搬送を行ってください。",
      rationale: "橈骨動脈拍動消失 または CRT>2秒（循環不全）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 4
    };
  }

  // (F) 意識障害 (従命不能) ➔ 即 RED
  if (entities.mental === "cannot_obey") {
    return {
      action: "finalize",
      category: "RED",
      thought: "【AI決定木推論: Step 5 ショートカット】簡単な指示に従えない（従命不能・意識障害）を抽出。中枢神経障害・頭部外傷の疑いにより最優先治療群(RED)として確定する。",
      reply: "【判定確定: RED (赤 / 最優先治療群)】簡単な指示に従えません（意識障害・従命不能）。頭部外傷等の疑いがあるため赤タッグを適用し、最優先搬送してください。",
      rationale: "従命不能・意識障害（START法 Step 5 規定）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 5
    };
  }

  // (G) 複合報告で全バイタル正常（歩行不可 + 呼吸正常 + 循環良好 + 従命良好） ➔ YELLOW
  if (entities.walking === "cannot_walk" && entities.rateStatus === "normal" && entities.circulation === "good" && entities.mental === "can_obey") {
    return {
      action: "finalize",
      category: "YELLOW",
      thought: "【AI決定木推論: 複合判定】自力歩行は不可であるが、呼吸数正常・循環良好・従命可の全バイタル安定を同時に確認。待機的治療群(YELLOW)として判定確定。",
      reply: "【判定確定: YELLOW (黄 / 待機的治療群)】自力歩行は困難ですが、呼吸・循環・意識はすべて安定しています。黄タッグを適用し、二次トリアージポストへ搬送してください。",
      rationale: "歩行不能だが呼吸・循環・意識はすべて安定（待機的治療群）。",
      extractedFacts: entities.facts,
      isShortcut: true,
      currentStep: 5
    };
  }

  // === 2. 通常の対話進行（未確定バイタルの順次質問） ===

  // Step 1: 歩行
  if (currentStep === 1) {
    return {
      action: "ask",
      nextStep: 2,
      thought: "【AI決定木推論: Step 1】報告から「自力歩行不能」を検出。軽症(緑)は除外されたため、次の最重要バイタルである「Step 2: 自発呼吸の有無」の確認を指示する。",
      reply: "自力歩行不能を確認しました。直ちに【自発呼吸の有無】を確認してください。息をしていますか？（息がない場合は気道確保を実施してください）",
      extractedFacts: entities.facts,
      isShortcut: false,
      currentStep: 1
    };
  }

  // Step 2: 呼吸有無
  if (currentStep === 2) {
    return {
      action: "ask",
      nextStep: 3,
      thought: "【AI決定木推論: Step 2】自発呼吸の存在を確認。次の決定木ノード「Step 3: 呼吸数(回/分)」へ遷移し、急性換気不全の有無を定量評価する。",
      reply: "自発呼吸を確認しました。続いて【1分間の呼吸数】を測定してください。10〜29回/分の正常範囲ですか、それとも異常（30回以上 / 10回未満）ですか？",
      extractedFacts: entities.facts,
      isShortcut: false,
      currentStep: 2
    };
  }

  // Step 3: 呼吸数
  if (currentStep === 3) {
    return {
      action: "ask",
      nextStep: 4,
      thought: "【AI決定木推論: Step 3】呼吸数が正常範囲（10〜29回/分）であることを確認。次の決定木ノード「Step 4: 循環動態（橈骨動脈・CRT）」の確認へ遷移する。",
      reply: "呼吸数は正常範囲内（10〜29回/分）です。続いて【循環動態】を確認してください。手首の橈骨動脈の脈拍は触れますか？ または爪床圧迫テスト(CRT)は2秒以内ですか？",
      extractedFacts: entities.facts,
      isShortcut: false,
      currentStep: 3
    };
  }

  // Step 4: 循環動態
  if (currentStep === 4) {
    return {
      action: "ask",
      nextStep: 5,
      thought: "【AI決定木推論: Step 4】循環動態良好（橈骨動脈触知可、CRT≦2秒）を確認。最終決定木ノード「Step 5: 意識・簡単な従命反応」へ遷移する。",
      reply: "循環動態は良好です。最後に【意識・簡単な従命反応】を確認してください。「手を握ってください」などの簡単な指示に従うことができますか？",
      extractedFacts: entities.facts,
      isShortcut: false,
      currentStep: 4
    };
  }

  // Step 5: 意識・従命
  if (currentStep === 5) {
    return {
      action: "finalize",
      category: "YELLOW",
      thought: "【AI決定木推論: Step 5】全決定木ノードをクリア（歩行不可、呼吸正常、循環良好、従命良好）。待機的治療群(YELLOW)として判定確定。",
      reply: "【判定確定: YELLOW (黄 / 待機的治療群)】歩行は困難ですが、呼吸・循環・意識の生命維持バイタルは保たれています。黄タッグを適用し、二次トリアージエリアへ搬送してください。",
      rationale: "歩行不能だが呼吸・循環・意識はすべて安定（待機的治療群）。",
      extractedFacts: entities.facts,
      isShortcut: false,
      currentStep: 5
    };
  }

  return {
    action: "unknown",
    reply: "状況を詳しく教えてください。",
    extractedFacts: entities.facts
  };
}
