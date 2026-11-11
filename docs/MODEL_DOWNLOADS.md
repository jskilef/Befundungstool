# Model downloads for Report Studio v1.6.0

Use the exact matching repository and keep its directory structure. Accept any required upstream terms yourself. Report Studio does not bundle models or grant rights to their weights. These are download sources, not claims of clinical accuracy.

| Selection | Files |
| --- | --- |
| CPU Qwen3 0.6B (q8) | https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/main |
| CPU SmolLM2 135M (q8) | https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/tree/main |
| WebGPU Qwen3 0.6B (MLC) | https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/tree/main |
| WebGPU Qwen3 1.7B (MLC) | https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/tree/main |
| WebGPU Qwen3 4B (MLC) | https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/tree/main |
| MedGemma 4B, CPU or WebGPU (ONNX, q4, experimental) | https://huggingface.co/geeek/medgemma-4b-it-ONNX/tree/main |
| MedGemma 1.5 4B, CPU or WebGPU (ONNX, q4, experimental) | https://huggingface.co/geeek/medgemma-1.5-4b-it-ONNX/tree/main |

## CPU Qwen / SmolLM2

Keep root JSON/tokenizer files, including config.json, tokenizer.json and tokenizer_config.json, plus onnx/model_quantized.onnx and any associated external data files. Other weight variants are not needed. The app uses q8 for both.

## MedGemma text-only bundle

Select the matching **MedGemma 4B** or **MedGemma 1.5 4B** entry in the CPU or WebGPU model list before choosing **Load model folder**. For the downloaded 1.5 model, select the `medgemma-1.5-4b-it-ONNX` folder itself, with `config.json` directly inside it and weights in its `onnx` subfolder. Selecting an individual file, the `onnx` subfolder, or the parent `models` folder will fail validation. Folder selection makes the files available locally; **Test connection**, **Review**, or **Revise** starts model initialization.

Keep the root configuration/tokenizer files (including generation_config.json and preprocessor/processor configuration if present), and these five files in the onnx subfolder:

- embed_tokens_q4.onnx
- embed_tokens_q4.onnx_data
- decoder_model_merged_q4.onnx
- decoder_model_merged_q4.onnx_data
- decoder_model_merged_q4.onnx_data_1

The text weights alone are approximately 2.85 GB in decimal units, before tokenizer files and working memory. The vision_encoder files are not required for this text-only app. This community conversion is based on [Google MedGemma 4B](https://huggingface.co/google/medgemma-4b-it), governed by [Health AI Developer Foundations terms](https://developers.google.com/health-ai-developer-foundations/terms). The separate MedGemma 1.5 preset uses the linked 1.5 conversion. See the conversion publisher's model card for technical claims and limitations. Report Studio has not verified full browser inference.

## WebLLM bundles

Keep mlc-chat-config.json, tensor-cache.json (and ndarray-cache.json if present), tokenizer files and all params_shard_*.bin files referenced by the cache manifest. Add the corresponding compiled library to the top level of the folder:

- [Qwen3 0.6B library](https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm)
- [Qwen3 1.7B library](https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm)
- [Qwen3 4B library](https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm)

These exact filenames match the WebLLM 0.2.85 registry. Preserve the filename when downloading; incompatible libraries cannot load the weights. Runtime JavaScript is still fetched from jsDelivr.

## Models outside the preset lists

Select Custom local model… and load a complete text-generation export. No Hugging Face repository ID is needed. ONNX folders need config.json (model_type), tokenizer.json and the onnx graphs/external data appropriate to the selected weight format. MLC folders need their own chat configuration, tensor-cache manifest and referenced shards, tokenizer files, and exactly one matching compiled WebLLM library; use WebGPU for these. Only models supported by Transformers.js 4.3.0 or WebLLM 0.2.85 can execute. GGUF, safetensors and PyTorch weights are not interchangeable with these exports. The app does not convert model formats.
