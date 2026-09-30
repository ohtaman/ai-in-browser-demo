"""
START法決定木シミュレータによる対話型トリアージデータセット生成スクリプト
Train (訓練用) と Eval (評価用) を完全分離して生成する。

各対話は以下の仕様を満たす：
1. ユーザーの初期報告（状況説明）から開始
2. エージェントは内部思考 (thought) と発話 (question / finalize) を JSON で出力
3. すでに提供された情報は二度聞きせず、決定木の次に必要な未確認項目のみを質問
4. 判定条件が成立した瞬間に即座に finalize（ショートカット）
"""

import json
import random
from pathlib import Path

SYSTEM_PROMPT = """あなたは災害医療・救急現場のSTART式トリアージ判定スペシャリストAIです。
総務省消防庁および日本救急医学会のSTART法（Simple Triage and Rapid Treatment）判定基準に従い、
ユーザー（救助者や初動対応者）と対話しながら、必要最小限の質問で迅速に傷病者のトリアージを行います。

以下の TypeScript 型定義に厳密に準拠した JSON 文字列のみを出力してください。
余計な解説やマークダウン記法は含めず、純粋な JSON のみを出力してください。

type TriageAgentResponse = 
  | {
      thought: string; // START法決定木に基づく内部思考プロセス（現在地・未確認項目の特定）
      action: "ask";
      question: string; // 救助者への簡潔かつ的確な質問・指示
    }
  | {
      thought: string; // 最終判定に至った臨床的根拠・ショートカット理由
      action: "finalize";
      vital_assessment: {
        walkable: boolean | null;
        respiratory_rate: number | null;
        radial_pulse: "present" | "weak" | "absent" | null;
        capillary_refill_time_sec: number | null;
        obeys_commands: boolean | null;
      };
      triage_category: "RED" | "YELLOW" | "GREEN" | "BLACK";
      priority: "最優先治療群" | "待機的治療群" | "保留群（軽症）" | "不処置（死亡・救命不能）";
      immediate_action: string;
    };"""

SCENES_TRAIN = [
    "地震による家屋倒壊現場", "高速道路多重衝突事故", "商業ビル火災現場",
    "化学工場爆発事故", "列車脱線衝突事故", "土砂崩れ巻き込み現場",
    "ガス爆発による店舗損壊現場", "トンネル内多重火災"
]

SCENES_EVAL = [
    "豪雨による地下街浸水現場", "スタジアム群衆転倒・圧迫事故", "製鉄所配管破裂現場",
    "大型客船衝突現場", "山林火災避難誘導現場"
]

