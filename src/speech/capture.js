/* Offline dictation: microphone capture (constraints carried over from RepDict lib/services/audio.dart).
   - 16 kHz mono Float32, held only in memory, hard limit (30 s): one preallocated buffer, no
     MediaRecorder, no encoded files, nothing stored or uploaded.
   - Raw signal: echo cancellation, noise suppression and auto gain are off.
   - Every buffer is zero-filled after use and on cancel; microphone tracks are stopped.
   - The AudioWorklet module loads from a data: URL: a Blob URL fails on file:// (measured 2026-11-21).
   - Start/stop/cancel carry an epoch, so a late permission grant cannot start a stale recording. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./text.js') : root.SpeechText);
  if (node) module.exports = api;
  else root.SpeechCapture = api;
})(globalThis, function (SpeechText) {
  'use strict';

  const MAX_SECONDS = 30;
  const PROCESSOR = 'befundungstool-capture';
  // Runs on the audio thread: forwards 2,048-sample chunks (transferred, not copied).
  const WORKLET_SOURCE = `class Collector extends AudioWorkletProcessor{constructor(){super();this.buf=new Float32Array(2048);this.n=0;this.port.onmessage=e=>{if(e.data==='flush'){if(this.n)this.port.postMessage(this.buf.slice(0,this.n));this.buf.fill(0);this.n=0;this.port.postMessage('flushed')}}}process(inputs){const ch=inputs[0]&&inputs[0][0];if(ch){for(let i=0;i<ch.length;i++){this.buf[this.n++]=ch[i];if(this.n===this.buf.length){this.port.postMessage(this.buf,[this.buf.buffer]);this.buf=new Float32Array(2048);this.n=0}}}return true}}registerProcessor('${PROCESSOR}',Collector);`;
  const CONSTRAINTS = { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } };

  function abortError() {
    const error = new Error('Cancelled');
    error.name = 'AbortError';
    return error;
  }

  /* onLimit: the buffer is full (the caller stops). onTick(seconds): recorded length, ~4×/s.
     media / AudioContextImpl / AudioWorkletNodeImpl are injectable for tests. */
  function createCapture({
    maxSeconds = MAX_SECONDS, onLimit = () => {}, onTick = () => {},
    media = globalThis.navigator?.mediaDevices, AudioContextImpl = globalThis.AudioContext, AudioWorkletNodeImpl = globalThis.AudioWorkletNode
  } = {}) {
    let epoch = 0, recording = false, stream = null, ctx = null, node = null, source = null, timer = null;
    let buffer = null, length = 0, rate = SpeechText.SAMPLE_RATE, limited = false;

    function append(chunk) {
      if (!recording || !buffer) { chunk.fill?.(0); return; }
      const room = buffer.length - length;
      const n = Math.min(room, chunk.length);
      buffer.set(n === chunk.length ? chunk : chunk.subarray(0, n), length);
      length += n;
      chunk.fill(0);
      if (length >= buffer.length && !limited) { limited = true; onLimit(); }
    }

    async function teardown() {
      clearInterval(timer);
      timer = null;
      try { source?.disconnect(); } catch { /* already gone */ }
      try { node?.disconnect(); node?.port?.close?.(); } catch { /* already gone */ }
      stream?.getTracks?.().forEach(track => track.stop());
      const closing = ctx;
      stream = ctx = node = source = null;
      try { await closing?.close?.(); } catch { /* already closed */ }
    }

    function wipe() {
      buffer?.fill(0);
      buffer = null;
      length = 0;
    }

    async function start() {
      if (recording) throw new Error('A recording is already running.');
      const started = ++epoch;
      limited = false;
      if (!media?.getUserMedia) throw Object.assign(new Error('No microphone access in this browser.'), { name: 'NotSupportedError' });
      const granted = await media.getUserMedia(CONSTRAINTS);
      if (started !== epoch) { granted.getTracks().forEach(t => t.stop()); throw abortError(); }
      stream = granted;
      try {
        // Prefer a 16 kHz context (Chromium resamples the microphone); otherwise resample on stop.
        try { ctx = new AudioContextImpl({ sampleRate: SpeechText.SAMPLE_RATE }); } catch { ctx = new AudioContextImpl(); }
        rate = ctx.sampleRate;
        await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(WORKLET_SOURCE));
        if (started !== epoch) throw abortError();
        node = new AudioWorkletNodeImpl(ctx, PROCESSOR);
        buffer = new Float32Array(Math.ceil(maxSeconds * rate));
        length = 0;
        recording = true;
        node.port.onmessage = event => { if (event.data instanceof Float32Array) append(event.data); };
        source = ctx.createMediaStreamSource(stream);
        source.connect(node);
        timer = setInterval(() => onTick(length / rate), 250);
      } catch (error) {
        recording = false;
        wipe();
        await teardown();
        throw error;
      }
    }

    // Returns the recording as 16 kHz Float32 (a fresh array the caller owns and must clear).
    async function stop() {
      if (!recording) throw new Error('No recording is running.');
      const started = epoch;
      const port = node?.port;
      if (port) {
        await new Promise(resolve => {
          const done = setTimeout(resolve, 500);
          const previous = port.onmessage;
          port.onmessage = event => { if (event.data === 'flushed') { clearTimeout(done); resolve(); } else previous?.(event); };
          port.postMessage('flush');
        });
      }
      recording = false;
      await teardown();
      if (started !== epoch) { wipe(); throw abortError(); }
      const recorded = buffer ? buffer.slice(0, length) : new Float32Array(0);
      wipe();
      const samples = SpeechText.resample(recorded, rate);
      if (samples !== recorded) recorded.fill(0);
      return samples;
    }

    async function cancel() {
      epoch++;
      recording = false;
      wipe();
      await teardown();
    }

    return {
      start, stop, cancel,
      get recording() { return recording; },
      get seconds() { return length / rate; }
    };
  }

  return { MAX_SECONDS, WORKLET_SOURCE, CONSTRAINTS, createCapture };
});
