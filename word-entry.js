/* The real five choices stay in their manga cells. One inert lettering
   projection introduces each word, then lands exactly on its live label. */
(() => {
  'use strict';
  const stage=document.querySelector('.book-stage');
  // PageFlip wraps the original leaves before this deferred script runs.
  const leaf=document.querySelector('#comic-book #words');
  const panels=leaf?.querySelector('.word-panels');
  const heading=leaf?.querySelector('.leaf-content > h2');
  const buttons=panels?[...panels.querySelectorAll('button[data-word]')]:[];
  if(!stage||!leaf||!panels||!heading||buttons.length!==5)return;
  const reduced=window.mangaDrawing?.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)');
  const layer=document.createElement('div');
  layer.className='word-entry-layer';layer.hidden=true;layer.inert=true;layer.setAttribute('aria-hidden','true');
  layer.dataset.state='idle';layer.dataset.phase='idle';layer.dataset.index='0';
  // A separate, non-focusable curtain receives taps during the question. A tap
  // dismisses it instead of accidentally selecting a choice hidden behind it.
  const backdrop=document.createElement('div');backdrop.className='word-entry-backdrop';backdrop.hidden=true;backdrop.setAttribute('aria-hidden','true');
  const ink=document.createElement('canvas');ink.className='word-entry-ink';ink.setAttribute('aria-hidden','true');backdrop.append(ink);
  let inkContext=null;try{inkContext=ink.getContext?.('2d')||null;}catch{}
  const prompt=document.createElement('div');prompt.className='word-entry-prompt';
  const word=document.createElement('div');word.className='word-entry-word';
  const ns='http://www.w3.org/2000/svg';
  const burst=document.createElementNS(ns,'svg');burst.classList.add('word-entry-burst');
  burst.setAttribute('aria-hidden','true');burst.setAttribute('focusable','false');
  layer.append(prompt,burst,word);document.body.append(backdrop,layer);
  const skip=document.createElement('button');skip.type='button';skip.className='word-entry-skip';skip.hidden=true;
  document.querySelector('.reader-help')?.append(skip);
  let frame=0,pending=null,run=null,generation=0,wasVisible=false,consumed=false;
  const restorers=[];
  const wordBeatMs=1280,wordChoreographyMs=780,promptHoldMs=1000,promptReturnMs=320;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const out=x=>1-Math.pow(1-clamp(x),3);
  const inOut=x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;};
  const smoothPromptFade=t=>{const x=clamp((t-.35)/.65);return x*x*(3-2*x);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const box=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
  const isVisible=()=>leaf.getAttribute('aria-hidden')==='false'&&!leaf.inert;
  const isRead=()=>!stage.dataset.turnState||stage.dataset.turnState==='read';
  function labels(){
    skip.textContent=document.documentElement.lang==='en'?'Skip introduction':document.documentElement.lang==='ja'?'案内をスキップ':'跳過提示';
  }
  function status(state,phase='',reason=''){
    layer.dataset.state=state;layer.dataset.phase=phase;layer.dataset.stopReason=reason;
    stage.dataset.wordEntryState=state;
  }
  function hideSource(node){
    const value=node.style.getPropertyValue('opacity'),priority=node.style.getPropertyPriority('opacity');
    node.style.setProperty('opacity','0','important');
    const restore=()=>value?node.style.setProperty('opacity',value,priority):node.style.removeProperty('opacity');
    restorers.push(restore);return restore;
  }
  function stop(reason='complete'){
    const active=!!run;
    generation++;if(frame)cancelAnimationFrame(frame);frame=0;pending=null;run=null;
    while(restorers.length)restorers.pop()();
    clearFullscreen();layer.hidden=true;skip.hidden=true;prompt.replaceChildren();word.replaceChildren();burst.replaceChildren();
    layer.dataset.word='';layer.dataset.index='0';layer.dataset.coveredWords='';status('idle','idle',reason);
    if(active)window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:false}}));
  }
  function consume(reason){if(pending||run){consumed=true;stop(reason);}}
  const fontKeys=['fontFamily','fontWeight','fontStyle','textAlign','textTransform','wordBreak','overflowWrap'];
  function copyType(source,target,scale){
    const css=getComputedStyle(source);
    for(const key of fontKeys)target.style[key]=css[key];
    for(const key of ['fontSize','lineHeight','letterSpacing']){
      const n=parseFloat(css[key]);target.style[key]=Number.isFinite(n)?`${n*scale}px`:css[key];
    }
    target.style.color=css.color;
  }
  function makePrompt(scale,grid){
    const bounds=box(heading.getBoundingClientRect());
    // Compose against the viewport, independently of the book frame. Measure
    // the real title ink so narrow screens can still use a prominent question.
    const viewWidth=document.documentElement.clientWidth||innerWidth,viewHeight=document.documentElement.clientHeight||innerHeight;
    const small=viewWidth<600,left=16,right=viewWidth-16;
    const visibleTop=64,visibleBottom=viewHeight-48;
    const width=Math.min(980,(right-left)*(small?.98:.86)),pad=small?22:64,padY=small?30:44;
    if(width<160||visibleBottom-visibleTop<180)return null;
    const range=document.createRange();range.selectNodeContents(heading);const titleInk=box(range.getBoundingClientRect());range.detach?.();
    const magnify=Math.min(small?1.22:1.85,(width-pad*2-8)/Math.max(titleInk.width,1));
    const height=bounds.height*magnify+padY*2+6;
    const x=(left+right-width)/2,y=Math.max(visibleTop,Math.min(visibleBottom-height,(visibleTop+visibleBottom-height)/2));
    copyType(heading,prompt,scale*magnify);
    Object.assign(prompt.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,padding:`${padY}px ${pad}px`,textAlign:'center',opacity:'1',transform:'none'});
    const clone=heading.cloneNode(true);clone.removeAttribute('id');clone.removeAttribute('data-book-text');
    prompt.replaceChildren(...clone.childNodes);
    const walker=document.createTreeWalker(prompt,NodeFilter.SHOW_TEXT),texts=[];
    while(walker.nextNode())texts.push(walker.currentNode);
    const chars=[];
    const segmenter=Intl.Segmenter?new Intl.Segmenter(document.documentElement.lang,{granularity:'grapheme'}):null;
    for(const text of texts){
      const fragment=document.createDocumentFragment();
      const pieces=segmenter?[...segmenter.segment(text.nodeValue)].map(x=>x.segment):[...text.nodeValue];
      for(const character of pieces){
        const span=document.createElement('span');span.className='word-entry-char';span.textContent=character;
        fragment.append(span);chars.push(span);
      }
      text.replaceWith(fragment);
    }
    return{chars,from:{x,y,width,height},to:bounds,viewport:{width:viewWidth,height:viewHeight}};
  }
  function clearFullscreen(){
    backdrop.hidden=true;backdrop.style.opacity='0';layer.dataset.fullscreen='false';skip.dataset.fullscreen='false';
    if(inkContext)inkContext.clearRect(0,0,ink.width,ink.height);
    ink.dataset.marks='0';ink.dataset.state='idle';ink.dataset.time='0';
  }
  function startFullscreen(question){
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    ink.width=Math.ceil(question.viewport.width*dpr);ink.height=Math.ceil(question.viewport.height*dpr);
    inkContext?.setTransform(dpr,0,0,dpr,0,0);
    backdrop.hidden=false;backdrop.style.opacity='1';layer.dataset.fullscreen='true';skip.dataset.fullscreen='true';
    ink.dataset.state='active';
  }
  function paintFullscreen(item,elapsed,returning=0){
    backdrop.style.opacity=String(1-returning);
    if(!inkContext)return;
    const {from,to,viewport}=item.question;
    const zoom=mix(1,Math.min(1,to.width/from.width,to.height/from.height),returning);
    const cx=mix(from.x+from.width/2,to.x+to.width/2,returning),cy=mix(from.y+from.height/2,to.y+to.height/2,returning);
    const safe={x:cx-from.width*zoom/2-18,y:cy-from.height*zoom/2-18,width:from.width*zoom+36,height:from.height*zoom+68};
    const skipBox={x:viewport.width-220,y:0,width:220,height:64};
    inkContext.clearRect(0,0,viewport.width,viewport.height);
    const marks=window.mangaLoopInk?.draw(inkContext,viewport.width,viewport.height,elapsed/1000,{ink:'#eee',accent:'#eee'},{kind:'burst',side:-1,density:.58,envelope:.76*(1-returning),safeRects:[safe,skipBox]})||0;
    ink.dataset.marks=String(marks);ink.dataset.time=String(Math.round(elapsed));ink.dataset.safeRect=JSON.stringify(safe);
  }
  function makeBurst(bounds){
    burst.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    Object.assign(burst.style,{left:`${bounds.x}px`,top:`${bounds.y}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});
    // Complete short strokes occupy the grid's clear outer edges. No painted
    // backing, image copy or rectangular subtraction mask is introduced.
    const w=bounds.width,h=bounds.height;
    for(const [i,line] of [[4,h*.28,22,h*.36],[4,h*.67,22,h*.59],[w-4,h*.28,w-22,h*.36],[w-4,h*.67,w-22,h*.59],[w*.17,5,w*.24,14],[w*.77,h-5,w*.84,h-14]].entries()){
      const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${line[0]} ${line[1]}L${line[2]} ${line[3]}`);
      path.setAttribute('fill','none');path.setAttribute('stroke',i===5?'#b71f30':'#111');path.setAttribute('stroke-width',i===5?'2.5':'1.7');burst.append(path);
    }
  }
  function projectedInk(target,dx,dy,zoom,rotation,landing){
    const cx=target.r.x+target.r.width/2,cy=target.r.y+target.r.height/2;
    const radians=rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
    const corners=target.inkCorners.map(([x,y])=>({x:cx+dx+(x*cos-y*sin)*zoom,y:cy+dy+(x*sin+y*cos)*zoom}));
    // Account for the white/black outline and ink shadow as well as the glyph.
    // All source rectangles were measured once, before the timeline started.
    const pad=(3.5*(1-landing)+.75)*zoom;
    const left=Math.min(...corners.map(p=>p.x))-pad,top=Math.min(...corners.map(p=>p.y))-pad;
    return{x:left,y:top,width:Math.max(...corners.map(p=>p.x))+pad-left,height:Math.max(...corners.map(p=>p.y))+pad-top};
  }
  function avoidLandedWords(item,index,bounds){
    const covered=[];
    for(let i=0;i<index;i++){
      const target=item.targets[i],r=target.ink;
      const collision=bounds.x<r.x+r.width&&bounds.x+bounds.width>r.x&&bounds.y<r.y+r.height&&bounds.y+bounds.height>r.y;
      if(collision){
        if(!target.coverHidden)target.source.style.setProperty('opacity','0','important');
        covered.push(buttons[i].dataset.word);
      }else if(target.coverHidden)target.restore();
      target.coverHidden=collision;
    }
    layer.dataset.coveredWords=covered.join(' ');
  }
  function start(){
    if(!pending||pending.token!==generation||!isVisible()||!isRead()||reduced.matches||document.hidden){consume('start-interrupted');return;}
    const grid=box(panels.getBoundingClientRect());
    const logicalWidth=parseFloat(getComputedStyle(panels).width)||394,scale=grid.width/logicalWidth;
    if(grid.width<80||grid.height<40||grid.y<0||grid.y+grid.height>innerHeight){consume('grid-offscreen');return;}
    const sources=buttons.map(button=>button.querySelector(':scope > span'));
    if(sources.some(source=>!source)){consume('missing-label');return;}
    const targets=sources.map(source=>{
      const r=box(source.getBoundingClientRect()),range=document.createRange();range.selectNodeContents(source);
      const ink=box(range.getBoundingClientRect());range.detach?.();
      const maxScale=Math.min(2.65,grid.width*.86/Math.max(ink.width,r.height),grid.height*.72/Math.max(r.height,1));
      const cx=r.x+r.width/2,cy=r.y+r.height/2;
      const inkCorners=[[ink.x-cx,ink.y-cy],[ink.x+ink.width-cx,ink.y-cy],[ink.x-cx,ink.y+ink.height-cy],[ink.x+ink.width-cx,ink.y+ink.height-cy]];
      return{source,r,ink,inkCorners,coverHidden:false,color:getComputedStyle(source).color,punch:Math.max(1.12,maxScale),restore:hideSource(source)};
    });
    const question=makePrompt(scale,grid);
    if(!question){consume('prompt-offscreen');return;}
    const {chars}=question;
    const restoreHeading=hideSource(heading),hint=leaf.querySelector('.interaction-hint');
    const restoreHint=hint?hideSource(hint):()=>{};
    const promptDuration=Math.max(700,Math.min(900,chars.length*22+210)),beat=wordBeatMs;
    pending=null;consumed=true;
    run={token:generation,chars,question,targets,grid,scale,restoreHeading,restoreHint,promptDuration,wordsStart:promptDuration+promptHoldMs+promptReturnMs,beat,index:-1,started:null};
    layer.hidden=false;skip.hidden=false;prompt.hidden=false;labels();makeBurst(grid);word.hidden=true;burst.style.opacity='0';startFullscreen(question);
    status('playing','prompt');window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:true}}));
    frame=requestAnimationFrame(tick);
  }
  function tick(time){
    frame=0;const item=run;
    if(!item||item.token!==generation)return;
    if(!isVisible()||!isRead()||document.hidden||reduced.matches){consume('reading-interrupted');return;}
    if(item.started===null)item.started=time;
    const elapsed=time-item.started;
    if(elapsed<item.promptDuration){
      const spacing=(item.promptDuration-150)/Math.max(1,item.chars.length-1);
      item.chars.forEach((char,i)=>{
        const p=clamp((elapsed-i*spacing)/150);char.style.opacity=String(p);
        char.style.transform=`translateY(${(1-out(p))*6}px) scale(${mix(.78,1,out(p))})`;
      });
      const pop=out(elapsed/180);prompt.style.transform=`scale(${mix(.72,1,pop)})`;
      prompt.style.opacity=String(clamp(elapsed/70));
      paintFullscreen(item,elapsed);
      layer.dataset.phase='prompt';
    }else if(elapsed<item.wordsStart){
      for(const char of item.chars){char.style.opacity='1';char.style.transform='none';}
      const returning=elapsed>=item.promptDuration+promptHoldMs;
      const t=returning?inOut((elapsed-item.promptDuration-promptHoldMs)/promptReturnMs):0;
      const {from,to}=item.question;
      const dx=to.x+to.width/2-from.x-from.width/2,dy=to.y+to.height/2-from.y-from.height/2;
      const zoom=Math.min(1,to.width/from.width,to.height/from.height);
      prompt.style.transform=`translate(${dx*t}px,${dy*t}px) scale(${mix(1,zoom,t)})`;
      prompt.style.opacity=String(1-smoothPromptFade(t));
      paintFullscreen(item,elapsed,t);
      layer.dataset.phase=returning?'prompt-return':'prompt-hold';
    }else{
      if(!prompt.hidden){clearFullscreen();prompt.hidden=true;item.restoreHeading();item.restoreHint();}
      const wordTime=elapsed-item.wordsStart,index=Math.floor(wordTime/item.beat);
      if(index>=item.targets.length){stop('complete');return;}
      // Stretch the whole pop/hold/landing beat by 500ms, not just its tail.
      const target=item.targets[index],t=(wordTime-index*item.beat)*wordChoreographyMs/item.beat;
      if(index!==item.index){
        if(item.index>=0)item.targets[item.index].restore();
        item.index=index;word.hidden=false;word.textContent=target.source.textContent;
        copyType(target.source,word,item.scale);
        Object.assign(word.style,{left:`${target.r.x}px`,top:`${target.r.y}px`,width:`${target.r.width}px`,minHeight:`${target.r.height}px`});
        layer.dataset.index=String(index+1);layer.dataset.word=buttons[index].dataset.word;
      }
      const landing=inOut((t-265)/(wordChoreographyMs-265));
      const cx=item.grid.x+item.grid.width/2,cy=item.grid.y+item.grid.height/2;
      const dx=(cx-target.r.x-target.r.width/2)*(1-landing),dy=(cy-target.r.y-target.r.height/2)*(1-landing);
      const entrance=out(t/130),punch=mix(.52,target.punch,entrance)+(t<220?Math.sin(clamp((t-90)/130)*Math.PI)*target.punch*.10:0);
      const zoom=mix(punch,1,landing),rotation=(index%2?-5:5)*(1-entrance)*(1-landing);
      word.style.opacity=String(clamp(t/38));word.style.transform=`translate(${dx}px,${dy}px) rotate(${rotation}deg) scale(${zoom})`;
      word.style.setProperty('--word-outline',`${(1-landing)*1.5}px`);
      word.style.setProperty('--word-shadow',`${(1-landing)*2}px`);
      word.style.setProperty('--word-fill',landing>.92?target.color:'#fff');
      avoidLandedWords(item,index,projectedInk(target,dx,dy,zoom,rotation,landing));
      burst.style.opacity=String(clamp(t/40)*(1-clamp((t-180)/140))*.85);
      layer.dataset.phase=t<150?'burst':t<265?'hold':'settle';
    }
    frame=requestAnimationFrame(tick);
  }
  function readyReason(){
    if(document.readyState!=='complete')return'document';
    if(stage.dataset.ready!=='true')return'book';
    if(document.fonts&&document.fonts.status!=='loaded')return'fonts';
    for(const source of document.querySelectorAll('#comic-book .leaf[aria-hidden="false"] img.art-image'))if(!source.complete)return'image';
    return'';
  }
  function wait(time){
    frame=0;const request=pending;if(!request||request.token!==generation)return;
    if(!isVisible()||!isRead()||reduced.matches){consume('entry-interrupted');return;}
    if(document.hidden){status('queued','waiting','visibility');return;}
    const needs=readyReason();if(needs){status('queued','waiting',needs);request.snapshot='';return;}
    const r=panels.getBoundingClientRect();
    const snapshot=[scrollX,scrollY,innerWidth,innerHeight,r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10).join(',');
    if(snapshot!==request.snapshot){request.snapshot=snapshot;request.quietSince=time;}
    status('queued','settling');
    if(time-request.quietSince>=150){start();return;}
    frame=requestAnimationFrame(wait);
  }
  function wake(){if(pending&&!frame&&!document.hidden)frame=requestAnimationFrame(wait);}
  function queue(force=false){
    if((consumed&&!force)||pending||run||!isVisible()||!isRead()||reduced.matches)return;
    stop('entry-queued');prompt.hidden=false;consumed=false;
    pending={token:generation,snapshot:'',quietSince:0};status('queued','waiting');wake();
  }
  function sync(){
    const visible=isVisible();
    if(!visible){if(wasVisible)stop('page-leave');wasVisible=false;consumed=false;return;}
    if(!wasVisible){wasVisible=true;consumed=false;}
    if(!isRead()){consume('page-turn');return;}
    queue();wake();
  }
  const observer=new MutationObserver(sync);
  observer.observe(stage,{attributes:true,attributeFilter:['data-ready','data-mode','data-turn-state']});
  observer.observe(leaf,{attributes:true,attributeFilter:['aria-hidden','inert']});
  function userIntent(event){
    if(event.isTrusted&&(pending||run))consume(event.target?.closest?.('[data-word]')?'selection':'user-input');
  }
  for(const type of ['pointerdown','touchstart','wheel','touchmove','keydown'])window.addEventListener(type,userIntent,{capture:true,passive:true});
  // A programmatic selection still restores the source immediately; only the
  // real buttons perform selection and the existing ink feedback afterwards.
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-word]'))consume('selection');
    if(event.target.closest?.('.motion-replay')&&isVisible()){consume('replay');queue(true);}
  },true);
  skip.addEventListener('click',()=>consume('skipped'));
  backdrop.addEventListener('click',()=>consume('skipped'));
  for(const type of ['resize','pagehide','beforeprint'])window.addEventListener(type,()=>consume(type),{passive:true});
  window.addEventListener('scroll',()=>{
    if(pending){pending.snapshot='';wake();}else if(run)consume('scroll');
  },{passive:true});
  window.addEventListener('manga:languagechange',()=>{consume('language-change');labels();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(run)consume('hidden');}else wake();});
  document.addEventListener('load',wake,true);window.addEventListener('load',wake,{passive:true});
  document.fonts?.addEventListener('loadingdone',wake);document.fonts?.addEventListener('loadingerror',wake);
  reduced.addEventListener('change',()=>consume('motion-preference'));
  matchMedia('print').addEventListener('change',event=>{if(event.matches)consume('print');});
  labels();sync();
})();
