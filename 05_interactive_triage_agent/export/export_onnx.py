"""
マージ済み対話型トリアージモデルを Transformers.js 用 ONNX (q4f16) にエクスポートするスクリプト
"""
import os
import sys
import subprocess
import argparse
import shutil

def parse_args():
    parser = argparse.ArgumentParser(description="Export merged interactive triage model to ONNX")
    parser.add_argument("--model_path", type=str, default="./merged_gemma4_interactive_triage", help="Path to merged HuggingFace model")
    parser.add_argument("--output_dir", type=str, default="./05_interactive_triage_agent/dist_onnx", help="Output directory for ONNX model")
    parser.add_argument("--dtype", type=str, default="q4f16", choices=["fp32", "fp16", "q4f16", "q4", "q8"], help="Quantization dtype")
    return parser.parse_args()

def main():
    args = parse_args()
    print(f"=== Exporting {args.model_path} to ONNX (dtype: {args.dtype}) ===")
    os.makedirs(args.output_dir, exist_ok=True)

    optimum_bin = shutil.which("optimum-cli") or os.path.join(sys.prefix, "bin", "optimum-cli")
    cmd = [
        optimum_bin, "export", "onnx",
        "--model", args.model_path,
        "--task", "text-generation-with-past",
        "--dtype", args.dtype,
        args.output_dir
    ]

    print("Running command:", " ".join(cmd))
    result = subprocess.run(cmd)

    if result.returncode == 0:
        print(f"\n[Success] ONNX model exported to: {args.output_dir}")
    else:
        print(f"\n[Error] ONNX export failed with exit code: {result.returncode}", file=sys.stderr)
        sys.exit(result.returncode)

if __name__ == "__main__":
    main()
