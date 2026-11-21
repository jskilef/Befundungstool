# Offline dictation: comparison and proposal (2026-11-20)

Status: **approved 2026-11-21 ("as proposed") and implemented** as option A (`src/speech/`). Formatting commands default on; offline dictation has its own feature switch `speech`; option C stays for later. Before that, Befundungstool supported only Fluency Direct (`src/dictation/compat.js`, a compatibility mode for an external dictation client).

## Measurements (2026-11-21, this PC: 12 CPU threads, Chromium 1243)

Synthetic German speech from Windows text-to-speech ("Microsoft Hedda", 16 kHz). Three recordings of 11.6 s, 14.2 s and 27.7 s. Real Transformers.js 3.8.1 and real model downloads. Times are per recording after the model has loaded.

| Model, device | Time per recording | First load (download) | Notes on the transcript |
| --- | --- | --- | --- |
| small, 8-bit, CPU, cross-origin isolated (8 threads) | 2.9–4.6 s | 13 s | Clear errors in medical terms: "Pluräagus", "Neumotorax", "Züste", "Lymphadenopathy" |
| small, 8-bit, CPU, single thread (as from `file://`) | 8.9–11.5 s | — | Same as above |
| large-v3-turbo, q4f16, WebGPU | 2.5–3.4 s | 20 s | "Hypodense Läsion", "Zyste", "Lymphadenopathie", "Lendenwirbelsäule", "Thorax" correct; "Pleuraerguss" and "Pneumothorax" still wrong (partly the TTS voice) |
| large-v3-turbo, 8-bit, CPU (8 threads) | 9.6–11.1 s | 52 s | Same quality as WebGPU |

- **Silence (5 s of zeros):** small returned "[Musik]", turbo returned "Vielen Dank.". This confirms the need for the silence check and the hallucination filter.
- **What works from `file://`:** microphone, a 16 kHz `AudioContext`, WebGPU and the Cache API. An AudioWorklet module from a Blob URL fails there, so the app loads it from a `data:` URL, which works in all three modes.
- **End-to-end in the built app** (fake microphone playing the TTS file):
  - small: 17 s for the first dictation including the download; 2.9 s afterwards.
  - turbo on WebGPU: 31 s for the first dictation including the download; 2.3–2.7 s afterwards.
  - "Neuer Absatz" became a paragraph break and "neue Zeile" a line break.
  - Only `cdn.jsdelivr.net` and Hugging Face were contacted.
- **Not measured:** real voices, real microphones, and other hardware. The headless test shell has no WebGPU shader compiler (`dxil.dll`); the full Chromium build does.

Sources:
- Model and runtime facts come from the Hugging Face model pages, the whisper.cpp repository and the Transformers.js docs, read 2026-11-20.
- RepDict facts come from `lib/services/audio.dart`, `lib/ui/studio.dart` and `lib/services/models.dart`, read only.
- No speed figure below has been measured on our hardware. Speeds need a measurement step (see the plan).

## Options compared

