/* Browser-local inference (adapted from Report Studio v1.6.0): WebLLM on WebGPU, Transformers.js on
   CPU/WebAssembly or WebGPU, preset models and user-selected model folders (ONNX or MLC).
   Worker sources, folder validation and model lists are verbatim from Report Studio.
   Lifecycle rules: one worker per provider/model/bundle revision; cancel, unload and model changes
   terminate the worker and revoke its Blob URL; local model files never fall back to online downloads. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiLocal = api;
})(globalThis, function () {
  'use strict';

const BROWSER_MODELS=['Qwen3-0.6B-q4f16_1-MLC','Qwen3-1.7B-q4f16_1-MLC','Qwen3-4B-q4f16_1-MLC','geeek/medgemma-4b-it-ONNX','geeek/medgemma-1.5-4b-it-ONNX','custom-local'];
const CPU_MODELS=['onnx-community/Qwen3-0.6B-ONNX','HuggingFaceTB/SmolLM2-135M-Instruct','geeek/medgemma-4b-it-ONNX','geeek/medgemma-1.5-4b-it-ONNX','custom-local'];
const CPU_WORKER_SOURCE="\nconst MODEL_FILES_ORIGIN='https://report-studio-model.invalid/';\nlet filesConfigured=false;function useModelFiles(entries){if(!entries?.length||filesConfigured)return;filesConfigured=true;const files=new Map(entries);const nativeFetch=self.fetch.bind(self);self.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.origin==='https://report-studio-model.invalid'){const path=decodeURIComponent(url.pathname.slice(1)).replace(/^local-model\\//,'').replace(/^_bundle\\/[^/]+\\//,'');const file=files.get(path);return file?new Response(file,{status:200,headers:{'Content-Type':path.endsWith('.json')?'application/json':path.endsWith('.wasm')?'application/wasm':'application/octet-stream'}}):new Response('Missing local model file',{status:404});}if(url.hostname==='huggingface.co'||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co'))return new Response('Model network downloads disabled',{status:404});return nativeFetch(input,options);};}\nlet generator=null,currentModel=null,stage='library';self.postMessage({type:'ready'});self.onmessage=async e=>{try{const {model,messages,files,custom,device='wasm'}=e.data;useModelFiles(files);const med=['geeek/medgemma-4b-it-ONNX','geeek/medgemma-1.5-4b-it-ONNX'].includes(model);if(!generator||currentModel!==model){if(generator)await generator.dispose();stage='library';const lib=med||custom?await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0'):await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');stage='model';lib.env.allowLocalModels=!!files?.length;lib.env.allowRemoteModels=!files?.length;if(files?.length)lib.env.useBrowserCache=false;if(files?.length)lib.env.localModelPath=MODEL_FILES_ORIGIN;lib.env.backends.onnx.wasm.numThreads=1;lib.env.backends.onnx.wasm.proxy=false;generator=await lib.pipeline('text-generation',files?.length?'local-model':model,{device,dtype:custom?.dtype||(med?'q4':'q8'),progress_callback:p=>{if(p.status==='progress')self.postMessage({type:'progress',progress:(Number(p.progress)||0)/100});}});currentModel=model;}stage='generate';const rendered=generator.tokenizer.apply_chat_template((med||custom?.mergeSystem)?[{role:'user',content:messages.map(m=>m.content).join('\\n\\n')}]:messages,{tokenize:false,add_generation_prompt:true,enable_thinking:false});const encoded=generator.tokenizer(rendered);if(encoded.input_ids.dims[1]>2048){self.postMessage({type:'error',code:'context'});return;}self.postMessage({type:'generating'});const output=await generator(rendered,{max_new_tokens:1024,do_sample:false,repetition_penalty:1.1,return_full_text:false});const text=output[0]?.generated_text;if(typeof text!=='string'||!text.trim())throw Error('Empty output');self.postMessage({type:'result',response:{choices:[{finish_reason:'stop',message:{content:text}}]}});}catch(error){const message=String(error?.message||'');let code=stage;if(stage==='model'){if(/out of memory|allocation|memory access|Array buffer allocation|bad_alloc/i.test(message))code='memory';else if(/unsupported model|model type|not supported|No Op registered|NOT_IMPLEMENTED/i.test(message))code='unsupported';else if(/fetch|network|download|HTTP|404|403|failed to load.*file/i.test(message))code='download';else if(/backend|wasm|session|compile|instantiate/i.test(message))code='runtime';}self.postMessage({type:'error',code});}};";
const BROWSER_WORKER_SOURCE="\nconst MODEL_FILES_ORIGIN='https://report-studio-model.invalid/';\nlet filesConfigured=false;function useModelFiles(entries){if(!entries?.length||filesConfigured)return;filesConfigured=true;const files=new Map(entries);const nativeFetch=self.fetch.bind(self);self.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.origin==='https://report-studio-model.invalid'){const path=decodeURIComponent(url.pathname.slice(1)).replace(/^_bundle\\/[^/]+\\//,'');const file=files.get(path);return file?new Response(file,{status:200,headers:{'Content-Type':path.endsWith('.json')?'application/json':path.endsWith('.wasm')?'application/wasm':'application/octet-stream'}}):new Response('Missing local model file',{status:404});}if(url.hostname==='huggingface.co'||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co'))return new Response('Model network downloads disabled',{status:404});return nativeFetch(input,options);};}\nlet engine=null,currentModel=null;self.onmessage=async e=>{try{const {model,messages,files,custom}=e.data;useModelFiles(files);if(!engine||currentModel!==model){if(engine)await engine.unload();const lib=await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm');let appConfig;if(files?.length){const original=custom?{model_id:model}:lib.prebuiltAppConfig.model_list.find(m=>m.model_id===model);if(!original)throw Error('Unsupported model');const wasm=custom?.library||model.replace('-MLC','_cs1k-webgpu.wasm');const localBase=MODEL_FILES_ORIGIN+'_bundle/'+Date.now()+'/';appConfig={...lib.prebuiltAppConfig,model_list:[{...original,model:localBase,model_lib:localBase+wasm}]};}engine=await lib.CreateMLCEngine(model,{...(appConfig?{appConfig}:{}),initProgressCallback:p=>self.postMessage({type:'progress',progress:p.progress})});currentModel=model;}self.postMessage({type:'generating'});const response=await engine.chat.completions.create({messages,temperature:0.2,max_tokens:2048,response_format:{type:'json_object'},extra_body:{enable_thinking:false}});self.postMessage({type:'result',response});}catch{self.postMessage({type:'error'});}};";
const CUSTOM_MODEL='custom-local';
const LOCAL_DTYPES=['fp32','fp16','q8','int8','uint8','q4','q4f16','bnb4'];
function modelFolderEntries(files){const entries=[];const seen=new Set();for(const file of files){const path=file.webkitRelativePath||file.name;const key=file.webkitRelativePath?path.split('/').slice(1).join('/'):path;if(!key||key.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(key))throw Error('Invalid or duplicate model file path.');seen.add(key);entries.push([key,file]);}if(!entries.length)throw Error('Choose a model folder.');return entries;}
function validateModelBundle(model,entries){const names=new Set(entries.map(e=>e[0]));if(model.endsWith('-MLC')){for(const name of ['mlc-chat-config.json','tensor-cache.json'])if(!names.has(name))throw Error('Missing model file: '+name);if(!names.has(model.replace('-MLC','_cs1k-webgpu.wasm')))throw Error('Include the matching WebLLM .wasm library in this folder.');}else{for(const name of ['config.json','tokenizer.json','tokenizer_config.json'])if(!names.has(name))throw Error('Missing model file: '+name);if(['geeek/medgemma-4b-it-ONNX','geeek/medgemma-1.5-4b-it-ONNX'].includes(model)){for(const name of ['onnx/embed_tokens_q4.onnx','onnx/embed_tokens_q4.onnx_data','onnx/decoder_model_merged_q4.onnx','onnx/decoder_model_merged_q4.onnx_data','onnx/decoder_model_merged_q4.onnx_data_1'])if(!names.has(name))throw Error('Missing model file: '+name);}else if(!names.has('onnx/model_quantized.onnx'))throw Error('Missing model file: onnx/model_quantized.onnx');if(!entries.some(e=>e[0].startsWith('onnx/')&&e[0].endsWith('.onnx')))throw Error('The model folder must include onnx/ model files.');}}
async function readModelJSON(entries,path){const file=entries.find(e=>e[0]===path)?.[1];if(!file)throw Error('Missing model file: '+path);if(file.size>20e6)throw Error('Model configuration is too large.');try{return JSON.parse(await file.text());}catch{throw Error('Invalid model configuration: '+path);}}

  const MEDGEMMA = ['geeek/medgemma-4b-it-ONNX', 'geeek/medgemma-1.5-4b-it-ONNX'];
  const LOCAL_PROVIDERS = ['webllm', 'wasm'];
  const MODEL_LABELS = {
    'Qwen3-0.6B-q4f16_1-MLC': 'Qwen3 0.6B · smallest',
    'Qwen3-1.7B-q4f16_1-MLC': 'Qwen3 1.7B · balanced',
    'Qwen3-4B-q4f16_1-MLC': 'Qwen3 4B · larger',
    'onnx-community/Qwen3-0.6B-ONNX': 'Qwen3 0.6B · multilingual · larger download',
    'HuggingFaceTB/SmolLM2-135M-Instruct': 'SmolLM2 135M · tiny · English-focused',
    'geeek/medgemma-4b-it-ONNX': 'MedGemma 4B · ONNX · experimental',
    'geeek/medgemma-1.5-4b-it-ONNX': 'MedGemma 1.5 4B · ONNX · experimental',
    'custom-local': 'Custom local model…'
  };

  const modelsFor = provider => (provider === 'wasm' ? CPU_MODELS : BROWSER_MODELS);

  // Report Studio's describeCustomModel(), with the preferred ONNX dtype passed in instead of read from the DOM.
  async function describeCustomModel(entries, provider, preferredDtype) {
    const names = new Set(entries.map(e => e[0]));
    if (names.has('mlc-chat-config.json')) {
      if (provider === 'wasm') throw Error('MLC models require WebGPU mode. Select an ONNX model for CPU mode.');
      await readModelJSON(entries, 'mlc-chat-config.json');
      const manifest = await readModelJSON(entries, 'tensor-cache.json');
      const libraries = entries.filter(e => e[0].endsWith('.wasm'));
      if (libraries.length !== 1) throw Error('Include exactly one matching compiled WebLLM .wasm library.');
      if (!Array.isArray(manifest.records) || !manifest.records.length) throw Error('The MLC weight manifest has no weight shards.');
      for (const shard of manifest.records) { if (typeof shard.dataPath !== 'string' || !names.has(shard.dataPath)) throw Error('Missing model file: ' + String(shard.dataPath)); }
      if (!entries.some(e => /tokenizer\.(json|model)$/.test(e[0]))) throw Error('Missing tokenizer files.');
      return { format: 'mlc', library: libraries[0][0] };
    }
    if (!names.has('config.json')) throw Error('Choose a Transformers.js ONNX folder or a WebLLM MLC folder. GGUF, safetensors and PyTorch weights cannot run in these browser runtimes.');
    const configuration = await readModelJSON(entries, 'config.json');
    if (!configuration || typeof configuration.model_type !== 'string') throw Error('The model configuration must specify model_type.');
    if (!entries.some(e => /^onnx\/.+\.onnx$/.test(e[0]))) throw Error('The model folder must include onnx/ model files.');
    if (!names.has('tokenizer.json')) throw Error('Missing model file: tokenizer.json');
    const variants = [['q4f16', /_q4f16\.onnx$/], ['q4', /_q4\.onnx$/], ['q8', /_quantized\.onnx$/], ['int8', /_int8\.onnx$/], ['uint8', /_uint8\.onnx$/], ['bnb4', /_bnb4\.onnx$/], ['fp16', /_fp16\.onnx$/], ['fp32', /\/(?:model|decoder_model_merged|embed_tokens)\.onnx$/]];
    const available = variants.filter(([, pattern]) => entries.some(e => pattern.test(e[0]))).map(([dtype]) => dtype);
    const dtype = available.includes(preferredDtype) ? preferredDtype : (available[0] || 'fp32');
    return { format: 'onnx', dtype, mergeSystem: configuration.model_type.startsWith('gemma') };
  }

  function buildLocalRequest(provider, model, system, input) {
    if (!modelsFor(provider).includes(model)) throw Error('Choose a supported browser model.');
    return { local: provider, model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] };
  }

  // ONNX work (CPU, MedGemma, custom ONNX) runs in the Transformers.js worker; MLC models in the WebLLM worker.
  function usesCpuWorker(request, bundle) {
    return request.local === 'wasm' || (request.model === CUSTOM_MODEL && bundle?.format === 'onnx') || MEDGEMMA.includes(request.model);
  }

  function errorMessage(code, local) {
    switch (code) {
      case 'library': return 'CPU runtime could not load from jsDelivr. Try the local launcher and check browser shields or workplace download restrictions.';
      case 'memory': return 'CPU model initialization ran out of memory. Close other tabs and apps, then retry; the download size is smaller than the RAM needed.';
      case 'unsupported': return 'The CPU runtime does not support this model or an operator in its model file. This is a compatibility failure, not a report error.';
      case 'download': return 'CPU model files could not be downloaded. Check Hugging Face access and large-file download restrictions. The local launcher cannot bypass workplace network policy.';
      case 'runtime': return 'The CPU model could not create a WebAssembly session. Try the local launcher; the model may be incompatible with this browser runtime.';
      case 'model': return 'CPU model download or initialization failed. The underlying error was not recognized. Try the local launcher; CPU compatibility is not verified.';
      case 'generate': return 'CPU model loaded, but generation failed. Try a shorter report or the tiny model.';
      case 'context': return 'CPU input is too long (maximum 2,048 tokens). Shorten the report, template or prompts.';
      default: return local === 'wasm'
        ? 'CPU model failed to load or generate. Check free RAM, WebAssembly support and access to model downloads. Try the tiny model or the local launcher.'
        : 'Browser model failed to load or generate. Check WebGPU, free GPU memory, and access to model downloads. Try a smaller model or the local launcher.';
    }
  }

  function abortError() {
    const e = new Error('Cancelled');
    e.name = 'AbortError';
    return e;
  }

  /* Owns the single browser worker. env lets tests inject Worker/Blob/URL/navigator.
     onProgress receives a translatable message key plus an optional suffix. */
  function createRunner({ onProgress = () => {}, env = globalThis } = {}) {
    let worker = null, workerKind = null, workerURL = null, job = null, bundle = null, revision = 0;

    function release() {
      worker?.terminate();
      worker = null;
      workerKind = null;
      if (workerURL) { env.URL.revokeObjectURL(workerURL); workerURL = null; }
    }

    function stop() {
      release();
      if (job) { const current = job; job = null; current.cleanup(); current.reject(abortError()); }
      onProgress('Browser model unloaded.');
    }

    function setBundle(next) {
      stop();
      bundle = next ? { ...next, revision: ++revision } : null;
      return bundle;
    }

    function setDtype(dtype) {
      if (bundle?.model === CUSTOM_MODEL && bundle.format === 'onnx') { stop(); bundle.dtype = dtype; bundle.revision = ++revision; }
    }

    async function request(req, signal) {
      if (req.local === 'webllm' && !env.navigator?.gpu) throw Error('WebGPU is unavailable on this computer. Choose CPU mode or an API provider; WebLLM cannot run on CPU.');
      if (req.local === 'wasm' && typeof env.WebAssembly === 'undefined') throw Error('WebAssembly is unavailable in this browser.');
      if (typeof env.Worker === 'undefined') throw Error('Browser workers are unavailable. Try the local launcher in a current browser.');
      if (signal?.aborted) throw abortError();
      if (bundle && bundle.model !== req.model) throw Error('Loaded model files belong to another model. Load the matching folder or select online downloads.');
      if (req.model === CUSTOM_MODEL && !bundle) throw Error('Choose a custom model folder to continue.');
      if (req.model === CUSTOM_MODEL && req.local === 'wasm' && bundle?.format === 'mlc') throw Error('MLC models require WebGPU mode. Select an ONNX model for CPU mode.');
      if (job) throw Error('A browser model request is already running.');
      const kind = req.local + ':' + req.model + ':' + (bundle?.revision || 0);
      if (worker && workerKind !== kind) stop();
      if (!worker) {
        workerKind = kind;
        workerURL = env.URL.createObjectURL(new env.Blob([usesCpuWorker(req, bundle) ? CPU_WORKER_SOURCE : BROWSER_WORKER_SOURCE], { type: 'text/javascript' }));
        try {
          // Classic worker for CPU mode keeps direct file:// use working in more browsers.
          worker = new env.Worker(workerURL, { type: req.local === 'wasm' ? 'classic' : 'module' });
        } catch {
          release();
          throw Error('Browser worker could not start. Open the app through the local launcher; browser or workplace policy may block workers.');
        }
      }
      return new Promise((resolve, reject) => {
        const abort = () => stop();
        const cleanup = () => signal?.removeEventListener('abort', abort);
        job = { resolve, reject, cleanup };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = e => {
          const data = e.data;
          if (data.type === 'ready') { onProgress('CPU worker started. Loading runtime…'); return; }
          if (data.type === 'progress') { onProgress('Loading browser model:', ' ' + Math.round(Math.max(0, Math.min(1, Number(data.progress) || 0)) * 100) + '%'); return; }
          if (data.type === 'generating') { onProgress('Generating locally…'); return; }
          const current = job;
          if (!current) return;
          job = null;
          current.cleanup();
          if (data.type === 'result') { onProgress('Browser model ready.'); current.resolve(data.response); }
          else { release(); current.reject(new Error(errorMessage(data.code, req.local))); }
        };
        worker.onerror = () => {
          const current = job;
          job = null;
          release();
          current?.cleanup();
          current?.reject(new Error(req.local === 'wasm'
            ? 'CPU browser worker failed to start or crashed. Check browser worker permissions, available RAM, and access to jsDelivr and Hugging Face, or use the local launcher.'
            : 'Browser model worker failed. Model downloads or WebGPU may be blocked. Try the local launcher or an API provider.'));
        };
        worker.postMessage({
          model: req.model, messages: req.messages, device: req.local === 'wasm' ? 'wasm' : 'webgpu',
          custom: req.model === CUSTOM_MODEL ? { format: bundle.format, dtype: bundle.dtype, library: bundle.library, mergeSystem: bundle.mergeSystem } : undefined,
          files: bundle?.model === req.model ? bundle.entries : undefined
        });
      });
    }

    return {
      request, stop, setBundle, setDtype,
      get bundle() { return bundle; },
      get busy() { return !!job; },
      get active() { return !!worker; }
    };
  }

  // Hugging Face page for a preset (null for custom models).
  function downloadPage(model) {
    if (!model || model === CUSTOM_MODEL) return null;
    return 'https://huggingface.co/' + (model.endsWith('-MLC') ? 'mlc-ai/' + model : model) + '/tree/main';
  }

  return {
    BROWSER_MODELS, CPU_MODELS, CUSTOM_MODEL, LOCAL_DTYPES, MEDGEMMA, LOCAL_PROVIDERS, MODEL_LABELS,
    CPU_WORKER_SOURCE, BROWSER_WORKER_SOURCE,
    modelsFor, modelFolderEntries, validateModelBundle, readModelJSON, describeCustomModel,
    buildLocalRequest, usesCpuWorker, errorMessage, createRunner, downloadPage
  };
});
