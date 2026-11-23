# Parakeet-DE-Med in the browser: feasibility check (2026-11-23)

Status: **checked, not integrated.** This note answers whether `johannhartmann/parakeet_de_med` can run as an offline dictation model in Befundungstool's browser runtime. It follows up the Mediform/Parakeet note in `OFFLINE_DICTATION_PLAN.md`. Nothing in `src/` changed.

## Short answer

- **Technically yes.** The model runs in Chromium through `parakeet.js` and ONNX Runtime Web, fully client-side. Only `cdn.jsdelivr.net` and the model host were contacted.
- **Medically it adds little on our synthetic test.** With numbers excluded, it is 1–1.5 percentage points better than the base Parakeet model and finds one more of 64 medical terms. It is no better than the Whisper large-v3-turbo preset we already ship.
- **Recommendation:** don't integrate it yet. Before deciding, measure with real voices (see "Next steps").

## Model facts (verified from the files, not only the card)

**`johannhartmann/parakeet_de_med`**
- Commit `82c627fe2b87307bd2b582fac5ae6e6c4bb27aad`: one `parakeet_de_med.nemo` of 2,509,322,240 bytes.
- Licence: CC-BY-4.0. Attribution must name NVIDIA (base model) and the fine-tune, link the licence, and say that changes were made.
- Base model: `nvidia/parakeet-tdt-0.6b-v3`, commit `541d1f99c6b0c3cd0b11a95167540bb8edefd82b`, also CC-BY-4.0.

**Tensor-by-tensor comparison of the two `.nemo` checkpoints:**

| Part | Parameters | Result |
| --- | --- | --- |
| Encoder | 608,928,792 | bit-identical to the base model |
| Preprocessor | 33,296 | bit-identical |
| Decoder (prediction network) | 11,807,360 | changed (max abs diff 0.025) |
| Joint network | 6,321,158 | changed (max abs diff 0.022) |
| Tokenizer files (`tokenizer.model`, `.vocab`, `vocab.txt`) | — | byte-identical |

**Training, from the checkpoint's `model_config.yaml`:**
- The manifest path is `parakeet-de-tts/manifests_arztbriefe`. Together with the card ("Trained on synthetic speech data"), this shows the training audio was text-to-speech of German discharge letters, not real voices.
- Settings: `max_steps: 250`, `lr: 0.0002`, clips of 0.1–8 s.
- The card's WER (11.73 % → 3.28 %) comes from 122 samples of that same synthetic set.

## How it runs in the browser

Because only decoder and joint changed, we reuse the published ONNX encoder of the base model. Only the decoder/joint graph needs new weights.

- **Base export:** `istupakov/parakeet-tdt-0.6b-v3-onnx`, commit `8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce`, from onnx-asr, opset 17.
  - Encoder: fp32 2.4 GB (external data) or int8 652 MB.
  - Decoder/joint: fp32 72.5 MB or int8 18.2 MB.
  - Also `vocab.txt` (8,193 entries, `<blk>` last) and `nemo128.onnx`.
  - `ysdede/parakeet-tdt-0.6b-v3-onnx`, commit `e5356bf6e24bdb7a269536b0e9e7869bc034b893`, adds an fp16 encoder of 1.24 GB. Its author validated fp16 encoder on WebGPU with the int8 decoder on WASM.
- **Weight swap, no NeMo needed:** the decoder/joint graph has exactly 18,128,518 parameters, the 18.1 M of the card. The mapping from checkpoint to graph is:
  - Embedding and biases go in directly.
  - `joint.*.weight` are transposed into `MatMul` initializers.
  - LSTM weights have their gates reordered from PyTorch i,f,g,o to ONNX i,o,f,c, and the biases are concatenated as `[b_ih, b_hh]`.
- **Proof of the mapping:** applied to the *base* checkpoint, it reproduces all 13 initializers of the published base decoder bit for bit.
- **Swapped files:**
  - fp32 decoder/joint, SHA-256 `e3265019…f373f`.
  - int8 decoder/joint, SHA-256 `614b5c27…8cbbe`. Made with `quantize_dynamic(weight_type=QUInt8)`. That call reproduces the published base int8 decoder bit for bit.
- **Runtime:** `parakeet.js` 1.4.4 (MIT), which depends on `onnxruntime-web` 1.24.1 (MIT).
  - Provides JavaScript mel features (no `nemo128.onnx` needed), TDT greedy decoding, and `fromUrls()` for explicit file URLs. Blob URLs from a chosen folder fit our local-folder pattern.
  - The vocabulary size and blank id are read from `vocab.txt`.
  - To integrate it, we would load the pinned jsDelivr `+esm` build in a Blob worker and set `wasmPaths` to a pinned URL. Otherwise it defaults to jsDelivr itself.
  - We would not use its `fromHub()`: it fetches from Hugging Face and caches in IndexedDB.

