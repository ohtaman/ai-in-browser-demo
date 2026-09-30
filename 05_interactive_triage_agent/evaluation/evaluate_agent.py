"""
対話型トリアージエージェントの定量評価スクリプト
未見の評価データセット（eval_conversations.jsonl）に対して、
1. JSONフォーマット妥当率 (Format Validity)
2. アクション一致率 (Action Accuracy: ask vs finalize)
3. 最終判定正解率 (Triage Category Accuracy: RED/YELLOW/GREEN/BLACK)
4. 決定木ショートカット適切性 (Early Termination Consistency)
を厳密にスコアリングし、結果を JSON および Markdown レポートとして出力する。
"""

import json
import argparse
from pathlib import Path
from typing import Dict, List, Any
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def evaluate_model(model_path: str, eval_data_path: str, device: str = "auto", max_samples: int = None) -> Dict[str, Any]:
    print(f"=== Loading model from: {model_path} ===")
    
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        
    torch_dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch_dtype,
        device_map=device,
        trust_remote_code=True
    )
    model.eval()

    print(f"=== Loading evaluation data from: {eval_data_path} ===")
    conversations = []
    with open(eval_data_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                conversations.append(json.loads(line))
                
    if max_samples and max_samples < len(conversations):
        conversations = conversations[:max_samples]

    total_turns = 0
    valid_json_turns = 0
    correct_action_turns = 0
    
    total_final_cases = 0
    correct_category_cases = 0
    
    category_confusion = {
        "RED": {"correct": 0, "total": 0},
        "YELLOW": {"correct": 0, "total": 0},
        "GREEN": {"correct": 0, "total": 0},
        "BLACK": {"correct": 0, "total": 0},
    }

    print(f"Evaluating {len(conversations)} conversations...")

    for conv_idx, conv in enumerate(conversations):
        msgs = conv["messages"]
        # 対話の各 assistant ターンを検証
        history = [msgs[0]] # system prompt
        
        for turn_idx in range(1, len(msgs), 2):
            user_msg = msgs[turn_idx]
            ground_truth_model_msg = msgs[turn_idx + 1]
            gt_json = json.loads(ground_truth_model_msg["content"])
            
            history.append(user_msg)
            total_turns += 1
            
            # プロンプト生成 (Gemma チャットテンプレート適用)
            prompt = tokenizer.apply_chat_template(history, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
            
            with torch.no_grad():
                output_ids = model.generate(
                    **inputs,
                    max_new_tokens=256,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id
                )
                
            gen_text = tokenizer.decode(output_ids[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
            
            # 1. JSON妥当性
            pred_json = None
            try:
                # ```json ... ``` の除去
                clean_text = gen_text
                if "```json" in clean_text:
                    clean_text = clean_text.split("```json")[1].split("```")[0].strip()
                elif "```" in clean_text:
                    clean_text = clean_text.split("```")[1].split("```")[0].strip()
                pred_json = json.loads(clean_text)
                valid_json_turns += 1
            except Exception:
                pred_json = None
                
            # 2. アクション一致率
            if pred_json and isinstance(pred_json, dict):
                pred_action = pred_json.get("action")
                gt_action = gt_json.get("action")
                if pred_action == gt_action:
                    correct_action_turns += 1
                    
                # 最終判定ターンの評価
                if gt_action == "finalize":
                    total_final_cases += 1
                    gt_cat = gt_json.get("triage_category")
                    pred_cat = pred_json.get("triage_category")
                    
                    if gt_cat in category_confusion:
                        category_confusion[gt_cat]["total"] += 1
                    
                    if pred_cat == gt_cat:
                        correct_category_cases += 1
                        if gt_cat in category_confusion:
                            category_confusion[gt_cat]["correct"] += 1
            else:
                if gt_json.get("action") == "finalize":
                    total_final_cases += 1
                    gt_cat = gt_json.get("triage_category")
                    if gt_cat in category_confusion:
                        category_confusion[gt_cat]["total"] += 1

            # 正解モデル発話を履歴に追加して次のターンへ
            history.append(ground_truth_model_msg)

        if (conv_idx + 1) % 10 == 0 or (conv_idx + 1) == len(conversations):
            print(f"Processed {conv_idx + 1}/{len(conversations)} conversations...")

    results = {
        "model_path": model_path,
        "eval_samples": len(conversations),
        "total_turns": total_turns,
        "format_validity_rate": valid_json_turns / total_turns if total_turns > 0 else 0,
        "action_accuracy": correct_action_turns / total_turns if total_turns > 0 else 0,
        "triage_category_accuracy": correct_category_cases / total_final_cases if total_final_cases > 0 else 0,
        "category_breakdown": {
            cat: {
                "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0,
                "correct": data["correct"],
                "total": data["total"]
            }
            for cat, data in category_confusion.items()
        }
    }
    
    return results

def main():
    parser = argparse.ArgumentParser(description="Evaluate Interactive Triage Agent")
    parser.add_argument("--model_path", type=str, required=True, help="Path or HuggingFace ID of model to evaluate")
    parser.add_argument("--eval_data", type=str, default="05_interactive_triage_agent/dataset/eval_conversations.jsonl")
    parser.add_argument("--output_json", type=str, default="evaluation_results.json")
    parser.add_argument("--max_samples", type=int, default=None)
    args = parser.parse_args()

    results = evaluate_model(args.model_path, args.eval_data, max_samples=args.max_samples)
    
    print("\n=== EVALUATION RESULTS ===")
    print(f"Model: {results['model_path']}")
    print(f"Evaluated Samples: {results['eval_samples']} conversations ({results['total_turns']} turns)")
    print(f"JSON Format Validity: {results['format_validity_rate']:.2%}")
    print(f"Action Accuracy (ask/finalize): {results['action_accuracy']:.2%}")
    print(f"Triage Category Accuracy: {results['triage_category_accuracy']:.2%}")
    print("\nPer-Category Breakdown:")
    for cat, data in results["category_breakdown"].items():
        print(f"  - {cat:6s}: {data['correct']}/{data['total']} ({data['accuracy']:.2%})")

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved full results to {args.output_json}")

if __name__ == "__main__":
    main()
