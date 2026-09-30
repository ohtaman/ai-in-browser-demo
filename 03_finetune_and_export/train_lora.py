"""
Gemma 4 E2B-it START式トリアージ特化 LoRA 学習 & マージスクリプト
"""
import os
import argparse
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments
)
from peft import LoraConfig, get_peft_model, TaskType, PeftModel
from trl import SFTTrainer, SFTConfig

def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune Gemma 4 for Triage Task")
    parser.add_argument("--model_id", type=str, default="google/gemma-4-E2B-it", help="HuggingFace model ID")
    parser.add_argument("--dataset_path", type=str, default="03_finetune_and_export/triage_dataset.jsonl")
    parser.add_argument("--output_adapter_dir", type=str, default="./lora_adapter")
    parser.add_argument("--output_merged_dir", type=str, default="./merged_gemma4_triage")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max_seq_length", type=int, default=512)
    return parser.parse_args()

def main():
    args = parse_args()
    print(f"=== Starting LoRA Fine-Tuning for: {args.model_id} ===")

    # 1. トークナイザーのロード
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. データセットのロードとフォーマット適用
    print(f"Loading dataset from: {args.dataset_path}")
    raw_dataset = load_dataset("json", data_files=args.dataset_path, split="train")

    def format_chat(sample):
        # messages: [{"role": "system", "content": ...}, {"role": "user", ...}, {"role": "model", ...}]
        text = tokenizer.apply_chat_template(sample["messages"], tokenize=False, add_generation_prompt=False)
        return {"text": text}

    formatted_dataset = raw_dataset.map(format_chat)

    # 3. ベースモデルのロード
    print("Loading base model...")
    device_map = "auto" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    torch_dtype = torch.bfloat16 if (torch.cuda.is_available() and torch.cuda.is_bf16_supported()) else torch.float32

    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        torch_dtype=torch_dtype,
        device_map=device_map,
        trust_remote_code=True
    )

    # 4. LoRA 設定（知識記憶を担う MLP 層および構文・関係性を担う Attention 層の全線形層を対象化）
    print("Configuring LoRA (Attention + MLP: all-linear)...")
    target_modules = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ]
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=target_modules,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM
    )

    # 5. Trainer の設定と学習開始
    sft_config = SFTConfig(
        output_dir="./training_checkpoints",
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=2,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy="no",
        fp16=False,
        bf16=(torch_dtype == torch.bfloat16),
        optim="adamw_torch",
        report_to="none",
        dataset_text_field="text",
        max_length=args.max_seq_length,
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=formatted_dataset,
        processing_class=tokenizer,
        args=sft_config,
        peft_config=lora_config,
    )

    print("Training LoRA adapter...")
    trainer.train()

    # 6. LoRA アダプタの保存
    print(f"Saving LoRA adapter to: {args.output_adapter_dir}")
    trainer.model.save_pretrained(args.output_adapter_dir)
    tokenizer.save_pretrained(args.output_adapter_dir)

    # 7. アダプタをベースモデルに完全マージ (merge_and_unload)
    print("=== Merging LoRA weights into base model ===")
    merged_model = trainer.model.merge_and_unload()

    print(f"Saving merged standalone model to: {args.output_merged_dir}")
    os.makedirs(args.output_merged_dir, exist_ok=True)
    merged_model.save_pretrained(args.output_merged_dir)
    tokenizer.save_pretrained(args.output_merged_dir)

    print("Success! Standalone merged model is ready for ONNX & LiteRT export.")

if __name__ == "__main__":
    main()
