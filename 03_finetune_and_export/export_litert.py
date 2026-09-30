"""
マージ済みGemmaモデルを LiteRT-LM.js 用の .litertlm に変換するスクリプト
"""
import os
import sys
import subprocess
import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="Export merged model to .litertlm for LiteRT-LM.js")
    parser.add_argument("--model_path", type=str, default="./merged_gemma4_triage", help="Path to merged HuggingFace model")
    parser.add_argument("--output_dir", type=str, default="./dist_litert", help="Output directory for .litertlm model")
    parser.add_argument("--quantization", type=str, default="dynamic_wi4_afp32", help="Quantization recipe (e.g. dynamic_wi4_afp32, dynamic_wi8_afp32)")
    return parser.parse_args()

def main():
    args = parse_args()
    print(f"=== Exporting {args.model_path} to LiteRT-LM (.litertlm) ===")
    os.makedirs(args.output_dir, exist_ok=True)

    cmd = [
        sys.executable, "-m", "litert_torch.generative.export_hf",
        args.model_path,
        args.output_dir,
        "--task", "text_generation",
        "--bundle_litert_lm", "true",
        "--externalize_embedder", "true",
        "--quantization", args.quantization
    ]

    print("Running command:", " ".join(cmd))
    result = subprocess.run(cmd)

    if result.returncode == 0:
        print(f"\n[Success] LiteRT-LM model bundle exported to {args.output_dir}")
        print("You can now load this model in LiteRT-LM.js with:")
        print(f"  const engine = await Engine.create({{ model: '{args.output_dir}/model.litertlm' }});")
    else:
        print("\n[Error] LiteRT export failed with exit code:", result.returncode, file=sys.stderr)
        print("Tip: If litert-torch is missing, install it with: uv add litert-torch")
        sys.exit(result.returncode)

if __name__ == "__main__":
    main()
