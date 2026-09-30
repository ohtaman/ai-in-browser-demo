import os
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def test_merged_model():
    model_dir = "./merged_gemma4_triage"
    assert os.path.exists(model_dir), f"{model_dir} must exist"
    assert os.path.exists(os.path.join(model_dir, "config.json")), "config.json must exist"
    assert os.path.exists(os.path.join(model_dir, "tokenizer.json")), "tokenizer.json must exist"

    print("Loading merged model from disk...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForCausalLM.from_pretrained(
        model_dir,
        torch_dtype=torch.bfloat16,
        device_map="auto"
    )
    assert model is not None, "Model must load successfully"
    print("Model and tokenizer loaded successfully.")

    test_case = "45歳男性。家屋倒壊現場から救出。自力歩行不可。呼吸数36回/分。橈骨動脈は微弱に触知。呼びかけに対してうめき声のみで従命不能。"
    messages = [
        {"role": "system", "content": "あなたは災害医療のSTART式トリアージ判定スペシャリストAIです。厳密にSTART基準に従って判定を行い、所定のJSON形式のみで回答してください。"},
        {"role": "user", "content": test_case}
    ]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    print("Generating triage inference...")
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=256, do_sample=False)

    generated_text = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
    print("\n=== Generated Model Output ===\n" + generated_text + "\n==============================\n")

    # TDD Assertions:
    # 1. Output must contain valid JSON object
    json_start = generated_text.find("{")
    json_end = generated_text.rfind("}")
    assert json_start != -1 and json_end != -1, "Output must contain JSON object"
    json_str = generated_text[json_start:json_end+1]

    # 2. JSON must parse cleanly
    data = json.loads(json_str)
    assert "triage_category" in data or "category" in data or "start_triage_category" in data, "JSON must contain triage category key"
    category_val = (data.get("triage_category") or data.get("start_triage_category") or data.get("category")).upper()
    print(f"Parsed triage category: {category_val}")
    assert "RED" in category_val or "赤" in category_val, f"Expected RED, got {category_val}"
    print(">>> TEST PASSED: Model correctly outputs structured JSON triage judgment! <<<")

if __name__ == "__main__":
    test_merged_model()
