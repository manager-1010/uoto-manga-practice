(() => {
  'use strict';
  const surface=document.querySelector('#comic-book');
  const stage=document.querySelector('.book-stage');
  const replay=document.querySelector('.motion-replay');
  const preference=window.mangaDrawing.reducedMotion;
  const scenes=[{name:'opening',duration:2000},{name:'race',duration:0},{name:'belief',duration:1800},{name:'resolve',duration:1650},{name:'ambition',duration:1600},{name:'reflection',duration:1150},{name:'quotation',duration:1600},{name:'ending',duration:2000}];
  const leaves=[...surface.querySelectorAll(':scope > .leaf')];
  let scene=null,pageKey='',state='read',elapsed=0,previousTime=0,frame=0;
  function paint(progress=1){
    const rest=Math.pow(1-progress,3),late=Math.pow(1-Math.max(0,(progress-.15)/.85),3);
    const flare=Math.max(0,Math.min(1,(.74-progress)/.24));
    for(const target of [surface,stage]){
      target.style.setProperty('--scene-rest',rest.toFixed(5));
      target.style.setProperty('--scene-late-rest',late.toFixed(5));
      target.style.setProperty('--scene-flare',flare.toFixed(5));
    }
    surface.dataset.motionPlaying=String(progress<1&&!preference.matches&&state==='read'&&!document.hidden);
  }
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;previousTime=0;surface.dataset.motionPlaying='false';}
  function canPlay(){return scene&&state==='read'&&!preference.matches&&!document.hidden;}
  function tick(time){
    frame=0;if(!canPlay())return;
    if(previousTime)elapsed+=Math.min(time-previousTime,80);previousTime=time;
    const progress=Math.min(1,elapsed/scene.duration);paint(progress);
    if(progress<1)frame=requestAnimationFrame(tick);else previousTime=0;
  }
  function resume(){if(canPlay()&&elapsed<scene.duration&&!frame)frame=requestAnimationFrame(tick);}
  function restart(){stop();elapsed=0;if(preference.matches||!scene?.duration){paint();return;}paint(0);resume();}
  window.comicMotion={
    sync(page,spread,nextState){
      const sceneName=leaves[page]?.dataset.scene;
      const nextScene=scenes.find(item=>item.name===sceneName);
      const nextKey=nextScene?`${nextScene.name}-${spread?'spread':page}`:'';
      const changed=nextKey!==pageKey;
      state=nextState;
      if(changed){stop();scene=nextScene;pageKey=nextKey;elapsed=0;if(scene)preference.matches||!scene.duration?paint():paint(0);}
      replay.hidden=!scene||preference.matches;replay.disabled=state!=='read';
      if(preference.matches){paint();stop();}else if(!canPlay())stop();else resume();
    },
    selection(){if(scene?.name==='reflection')restart();}
  };
  replay.addEventListener('click',restart);
  preference.addEventListener('change',()=>{stop();if(preference.matches){paint();replay.hidden=true;}else{replay.hidden=!scene;restart();}});
  document.addEventListener('visibilitychange',()=>{document.hidden?stop():resume();});
})();
