/* Offline dictation: pure helpers for audio checks and transcript text (testable in Node).
   - hasSpeech: silence or steady noise never reaches the model (Whisper invents text for silence,
     e.g. "[Musik]" or "Vielen Dank." in our measurements).
   - cleanTranscript: drops Whisper's known silence/subtitle hallucinations.
   - applyCommands: spoken formatting commands anywhere in punctuated one-line output. RepDict matched
     only exact standalone lines, so real Whisper output ("Kein Erguss. Neuer Absatz. Herz …") never
     triggered them. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpeechText = api;
})(globalThis, function () {
  'use strict';

  const SAMPLE_RATE = 16000;
  const FRAME_MS = 20;

  function frameLevels(samples, sampleRate = SAMPLE_RATE) {
    const size = Math.max(1, Math.round(sampleRate * FRAME_MS / 1000));
    const levels = [];
    for (let start = 0; start + size <= samples.length; start += size) {
      let sum = 0;
      for (let i = start; i < start + size; i++) sum += samples[i] * samples[i];
      levels.push(Math.sqrt(sum / size));
    }
    return levels;
  }

  /* Speech = enough loud frames (above ≈ -40 dBFS and well above the recording's own noise floor)
     AND the level varies like syllables and pauses do. Steady hum or fan noise fails the second test. */
  function speechActivity(samples, sampleRate = SAMPLE_RATE) {
    const levels = frameLevels(samples, sampleRate);
    if (!levels.length) return { speechMs: 0, speech: false };
    const sorted = levels.slice().sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)], p90 = sorted[Math.floor(sorted.length * 0.9)];
    const threshold = Math.min(0.05, Math.max(0.01, p10 * 3));
    const speechMs = levels.filter(l => l > threshold).length * FRAME_MS;
    const varies = p90 >= Math.max(p10 * 2.5, 0.01);
    return { speechMs, speech: speechMs >= 250 && varies };
  }
  const hasSpeech = (samples, sampleRate) => speechActivity(samples, sampleRate).speech;

  // Whole-transcript phrases Whisper produces from silence or noise (subtitle and video endings).
  const HALLUCINATIONS = new Set([
    'vielen dank', 'danke', 'danke schön', 'dankeschön', 'vielen dank fürs zuschauen', 'danke fürs zuschauen',
    'vielen dank für ihre aufmerksamkeit', 'bis zum nächsten mal', 'tschüss', 'ciao', 'bye',
    'thank you', 'thanks', 'thank you for watching', 'thanks for watching', 'you', 'amen'
  ]);
  function cleanTranscript(text) {
    let out = String(text || '')
      .replace(/\[[^\]]*\]/g, ' ')                       // [Musik], [BLANK_AUDIO]
      .replace(/\((?:musik|music|applaus|applause|lachen|laughter|stille|silence|geräusch\w*|noise|unverständlich)[^)]*\)/gi, ' ')
      .replace(/\*[^*]{0,40}\*/g, ' ')                   // *Musik*
      .replace(/untertitel(?:ung)? (?:im auftrag|der amara|von|:)[^.!?\n]*[.!?]?/gi, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    const bare = out.toLowerCase().replace(/[.,;:!?…"'„“”-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!bare || HALLUCINATIONS.has(bare)) return '';
    return out;
  }

  // "neuer Absatz" / "new paragraph" -> blank line; "neue Zeile" / "new line" -> line break.
  // Matched anywhere, case-insensitive, together with the punctuation and spaces Whisper puts around them.
  const PARAGRAPH = /[ \t]*[,;]?[ \t]*\b(?:neuer|neuen)\s+absatz\b[.,;:!?]*[ \t]*|[ \t]*[,;]?[ \t]*\bnew\s+paragraph\b[.,;:!?]*[ \t]*/gi;
  const LINE = /[ \t]*[,;]?[ \t]*\b(?:neue)\s+zeile\b[.,;:!?]*[ \t]*|[ \t]*[,;]?[ \t]*\bnew\s+line\b[.,;:!?]*[ \t]*/gi;
  function applyCommands(text, enabled = true) {
    if (!enabled) return text;
    return String(text)
      .replace(PARAGRAPH, '\n\n')
      .replace(LINE, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // A new line starts with a capital; the very start stays as spoken (it may continue a sentence).
      .replace(/\n([a-zäöü])/g, (m, letter) => '\n' + letter.toUpperCase());
  }

  // Linear resampling to 16 kHz for browsers that refuse a 16 kHz AudioContext (e.g. Firefox).
  function resample(samples, from, to = SAMPLE_RATE) {
    if (from === to) return samples;
    const out = new Float32Array(Math.floor(samples.length * to / from));
    const ratio = from / to;
    for (let i = 0; i < out.length; i++) {
      const x = i * ratio, j = Math.floor(x), f = x - j;
      out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] ?? samples[j] ?? 0) * f;
    }
    return out;
  }

  return { SAMPLE_RATE, frameLevels, speechActivity, hasSpeech, cleanTranscript, applyCommands, resample };
});
