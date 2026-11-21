'use strict';
// GPU switches and the "GPU status" diagnostics. Browser models (WebLLM, Transformers.js/ONNX, wllama,
// Whisper) need WebGPU; managed Chrome/Edge installs often block it by policy or by Chromium's GPU
// blocklist. The desktop app ships its own Chromium and turns WebGPU on wherever the hardware allows it.

const GPU_SWITCHES = ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu'];

// Must run before app.whenReady(). `--safe-gpu` keeps Chromium's defaults for broken drivers.
function applyGpuSwitches(app, { safe }) {
  if (safe) return [];
  for (const name of GPU_SWITCHES) app.commandLine.appendSwitch(name);
  return GPU_SWITCHES.slice();
}

// Runs in the app page (main world) via executeJavaScript: no preload or exposed API is needed.
// Returns plain JSON; every value is read defensively because the adapter may be missing.
const PAGE_PROBE = `(async () => {
  const plain = value => { const out = {}; for (const key in value) { const v = value[key]; if (typeof v !== 'function') out[key] = v; } return out; };
  const result = { crossOriginIsolated: self.crossOriginIsolated === true, hardwareConcurrency: navigator.hardwareConcurrency || null, webgpu: { available: !!navigator.gpu } };
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        result.webgpu.adapter = { info: plain(adapter.info || {}), features: [...adapter.features].sort(), limits: plain(adapter.limits), isFallbackAdapter: adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null };
      } else result.webgpu.adapter = null;
    } catch (error) { result.webgpu.error = String(error && error.message || error).slice(0, 300); }
  }
  return result;
})()`;

async function collectGpuInfo({ app, webContents, switches, safe }) {
  const page = await webContents.executeJavaScript(PAGE_PROBE, true).catch(error => ({ error: String(error?.message || error).slice(0, 300) }));
  const basic = await app.getGPUInfo('basic').catch(() => null);
  return {
    versions: { app: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome },
    mode: safe ? 'safe-gpu' : 'webgpu',
    switches,
    featureStatus: app.getGPUFeatureStatus(),
    devices: basic?.gpuDevice ?? [],
    ...page
  };
}

// Short summary for the dialog; the full JSON goes to the clipboard on request.
function summarize(info, german) {
  const adapter = info.webgpu?.adapter;
  const yes = german ? 'ja' : 'yes', no = german ? 'nein' : 'no';
  const lines = [
    `Befundungstool ${info.versions.app} · Electron ${info.versions.electron} · Chromium ${info.versions.chromium}`,
    `${german ? 'Modus' : 'Mode'}: ${info.mode}${info.switches.length ? ' (' + info.switches.join(', ') + ')' : ''}`,
    `WebGPU (navigator.gpu): ${info.webgpu?.available ? yes : no}`,
    `WebGPU ${german ? 'Adapter' : 'adapter'}: ${adapter ? [adapter.info.vendor, adapter.info.architecture, adapter.info.description].filter(Boolean).join(' · ') || yes : info.webgpu?.error || no}`,
    adapter ? `${german ? 'Fallback-Adapter (Software)' : 'Fallback adapter (software)'}: ${adapter.isFallbackAdapter ? yes : no}` : null,
    adapter ? `shader-f16: ${adapter.features.includes('shader-f16') ? yes : no} · maxBufferSize: ${adapter.limits.maxBufferSize ?? '?'}` : null,
    `crossOriginIsolated (${german ? 'mehrere CPU-Threads' : 'multi-threaded CPU'}): ${info.crossOriginIsolated ? yes : no}`,
    `navigator.hardwareConcurrency: ${info.hardwareConcurrency ?? '?'}`,
    `${german ? 'GPU-Funktionen' : 'GPU features'}: webgpu=${info.featureStatus.webgpu ?? '?'}, webgl2=${info.featureStatus.webgl2 ?? '?'}, gpu_compositing=${info.featureStatus.gpu_compositing ?? '?'}`,
    ...info.devices.map(device => `GPU: ${device.deviceString || `vendor 0x${(device.vendorId ?? 0).toString(16)} device 0x${(device.deviceId ?? 0).toString(16)}`}${device.driverVersion ? ' · ' + (german ? 'Treiber' : 'driver') + ' ' + device.driverVersion : ''}`)
  ];
  return lines.filter(Boolean).join('\n');
}

module.exports = { GPU_SWITCHES, applyGpuSwitches, collectGpuInfo, summarize };
