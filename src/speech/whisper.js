/* Offline dictation: Whisper speech recognition in a browser worker via Transformers.js (the same
   pinned runtime the browser AI models use, loaded lazily from jsDelivr). Nothing is fetched until
   the user selects a dictation model and dictates or presses "Load model".
   Presets are pinned to a model revision; dtypes and devices follow the 2026-11-21 measurements
   (synthetic German speech, 12-core CPU / WebGPU, docs/OFFLINE_DICTATION_PLAN.md):
   - Whisper small 8-bit on CPU: 3–5 s per 12–28 s recording with cross-origin isolation, 9–12 s without.
   - Whisper large-v3-turbo: q4f16 on WebGPU 2.5–3.5 s; 8-bit on CPU ≈ 10 s. Much better medical terms.
   A local model folder (Transformers.js Whisper export) works fully offline: Hugging Face downloads are
   then blocked inside the worker.
   Audio is transferred to the worker (not copied) and zero-filled there after transcription. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpeechWhisper = api;
})(globalThis, function () {
  'use strict';

  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  const Q8 = { encoder_model: 'q8', decoder_model_merged: 'q8' };
  const PRESETS = {
    'whisper-small': {
      model: 'onnx-community/whisper-small', revision: '36050c46d777d46dc4b5f43f6d90574fc38f8732',
      devices: { wasm: Q8 }, size: { wasm: '≈ 250 MB' }
    },
    'whisper-large-v3-turbo': {
      model: 'onnx-community/whisper-large-v3-turbo', revision: '360ebcde2559d60bb474678be3c1de9ef347d01a',
      devices: { webgpu: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }, wasm: Q8 },
      size: { webgpu: '≈ 560 MB', wasm: '≈ 1.1 GB' }
    },
    // German fine-tune by primeLine (Apache-2.0). Same file layout and sizes as the turbo conversion.
    'whisper-large-v3-turbo-german': {
      model: 'onnx-community/whisper-large-v3-turbo-german-ONNX', revision: '7a86cb9d63ad2517468c15fdac7dc9bb6d2abaed',
      devices: { webgpu: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }, wasm: Q8 },
      size: { webgpu: '≈ 560 MB', wasm: '≈ 1.1 GB' }
    }
  };
  const FOLDER = 'folder';
  const LANGUAGES = { de: 'german', en: 'english' };

  // Local folder: which ONNX variant to use, best first per device. Suffix as in Transformers.js exports.
  const SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', q4: '_q4', q4f16: '_q4f16' };
  const FOLDER_ORDER = { webgpu: ['q4f16', 'fp16', 'q8', 'fp32'], wasm: ['q8', 'q4', 'fp32'] };
  function folderDtype(names, device) {
    for (const dtype of FOLDER_ORDER[device]) {
      if (['encoder_model', 'decoder_model_merged'].every(part => names.has(`onnx/${part}${SUFFIX[dtype]}.onnx`))) {
        return { encoder_model: dtype, decoder_model_merged: dtype };
      }
    }
    return null;
  }
  // entries: [[relativePath, File]] as from AiLocal.modelFolderEntries.
  function validateFolder(entries) {
    const names = new Set(entries.map(e => e[0]));
    for (const name of ['config.json', 'tokenizer.json', 'preprocessor_config.json']) {
      if (!names.has(name)) throw new Error('This folder is not a Whisper model for Transformers.js (missing ' + name + ').');
    }
    if (!folderDtype(names, 'wasm') && !folderDtype(names, 'webgpu')) throw new Error('No Whisper ONNX files (onnx/encoder_model…, onnx/decoder_model_merged…) in this folder.');
    return names;
  }

  // Classic worker (Blob URL): dynamic import of the pinned runtime, one pipeline kept per model key.
  const WORKER_SOURCE = `
const MODEL_ORIGIN='https://befundungstool-speech-model.invalid/';
let filesConfigured=false;
function useModelFiles(entries){if(!entries||filesConfigured)return;filesConfigured=true;const files=new Map(entries);const nativeFetch=self.fetch.bind(self);self.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.origin==='https://befundungstool-speech-model.invalid'){const path=decodeURIComponent(url.pathname.slice(1)).replace(/^local-model\\//,'');const file=files.get(path);return file?new Response(file,{status:200}):new Response('Missing local model file',{status:404});}if(url.hostname==='huggingface.co'||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co'))return new Response('Model network downloads disabled',{status:404});return nativeFetch(input,options);};}
let asr=null,loadedKey=null,stage='library';
self.onmessage=async e=>{const {id,type,key,model,revision,device,dtype,audio,language,files}=e.data;
 try{
  if(files)useModelFiles(files);
  if(!asr||loadedKey!==key){
   if(asr){try{await asr.dispose()}catch{}}asr=null;loadedKey=null;stage='library';
   const lib=await import('${TRANSFORMERS_URL}');
   lib.env.backends.onnx.wasm.numThreads=self.crossOriginIsolated?Math.min(8,navigator.hardwareConcurrency||4):1;
   lib.env.backends.onnx.wasm.proxy=false;
   if(files){lib.env.allowLocalModels=true;lib.env.allowRemoteModels=false;lib.env.useBrowserCache=false;lib.env.localModelPath=MODEL_ORIGIN;}
   stage='model';
   asr=await lib.pipeline('automatic-speech-recognition',files?'local-model':model,{device,dtype,...(files?{}:{revision}),progress_callback:p=>{if(p.status==='progress')self.postMessage({id,type:'progress',progress:(Number(p.progress)||0)/100});}});
   loadedKey=key;
  }
  if(type==='load'){self.postMessage({id,type:'loaded'});return;}
  stage='transcribe';self.postMessage({id,type:'transcribing'});
  const result=await asr(audio,{language,task:'transcribe',chunk_length_s:30});
  audio.fill(0);
  self.postMessage({id,type:'result',text:String(result&&result.text||'')});
 }catch(error){
  if(audio&&audio.fill)audio.fill(0);
  const message=String(error&&error.message||'');let code=stage;
  if(stage!=='transcribe'){if(/out of memory|allocation|memory access|bad_alloc/i.test(message))code='memory';else if(/webgpu|requestDevice|adapter/i.test(message))code='webgpu';else if(/fetch|network|download|HTTP|404|403|failed to load/i.test(message))code=stage==='library'?'library':'download';}
  self.postMessage({id,type:'error',code});
 }
};`;

  const ERRORS = {
    library: 'The speech recognition runtime could not load from jsDelivr. Check network access or workplace download restrictions.',
    download: 'The dictation model could not be downloaded. Check network access, or use a local model folder.',
    model: 'The dictation model could not be loaded in this browser.',
    memory: 'The dictation model does not fit into browser memory. Close other tabs or choose Whisper small.',
    webgpu: 'WebGPU could not start. Choose Whisper small, or update the graphics driver.',
    transcribe: 'Transcription failed. Try again.'
  };
  const SUPERSEDED = 'Dictation was cancelled or the model changed. Record again.';

  function abortError() {
    const error = new Error('Cancelled');
    error.name = 'AbortError';
    return error;
  }

  /* One worker at a time. Every call carries a generation: stop(), a model change or cancellation
     terminates the worker and rejects pending work; a late result is never delivered.
     gpu(): resolves true when a WebGPU adapter is available. */
  function createRunner({ onProgress = () => {}, WorkerImpl = globalThis.Worker, gpu = async () => !!(await globalThis.navigator?.gpu?.requestAdapter?.()) } = {}) {
    let worker = null, workerKey = null, generation = 0, nextId = 0, folder = null;
    const handlers = new Map();      // request id -> handler; replies are routed by id

    function terminate() {
      generation++;
      worker?.terminate();
      worker = null;
      workerKey = null;
      const open = [...handlers.values()];
      handlers.clear();
      for (const handler of open) handler({ type: 'superseded' });
    }

    async function plan(preset) {
      if (preset === FOLDER) {
        if (!folder) throw new Error('Choose a local Whisper model folder in Settings.');
        const device = (await gpu()) && folderDtype(folder.names, 'webgpu') ? 'webgpu' : 'wasm';
        const dtype = folderDtype(folder.names, device);
        if (!dtype) throw new Error('No Whisper ONNX files (onnx/encoder_model…, onnx/decoder_model_merged…) in this folder.');
        return { key: 'folder:' + folder.revision + ':' + device, device, dtype, files: folder.entries };
      }
      const p = PRESETS[preset];
      if (!p) throw new Error('Choose a dictation model in Settings.');
      const device = p.devices.webgpu && (await gpu()) ? 'webgpu' : 'wasm';
      return { key: preset + ':' + device, model: p.model, revision: p.revision, device, dtype: p.devices[device] };
    }

    function ensureWorker(key) {
      if (worker && workerKey === key) return worker;
      terminate();
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      try { worker = new WorkerImpl(url); } finally { URL.revokeObjectURL(url); }
      workerKey = key;
      worker.onmessage = event => handlers.get(event.data?.id)?.(event.data);
      worker.onerror = () => { for (const handler of [...handlers.values()]) handler({ type: 'error', code: 'model' }); };
      return worker;
    }

    function call(message, transfer, signal) {
      const started = generation;
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        const onAbort = () => { handlers.delete(id); terminate(); onProgress('Dictation model unloaded.'); reject(abortError()); };
        signal?.addEventListener('abort', onAbort, { once: true });
        const settle = fn => value => { signal?.removeEventListener('abort', onAbort); handlers.delete(id); fn(value); };
        handlers.set(id, data => {
          if (data.type === 'superseded' || started !== generation) { settle(reject)(new Error(SUPERSEDED)); return; }
          if (data.type === 'progress') onProgress('Loading dictation model…', ' ' + Math.round(data.progress * 100) + ' %');
          else if (data.type === 'transcribing') onProgress('Transcribing locally…');
          else if (data.type === 'loaded') settle(resolve)({});
          else if (data.type === 'result') settle(resolve)({ text: data.text });
          else if (data.type === 'error') { settle(reject)(new Error(ERRORS[data.code] || ERRORS.model)); terminate(); }
        });
        worker.postMessage({ id, ...message }, transfer);
      });
    }

    return {
      // samples: 16 kHz Float32Array; it is transferred to the worker and unusable here afterwards.
      async transcribe(samples, { preset, language = 'de', signal } = {}) {
        const started = generation;
        let target;
        try { target = await plan(preset); } catch (error) { samples.fill(0); throw error; }
        if (started !== generation) { samples.fill(0); throw new Error(SUPERSEDED); }
        ensureWorker(target.key);
        onProgress(target.device === 'webgpu' ? 'Dictation on this device (WebGPU)' : 'Dictation on this device (CPU)');
        const result = await call({ type: 'transcribe', ...target, audio: samples, language: LANGUAGES[language] || 'german' }, [samples.buffer], signal);
        return { text: result.text, device: target.device };
      },
      // Downloads/loads the model without audio (Settings → "Load model").
      async load(preset, { signal } = {}) {
        const target = await plan(preset);
        ensureWorker(target.key);
        await call({ type: 'load', ...target }, [], signal);
        onProgress('Dictation model ready.', target.device === 'webgpu' ? ' (WebGPU)' : ' (CPU)');
        return target.device;
      },
      setFolder(entries) {
        if (!entries) { folder = null; if (workerKey?.startsWith('folder:')) terminate(); return; }
        const names = validateFolder(entries);
        if (workerKey?.startsWith('folder:')) terminate();
        folder = { entries, names, revision: Date.now() };
      },
      get folder() { return !!folder; },
      get loaded() { return !!worker; },
      stop() { terminate(); onProgress('Dictation model unloaded.'); }
    };
  }

  return { TRANSFORMERS_URL, PRESETS, FOLDER, LANGUAGES, ERRORS, SUPERSEDED, WORKER_SOURCE, folderDtype, validateFolder, createRunner };
});
