// Soundboard: every sound is synthesized with Web Audio, no files to host.

export const SFX = {
  airhorn: "Airhorn",
  tada: "Ta-da",
  rimshot: "Rimshot",
  drumroll: "Drumroll",
  applause: "Applause",
  boo: "Boo",
  sadtrombone: "Sad trombone",
  ding: "Ding",
  crickets: "Crickets",
  fart: "Fart",
} as const;
export type SfxId = keyof typeof SFX;

let ctx: AudioContext | undefined;
function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, t0: number, dur: number, opts: { f1?: number; gain?: number; attack?: number; release?: number; vibrato?: number; lp?: number } = {}) {
  const { f1 = f0, gain = 0.3, attack = 0.01, release = 0.05, vibrato = 0, lp } = opts;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + dur - release);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  let node: AudioNode = o;
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  if (vibrato) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 6;
    const lg = c.createGain();
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  node.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur);
}

function hit(c: AudioContext, out: AudioNode, t0: number, dur: number, gain: number, filter?: { type: BiquadFilterType; f: number; q?: number }) {
  const n = noise(c, dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  let node: AudioNode = n;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.f;
    f.Q.value = filter.q ?? 1;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  n.start(t0);
  n.stop(t0 + dur);
}

const synth: Record<SfxId, (c: AudioContext, out: AudioNode, t: number) => void> = {
  airhorn(c, out, t) {
    for (const d of [-4, 0, 5]) tone(c, out, "sawtooth", 440 + d, t, 1.3, { f1: 410 + d, gain: 0.18, attack: 0.03, release: 0.25, lp: 2500 });
  },
  tada(c, out, t) {
    tone(c, out, "square", 523, t, 0.18, { gain: 0.12 });
    tone(c, out, "square", 659, t, 0.18, { gain: 0.1 });
    for (const f of [784, 988, 1175]) tone(c, out, "square", f, t + 0.2, 0.9, { gain: 0.09, release: 0.5 });
  },
  rimshot(c, out, t) {
    tone(c, out, "sine", 220, t, 0.12, { f1: 50, gain: 0.6, attack: 0.002 });
    hit(c, out, t, 0.08, 0.5, { type: "highpass", f: 2000 });
    hit(c, out, t + 0.11, 0.15, 0.4, { type: "bandpass", f: 4000, q: 0.7 });
  },
  drumroll(c, out, t) {
    for (let i = 0; i < 48; i++) hit(c, out, t + i * 0.028, 0.05, 0.25 + i * 0.006, { type: "bandpass", f: 1800, q: 0.8 });
    hit(c, out, t + 1.4, 1.2, 0.5, { type: "highpass", f: 5000 });
  },
  applause(c, out, t) {
    for (let i = 0; i < 120; i++) {
      const at = t + Math.random() * 2.2;
      hit(c, out, at, 0.03 + Math.random() * 0.04, 0.08 + Math.random() * 0.12, { type: "bandpass", f: 1500 + Math.random() * 3000, q: 0.5 });
    }
  },
  boo(c, out, t) {
    for (const d of [0, 7, 13, 21]) tone(c, out, "sawtooth", 165 + d, t, 1.4, { f1: 140 + d, gain: 0.1, attack: 0.15, release: 0.5, vibrato: 4, lp: 700 });
  },
  sadtrombone(c, out, t) {
    const notes = [233, 220, 208];
    notes.forEach((f, i) => tone(c, out, "sawtooth", f, t + i * 0.42, 0.38, { gain: 0.2, attack: 0.03, lp: 1200 }));
    tone(c, out, "sawtooth", 196, t + 1.26, 1.4, { f1: 170, gain: 0.2, attack: 0.03, release: 0.6, vibrato: 6, lp: 1200 });
  },
  ding(c, out, t) {
    tone(c, out, "sine", 1319, t, 1.4, { gain: 0.3, attack: 0.002, release: 1.2 });
    tone(c, out, "sine", 2637, t, 0.7, { gain: 0.1, attack: 0.002, release: 0.6 });
  },
  crickets(c, out, t) {
    for (let k = 0; k < 6; k++) {
      const start = t + k * 0.45;
      for (let i = 0; i < 5; i++) tone(c, out, "sine", 4300, start + i * 0.035, 0.02, { gain: 0.12, attack: 0.003, release: 0.01 });
    }
  },
  fart(c, out, t) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.6);
    const lfo = c.createOscillator();
    lfo.frequency.value = 28;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.linearRampToValueAtTime(0, t + 0.65);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    lfo.connect(lg).connect(g.gain);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.7);
    lfo.stop(t + 0.7);
  },
};

export function playSfx(id: SfxId, volume = 1) {
  const c = ac();
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);
  synth[id](c, master, c.currentTime + 0.02);
}
