import os
import onnx
import onnxruntime as ort

def test_onnx_export():
    output_dir = "./dist_onnx"
    assert os.path.exists(output_dir), f"{output_dir} must exist"
    
    # Check essential Transformers.js config/tokenizer files
    assert os.path.exists(os.path.join(output_dir, "config.json")), "config.json must exist in dist_onnx"
    assert os.path.exists(os.path.join(output_dir, "tokenizer.json")), "tokenizer.json must exist in dist_onnx"

    # Find the main ONNX model file
    onnx_files = [f for f in os.listdir(output_dir) if f.endswith(".onnx")]
    if not onnx_files and os.path.exists(os.path.join(output_dir, "onnx")):
        onnx_files = [f"onnx/{f}" for f in os.listdir(os.path.join(output_dir, "onnx")) if f.endswith(".onnx")]

    assert len(onnx_files) > 0, "At least one .onnx file must exist in dist_onnx"
    print(f"Found ONNX models: {onnx_files}")

    main_model = os.path.join(output_dir, onnx_files[0])
    model_size_mb = os.path.getsize(main_model) / (1024 * 1024)
    print(f"Main ONNX model: {main_model} ({model_size_mb:.1f} MB)")

    # Verify ONNX model structure
    onnx_model = onnx.load(main_model, load_external_data=False)
    assert onnx_model is not None, "ONNX model must load cleanly"
    print(f"ONNX IR version: {onnx_model.ir_version}, Producer: {onnx_model.producer_name}")
    print(">>> ONNX EXPORT TDD TEST PASSED! <<<")

if __name__ == "__main__":
    test_onnx_export()
