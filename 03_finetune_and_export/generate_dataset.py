"""
公式START式トリアージ決定木に基づく体系的データセット生成スクリプト
総務省消防庁「多数傷病者対応標準マニュアル」および日本救急医学会START法基準に準拠。

各症例は START 法のデシジョンツリー（5段階判定フロー）をステップバイステップで
思考（Chain-of-Thought）し、judgment_reason を triage_category の前に出力する。
"""

import json
import random
from pathlib import Path

SYSTEM_PROMPT = """あなたは災害医療・救急現場のSTART式トリアージ判定スペシャリストAIです。
総務省消防庁および日本救急医学会のSTART法（Simple Triage and Rapid Treatment）判定基準に従い、
以下の TypeScript 型定義に厳密に準拠した JSON 文字列のみを出力してください。
思考プロセス（CoT）である judgment_reason を必ず triage_category の前に出力してください。

type TriageOutput = {
  judgment_reason: string; // START法決定木に基づく臨床思考プロセス（ステップ・バイ・ステップ判定理由）
  vital_assessment: {
    walkable: boolean;
    respiratory_rate: number | null;
    radial_pulse: "present" | "weak" | "absent" | null;
    capillary_refill_time_sec: number | null;
    obeys_commands: boolean;
  };
  triage_category: "RED" | "YELLOW" | "GREEN" | "BLACK";
  priority: "最優先治療群" | "待機的治療群" | "保留群（軽症）" | "不処置（死亡・救命不能）";
  immediate_action: string;
};"""

# テンプレート群（多様な災害現場シナリオ）
ACCIDENTS = [
    "地震による家屋倒壊現場", "高速道路多重追突事故", "商業ビル火災・煙充満現場",
    "化学工場爆発事故", "列車脱線衝突事故", "土砂崩れ巻き込み現場",
    "ガス爆発による店舗損壊現場", "トンネル内火災現場", "大型バス転落事故"
]

