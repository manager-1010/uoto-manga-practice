/* Local reader audio: original short effects and the reader-supplied theme.
   Nothing loads or plays until the trusted sound-toggle click. */
(() => {
  'use strict';
  const host = document.querySelector('.reader-help');
  if (!host) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'comic-sound-toggle';
  button.setAttribute('aria-pressed', 'false');
  host.append(button);
  const musicVolume = .045;
  function makeMusicElement() {
    const audio=document.createElement('audio');
    audio.className='comic-background-audio';audio.loop=true;audio.preload='none';audio.hidden=true;
    audio.setAttribute('aria-hidden','true');
    // Native media volume is not reliable on all mobile browsers. Attenuate
    // once, through musicGain, while retaining the element's default volume.
    audio.volume=1;audio.dataset.bgBaseGain=String(musicVolume);
    return audio;
  }
  let music = makeMusicElement();
  const status = document.createElement('span');
  status.className = 'comic-sound-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  host.append(music,status);
  const words = {
    'zh-Hant': {off:'開啟音效', on:'音效已開', offHint:'開啟細聲主題曲及翻頁、起跑、衝擊音效', onHint:'關閉主題曲及全部音效', unsupported:'這個瀏覽器不支援音效', blocked:'音效暫時無法開啟', loading:'正在載入主題曲…', musicBlocked:'主題曲未能開始播放；請關閉音效後再開啟。', musicError:'主題曲暫時無法播放，短音效仍可使用。'},
    en: {off:'Enable sound', on:'Sound on', offHint:'Enable the quiet theme and page, start and impact sounds', onHint:'Mute the theme and all sound effects', unsupported:'Sound is unavailable in this browser', blocked:'Sound could not be enabled', loading:'Loading the theme…', musicBlocked:'The theme could not start. Turn sound off and on to retry.', musicError:'The theme is unavailable. Short sound effects remain enabled.'},
    ja: {off:'音を入れる', on:'音 入', offHint:'小さな音量の主題歌とページ・スタート・衝撃の効果音を入れる', onHint:'主題歌とすべての効果音を消す', unsupported:'このブラウザーでは効果音を使えません', blocked:'音声を開始できませんでした', loading:'主題歌を読み込み中…', musicBlocked:'主題歌を再生できませんでした。音を一度切ってから、もう一度入れてください。', musicError:'主題歌を再生できません。短い効果音は引き続き使えます。'}
  };
  const specifications = {
    page:{duration:.22, level:.32, cooldown:.14},
    prepare:{duration:.28, level:.36, cooldown:.3},
    start:{duration:.36, level:.72, cooldown:.4},
    impact:{duration:.62, level:.78, cooldown:.48}
  };
  let context = null, master = null, analyser = null, musicSource = null, musicGain = null;
  let enabled = false, desiredEnabled = false, blocked = false, generation = 0, peak = 0;
  let musicState = 'off';
  const active = new Set();
  const buffers = {};
  const playCounts = {page:0, start:0, impact:0, prepare:0};
  const lastPlayed = {page:-Infinity, start:-Infinity, impact:-Infinity, prepare:-Infinity};
  const smooth = value => { const x=Math.max(0,Math.min(1,value)); return x*x*(3-2*x); };
  function wording() { return words[document.documentElement.lang] || words['zh-Hant']; }
  function render() {
    const copy = wording();
    button.textContent = desiredEnabled ? copy.on : copy.off;
    button.setAttribute('aria-pressed', String(desiredEnabled));
    button.dataset.soundEnabled = String(enabled);
    button.dataset.soundRequested = String(desiredEnabled);
    button.dataset.bgState = musicState;
    music.dataset.bgState = musicState;
    music.dataset.bgRequested = String(desiredEnabled);
    music.dataset.bgLoop = String(music.loop);
    music.dataset.bgVolume = String(music.volume);
    music.dataset.bgGain = String(musicGain?.gain.value||0);
    button.disabled = !AudioContextClass;
    button.title = !AudioContextClass ? copy.unsupported : blocked ? copy.blocked : desiredEnabled ? copy.onHint : copy.offHint;
    button.setAttribute('aria-label', button.title);
    status.textContent = musicState==='loading'?copy.loading:musicState==='blocked'?copy.musicBlocked:musicState==='error'?copy.musicError:'';
    status.hidden = !status.textContent || !desiredEnabled;
  }
  function stopMusic() {
    music.pause();
    if(musicGain&&context){
      musicGain.gain.cancelScheduledValues(context.currentTime);
      musicGain.gain.setValueAtTime(0,context.currentTime);
    }
    music.dataset.bgTargetGain='0';
    musicState='off';
  }
  function startMusic(request) {
    const requestedMusic=music;
    if(!requestedMusic.getAttribute('src'))requestedMusic.src='public/assets/audio/100m-rashisa.mp3';
    musicState='loading';
    requestedMusic.dataset.bgError='';
    const current=()=>request===generation&&desiredEnabled&&!document.hidden&&requestedMusic===music;
    try {
      const promise=requestedMusic.play();
      Promise.resolve(promise).then(()=>{
        // A stale play promise must never restart playback after Off. A new On
        // may already be playing this same element, so do not pause that run.
        if(!current()) {
          if(requestedMusic!==music||!desiredEnabled||document.hidden)requestedMusic.pause();
          return;
        }
        musicState=requestedMusic.paused?'blocked':'playing';render();
      }).catch(error=>{
        if(!current())return;
        musicState=error?.name==='NotAllowedError'?'blocked':'error';
        requestedMusic.dataset.bgError=error?.name||'PlaybackError';render();
      });
    } catch(error) {
      if(!current())return;
      musicState=error?.name==='NotAllowedError'?'blocked':'error';
      requestedMusic.dataset.bgError=error?.name||'PlaybackError';
    }
  }
  function bindMusicEvents(audio) {
    audio.addEventListener('playing',()=>{
      if(audio!==music||!desiredEnabled||document.hidden){audio.pause();return;}
      musicState='playing';render();
    });
    audio.addEventListener('error',()=>{
      if(audio!==music||!desiredEnabled)return;
      musicState='error';audio.dataset.bgError=String(audio.error?.code||'MediaError');render();
    });
    audio.addEventListener('waiting',()=>{
      if(audio!==music||!desiredEnabled)return;
      musicState='loading';render();
    });
    audio.addEventListener('timeupdate',()=>{
      if(audio===music)audio.dataset.bgGain=String(musicGain?.gain.value||0);
    });
  }
  bindMusicEvents(music);
  function makeSamples(kind, rate, variant) {
    const specification=specifications[kind];
    const samples=new Float32Array(Math.ceil(rate*specification.duration));
    let seed=731+variant*311+(kind==='page'?17:kind==='prepare'?53:kind==='start'?97:193);
    let low=0, mid=0, high=0, air=0, dc=0, maximum=0;
    const lowCoefficient=1-Math.exp(-2*Math.PI*190/rate);
    const midCoefficient=1-Math.exp(-2*Math.PI*950/rate);
    const highCoefficient=1-Math.exp(-2*Math.PI*4300/rate);
    const dcCoefficient=1-Math.exp(-2*Math.PI*18/rate);
    for(let i=0;i<samples.length;i++) {
      const t=i/rate;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const white=seed/4294967296*2-1;
      low+=(white-low)*lowCoefficient;
      mid+=(white-mid)*midCoefficient;
      high+=(white-high)*highCoefficient;
      const band=mid-low, crack=high-mid;
      let value=0;
      if(kind==='page') {
        const fold=(Math.exp(-Math.pow((t-.052)/.027,2))+.48*Math.exp(-Math.pow((t-.122)/.036,2)));
        value=(band*.62+crack*.20)*fold;
      } else if(kind==='prepare') {
        // A short breath gathers before the character arrives. No pitched sweep.
        const gather=Math.pow(smooth(t/.19),1.5)*(1-smooth((t-.19)/.09));
        air+=(band-air)*.14;
        value=(band*.74+crack*.07+air*.4)*gather;
      } else {
        const strong=kind==='impact';
        const attack=smooth(t/(strong?.0045:.003));
        const bodyDecay=Math.exp(-t/(strong?.15:.079));
        // Fixed, inharmonic drum modes rather than a laser-like pitch drop.
        const body=(Math.sin(2*Math.PI*58*t)*.52+Math.sin(2*Math.PI*91*t+.3)*.23+Math.sin(2*Math.PI*147*t+.7)*.14)*bodyDecay;
        const knock=(Math.sin(2*Math.PI*211*t)+.42*Math.sin(2*Math.PI*337*t+.2))*Math.exp(-t/.023)*.15;
        const grit=(low*.9+band*.54)*Math.exp(-t/(strong?.081:.042));
        const snap=crack*Math.exp(-t/(strong?.012:.009))*(strong?.19:.24);
        const room=strong?(low*.32+band*.11)*Math.exp(-t/.17)*smooth((t-.018)/.012):0;
        value=(body+knock+grit+snap+room)*attack;
      }
      // Remove DC and use sample-domain end fades, including at 44.1/48/96 kHz.
      dc+=(value-dc)*dcCoefficient;
      const fade=smooth(t/.0025)*(1-smooth((t-(specification.duration-.04))/.04));
      const shaped=Math.tanh((value-dc)*1.45)*fade;
      samples[i]=shaped; maximum=Math.max(maximum,Math.abs(shaped));
    }
    const gain=maximum?specification.level/maximum:0;
    for(let i=0;i<samples.length;i++) samples[i]*=gain;
    return samples;
  }
  function createGraph() {
    // A media element can only be attached once. Closed contexts are not used
    // by normal reading, but rebuilding one must also replace its old element.
    if(context?.state==='closed'&&musicSource){
      stopMusic();
      const previousMusic=music;music=makeMusicElement();
      previousMusic.replaceWith(music);bindMusicEvents(music);musicSource=null;
    }
    context = new AudioContextClass({latencyHint:'interactive'});
    for(const kind of Object.keys(lastPlayed)) lastPlayed[kind]=-Infinity;
    master = context.createGain();
    master.gain.value = 0;
    // Smooth limiting is a ceiling for simultaneous page/prepare/impact voices.
    const limiter=context.createWaveShaper();
    const curve=new Float32Array(4097);
    for(let i=0;i<curve.length;i++) {
      const x=i/(curve.length-1)*2-1, magnitude=Math.abs(x);
      curve[i]=Math.sign(x)*(magnitude<=.68?magnitude:.68+.17*Math.tanh((magnitude-.68)/.17));
    }
    limiter.curve=curve; limiter.oversample='2x';
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    master.connect(limiter); limiter.connect(analyser); analyser.connect(context.destination);
    musicSource=context.createMediaElementSource(music);
    musicGain=context.createGain();musicGain.gain.value=0;
    musicSource.connect(musicGain);musicGain.connect(context.destination);
    for(const kind of Object.keys(specifications)) {
      buffers[kind]=[];
      for(let variant=0;variant<3;variant++) {
        const samples=makeSamples(kind,context.sampleRate,variant);
        const buffer=context.createBuffer(1,samples.length,context.sampleRate);
        buffer.getChannelData(0).set(samples); buffers[kind].push(buffer);
      }
    }
  }
  function release(item, now) {
    // Fade the individual voice so an immediate next page can still sound.
    if(item.released) return;
    item.released=true;
    item.gain.gain.cancelScheduledValues(now);
    item.gain.gain.setValueAtTime(item.gain.gain.value,now);
    item.gain.gain.linearRampToValueAtTime(0,now+.008);
    try { item.source.stop(now+.01); } catch {}
  }
  function stop(immediate=false) {
    if(!context) return;
    for(const item of [...active]) {
      if(!immediate) { release(item,context.currentTime); continue; }
      try {item.source.stop(context.currentTime);item.source.disconnect();item.gain.disconnect();} catch {}
      active.delete(item);
    }
  }
  function mute(immediate=false) {
    generation++; desiredEnabled=false; enabled=false; stopMusic();stop(immediate);
    if(master&&context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(master.gain.value,context.currentTime);
      master.gain.linearRampToValueAtTime(0,context.currentTime+.01);
    }
    render();
  }
  function play(requestedKind) {
    const kind=requestedKind==='balloon'?'prepare':requestedKind;
    if (!Object.prototype.hasOwnProperty.call(playCounts,kind) || !enabled || !context || context.state!=='running' || document.hidden) return false;
    const now=context.currentTime, specification=specifications[kind];
    if(now-lastPlayed[kind]<specification.cooldown) return false;
    // Rapid navigation cannot accumulate an ever-louder stack of impacts.
    if(kind==='start'||kind==='impact') {
      for(const item of [...active]) if(item.kind==='start'||item.kind==='impact') release(item,now);
    }
    const live=[...active].filter(item=>!item.released);
    if(live.length>=4) release(live[0],now);
    const source=context.createBufferSource();
    source.buffer=buffers[kind][playCounts[kind]%buffers[kind].length];
    const gain=context.createGain(); gain.gain.value=1;
    source.connect(gain); gain.connect(master);
    const item={kind,source,gain}; active.add(item);
    source.onended=()=>{active.delete(item);try{source.disconnect();gain.disconnect();}catch{}};
    source.start(now+.005); source.stop(now+.005+source.buffer.duration);
    lastPlayed[kind]=now; playCounts[kind]++;
    return true;
  }
  button.addEventListener('click', async event => {
    if (!event.isTrusted || !AudioContextClass) return;
    if (desiredEnabled) { mute(); return; }
    const request=++generation; desiredEnabled=true;blocked=false;
    try {
      if (!context || context.state==='closed') createGraph();
      // Both requests originate in this same trusted click. Waiting for a slow
      // AudioContext resume first can otherwise lose media user activation.
      const resume=context.state!=='running'?context.resume():Promise.resolve();
      startMusic(request);render();
      await resume;
      if (request!==generation || !desiredEnabled || document.hidden) return;
      enabled=context.state==='running'; blocked=!enabled;
      if(enabled) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(0,context.currentTime);
        master.gain.linearRampToValueAtTime(.62,context.currentTime+.012);
        musicGain.gain.cancelScheduledValues(context.currentTime);
        musicGain.gain.setValueAtTime(musicGain.gain.value,context.currentTime);
        musicGain.gain.linearRampToValueAtTime(musicVolume,context.currentTime+.12);
        music.dataset.bgTargetGain=String(musicVolume);
      }
      if(!enabled){desiredEnabled=false;stopMusic();}
    } catch {
      if(request!==generation)return;
      enabled=false;desiredEnabled=false;blocked=true;stopMusic();
    }
    render();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    mute(true);
    if(context?.state==='running') context.suspend().catch(()=>{});
  });
  window.addEventListener('pagehide', ()=>mute(true));
  window.addEventListener('manga:languagechange', render);
  window.comicSound = Object.freeze({
    play,
    stop,
    getState() {
      let rms=0;
      if(analyser&&context?.state==='running') {
        const samples=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
        let sum=0;for(const sample of samples){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}rms=Math.sqrt(sum/samples.length);
      }
      return {enabled,contextState:context?.state||'not-created',playCounts:{...playCounts},activeVoices:[...active].filter(item=>!item.released).length,rms,peak};
    }
  });
  render();
})();