def generate_conversation(scene: str, category: str, variation_id: int):
    """
    START法決定木に沿って、1件のマルチターン対話をシミュレート・生成する。
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    age = random.choice([8, 17, 24, 32, 45, 56, 68, 79])
    gender = random.choice(["男性", "女性"])
    
    # -------------------------------------------------------------------------
    # パターン 1: GREEN (保留群・軽症)
    # -------------------------------------------------------------------------
    if category == "GREEN":
        # サブパターン A: 最初の発話で自力歩行していることが明らかな場合
        if variation_id % 2 == 0:
            user_init = random.choice([
                f"{scene}です。{age}歳{gender}が腕から血を流していますが、自力で救護所まで歩いてきました。",
                f"{scene}。{age}歳{gender}、「歩ける方は移動してください」の呼びかけに応じて自力で歩いて安全地帯に来ました。",
                f"{scene}。{age}歳{gender}、足を引きずりながらも自力で歩行して避難してきました。軽い擦り傷があります。"
            ])
            messages.append({"role": "user", "content": user_init})
            
            agent_res = {
                "thought": "自力歩行が可能であることを確認。START法一次スクリーニング基準により、呼吸・循環・意識の確認を省略して直ちにGREEN（保留群・軽症）と判定する。",
                "action": "finalize",
                "vital_assessment": {
                    "walkable": True,
                    "respiratory_rate": None,
                    "radial_pulse": None,
                    "capillary_refill_time_sec": None,
                    "obeys_commands": True
                },
                "triage_category": "GREEN",
                "priority": "保留群（軽症）",
                "immediate_action": "軽症者待機エリアへ誘導し、創部の保護・被覆を行ってください。状態変化があれば再評価します。"
            }
            messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})
        
        # サブパターン B: 最初は歩行可能か不明で、質問して歩行可能と判明
        else:
            user_init = random.choice([
                f"{scene}です。{age}歳{gender}が倒れた什器の横にうずくまっています。",
                f"{scene}。{age}歳{gender}が瓦礫のそばで座り込んで不安そうにしています。",
                f"{scene}。{age}歳{gender}がうずくまって腕を押さえています。"
            ])
            messages.append({"role": "user", "content": user_init})
            
            agent_ask1 = {
                "thought": "初期状況のみでは歩行可能か不明。START法第1ステップとして、自力歩行が可能かを確認する。",
                "action": "ask",
                "question": "その方は呼びかけに応じますか？ 自力で立って歩くことはできますか？"
            }
            messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
            
            user_resp1 = random.choice([
                "声をかけたら返事をして、自分で立って歩けます。手首を少し擦りむいているようです。",
                "自力で立ち上がることができ、安全な場所まで自分で歩いて移動できました。",
                "「痛いけど歩ける」と言って、自分で立ち上がって歩き始めました。"
            ])
            messages.append({"role": "user", "content": user_resp1})
            
            agent_res = {
                "thought": "自力歩行可能を確認。START法基準により、これ以上のバイタル測定をスキップして直ちにGREEN判定。",
                "action": "finalize",
                "vital_assessment": {
                    "walkable": True,
                    "respiratory_rate": None,
                    "radial_pulse": None,
                    "capillary_refill_time_sec": None,
                    "obeys_commands": True
                },
                "triage_category": "GREEN",
                "priority": "保留群（軽症）",
                "immediate_action": "緑タッグを装着し、軽症者エリアへ誘導してください。創傷処置を行いつつ経過観察します。"
            }
            messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 2: RED - 気道確保で自発呼吸再開 (無呼吸 ➔ 赤)
    # -------------------------------------------------------------------------
    elif category == "RED_AIRWAY_RESUMED":
        user_init = f"{scene}。{age}歳{gender}が倒れていて全く動きません。歩けそうにありません。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "自力歩行不可を確認。START法第2ステップとして、胸の上下動や自発呼吸の有無を確認する。",
            "action": "ask",
            "question": "胸やお腹は上下していますか？ 自発呼吸があるか確認してください。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "胸が動いていません。息をしていないようです！"})
        
        agent_ask2 = {
            "thought": "自発呼吸なし。直ちに気道確保（頭部後屈顎先挙上法）を実施させ、呼吸が再開するか確認する。",
            "action": "ask",
            "question": "直ちに気道確保（顎を上に持ち上げ、頭を後ろに反らせる）を行ってください。気道を確保した状態で呼吸は再開しますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask2, ensure_ascii=False)})
        
        rr_after = random.choice([12, 16, 20, 24])
        messages.append({"role": "user", "content": f"気道を開けたら、フシューと息を吐き出して自力で息をし始めました！ 1分間に{rr_after}回くらいです。"})
        
        agent_res = {
            "thought": f"気道確保手技により自発呼吸が再開（{rr_after}回/分）。START法基準により、気道確保で呼吸再開した患者は直ちに最優先治療群（赤）と確定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr_after,
                "radial_pulse": "weak",
                "capillary_refill_time_sec": None,
                "obeys_commands": False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "気道確保の姿勢を維持（エアウェイ挿入推奨）、高濃度酸素投与、直ちに最優先搬送を手配してください。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 3: BLACK - 気道確保しても無呼吸 (死亡・救命困難)
    # -------------------------------------------------------------------------
    elif category == "BLACK":
        user_init = f"{scene}。{age}歳{gender}が瓦礫の下敷きになっており自力歩行不可、呼びかけに反応がありません。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "自力歩行不可。呼吸の有無を確認する。",
            "action": "ask",
            "question": "胸やお腹の動きを見て、自発呼吸があるか確認してください。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "息をしていません。胸が全く動いていません。"})
        
        agent_ask2 = {
            "thought": "自発呼吸なし。気道確保（頭部後屈顎先挙上）を実施させて自発呼吸再開の有無を確認する。",
            "action": "ask",
            "question": "頭部後屈顎先挙上法で気道を確保してください。気道を開いても呼吸は再開しませんか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask2, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "気道確保をしっかり行いましたが、呼吸は全く再開しません。手首や首の脈もありません。"})
        
        agent_res = {
            "thought": "自力歩行不可、無呼吸に対し気道確保を実施するも自発呼吸再開なし。START法基準に基づき不処置群（黒）と確定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": 0,
                "radial_pulse": "absent",
                "capillary_refill_time_sec": None,
                "obeys_commands": False
            },
            "triage_category": "BLACK",
            "priority": "不処置（死亡・救命不能）",
            "immediate_action": "黒タッグを装着し、現時点での心肺蘇生は中止して他の生存傷病者のトリアージ・救命を優先してください。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 4: RED - 呼吸数異常 (>=30回 または <10回)
    # -------------------------------------------------------------------------
    elif category == "RED_RESPIRATORY":
        is_tachypnea = (variation_id % 2 == 0)
        rr = random.choice([30, 32, 36, 42]) if is_tachypnea else random.choice([4, 6, 8, 9])
        
        user_init = f"{scene}。{age}歳{gender}が倒れており、足の痛みを訴えて自力歩行できません。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "自力歩行不可。呼吸の有無と呼吸数を確認する。",
            "action": "ask",
            "question": "自発呼吸はありますか？ 1分間に何回程度呼吸していますか？（10秒間測って教えてください）"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        if is_tachypnea:
            user_resp = f"息はしていますが、肩で息をしていて非常に速いです。10秒で6回、1分あたり約{rr}回あります。"
            reason_txt = f"呼吸数が{rr}回/分（30回/分以上の異常頻呼吸）であり換気障害が切迫。"
        else:
            user_resp = f"息は微弱で非常に遅いです。1分間に{rr}回程度しか呼吸していません。顔色が悪いです。"
            reason_txt = f"呼吸数が{rr}回/分（10回/分未満の著しい徐呼吸）であり低換気・中枢抑制。"

        messages.append({"role": "user", "content": user_resp})
        
        agent_res = {
            "thought": f"自力歩行不可、{reason_txt}。循環や意識の評価をスキップし、START法基準により直ちにREDと確定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": None,
                "obeys_commands": True if rr >= 30 else False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "気道確保、高濃度酸素投与（BVM補助換気考慮）、赤タッグ装着、最優先搬送手配。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 5: RED - 呼吸正常だが循環虚脱 (脈拍触知不可 / CRT>2秒)
    # -------------------------------------------------------------------------
    elif category == "RED_CIRCULATION":
        rr = random.choice([14, 18, 22, 26, 28])
        user_init = f"{scene}。{age}歳{gender}が大出血しており自力歩行不可です。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "歩行不可。呼吸数を確認する。",
            "action": "ask",
            "question": "自発呼吸の回数は1分間にどれくらいですか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": f"呼吸は落ち着いていて、1分間に約{rr}回です。"})
        
        agent_ask2 = {
            "thought": f"呼吸数{rr}回/分で適正範囲（10〜29回）。次は循環の評価。橈骨動脈の触知またはCRTを確認する。",
            "action": "ask",
            "question": "手首の内側の脈（橈骨動脈）は触れますか？ または爪を白くなるまで圧迫して離したとき、赤みが戻るのに2秒以上かかりますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask2, ensure_ascii=False)})
        
        crt_delay = (variation_id % 2 == 0)
        if crt_delay:
            user_resp2 = "手首の脈が極めて弱く、爪を押して離しても赤みが戻るのに4秒くらいかかります。冷汗をかいています。"
            circ_reason = "CRTが4秒と著明遅延（末梢循環不全・ショック状態）"
            crt_val = 4
            pulse_val = "weak"
        else:
            user_resp2 = "手首の脈を触ろうとしましたが、全く触れません！ 頸動脈はかすかに触れます。"
            circ_reason = "橈骨動脈触知不可（収縮期血圧80mmHg未満の循環虚脱）"
            crt_val = None
            pulse_val = "absent"
            
        messages.append({"role": "user", "content": user_resp2})
        
        agent_res = {
            "thought": f"歩行不可、呼吸正常（{rr}回/分）。しかし{circ_reason}。意識の確認をスキップし、START法基準に基づき直ちにRED判定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": pulse_val,
                "capillary_refill_time_sec": crt_val,
                "obeys_commands": True
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "直ちに出血点の直接圧迫止血（必要に応じ止血帯適用）、下肢挙上、保温、最優先搬送手配。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 6: RED - 呼吸正常・循環正常だが従命不能 (意識障害)
    # -------------------------------------------------------------------------
    elif category == "RED_CONSCIOUSNESS":
        rr = random.choice([16, 20, 24])
        user_init = f"{scene}。{age}歳{gender}が頭部を強打して倒れており自力歩行不可です。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "歩行不可。呼吸状態と呼吸数を確認する。",
            "action": "ask",
            "question": "自発呼吸はありますか？ 呼吸数は1分間に何回程度ですか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": f"呼吸はしっかりしていて、1分間に約{rr}回です。"})
        
        agent_ask2 = {
            "thought": f"呼吸数{rr}回/分で適正。次は循環状態（手首の脈）を確認する。",
            "action": "ask",
            "question": "手首の脈（橈骨動脈）はしっかり触れますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask2, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "手首の脈はしっかり触れています。強く拍動しています。"})
        
        agent_ask3 = {
            "thought": "呼吸正常、循環良好。最後に意識状態（簡単な指示に従えるか）を確認する。",
            "action": "ask",
            "question": "「手を握ってください」「目を開けてください」などの簡単な指示に従えますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask3, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "呼びかけても唸るだけで、手を握る指示には全く従えません。意識が朦朧としています。"})
        
        agent_res = {
            "thought": f"歩行不可、呼吸正常（{rr}回）、循環良好。しかし簡単な指示に従命不能（中枢神経障害・意識障害あり）。START基準によりREDと確定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": 1,
                "obeys_commands": False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "頸椎保護、気道確保（嘔吐時の誤嚥防止）、赤タッグ装着、最優先搬送手配。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    # -------------------------------------------------------------------------
    # パターン 7: YELLOW - 呼吸正常・循環正常・従命可能 (待機的治療群)
    # -------------------------------------------------------------------------
    elif category == "YELLOW":
        rr = random.choice([15, 18, 21, 24])
        injury = random.choice(["右下腿の変形骨折", "骨盤部の激痛", "腰背部の打撲痛", "足関節の脱臼骨折"])
        
        user_init = f"{scene}。{age}歳{gender}が{injury}により立ち上がれず、自力歩行不可です。"
        messages.append({"role": "user", "content": user_init})
        
        agent_ask1 = {
            "thought": "歩行不可。呼吸数を確認する。",
            "action": "ask",
            "question": "呼吸数は1分間に何回程度ですか？ 息苦しさはなさそうですか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask1, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": f"呼吸は落ち着いていて、1分間に約{rr}回です。胸の痛みはありません。"})
        
        agent_ask2 = {
            "thought": f"呼吸数{rr}回/分で正常範囲内。次は手首の脈（循環）を確認する。",
            "action": "ask",
            "question": "手首の脈（橈骨動脈）は触れますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask2, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "はい、手首の脈は左右ともしっかり触れます。"})
        
        agent_ask3 = {
            "thought": "呼吸・循環ともに安定。意識・従命反応を確認する。",
            "action": "ask",
            "question": "意識ははっきりしていますか？ 「手を握ってください」などの指示に従えますか？"
        }
        messages.append({"role": "model", "content": json.dumps(agent_ask3, ensure_ascii=False)})
        
        messages.append({"role": "user", "content": "「痛いけど大丈夫です」と受け答えでき、指示通りしっかり手を握り返してくれます。"})
        
        agent_res = {
            "thought": f"歩行不可だが、呼吸正常（{rr}回）、循環良好、指示に従命可能。生命に直結するバイタル崩壊は認められないため、START基準により待機的治療群（黄）と判定。",
            "action": "finalize",
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": 1,
                "obeys_commands": True
            },
            "triage_category": "YELLOW",
            "priority": "待機的治療群",
            "immediate_action": "黄タッグ装着、患部の副木固定・免荷、保温。状態変化（ショック移行等）に備え定時再トリアージを実施。"
        }
        messages.append({"role": "model", "content": json.dumps(agent_res, ensure_ascii=False)})

    return {"messages": messages}

def main():
    base_dir = Path(__file__).parent
    
    # カテゴリ割り当て
    # Train: 300件
    categories_train = (
        ["GREEN"] * 50 +
        ["RED_AIRWAY_RESUMED"] * 35 +
        ["BLACK"] * 35 +
        ["RED_RESPIRATORY"] * 60 +
        ["RED_CIRCULATION"] * 40 +
        ["RED_CONSCIOUSNESS"] * 40 +
        ["YELLOW"] * 40
    )
    random.shuffle(categories_train)
    
    train_samples = []
    for i, cat in enumerate(categories_train):
        scene = random.choice(SCENES_TRAIN)
        train_samples.append(generate_conversation(scene, cat, i))
        
    train_file = base_dir / "train_conversations.jsonl"
    with open(train_file, "w", encoding="utf-8") as f:
        for s in train_samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"Generated Train dataset: {len(train_samples)} conversations in {train_file}")
    
    # Eval: 60件 (完全に異なるシーンと未知のシードで生成)
    categories_eval = (
        ["GREEN"] * 10 +
        ["RED_AIRWAY_RESUMED"] * 8 +
        ["BLACK"] * 8 +
        ["RED_RESPIRATORY"] * 12 +
        ["RED_CIRCULATION"] * 8 +
        ["RED_CONSCIOUSNESS"] * 8 +
        ["YELLOW"] * 8
    )
    random.shuffle(categories_eval)
    
    eval_samples = []
    for i, cat in enumerate(categories_eval):
        scene = random.choice(SCENES_EVAL)
        eval_samples.append(generate_conversation(scene, cat, i + 1000))
        
    eval_file = base_dir / "eval_conversations.jsonl"
    with open(eval_file, "w", encoding="utf-8") as f:
        for s in eval_samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"Generated Eval dataset: {len(eval_samples)} conversations in {eval_file}")

if __name__ == "__main__":
    main()