def generate_samples():
    samples = []
    
    # =========================================================================
    # 分岐 1: 歩行可能 ➔ GREEN（保留群・軽症） (25件)
    # =========================================================================
    green_cases = [
        ("前腕に浅い擦過傷あり。自力で救護所まで歩いてきた。", "軽度の擦過創の被覆、破傷風予防の確認、待機エリア誘導"),
        ("割れたガラスによる手掌切創、圧迫止血中。歩行移動可能。", "直接圧迫止血の継続、ガーゼ保護、再評価"),
        ("足関節の軽度捻挫。足を引きずりながらも自力歩行可能。", "患部アイシング、弾性包帯固定、経過観察"),
        ("「歩ける方はこちらへ移動してください」の呼びかけに応じ、自力避難完了。", "安全エリアへの誘導、バイタル確認、トリアージタッグ装着"),
        ("頭部に小さな擦り傷。ふらつきなく自力歩行し会話可能。", "頭部創処置、遅発性頭蓋内出血への注意喚起、経過観察"),
        ("右肩の打撲痛。自力歩行可能で受け答え明瞭。", "三角巾による腕の保持、疼痛管理、経過観察"),
        ("煙を吸って咳き込んでいるが自力歩行可能。チアノーゼなし。", "新鮮空気下での安静、SpO2モニタリング、呼吸状態再評価"),
        ("顔面に粉塵・泥付着。自力歩行して受診、視力・意識問題なし。", "洗眼・顔面洗浄、角膜損傷チェック、待機エリア誘導"),
        ("背部打撲痛。歩行可能、神経麻痺症状なし。", "体動時痛の確認、安静指示、再トリアージ体制確保"),
        ("手足の打撲・擦過傷。自力で安全地帯へ避難できた。", "創傷処置、保温、軽症者エリアでの待機指示"),
    ]
    
    for i in range(25):
        age = random.choice([8, 16, 22, 29, 35, 42, 51, 63, 72])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        complaint, action = random.choice(green_cases)
        
        user_input = f"{scene}にて救出された{age}歳{gender}。{complaint}自力歩行可能。"
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 現場指示に対して自力歩行が可能。"
                "➔ START法一次スクリーニング基準により、直ちに保留群（緑/軽症）と確定。"
            ),
            "vital_assessment": {
                "walkable": True,
                "respiratory_rate": None,
                "radial_pulse": None,
                "capillary_refill_time_sec": None,
                "obeys_commands": True
            },
            "triage_category": "GREEN",
            "priority": "保留群（軽症）",
            "immediate_action": action
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 2A: 自力歩行不可 ➔ 無呼吸 ➔ 気道確保で呼吸再開 ➔ RED (最優先) (15件)
    # =========================================================================
    for i in range(15):
        age = random.choice([19, 28, 37, 45, 54, 62, 70])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        rr_after = random.choice([12, 14, 16, 20, 24])
        
        user_input = (
            f"{scene}。{age}歳{gender}。瓦礫の下から救出され自力歩行不可。初期確認で自発呼吸なし。"
            f"直ちに頭部後屈顎先挙上法により用手的気道確保を行ったところ、微弱な自発呼吸が再開（呼吸数{rr_after}回/分）。橈骨動脈は微弱。"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 自力歩行不可。"
                f"②呼吸判定: 初期自発呼吸なし ➔ 用手的気道確保を実施 ➔ 自発呼吸が再開（呼吸数{rr_after}回/分）。"
                "➔ 気道確保により呼吸再開した傷病者は、循環や意識の評価を待たず最優先治療群（赤）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr_after,
                "radial_pulse": "weak",
                "capillary_refill_time_sec": None,
                "obeys_commands": False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "経口/経鼻エアウェイ挿入による気道開通維持、高濃度酸素投与、最優先搬送手配"
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 2B: 自力歩行不可 ➔ 無呼吸 ➔ 気道確保でも呼吸再開せず ➔ BLACK (死亡・救命困難) (15件)
    # =========================================================================
    for i in range(15):
        age = random.choice([25, 34, 48, 57, 66, 75])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        finding = random.choice([
            "頸動脈触知不可、対光反射なし。",
            "頭部開放性粉砕骨折、脳組織脱出あり。",
            "体幹部高度挫滅、心音・脈拍完全停止。",
            "総頸動脈の拍動なし、死戦期硬直様。"
        ])
        
        user_input = (
            f"{scene}。{age}歳{gender}。自力歩行不可。自発呼吸を認めず。"
            f"気道確保（頭部後屈顎先挙上法）を2回実施したが自発呼吸の再開なし。{finding}"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 自力歩行不可。"
                "②呼吸判定: 自発呼吸なし ➔ 気道確保を実施するも呼吸の再開は認められず。"
                "➔ START法基準により、不処置群（黒 / 死亡・救命困難）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": 0,
                "radial_pulse": "absent",
                "capillary_refill_time_sec": None,
                "obeys_commands": False
            },
            "triage_category": "BLACK",
            "priority": "不処置（死亡・救命不能）",
            "immediate_action": "トリアージタッグ黒装着、現場指揮所へ死亡報告、生存傷病者の救命を優先"
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 3: 呼吸数異常（<10回 または >=30回）➔ RED (最優先) (30件)
    # 境界値: 30回（赤）, 32回, 38回, 42回 / 8回（赤）, 6回
    # =========================================================================
    for i in range(30):
        age = random.choice([15, 23, 31, 44, 52, 60, 68, 77])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        is_tachypnea = (i % 2 == 0)
        
        if is_tachypnea:
            # 頻呼吸 (>=30)
            rr = random.choice([30, 31, 34, 36, 40, 44])
            finding = random.choice([
                "胸部打撲、陥没呼吸、チアノーゼあり。",
                "肋骨多発骨折疑い、浅く速い促迫呼吸。",
                "熱傷による気道浮腫疑い、吸気性喘鳴を伴う頻呼吸。"
            ])
            reason_part = f"呼吸数が{rr}回/分（30回/分以上の異常頻呼吸）であり換気不全が切迫。"
        else:
            # 徐呼吸 (<10)
            rr = random.choice([4, 6, 8, 9])
            finding = random.choice([
                "胸部圧迫外傷、著明な努力性徐呼吸、チアノーゼ顕著。",
                "頭部打撲、不規則なあえぎ様徐呼吸。",
                "煙吸入による意識障害、低換気・徐呼吸。"
            ])
            reason_part = f"呼吸数が{rr}回/分（10回/分未満の著明な徐呼吸）であり呼吸中枢抑制・呼吸不全。"

        user_input = (
            f"{scene}。{age}歳{gender}。自力歩行不可。自発呼吸あり、呼吸数{rr}回/分。{finding}橈骨動脈触知可能。"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 自力歩行不可。"
                f"②呼吸判定: 自発呼吸あり、{reason_part}"
                "➔ 循環や意識の評価を待たず、START法基準に基づき最優先治療群（赤）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": None,
                "obeys_commands": True if rr >= 30 else False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "BVMによる補助換気または高濃度酸素投与、胸部外傷の初期処置、最優先搬送"
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 4: 呼吸正常(10-29) ➔ 循環異常(脈拍消失 / CRT>2秒) ➔ RED (最優先) (30件)
    # =========================================================================
    for i in range(30):
        age = random.choice([17, 24, 33, 41, 50, 58, 65, 73])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        rr = random.choice([12, 16, 20, 24, 28, 29]) # 呼吸数は適正範囲
        
        circ_type = random.choice(["pulse_absent", "crt_delayed", "both"])
        if circ_type == "pulse_absent":
            pulse_str = "absent"
            crt_val = None
            finding = "大腿骨開放骨折からの多量活動性出血。橈骨動脈触知不可。頸動脈は微弱に触知。"
            circ_reason = "橈骨動脈触知不可（収縮期血圧80mmHg未満のショック状態）"
            action = "出血点への直接圧迫止血・止血帯（ターニケット）適用、下肢挙上、最優先搬送"
        elif circ_type == "crt_delayed":
            pulse_str = "weak"
            crt_val = random.choice([3, 4, 5])
            finding = f"骨盤部高度打撲変形。橈骨動脈極めて微弱、毛細血管再充満時間(CRT)は{crt_val}秒と著明遅延。"
            circ_reason = f"CRTが{crt_val}秒（2秒を超える末梢循環不全・出血性ショック疑い）"
            action = "骨盤部シーツラッピング固定、保温、急速輸液路確保、最優先搬送"
        else:
            pulse_str = "absent"
            crt_val = 3
            finding = "腹部鈍的外傷による腹部膨満と冷汗。橈骨動脈触知不可、CRT3秒。意識清明だが顔面蒼白。"
            circ_reason = "橈骨動脈触知不可およびCRT3秒以上（重篤な内出血・循環虚脱）"
            action = "ショック体位、保温、腹部愛護的管理、最優先搬送"

        user_input = (
            f"{scene}。{age}歳{gender}。自力歩行不可。呼吸数{rr}回/分（適正範囲）。{finding}従命反応あり。"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 自力歩行不可。"
                f"②呼吸判定: 自発呼吸あり、呼吸数{rr}回/分（10〜29回の適正範囲内）。"
                f"③循環判定: {circ_reason}が認められる。"
                "➔ 意識の評価を待たず、START法基準に基づき最優先治療群（赤）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": pulse_str,
                "capillary_refill_time_sec": crt_val,
                "obeys_commands": True
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": action
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 5A: 呼吸正常・循環正常 ➔ 従命不能 ➔ RED (最優先) (20件)
    # =========================================================================
    for i in range(20):
        age = random.choice([14, 21, 30, 46, 55, 64, 78])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        rr = random.choice([14, 18, 22, 26])
        finding = random.choice([
            "頭部外傷、前額部に挫創。呼びかけに対し開眼するが発語不能、従命不可。",
            "側頭部打撲、耳孔より耳出血。昏睡状態、簡単な指示に応答なし。",
            "瓦礫直撃による頭部挫創。「手を握って」の簡単な指示に従えず不穏状態。",
            "爆風による脳振盪疑い。意識混濁、従命反応なし、開眼のみ。"
        ])
        
        user_input = (
            f"{scene}。{age}歳{gender}。自力歩行不可。呼吸数{rr}回/分（適正）。橈骨動脈触知良好、CRT1秒。{finding}"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 自力歩行不可。"
                f"②呼吸判定: 自発呼吸あり、呼吸数{rr}回/分（適正範囲）。"
                "③循環判定: 橈骨動脈触知良好、CRT正常（循環動態安定）。"
                "④意識判定: 簡単な指示に従命不能（中枢神経障害・重篤な意識障害）。"
                "➔ START法基準に基づき、最優先治療群（赤）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": 1,
                "obeys_commands": False
            },
            "triage_category": "RED",
            "priority": "最優先治療群",
            "immediate_action": "頸椎保護（カラー装着）、気道確保、嘔吐誤嚥防止、最優先搬送手配"
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    # =========================================================================
    # 分岐 5B: 呼吸正常・循環正常 ➔ 従命可能 ➔ YELLOW (待機的治療群) (30件)
    # =========================================================================
    for i in range(30):
        age = random.choice([18, 26, 35, 43, 53, 61, 69])
        gender = random.choice(["男性", "女性"])
        scene = random.choice(ACCIDENTS)
        rr = random.choice([12, 15, 18, 21, 25, 27])
        finding = random.choice([
            "右下腿の明らかな変形と激痛。自力歩行は不可能だが、意識清明で「手を握って」に従命可能。",
            "骨盤部の強打、荷重不可（担架移送）。橈骨動脈良好、質問に的確に回答。",
            "両大腿部の広範囲挫傷・血腫。起立歩行困難だがバイタル安定、従命可能。",
            "腰椎圧迫骨折疑い、体動時腰痛激しい。神経脱落症状なし、呼吸循環安定、従命良好。",
            "左足関節の脱臼骨折、激痛で歩行不能。橈骨動脈触知明瞭、意識は完全に清明。"
        ])
        
        user_input = (
            f"{scene}。{age}歳{gender}。疼痛・変形のため自力歩行不可。呼吸数{rr}回/分。橈骨動脈触知良好、CRT1秒。{finding}"
        )
        output = {
            "judgment_reason": (
                "【START法判定フロー】"
                "①歩行判定: 患部疼痛・変形により自力歩行不可。"
                f"②呼吸判定: 自発呼吸あり、呼吸数{rr}回/分（10〜29回の適正範囲）。"
                "③循環判定: 橈骨動脈触知良好、CRT正常（循環不全なし）。"
                "④意識判定: 簡単な指示に従命可能（意識清明・中枢神経障害なし）。"
                "➔ バイタルサインは安定しており生命の危機は切迫していないため、待機的治療群（黄）と判定。"
            ),
            "vital_assessment": {
                "walkable": False,
                "respiratory_rate": rr,
                "radial_pulse": "present",
                "capillary_refill_time_sec": 1,
                "obeys_commands": True
            },
            "triage_category": "YELLOW",
            "priority": "待機的治療群",
            "immediate_action": "患部副木固定、クーリング・除痛、バイタル定時再評価（状態悪化時の再トリアージ）"
        }
        samples.append({"input": user_input, "output": json.dumps(output, ensure_ascii=False)})

    random.shuffle(samples)
    return samples

def main():
    samples = generate_samples()
    output_path = Path(__file__).parent / "triage_dataset.jsonl"
    
    with open(output_path, "w", encoding="utf-8") as f:
        for item in samples:
            record = {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": item["input"]},
                    {"role": "model", "content": item["output"]}
                ]
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            
    print(f"Generated {len(samples)} high-quality CoT triage samples in {output_path}")

if __name__ == "__main__":
    main()
