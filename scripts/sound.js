/* Cyrus OS — System SFX.
   A tiny Web Audio synth: every cue is generated from oscillators + filtered
   noise, so there are zero audio files to ship or cache. The engine adds a
   procedurally-generated convolution reverb (decaying-noise impulse) so cues
   can sit "in space" — the brass / holographic HUD feel — plus per-cue
   stereo placement, random micro-detune on frequent cues, and rate-gating
   so rapid clicking never machine-guns.

   Volume hierarchy (quiet → loud, approximate — the compressor narrows it):
     tab < tick/untick < close < toast ≈ notice ≈ save < quest < open
       ≈ achievement < perfect < levelup < lowday/cross < rankup

   Mute is DEVICE-LOCAL (localStorage, not synced) — you may want sound on the
   desktop and off on the phone. The AudioContext is created lazily and resumed
   on the first cue; that first cue must originate from a user gesture (opening
   the System, ticking a box), which satisfies the browser autoplay policy. */
(function(){
  const LS_KEY = 'cyrus_sfx_muted';
  let ctx = null, master = null, verb = null;
  let noiseBuf = null;
  let muted = (localStorage.getItem(LS_KEY) === '1');

  /* Gesture gate: until the user has actually touched the page, refuse to
     schedule ANY audio. Without this, a load-time code path (e.g. arriving on
     #system, or a realtime sync pop) schedules notes into a still-suspended
     AudioContext — and they all fire at once, stale, on the first real click.
     The handler ALSO eagerly creates+resumes the context (pointerdown IS a
     user gesture), so later async cues (realtime notices) find it running —
     Safari/iOS won't resume outside a gesture stack, and re-running it on
     every gesture self-heals iOS's non-standard 'interrupted' state. */
  let interacted = false, lastGestureTs = 0;
  function markInteracted(){
    interacted = true; lastGestureTs = Date.now();
    if(!muted && ensure()) resume();
  }
  window.addEventListener('pointerdown', markInteracted, { capture:true, passive:true });
  window.addEventListener('keydown', markInteracted, { capture:true });

  function ensure(){
    if(ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx = new AC(); }catch(e){ return null; }
    master = ctx.createGain();
    // NOTE: the compressor below adds an unavoidable spec-mandated makeup gain
    // (~+10 dB at these settings), so the effective output level is ≈3× this.
    master.gain.value = 0.20;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 8200;   // shave harsh highs
    const comp = ctx.createDynamicsCompressor();      // tame stacked chords
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 5;
    comp.attack.value = 0.004;  comp.release.value = 0.16;
    master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    // Procedural reverb: a 1.3 s decaying-noise impulse, built once. Cues opt
    // in via `verb: 0..1` (a send level) — dry cues stay tactile, spacious
    // cues get the holographic tail.
    try{
      verb = ctx.createConvolver();
      verb.buffer = makeImpulse(1.3, 2.8);
      verb.connect(master);
    }catch(e){ verb = null; }
    return ctx;
  }

  function makeImpulse(seconds, decay){
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for(let ch = 0; ch < 2; ch++){
      const d = buf.getChannelData(ch);
      for(let i = 0; i < len; i++){
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeNoise(){
    if(noiseBuf) return noiseBuf;
    const rate = ctx.sampleRate, len = Math.floor(rate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, rate);
    const d = noiseBuf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function resume(){
    // state !== 'running' also covers iOS Safari's non-standard 'interrupted';
    // resume() returns a promise — swallow its rejection (NotAllowedError
    // outside a gesture) or it spams unhandled-rejection noise.
    if(ctx && ctx.state !== 'running'){
      try{ const p = ctx.resume(); if(p && p.catch) p.catch(()=>{}); }catch(e){}
    }
  }

  /* Rate gate: frequent cues (tick/tab) refuse to re-fire within `ms`.
     Keeps fast clicking from stacking into a machine gun. */
  const _last = Object.create(null);
  function gate(key, ms){
    const now = Date.now();
    if(_last[key] && now - _last[key] < ms) return false;
    _last[key] = now; return true;
  }

  /* Route an enveloped node to master, with optional pan + reverb send. */
  function route(node, t0, n){
    let out = node;
    if(n.pan && ctx.createStereoPanner){
      const p = ctx.createStereoPanner(); p.pan.value = n.pan;
      node.connect(p); out = p;
    }
    out.connect(master);
    if(n.verb && verb){
      const w = ctx.createGain(); w.gain.value = n.verb;
      out.connect(w); w.connect(verb);
    }
  }

  // one enveloped oscillator voice
  function voice(t0, n){
    const dur = n.dur || 0.18, atk = n.attack || 0.006, rel = n.release || 0.12;
    const o = ctx.createOscillator();
    o.type = n.type || 'sine';
    o.frequency.setValueAtTime(n.freq, t0);
    if(n.slideTo) o.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + dur);
    if(n.detune) o.detune.value = n.detune;
    if(n.vib){            // gentle vibrato on held notes (cents via detune LFO)
      const lfo = ctx.createOscillator(); lfo.frequency.value = n.vibHz || 5.5;
      const lg = ctx.createGain(); lg.gain.value = n.vib;
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start(t0); lfo.stop(t0 + dur + rel + 0.02);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain || 0.6, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    o.connect(g);
    route(g, t0, n);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }

  // one filtered-noise voice — transients, sweeps, air
  function nVoice(t0, n){
    const dur = n.dur || 0.05, atk = n.attack || 0.003, rel = n.release || 0.05;
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(); src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = n.fType || 'bandpass';
    f.frequency.setValueAtTime(n.f0 || 1800, t0);
    if(n.f1) f.frequency.exponentialRampToValueAtTime(n.f1, t0 + dur);
    f.Q.value = n.q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain || 0.3, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    src.connect(f); f.connect(g);
    route(g, t0, n);
    src.start(t0); src.stop(t0 + dur + rel + 0.02);
  }

  // schedule oscillator notes ({at, freq, dur, type, gain, slideTo, shimmer, verb, pan, vib})
  function seq(notes){
    if(muted || !interacted || !ensure()) return;
    resume();
    // never schedule into a frozen (suspended) timeline unless a gesture just
    // happened (its resume() is still in flight) — prevents stale-cue bursts
    if(ctx.state !== 'running' && Date.now() - lastGestureTs > 1000) return;
    const t = ctx.currentTime + 0.02;
    for(const n of notes){
      voice(t + (n.at || 0), n);
      if(n.shimmer) voice(t + (n.at || 0), Object.assign({}, n, {
        detune:(n.detune || 0) + 9, gain:(n.gain || 0.6) * 0.5, type:'triangle'
      }));
    }
  }

  // schedule noise bursts ({at, f0, f1, q, fType, dur, gain, verb, pan})
  function seqN(noises){
    if(muted || !interacted || !ensure()) return;
    resume();
    if(ctx.state !== 'running' && Date.now() - lastGestureTs > 1000) return;
    const t = ctx.currentTime + 0.02;
    for(const n of noises) nVoice(t + (n.at || 0), n);
  }

  const Sfx = {
    get muted(){ return muted; },
    setMuted(v){ muted = !!v; try{ localStorage.setItem(LS_KEY, muted ? '1' : '0'); }catch(e){} },
    toggle(){ this.setMuted(!muted); return muted; },

    /* ── micro-interactions (dry, tactile, rate-gated) ── */

    // checklist item CHECKED — 2 ms noise click + glass pip, ±2.5 % random
    // pitch so a run of checks sounds organic instead of mechanical
    tick(){
      if(!gate('tick', 55)) return;
      const v = 1 + (Math.random() * 0.05 - 0.025);
      seqN([{at:0, f0:2600, f1:4200, dur:0.018, gain:0.26, q:1.0}]);
      seq([{at:0.004, freq:1318 * v, dur:0.045, type:'sine', gain:0.32, release:0.07}]);
    },
    // checklist item UNCHECKED — duller, lower, quieter (an undo, not a reward)
    untick(){
      if(!gate('tick', 55)) return;
      seq([{at:0, freq:620, dur:0.04, type:'sine', gain:0.20, slideTo:520, release:0.05}]);
    },
    // System tab switch — dry micro click, the quietest cue in the set.
    // 130 ms gate: held arrow-key repeat must not become a click zipper.
    tab(){
      if(!gate('tab', 130)) return;
      seqN([{at:0, f0:1900, dur:0.014, gain:0.16, q:1.4}]);
    },

    /* ── panel / ambient ── */

    // opening the System — holographic boot: noise sweep up + rising fifth
    open(){
      seqN([{at:0, f0:300, f1:2400, dur:0.16, gain:0.16, q:2.5, verb:0.5}]);
      seq([
        {at:0.02, freq:392, dur:0.10, type:'sine', gain:0.42, shimmer:true, verb:0.40},
        {at:0.10, freq:587, dur:0.16, type:'sine', gain:0.55, shimmer:true, slideTo:622, verb:0.55, pan:0.15},
      ]);
    },
    // closing — soft downward blip + tiny noise exhale
    close(){
      seq([{at:0, freq:330, dur:0.07, type:'sine', gain:0.32, slideTo:247, verb:0.30}]);
      seqN([{at:0.01, f0:1600, f1:340, dur:0.10, gain:0.09, q:1.8}]);
    },

    /* ── progress / rewards ── */

    // EXP gained — glassy micro-bell (fundamental + faint high partial)
    toast(){ seq([
      {at:0, freq:880,  dur:0.05, type:'triangle', gain:0.38, release:0.08, verb:0.35},
      {at:0, freq:2430, dur:0.04, type:'sine',     gain:0.09, release:0.10, verb:0.50},
    ]); },
    // daily challenge / quest cleared — two-note up + a sparkle an octave above
    quest(){ seq([
      {at:0,    freq:659,  dur:0.07, type:'triangle', gain:0.46, verb:0.30},
      {at:0.07, freq:988,  dur:0.13, type:'triangle', gain:0.52, verb:0.45},
      {at:0.10, freq:1976, dur:0.10, type:'sine',     gain:0.13, verb:0.60, pan:0.2},
    ]); },
    // perfect day (5/5 The 90 targets) — compact bright flourish, smaller than
    // levelup but unmistakably a celebration. Starts on C (523), a third below
    // quest's opener, so the two never blur in the first 100 ms.
    perfect(){
      seq([
        {at:0,    freq:523,  dur:0.07, type:'triangle', gain:0.45, verb:0.30},
        {at:0.07, freq:659,  dur:0.07, type:'triangle', gain:0.48, verb:0.35},
        {at:0.14, freq:784,  dur:0.08, type:'triangle', gain:0.52, verb:0.40},
        {at:0.22, freq:1319, dur:0.26, type:'sine',     gain:0.58, shimmer:true, release:0.35, verb:0.60},
      ]);
      seqN([{at:0.20, f0:3000, f1:6500, dur:0.18, gain:0.06, q:1.0, verb:0.7}]);
    },
    // LEVEL UP — ascending triad fanfare topped by a ringing octave w/ vibrato
    levelup(){ seq([
      {at:0,    freq:523,  dur:0.10, type:'sawtooth', gain:0.42, shimmer:true, verb:0.30},
      {at:0.10, freq:659,  dur:0.10, type:'sawtooth', gain:0.46, shimmer:true, verb:0.35},
      {at:0.20, freq:784,  dur:0.14, type:'sawtooth', gain:0.50, shimmer:true, verb:0.40},
      {at:0.30, freq:1047, dur:0.30, type:'sine',     gain:0.62, shimmer:true, release:0.4, verb:0.60, vib:6, vibHz:5.2},
    ]); },
    // RANK UP — rarer, bigger: noise riser into sub-bass + chord swell
    rankup(){
      seqN([{at:0, f0:240, f1:3200, dur:0.34, gain:0.14, q:2.2, verb:0.55}]);
      seq([
        {at:0.10, freq:131,  dur:0.55, type:'sine',     gain:0.62, release:0.4, verb:0.30},   // sub
        {at:0.10, freq:523,  dur:0.40, type:'sawtooth', gain:0.42, shimmer:true, verb:0.45},
        {at:0.22, freq:659,  dur:0.40, type:'sawtooth', gain:0.44, shimmer:true, verb:0.50, pan:-0.12},
        {at:0.34, freq:880,  dur:0.50, type:'sine',     gain:0.60, shimmer:true, release:0.5, verb:0.60, pan:0.12},
        {at:0.50, freq:1318, dur:0.45, type:'sine',     gain:0.50, shimmer:true, release:0.5, verb:0.70, vib:7, vibHz:5.0},
      ]);
    },
    // achievement / hidden quest — true bell voicing: inharmonic partials
    // (1× / 2.76× / 5.40×, like a real bell) + answering strike a fourth up
    achievement(){
      const f = 1175;
      seq([
        {at:0,    freq:f,        dur:0.30, type:'sine', gain:0.48, release:0.45, verb:0.60},
        {at:0,    freq:f * 2.76, dur:0.20, type:'sine', gain:0.12, release:0.30, verb:0.60},
        {at:0,    freq:f * 5.40, dur:0.10, type:'sine', gain:0.04, release:0.15, verb:0.50},
        {at:0.12, freq:1568,     dur:0.30, type:'sine', gain:0.55, shimmer:true, release:0.45, verb:0.65},
      ]);
    },

    /* ── communication / forms ── */

    // Hermes notice arrives — soft comm ping (double chirp, slightly right)
    notice(){
      if(!gate('notice', 400)) return;
      seq([
        {at:0,    freq:1245, dur:0.05, type:'sine', gain:0.32, verb:0.50},
        {at:0.09, freq:1661, dur:0.09, type:'sine', gain:0.38, verb:0.60, pan:0.18},
      ]);
    },
    // record saved (finance tx etc.) — a falling "stamp" (confirmation, not a
    // progression: descending sine contour keeps it distinct from quest's rise)
    save(){
      if(!gate('save', 200)) return;
      seq([
        {at:0,    freq:740, dur:0.05, type:'sine', gain:0.34},
        {at:0.06, freq:554, dur:0.10, type:'sine', gain:0.38, verb:0.30},
      ]);
    },

    /* ── low day (低谷日) ── */

    // entering low day — somber but kind: a minor-third descent over a low
    // root, heavy reverb. Acknowledgement, not punishment.
    lowday(){ seq([
      {at:0,    freq:294, dur:0.30, type:'sine', gain:0.45, release:0.30, verb:0.60},
      {at:0.22, freq:247, dur:0.45, type:'sine', gain:0.42, release:0.45, verb:0.70},
      {at:0.22, freq:123, dur:0.50, type:'sine', gain:0.28, release:0.45, verb:0.50},
    ]); },
    // 渡 — crossed the low day: rising fourth resolving into a warm A-major
    // chord over a deep root. Relief, not fanfare.
    cross(){ seq([
      {at:0,    freq:330, dur:0.12, type:'sine', gain:0.45, verb:0.40},
      {at:0.12, freq:440, dur:0.16, type:'sine', gain:0.52, verb:0.50},
      {at:0.30, freq:440, dur:0.55, type:'sine', gain:0.40, release:0.5, verb:0.70},
      {at:0.30, freq:554, dur:0.55, type:'sine', gain:0.32, release:0.5, verb:0.70, pan:-0.12},
      {at:0.30, freq:659, dur:0.55, type:'sine', gain:0.28, release:0.5, verb:0.70, pan:0.12},
      {at:0.30, freq:110, dur:0.60, type:'sine', gain:0.28, release:0.5, verb:0.40},
    ]); },
    // blocked action (low-day lock) — muted dull double-thud, very short
    blocked(){
      if(!gate('blocked', 250)) return;
      seq([
        {at:0,    freq:160, dur:0.05, type:'sine', gain:0.38, slideTo:120, release:0.06},
        {at:0.09, freq:140, dur:0.06, type:'sine', gain:0.32, slideTo:100, release:0.08},
      ]);
    },
    // penalty / debuff — low ominous downward slide
    penalty(){ seq([
      {at:0,    freq:196, dur:0.18, type:'sawtooth', gain:0.45, slideTo:147, verb:0.30},
      {at:0.14, freq:131, dur:0.30, type:'sawtooth', gain:0.42, slideTo:98, release:0.3, verb:0.40},
    ]); },
  };

  window.Sfx = Sfx;
  // mute toggle used by the speaker control in the System title bar
  window.sfxToggleMute = function(btn){
    const m = Sfx.toggle();
    if(btn){ btn.classList.toggle('sfx-muted', m); btn.setAttribute('aria-pressed', String(m)); }
    if(!m) Sfx.save();   // little confirmation chirp when turning sound back on
  };
})();