| | A. Whisper via Transformers.js | B. whisper.cpp WASM | C. Native server via the launcher |
| --- | --- | --- | --- |
| Runtime | `@huggingface/transformers`, already pinned and lazily loaded from jsDelivr by our CPU worker (3.8.1 / 4.3.0); ONNX Runtime Web | Emscripten build of whisper.cpp. Only an example (`examples/whisper.wasm`): no official package or CDN, so we would build and host it ourselves | User-run `whisper-server` (whisper.cpp) on 127.0.0.1; launcher forwards audio to it |
| Backends | WebGPU or WASM (CPU) | CPU only (WASM SIMD); no GPU backend documented | Native CPU/GPU (whatever the user's build supports) |
| Models | Any Whisper size; ONNX from `onnx-community/*` | Upstream: "up to size `small` inclusive"; greedy decoding only | Any GGML Whisper incl. large-v3-turbo |
| Download (encoder + merged decoder) | base 8-bit ≈ 77 MB · small 8-bit ≈ 250 MB · large-v3-turbo q4f16 ≈ 564 MB (WebGPU), 8-bit ≈ 1.09 GB (CPU) | GGML tiny 75 MiB, base 142 MiB, small 466 MiB (+ our wasm) | GGML, e.g. large 2.9 GiB; quantized smaller |
| German medical vocabulary | Depends on model size: base weak, small usable, large-v3-turbo best. No initial-prompt/vocabulary option documented in the pipeline API | Same models, max `small` → weaker | Best Whisper option: large-v3-turbo, and the server accepts a `prompt` field (vocabulary hints) |
| Speed (unmeasured) | WebGPU: expected fast for large-v3-turbo on a dedicated GPU. CPU: needs cross-origin isolation for threads (as GGUF today) | Upstream claims 2–3× real time for tiny/base on a modern CPU ("performance is not great") | Native speed |
| `file://` | Runtime from CDN works like today's CPU worker. **To verify:** microphone permission, WebGPU and model caching on `file://`. Single-threaded on CPU (no isolation) | Same, plus SharedArrayBuffer needs isolation | Not applicable (launcher only) |
| Hosted (HTTPS) | Works; `coi-sw.js` gives isolation for CPU threads | Works with isolation | Not applicable |
| Launcher | Works; COOP/COEP already sent | Works | The only mode. Audio leaves the browser, but only to a local process |
| Licences | Transformers.js Apache-2.0; Whisper weights MIT (OpenAI); `onnx-community/whisper-base` lists Apache-2.0 (turbo page states none) | whisper.cpp MIT | whisper.cpp MIT; user installs it |
| Fit with our rules | Same pattern as the existing browser models: no new dependency, pinned CDN, nothing loaded until a model is chosen | New build artifact to maintain; weaker models | Like LM Studio: no new dependency, but needs a user install, the launcher, and new audio forwarding in the launcher (today it forwards JSON only) |

### Feasibility note: Mediform/parakeet-medical-de (as in RepDict via CrispASR)

- **Model:**
  - Fine-tune of `nvidia/parakeet-tdt-0.6b-v3`: 627M parameters, 117 h of German medical audio covering 529 medical terms.
  - The card reports a test WER of **11.3 % against 26.2 %** for the base model. These numbers are self-reported, and the test set is not described.
  - Download: one F32 `model.safetensors` of **2.51 GB**, NeMo-style config, aimed at MLX. There is no ONNX export.
- **Licence:**
  - The repository metadata says Apache-2.0, but the base model is **CC-BY-4.0**, and the card doesn't explain the conflict. This must be clarified before shipping.
  - CC-BY requires attribution in any case.
- **In the browser:**
  - An ONNX export exists only for the *base* model (`istupakov/parakeet-tdt-0.6b-v3-onnx`: 652 MB int8 encoder plus 18 MB decoder, made for the Python `onnx-asr` package).
  - Running Parakeet in the browser would need three pieces of our own:
    - ONNX Runtime Web
    - mel preprocessing (`nemo128.onnx` is included in that export)
    - a TDT decoding loop
  - Using Mediform's weights would also need a one-time NeMo→ONNX conversion that we would have to host or document.
- **Verdict:** feasible, but a separate project. The realistic route is option C with CrispASR's native Parakeet (as RepDict does), or a self-converted ONNX folder loaded locally. **Not part of the first version.**

## Recommendation

**Option A: Whisper via Transformers.js**, built like the existing browser models:

- **No new dependency.** The same pinned Transformers.js from jsDelivr, loaded only once a dictation model is chosen, in a dedicated worker.
- **Two presets, pinned to a model revision:**
  - **Whisper small** (8-bit, ≈ 250 MB, CPU or WebGPU): default.
  - **Whisper large-v3-turbo** (q4f16, ≈ 564 MB, WebGPU only): best German quality.
- **Local model folder** (like today's custom ONNX folder), for offline or locked-down workplaces: no download at all.
- **Later, optional:** option C for native speed and Mediform/Parakeet via CrispASR, as a separate provider like LM Studio.

## Carried over from RepDict, and the formatting-command flaw fixed

- **Capture:**
  - `getUserMedia` (mono; echo cancellation, noise suppression and auto-gain off).
  - An `AudioContext` at 16 kHz with an AudioWorklet that writes Float32 samples into one preallocated 30 s buffer (480,000 samples).
  - Recording stops automatically at 30 s.
  - No `MediaRecorder` and no encoded files.
- **No storing or uploading:**
  - Audio exists only in memory.
  - The buffer is handed to the worker and zero-filled after transcription and on cancel; microphone tracks are stopped.
  - Audio and transcripts are never written to storage, the draft or the settings file.
- **Pending text:**
  - The transcript appears as editable text under the section that was focused when recording started, in the same card style as AI suggestions.
  - "Einfügen" inserts it at the cursor or replaces the selection in that section, undoably and respecting frozen text. "Verwerfen" discards it.
  - Nothing is inserted automatically.
- **Silence produces nothing:**
  - An energy check runs before the model; too little speech means "Keine Sprache erkannt" and the model never runs.
  - A filter catches Whisper's known silence hallucinations, such as subtitle credits and "Vielen Dank fürs Zuschauen".
- **Network:**
  - Zero requests until the user selects a dictation model; tests assert this, as they do for AI.
  - After that, only the pinned runtime and the chosen model files are fetched.
- **Feature switch:** a new `settings.features.speech` ("Offline-Diktat"), default on, hidden like the other tools. It needs no network until a model is chosen.
- **Formatting commands (RepDict's flaw):** RepDict only matched exact standalone lines, but Whisper returns punctuated text on one line ("Kein Erguss. Neuer Absatz. Herz normal groß.").
  - The fix is to match the commands anywhere in the text, case-insensitively, with the punctuation and spaces around them: "neuer Absatz" / "new paragraph" becomes a blank line, "neue Zeile" / "new line" a line break.
  - They are applied while the pending text is shown, so the user sees and can correct the result before inserting.
  - The commands are switchable, and tests use real-style Whisper strings.
- **Lifecycle:** generation tickets as in the GGUF runner. Stop, cancel, model change and unload terminate the worker; obsolete results are dropped.

## Plan (after approval)

1. **Measurement spike (no product code):**
   - Run small and large-v3-turbo on your PC (CPU and WebGPU; `file://`, hosted and launcher) with **synthetic** German speech (e.g. Windows text-to-speech), and record speed and quality.
   - Check microphone, WebGPU and caching on `file://`.
   - Adjust the presets based on the results.
2. **Capture and silence check:** `src/speech/capture.js`, with engine tests on synthetic PCM (silence, noise, tone, 30 s limit, buffers cleared).
3. **Worker and runner:** `src/speech/whisper.js`, with fake-runtime UI tests like `local-ui`.
4. **UI and settings:**
   - Mic button and pending card.
   - Settings section "Diktat".
   - `features.speech`.
   - Formatting commands.
   - Playwright with Chromium's fake audio device (`--use-file-for-fake-audio-capture`) and synthetic WAV.
5. **Documentation:** licences in `licenses/` and `THIRD_PARTY_NOTICES.md`, CLAUDE.md and the clinical notice (where audio goes).

## Questions before building

1. `features.speech` as its own switch (proposed), or shared with the Fluency Direct `dictation` switch?
2. Presets small and large-v3-turbo, with small as default, given the downloads of ≈ 250 MB and ≈ 564 MB?
3. Spoken formatting commands on or off by default?
4. Should option C (local whisper.cpp/CrispASR server via the launcher) be planned now, or only after the browser version?
