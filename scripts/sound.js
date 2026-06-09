/* Cyrus OS — System SFX.
   A tiny Web Audio synth: every cue is generated from oscillators, so there are
   zero audio files to ship or cache. Voices use a soft exponential envelope and
   a slight detuned "shimmer" layer to match the brass / holographic HUD.

   Mute is DEVICE-LOCAL (localStorage, not synced) — you may want sound on the
   desktop and off on the phone. The AudioContext is created lazily and resumed
   on the first cue; that first cue must originate from a user gesture (opening
   the System, toggling mute), which satisfies the browser autoplay policy. */
(function(){
  const LS_KEY = 'cyrus_sfx_muted';
  let ctx = null, master = null;
  let muted = (localStorage.getItem(LS_KEY) === '1');

  function ensure(){
    if(ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx = new AC(); }catch(e){ return null; }
    master = ctx.createGain();
    master.gain.value = 0.20;                 // global headroom — keep it subtle
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 7600;   // shave harsh highs
    const comp = ctx.createDynamicsCompressor();      // tame stacked chords
    master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    return ctx;
  }
  function resume(){ if(ctx && ctx.state === 'suspended'){ try{ ctx.resume(); }catch(e){} } }

  // one enveloped oscillator voice
  function voice(t0, n){
    const dur = n.dur || 0.18, atk = n.attack || 0.006, rel = n.release || 0.12;
    const o = ctx.createOscillator();
    o.type = n.type || 'sine';
    o.frequency.setValueAtTime(n.freq, t0);
    if(n.slideTo) o.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + dur);
    if(n.detune) o.detune.value = n.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain || 0.6, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }

  // schedule a list of notes ({at, freq, dur, type, gain, slideTo, shimmer})
  function seq(notes){
    if(muted || !ensure()) return;
    resume();
    const t = ctx.currentTime + 0.02;
    for(const n of notes){
      voice(t + (n.at || 0), n);
      if(n.shimmer) voice(t + (n.at || 0), Object.assign({}, n, {
        detune:(n.detune || 0) + 9, gain:(n.gain || 0.6) * 0.5, type:'triangle'
      }));
    }
  }

  const Sfx = {
    get muted(){ return muted; },
    setMuted(v){ muted = !!v; try{ localStorage.setItem(LS_KEY, muted ? '1' : '0'); }catch(e){} },
    toggle(){ this.setMuted(!muted); return muted; },

    // opening the System — soft holographic boot, rising fifth + shimmer
    open(){ seq([
      {at:0,    freq:392, dur:0.10, type:'sine', gain:0.45, shimmer:true},
      {at:0.08, freq:587, dur:0.16, type:'sine', gain:0.60, shimmer:true, slideTo:622},
    ]); },
    // closing — a soft downward blip
    close(){ seq([{at:0, freq:330, dur:0.07, type:'sine', gain:0.35, slideTo:247}]); },
    // EXP gained — tiny confirm blip
    toast(){ seq([{at:0, freq:880, dur:0.05, type:'triangle', gain:0.45, release:0.06}]); },
    // daily challenge / quest cleared — two-note up
    quest(){ seq([
      {at:0,    freq:659, dur:0.07, type:'triangle', gain:0.55},
      {at:0.07, freq:988, dur:0.13, type:'triangle', gain:0.65},
    ]); },
    // LEVEL UP — ascending triad fanfare topped by a ringing octave
    levelup(){ seq([
      {at:0,    freq:523,  dur:0.10, type:'sawtooth', gain:0.42, shimmer:true},
      {at:0.10, freq:659,  dur:0.10, type:'sawtooth', gain:0.46, shimmer:true},
      {at:0.20, freq:784,  dur:0.14, type:'sawtooth', gain:0.50, shimmer:true},
      {at:0.30, freq:1047, dur:0.30, type:'sine',     gain:0.62, shimmer:true, release:0.4},
    ]); },
    // RANK UP — rarer, bigger: sub-bass + chord swell
    rankup(){ seq([
      {at:0,    freq:131,  dur:0.55, type:'sine',     gain:0.62, release:0.4},   // sub
      {at:0,    freq:523,  dur:0.40, type:'sawtooth', gain:0.42, shimmer:true},
      {at:0.12, freq:659,  dur:0.40, type:'sawtooth', gain:0.44, shimmer:true},
      {at:0.24, freq:880,  dur:0.50, type:'sine',     gain:0.60, shimmer:true, release:0.5},
      {at:0.40, freq:1318, dur:0.45, type:'sine',     gain:0.50, shimmer:true, release:0.5},
    ]); },
    // achievement / hidden quest — clean bell-like two-tone
    achievement(){ seq([
      {at:0,    freq:1175, dur:0.10, type:'sine', gain:0.45, shimmer:true},
      {at:0.10, freq:1568, dur:0.30, type:'sine', gain:0.58, shimmer:true, release:0.4},
    ]); },
    // penalty / debuff — low ominous downward slide
    penalty(){ seq([
      {at:0,    freq:196, dur:0.18, type:'sawtooth', gain:0.45, slideTo:147},
      {at:0.14, freq:131, dur:0.30, type:'sawtooth', gain:0.42, slideTo:98, release:0.3},
    ]); },
  };

  window.Sfx = Sfx;
  // mute toggle used by the speaker control in the System title bar
  window.sfxToggleMute = function(btn){
    const m = Sfx.toggle();
    if(btn) btn.classList.toggle('sfx-muted', m);
    if(!m) Sfx.open();   // little confirmation chirp when turning sound back on
  };
})();
