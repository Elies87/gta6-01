// audio.js — semua suara disintesis dengan WebAudio, tanpa berkas audio sama sekali.
// Mesin dan sirene adalah node yang hidup terus dan diatur gain/frekuensinya dari loop game;
// sisanya one-shot pendek: tembakan, tinju, tabrakan, jingle misi, klik UI. Konteks audio
// dibuat malas (lazy) pada gestur pertama pemain, sesuai kebijakan autoplay browser.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let muted = false;

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function blip(freqFrom, freqTo, seconds, type, gainValue) {
  if (!ensureContext()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + seconds);
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

function noiseHit(seconds, filterFreq, gainValue) {
  if (!ensureContext()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + seconds + 0.02);
}

export const Sound = {
  unlock() {
    ensureContext();
  },
  isMuted() {
    return muted;
  },
  setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.03);
  },
  // Dengung mesin: dipanggil tiap frame saat mengemudi; speed01 = 0..1 dari kecepatan mobil.
  engine(speed01, driving) {
    if (!ensureContext()) return;
    if (!engineNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
      engineNodes = { osc, gain };
    }
    const target = driving ? 0.05 + speed01 * 0.05 : 0;
    engineNodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.08);
  },
  // Sirene dua nada untuk mobil polisi di dekat pemain.
  siren(active, phase) {
    if (!ensureContext()) return;
    if (!sirenNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      sirenNodes = { osc, gain };
    }
    sirenNodes.gain.gain.setTargetAtTime(active ? 0.035 : 0, ctx.currentTime, 0.1);
    if (active) sirenNodes.osc.frequency.setTargetAtTime(phase % 1 < 0.5 ? 660 : 880, ctx.currentTime, 0.02);
  },
  shot() {
    noiseHit(0.16, 2600, 0.5);
    blip(160, 40, 0.12, 'square', 0.25);
  },
  punch() {
    noiseHit(0.09, 500, 0.4);
    blip(110, 50, 0.09, 'sine', 0.35);
  },
  crash(strength) {
    noiseHit(0.25, 900, Math.min(0.6, 0.2 + strength * 0.4));
    blip(90, 30, 0.22, 'sine', 0.3);
  },
  pickup() {
    blip(520, 880, 0.14, 'sine', 0.25);
  },
  click() {
    blip(700, 700, 0.05, 'sine', 0.15);
  },
  jingle(success) {
    if (!ensureContext()) return;
    const notes = success ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((freq, i) => {
      setTimeout(() => blip(freq, freq, 0.22, 'triangle', 0.28), i * 110);
    });
  },
};
