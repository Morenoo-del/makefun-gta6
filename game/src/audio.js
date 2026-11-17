// audio.js — all sound is synthesized live with WebAudio. No audio files.
export function createAudio() {
  const A = {
    ctx: null, master: null, musicGain: null, engineOsc: null, engineGain: null,
    engineFilter: null, sirenOsc: null, sirenGain: null, sirenLfo: null,
    muted: false, musicTimer: null, musicStep: 0,
  };
  return A;
}

// Must be called from a user gesture (start button). Safe to call repeatedly.
export function initAudio(G) {
  const A = G.audio;
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    A.ctx = new Ctx();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.55;
    A.master.connect(A.ctx.destination);

    // engine hum: sawtooth through a low-pass, pitch follows speed
    A.engineOsc = A.ctx.createOscillator();
    A.engineOsc.type = 'sawtooth';
    A.engineOsc.frequency.value = 55;
    A.engineFilter = A.ctx.createBiquadFilter();
    A.engineFilter.type = 'lowpass'; A.engineFilter.frequency.value = 320;
    A.engineGain = A.ctx.createGain(); A.engineGain.gain.value = 0;
    A.engineOsc.connect(A.engineFilter);
    A.engineFilter.connect(A.engineGain);
    A.engineGain.connect(A.master);
    A.engineOsc.start();

    // police siren: two alternating tones via an LFO on a square osc
    A.sirenOsc = A.ctx.createOscillator();
    A.sirenOsc.type = 'triangle'; A.sirenOsc.frequency.value = 800;
    A.sirenLfo = A.ctx.createOscillator();
    A.sirenLfo.type = 'square'; A.sirenLfo.frequency.value = 0.55;
    const lfoGain = A.ctx.createGain(); lfoGain.gain.value = 180;
    A.sirenLfo.connect(lfoGain); lfoGain.connect(A.sirenOsc.frequency);
    A.sirenGain = A.ctx.createGain(); A.sirenGain.gain.value = 0;
    A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
    A.sirenOsc.start(); A.sirenLfo.start();

    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.16;
    A.musicGain.connect(A.master);
    startMusic(G);
  } catch (e) {
    // Headless / no-audio environments: the game must still run.
    A.ctx = null;
  }
}

function tone(G, freq, dur, type, vol, when = 0, slideTo = null) {
  const A = G.audio;
  if (!A.ctx) return;
  const t0 = A.ctx.currentTime + when;
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(A.master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noiseBurst(G, dur, vol, filterFreq) {
  const A = G.audio;
  if (!A.ctx) return;
  const len = Math.floor(A.ctx.sampleRate * dur);
  const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = A.ctx.createBufferSource(); src.buffer = buf;
  const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = A.ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(A.master);
  src.start();
}

export const sfx = {
  shoot(G) { noiseBurst(G, 0.12, 0.5, 2400); tone(G, 190, 0.1, 'square', 0.22, 0, 60); },
  punch(G) { noiseBurst(G, 0.09, 0.4, 500); tone(G, 110, 0.09, 'sine', 0.35, 0, 55); },
  pickup(G) { tone(G, 660, 0.12, 'sine', 0.3); tone(G, 990, 0.18, 'sine', 0.3, 0.1); },
  cash(G) { tone(G, 880, 0.1, 'triangle', 0.3); tone(G, 1174, 0.1, 'triangle', 0.3, 0.09); tone(G, 1568, 0.22, 'triangle', 0.3, 0.18); },
  crash(G) { noiseBurst(G, 0.3, 0.55, 700); tone(G, 70, 0.25, 'sine', 0.4, 0, 40); },
  click(G) { tone(G, 1200, 0.04, 'square', 0.12); },
  sirenBlip(G) { tone(G, 950, 0.18, 'triangle', 0.2, 0, 700); },
  busted(G) { tone(G, 392, 0.3, 'sawtooth', 0.25); tone(G, 311, 0.5, 'sawtooth', 0.25, 0.28); },
  wasted(G) { tone(G, 220, 0.4, 'sawtooth', 0.3, 0, 110); tone(G, 165, 0.7, 'sawtooth', 0.3, 0.35, 82); },
  mission(G) { tone(G, 523, 0.14, 'triangle', 0.3); tone(G, 659, 0.14, 'triangle', 0.3, 0.12); tone(G, 784, 0.3, 'triangle', 0.3, 0.24); },
};

export function setEngineSound(G, speed01, on) {
  const A = G.audio;
  if (!A.ctx || !A.engineOsc) return;
  const t = A.ctx.currentTime;
  A.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
  A.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  A.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
}

export function setSiren(G, on) {
  const A = G.audio;
  if (!A.ctx || !A.sirenGain) return;
  A.sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, A.ctx.currentTime, 0.3);
}

// A lazy synthwave loop: Am – F – C – G bass + a soft pad, stepped on a timer.
const BASSLINE = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42]; // A1 A1 C2 G1 ...
const PAD_CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
function startMusic(G) {
  const A = G.audio;
  if (!A.ctx || A.musicTimer) return;
  A.musicTimer = setInterval(() => {
    if (!A.ctx || A.muted) return;
    const step = A.musicStep++;
    const bar = Math.floor(step / 8) % 4;
    // bass note every beat
    const bassFreq = BASSLINE[step % BASSLINE.length];
    const o = A.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = bassFreq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.5, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.42);
    o.connect(g); g.connect(A.musicGain);
    o.start(); o.stop(A.ctx.currentTime + 0.45);
    // pad at the top of each bar
    if (step % 8 === 0) {
      for (const f of PAD_CHORDS[bar]) {
        const p = A.ctx.createOscillator(); p.type = 'sine'; p.frequency.value = f;
        const pg = A.ctx.createGain();
        pg.gain.setValueAtTime(0.0001, A.ctx.currentTime);
        pg.gain.exponentialRampToValueAtTime(0.12, A.ctx.currentTime + 0.4);
        pg.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 3.6);
        p.connect(pg); pg.connect(A.musicGain);
        p.start(); p.stop(A.ctx.currentTime + 3.7);
      }
    }
    // hi-hat tick every half beat
    if (step % 2 === 0) noiseBurst(G, 0.03, 0.05, 6000);
  }, 240);
}

export function toggleMute(G) {
  const A = G.audio;
  A.muted = !A.muted;
  if (A.ctx && A.master) A.master.gain.value = A.muted ? 0 : 0.55;
  return A.muted;
}
