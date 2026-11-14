# Third-party licenses and attribution

Befundungstool integrates the same optional browser runtimes and model presets as
Report Studio 1.6.0. The inventory below was reviewed for Report Studio 1.6.0 on
23 October 2026 and is carried over unchanged in substance: WebLLM 0.2.85,
Transformers.js 3.8.1 and 4.3.0, and the listed model presets are identical.
Re-review it whenever a runtime version or model preset changes.

## What the release contains

Befundungstool's original code, documentation, templates, and project assets are
provided under the [MIT License](LICENSE). Preserve the copyright notices and the
license when sharing copies or substantial portions.

The release ZIP contains the application (with the embedded Roboto font, see
below), launcher, documentation, icons, and license documents. It contains no
third-party runtime implementation, model weights, Node.js executable, browser,
or cloud-provider SDK. The launcher uses Node.js built-ins. Optional browser-local
inference downloads third-party runtimes and model assets on demand; these are
separate works with their own terms, not relicensed under the project's MIT license.

## Runtime components referenced by the application

| Component | Version / source | License and included text |
| --- | --- | --- |
| WebLLM, MLC-AI | [`@mlc-ai/web-llm` 0.2.85](https://github.com/mlc-ai/web-llm/tree/v0.2.85) | Apache-2.0; [upstream LICENSE including its attribution appendix](licenses/web-llm-0.2.85-LICENSE.txt) |
| OpenAI API protocol definitions within WebLLM | [Upstream copy shipped with WebLLM 0.2.85](https://github.com/mlc-ai/web-llm/blob/v0.2.85/licenses/license.openai_node.txt) | Apache-2.0; [upstream text](licenses/web-llm-openai-protocols-LICENSE.txt). This is not a dependency on the OpenAI SDK in Befundungstool. |
| Transformers.js, Hugging Face | [`@huggingface/transformers` 3.8.1](https://github.com/huggingface/transformers.js/tree/3.8.1) | Apache-2.0; [upstream text](licenses/transformers-js-3.8.1-LICENSE.txt) |
| ONNX Runtime Web, Microsoft and contributors | `1.22.0-dev.20250409-89f8206ba4`, declared in [Transformers.js 3.8.1](https://github.com/huggingface/transformers.js/blob/3.8.1/package.json) | MIT; [Microsoft copyright and license](licenses/onnxruntime-LICENSE.txt), plus the [upstream third-party notice collection](licenses/onnxruntime-ThirdPartyNotices.txt) |
| wllama (llama.cpp WebAssembly binding), Xuan Son Nguyen | [`@wllama/wllama` 3.8.1](https://github.com/ngxson/wllama) | MIT; [upstream text](licenses/wllama-LICENSE.txt). Loaded from jsDelivr only when the GGUF browser mode is used. |
| llama.cpp / ggml, The ggml authors | Compiled into wllama | MIT; [upstream text](licenses/llama.cpp-LICENSE.txt) |

WebLLM's published bundle also incorporates runtime/tokenizer/grammar components
and references dependencies such as loglevel. Transformers.js incorporates or
loads additional dependencies such as Hugging Face Jinja and ONNX Runtime's
components. Their own upstream copyright and license notices remain applicable.
The table identifies the integrations used here; it is not an assertion that
every transitive component of a future CDN download has been audited or has the
same license. WebLLM's repository has no root NOTICE file at the reviewed tag;
its LICENSE appendix and referenced protocol license are retained here.

The app pins the top-level JavaScript runtime versions. It does not pin every
model revision or every CDN-resolved transitive asset. The model revisions below
are the revisions inspected for this notice, not new runtime download pins.

## Development test tools

The optional test setup pins `@playwright/test` (with `playwright` and
`playwright-core`) to 1.63.0 through `package-lock.json`. These Microsoft projects use
[Apache-2.0](https://github.com/microsoft/playwright/blob/v1.63.0/LICENSE).
They are development dependencies installed separately; their implementation
and downloaded test browsers are not included in the release ZIP or standalone
HTML. Installed packages retain their upstream license and notice files.

## Optional model assets

| Model selected in Befundungstool | License evidence | Inspected conversion / model revision |
| --- | --- | --- |
| `mlc-ai/Qwen3-0.6B-q4f16_1-MLC` | Conversion card names [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B); original weights are Apache-2.0. [Original license](licenses/Qwen3-0.6B-LICENSE.txt). | [`8c14ce481d4c692769976ad52afea453a102df19`](https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/tree/8c14ce481d4c692769976ad52afea453a102df19) |
| `mlc-ai/Qwen3-1.7B-q4f16_1-MLC` | Conversion card names [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B); original weights are Apache-2.0. [Original license](licenses/Qwen3-1.7B-LICENSE.txt). | [`80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc`](https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/tree/80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc) |
| `mlc-ai/Qwen3-4B-q4f16_1-MLC` | Conversion card names [Qwen/Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B); original weights are Apache-2.0. [Original license](licenses/Qwen3-4B-LICENSE.txt). | [`a5c9fab855e3ccbdfed2e7e69683d75f30332161`](https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/tree/a5c9fab855e3ccbdfed2e7e69683d75f30332161) |
| `onnx-community/Qwen3-0.6B-ONNX` | Conversion metadata names [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B); original weights are Apache-2.0. [Original license](licenses/Qwen3-0.6B-LICENSE.txt). | [`da1453100cf3ff33ef56d17983fc7a8648706db6`](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/da1453100cf3ff33ef56d17983fc7a8648706db6) |
| `HuggingFaceTB/SmolLM2-135M-Instruct` | The publisher's [model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/12fd25f77366fa6b3b4b768ec3050bf629380bac/README.md) declares Apache-2.0. [Standard Apache-2.0 text](licenses/Apache-2.0.txt). | [`12fd25f77366fa6b3b4b768ec3050bf629380bac`](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/tree/12fd25f77366fa6b3b4b768ec3050bf629380bac) |

At inspection, the MLC and ONNX conversion repositories above did not contain
their own LICENSE file or license metadata. Their cards identify the original
Qwen models; the original publisher's license files are included as evidence for
those original weights, not as a blanket clearance of all converted artifacts.
SmolLM2 declares its license in model-card metadata without a separate LICENSE
file. Model weights are not redistributed in this release.

## Redistribution and services

- When sharing Befundungstool, retain its MIT copyright/license and these notices.
- If you later vendor, mirror, modify, or bundle runtime packages, WASM libraries,
  tokenizer assets, or weights, inspect the exact artifacts first. Include their
  complete licenses, relevant upstream NOTICE files and attribution, identify
  modifications, and meet any additional source/distribution obligations. Merely
  including this integration inventory is not a substitute for that review.
- The ONNX Runtime notice collection is preserved verbatim for reference. It
  describes upstream components; it does not imply that all listed components
  are used by this app or that Befundungstool is subject to every listed license.
- API requests are implemented directly. OpenAI, Gemini, and other configured
  services retain their own service/account terms; an open-source application
  license does not grant API access or replace those terms.
- Licenses grant software/model permissions, not clinical validation, regulatory
  approval, trademark rights, or permission to disclose patient information.

The [source inventory](licenses/SOURCES.json) records the URLs and SHA-256 hashes
of the included upstream license documents. No upstream license text is modified.

## MedGemma and additional runtime

Experimental MedGemma text-only inference uses [Transformers.js 4.3.0](https://github.com/huggingface/transformers.js/tree/4.3.0), Apache-2.0; [upstream license](licenses/transformers-js-4.3.0-LICENSE.txt). MedGemma uses the third-party [geeek/medgemma-4b-it-ONNX](https://huggingface.co/geeek/medgemma-4b-it-ONNX) conversion of [google/medgemma-4b-it](https://huggingface.co/google/medgemma-4b-it), governed by the [Health AI Developer Foundations terms](https://developers.google.com/health-ai-developer-foundations/terms). It is not licensed under Befundungstool's MIT license. No weights are redistributed in this release. Users must review and comply with upstream terms before downloading or using them. Local model folders and compiled libraries remain separately supplied works.

Custom local models are supplied by the user and retain their original licenses. Befundungstool does not redistribute or relicense their weights or compiled model libraries. The optional MedGemma 1.5 preset references [geeek/medgemma-1.5-4b-it-ONNX](https://huggingface.co/geeek/medgemma-1.5-4b-it-ONNX), based on [google/medgemma-1.5-4b-it](https://huggingface.co/google/medgemma-1.5-4b-it), under the applicable Health AI Developer Foundations terms.

## Bundled font: Roboto

The application embeds the Roboto variable font (Latin, Latin Extended and Greek subsets, as served by Google Fonts, Roboto v51) so that it renders identically offline. Copyright 2011 The Roboto Project Authors ([googlefonts/roboto-classic](https://github.com/googlefonts/roboto-classic)), licensed under the [SIL Open Font License 1.1](licenses/Roboto-OFL.txt). The font files are unmodified; their source URLs and SHA-256 hashes are recorded in [licenses/SOURCES.json](licenses/SOURCES.json). The OFL permits bundling with software; the font may not be sold on its own, and its license must accompany redistributions. This is the only third-party binary included in the release.

## Clinical terminology sources

The report builders' German terminology draws on DRG/AGIT templates and Fleischner,
AO and ACR resources, as documented with sources, attribution and scope in
[docs/radnote/TERMINOLOGY.md](docs/radnote/TERMINOLOGY.md). This attribution does not
claim endorsement or certification by any of these organisations.
