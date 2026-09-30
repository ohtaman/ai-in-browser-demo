"""
Gemma 4 E2B-it 対話型トリアージ特化 Multi-turn LoRA 学習スクリプト
（Attention + MLP 全線形層 / Assistant ターンのみ Loss Masking）
"""

import os
import argparse
import json
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    DataCollatorForSeq2Seq
)
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer, SFTConfig

def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune Gemma 4 for Interactive Triage Agent")
    parser.add_argument("--model_id", type=str, default="google/gemma-4-E2B-it", help="HuggingFace model ID or local path")
    parser.add_argument("--dataset_path", type=str, default="05_interactive_triage_agent/dataset/train_conversations.jsonl")
    parser.add_argument("--output_adapter_dir", type=str, default="./lora_adapter_interactive")
    parser.add_argument("--output_merged_dir", type=str, default="./merged_gemma4_interactive_triage")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max_seq_length", type=int, default=1024)
    return parser.parse_args()

def build_multiturn_loss_masked_samples(sample, tokenizer, max_length=1024):
    """
    マルチターン対話の messages から、Assistant (model) の発話部分のみに Loss をかけ、
    User および System の部分は -100 でマスクした input_ids と labels を生成する。
    """
    messages = sample["messages"]
    
    # Gemma 4 のチャットテンプレートを順次トークナイズしてマスクを構成
    input_ids = []
    labels = []
    
    # 全体を1つのシーケンスとして構築しながら、ロールごとにマスクを判定
    for i, msg in enumerate(messages):
        role = msg["role"]
        content = msg["content"]
        
        # 1メッセージ分のフォーマット済みテキスト
        msg_sub = [{"role": role, "content": content}]
        # 前後のメッセージとの区切りトークンを含むテキストを生成
        tokenized_chunk = tokenizer.apply_chat_template(
            msg_sub,
            tokenize=True,
            add_generation_prompt=False,
            return_dict=False
        )
        
        # 先頭の BOS トークンが重複する場合は除去
        if input_ids and tokenized_chunk and tokenized_chunk[0] == tokenizer.bos_token_id:
            tokenized_chunk = tokenized_chunk[1:]
            
        chunk_len = len(tokenized_chunk)
        input_ids.extend(tokenized_chunk)
        
        if role == "model" or role == "assistant":
            # モデル発話ターンには Loss をかける
            labels.extend(tokenized_chunk)
        else:
            # ユーザー・システム発話ターンは -100 でマスク（Loss をかけない）
            labels.extend([-100] * chunk_len)
            
    # 最大長で切り詰め
    if len(input_ids) > max_length:
        input_ids = input_ids[:max_length]
        labels = labels[:max_length]
        
    return {
        "input_ids": input_ids,
        "labels": labels,
        "attention_mask": [1] * len(input_ids)
    }

def main():
    args = parse_args()
    print(f"=== Starting Multi-Turn LoRA Fine-Tuning for: {args.model_id} ===")

    # 1. トークナイザー
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. データセットロードと Loss Masking 前処理
    print(f"Loading conversational dataset from: {args.dataset_path}")
    raw_dataset = load_dataset("json", data_files=args.dataset_path, split="train")

    print("Formatting multi-turn conversations with Assistant-only Loss Masking...")
    processed_dataset = raw_dataset.map(
        lambda x: build_multiturn_loss_masked_samples(x, tokenizer, max_length=args.max_seq_length),
        remove_columns=raw_dataset.column_names
    )
    print(f"Processed {len(processed_dataset)} training samples.")

    # 3. ベースモデル
    print("Loading base model...")
    device_map = "auto"
    torch_dtype = torch.bfloat16 if (torch.cuda.is_available() and torch.cuda.is_bf16_supported()) else torch.float32

    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        torch_dtype=torch_dtype,
        device_map=device_map,
        trust_remote_code=True
    )

    # 4. LoRA 設定（知識記憶を担う MLP 層および構文・関係性を担う Attention 層の全線形層を対象化）
    # Gemma 4 はマルチモーダルモデルのため、vision_tower の clippable linear ではなく
    # language_model 側の全線形層（Attention + MLP: all-linear）を正規表現で対象化
    print("Configuring LoRA (language_model Attention + MLP: all-linear)...")
    target_modules = r".*language_model.*(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)"
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=target_modules,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # 勾配チェックポインティングを有効化して VRAM 消費を半減
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()
    else:
        def make_inputs_require_grad(module, input, output):
            output.requires_grad_(True)
        model.get_input_embeddings().register_forward_hook(make_inputs_require_grad)

    # 5. Trainer の設定と学習開始
    training_args = TrainingArguments(
        output_dir="./training_checkpoints_interactive",
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_steps=10,
        lr_scheduler_type="cosine",
        logging_steps=5,
        save_strategy="no",
        fp16=False,
        bf16=(torch_dtype == torch.bfloat16),
        optim="adamw_torch",
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        report_to="none"
    )

    # パディングコレーター
    data_collator = DataCollatorForSeq2Seq(
        tokenizer,
        pad_to_multiple_of=8,
        return_tensors="pt",
        padding=True
    )

    from transformers import Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=processed_dataset,
        data_collator=data_collator
    )

    print("Training Multi-turn LoRA adapter...")
    trainer.train()

    # 6. LoRA アダプタの保存
    print(f"Saving LoRA adapter to: {args.output_adapter_dir}")
    os.makedirs(args.output_adapter_dir, exist_ok=True)
    trainer.model.save_pretrained(args.output_adapter_dir)
    tokenizer.save_pretrained(args.output_adapter_dir)

    # 7. アダプタをベースモデルに完全マージ (merge_and_unload)
    print("=== Merging LoRA weights into base model ===")
    merged_model = trainer.model.merge_and_unload()

    print(f"Saving merged standalone model to: {args.output_merged_dir}")
    os.makedirs(args.output_merged_dir, exist_ok=True)
    merged_model.save_pretrained(args.output_merged_dir)
    tokenizer.save_pretrained(args.output_merged_dir)

    print(f"Success! Merged model saved to: {args.output_merged_dir}")

if __name__ == "__main__":
    main()