## Measurements

Setup:
- **Machine:** this cloud container (4 vCPU, no GPU), not a radiology PC.
- **Audio:** 12 synthetic German report sentences with dense medical vocabulary, spoken by two Piper voices (`de_DE-thorsten-high`, `de_DE-kerstin-medium`, both CC0). That gives 24 clips, 3–7 s each, 139 s in total, resampled to 16 kHz.
- **Scoring:** WER over words with numbers and units removed, because "48 mm" and "achtundvierzig Millimetern" are both acceptable. Terms are counted per occurrence (64 in total).

| System | WER | Thorsten | Kerstin | Terms |
| --- | --- | --- | --- | --- |
| Parakeet base, int8 encoder | 41.1 % | 40.2 % | 42.1 % | 19/64 |
| Parakeet-DE-Med, int8 encoder | 40.7 % | 37.4 % | 43.9 % | 19/64 |
| Parakeet-DE-Med, int8 encoder + int8 decoder | 40.2 % | 39.3 % | 41.1 % | 18/64 |
| Parakeet-DE-Med, same files, **in Chromium via parakeet.js (WASM)** | 39.3 % | 38.3 % | 40.2 % | 18/64 |
| Parakeet base, fp16 or fp32 encoder | 33.2 % | 30.8 % | 35.5 % | 21/64 |
| Parakeet-DE-Med, fp16 or fp32 encoder | 31.8 % | 29.9 % | 33.6 % | 22/64 |
| Whisper large-v3-turbo, q8, CPU (our preset, Transformers.js 3.8.1 in Node) | 31.8 % | 33.6 % | 29.9 % | 24/64 |

Speed and network:
- **Parakeet in Chromium:** 12.7 s to load from a local server (int8 encoder + int8 decoder, cross-origin isolated, threaded WASM), then 0.65–1.15 s per clip. One outlier: 4.9 s for the first clip (warm-up).
- **Whisper turbo:** 38 s to load, then about 4 s per clip.
- **Hosts contacted by the browser run:** the local server and `cdn.jsdelivr.net` only.

What the numbers say:
- **The medical fine-tune barely helps on this audio.** Its main visible effect is spelling numbers as words ("zwölf Millimeter"), which looks like the discharge-letter style of its training text. Medical terms that the frozen encoder mishears ("Bleureckus" for Pleuraerguss, "Kaliomegalie") stay wrong. A decoder-only fine-tune cannot fix acoustic errors.
- **Encoder precision matters more than the fine-tune.** int8 costs about 8 points. fp16 is as good as fp32. So a real preset would need fp16 on WebGPU (≈1.3 GB download). On CPU, the int8 encoder is noticeably worse than our Whisper turbo CPU preset.
- **Parakeet is about 4× faster than Whisper turbo on CPU** in these runs (Chromium vs Node, so only indicative).
- **Limits of this test:** both voices are TTS, Kerstin-medium is low quality, and the sentences are short. The model was itself trained on TTS of unknown voices, which may help or hurt here. These numbers say nothing about real dictation.

## Next steps, if we pursue it

1. **Measure with real voices first.** Synthetic sentences read by real people on a real microphone, Whisper turbo (WebGPU q4f16 and CPU q8) against Parakeet base and DE-Med (fp16 on WebGPU, int8 on CPU). Only integrate if DE-Med clearly wins on terms.
2. **If it wins, build option A-Parakeet:**
   - A third speech preset backed by a `parakeet.js` worker. This is a new pinned CDN runtime, so it needs approval first.
   - Base encoder from the pinned `istupakov` or `ysdede` revision.
   - The swapped DE-Med decoder/joint, either hosted at a pinned location we control or built locally from the `.nemo` with a small conversion script (Python with `numpy` and `onnx`, no PyTorch or NeMo).
   - Local-folder support for offline workplaces.
   - Attribution for NVIDIA, the fine-tune, and the ONNX exports in `THIRD_PARTY_NOTICES.md` and `licenses/`.
3. **Keep the existing speech rules:** 30 s limit, silence check, and the RepDict-derived text handling. Parakeet does not produce Whisper's typical hallucinations, but the silence check stays.

The scripts used for this check (torch-free `.nemo` reader, weight swap with `--verify`, scoring, Playwright page) were run from a temporary scratch area and are not in the repository. They can be added under `scripts/` if we continue.
