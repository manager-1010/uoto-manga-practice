/* Original manga contour -> browser foreground -> exact source crop.
   Nothing in this layer replaces reader HTML, the page renderer or content. */
(() => {
  'use strict';
  const surface=document.querySelector('#comic-book'),stage=document.querySelector('.book-stage');
  if(!surface||!stage||!window.comicMotion)return;
  const leaves=[...surface.querySelectorAll(':scope > .leaf')];
  const reduced=window.mangaDrawing?.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)');
  const ns='http://www.w3.org/2000/svg';
  const overlay=document.createElement('div');overlay.className='manga-impact';overlay.hidden=true;overlay.inert=true;overlay.setAttribute('aria-hidden','true');
  const backdrop=document.createElement('div');backdrop.className='manga-impact-backdrop';
  const loopCanvas=document.createElement('canvas');loopCanvas.className='manga-impact-loop';loopCanvas.setAttribute('aria-hidden','true');
  const loopContext=loopCanvas.getContext('2d');
  const drawing=document.createElementNS(ns,'svg');drawing.classList.add('manga-impact-ink');drawing.setAttribute('aria-hidden','true');drawing.setAttribute('focusable','false');
  const caption=document.createElement('p');caption.className='manga-impact-caption';
  const typography=document.createElement('p');typography.className='manga-impact-type';typography.hidden=true;
  const sfx=document.createElement('p');sfx.className='manga-impact-sfx';sfx.hidden=true;
  const balloon=document.createElement('div');balloon.className='manga-impact-balloon';balloon.hidden=true;
  const balloonText=document.createElement('p');balloon.append(balloonText);
  const intro=document.createElement('p');intro.className='manga-impact-intro';intro.hidden=true;
  overlay.append(backdrop,loopCanvas,drawing,caption,typography,sfx,balloon,intro);document.body.append(overlay);
  const skip=document.createElement('button');skip.type='button';skip.className='manga-impact-skip';skip.hidden=true;document.body.append(skip);
  const shots=[
    {art:'.opening-visual',cutout:'runners',rig:'runners',text:'.opening-hook h1',cross:true,balloon:true,opening:true,tone:'track',move:'sprint-left',side:-1,hero:true},
    {inplace:true,art:'.opening-mobile-beat .art',sourceOnly:true,text:'.opening-finish-voice',variant:'footfall',tone:'feet',side:1,duration:1800},
    {inplace:true,art:'.race-visual',sourceOnly:true,variant:'race-flash',tone:'track',side:1,duration:2000,artDurationMs:2000,edgeInk:true},
    {inplace:true,text:'.comparison-question p',variant:'question-letters',tone:'question',duration:2000,lettering:{delayMs:40,revealMs:1800,pop:.20,lift:4}},
    {art:'.belief-cover .art',text:'.unframed-question',tone:'orbit',move:'orbit',side:-1},
    {inplace:true,text:'.character-question',variant:'portrait-ink',tone:'portrait',duration:2000},
    {inplace:true,art:'.komiya-conversation .art',sourceOnly:true,variant:'breath',tone:'conversation',duration:1250,artDurationMs:900,edgeInk:true},
    {inplace:true,art:'.nigami-glance .art',sourceOnly:true,variant:'eye-shutter',tone:'eye',duration:1200,artDurationMs:850,edgeInk:true},
    {inplace:true,art:'.kaido-tall .art',sourceOnly:true,text:'.courage-bubble p',variant:'resolve',tone:'resolve',duration:2000,artDurationMs:600,edgeInk:true,lettering:{delayMs:680,revealMs:720,pop:.16,lift:3}},
    {inplace:true,art:'.zaitsu-visual',sourceOnly:true,text:'.character-question',variant:'paper-cut',tone:'portrait',duration:2100,artDelayMs:1050,artDurationMs:700,edgeInk:true,lettering:{delayMs:100,revealMs:800,pop:.18,lift:4}},
    {static:true,tone:'track'}, // Feedback starts when the reader chooses a word.
    {static:true,tone:'question'}, // The picture and courage paragraph stay still.
    {art:'.quote-visual',focusCrop:[350,20,300,365],text:'.quote-balloon p',glyph:true,explain:'.interpretation-next',tone:'resolve',move:'reveal',side:1},
    {inplace:true,text:'.interpretation-first strong',secondary:'.interpretation-next strong',variant:'ink-emphasis',tone:'question',duration:2650},
    {art:'.impact-100m .art',text:'h2',tone:'cover',move:'push',side:-1},
    {art:'.impact-orb .art',text:'.final-balloon p',tone:'orbit',move:'orbit',side:1}
  ];
  // Busy patterns cut around white text/art boxes become fragments. Leave
  // conversational pages on their original paper; use ink only at key beats.
  const inkBeats=[
    {kind:'halftone',density:.62,span:4},
    null, // 2: the finish-line lettering already carries the beat.
    null, // 3: a brief safe ink flash; the original runner stays still.
    null, // 4: quiet reading space beside the runner.
    {kind:'orbit',density:.68,span:5},
    {kind:'circle',density:.48,span:4},
    null, null, // 7–8: conversation and eye panel stay clear.
    null, null, // 9–10: no chopped rays behind the portraits.
    null, null, // 11–12: word-selection ink stays near the picture.
    {kind:'burst',density:.76,span:3},
    null, // 14: only the original inline emphasis remains.
    {kind:'flow',density:.64,span:4},
    {kind:'orbit',density:.72,span:6}
  ];
  const soundWords={
    'zh-Hant':{opening:'砰！',race:'唰——',ambition:'怦',quotation:'轟！'},
    en:{opening:'BAM!',race:'WHOOSH',ambition:'THUMP',quotation:'BOOM!'},
    ja:{opening:'ドンッ',race:'ザッ',ambition:'ドクン',quotation:'ドンッ'}
  };
  let currentPage=0,spread=false,readerState='read',lastKey='',frame=0,pending=0,run=null,settling=null,sequence=0,reason='idle',suppressedUntil=0,inkState=null,loopOrigin=0;
  const firstOpening={eligible:!location.hash||location.hash==='#opening',pending:false,consumed:false,starts:0};
  overlay.dataset.firstEntryState=firstOpening.eligible?'idle':'not-opening';
  overlay.dataset.firstEntryStarts='0';
  const restorers=[];
  const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>1-Math.pow(1-clamp(t),4);
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const rect=r=>({x:r.left??r.x,y:r.top??r.y,width:r.width,height:r.height});
  function svg(tag,attrs={}){const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;}
  function setRect(node,r){for(const name of ['x','y','width','height'])node.setAttribute(name,Math.max(name==='width'||name==='height'?0:-1e7,r[name]).toFixed(3));}
  function intersect(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};}
  function visible(node){if(!node)return false;const style=getComputedStyle(node),r=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&r.width>8&&r.height>8&&r.bottom>0&&r.top<innerHeight;}
  function find(leaf,selector,cross=false){if(!selector)return null;const roots=cross&&spread?[leaf,leaves[currentPage+1]]:[leaf];for(const root of roots.filter(Boolean))for(const node of root.querySelectorAll(selector))if(visible(node))return node;return null;}
  function textOf(node){
    if(!node)return '';
    const clone=node.cloneNode(true),english=document.documentElement.lang==='en';
    clone.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode(english?' ':'')));
    let text=clone.textContent.replace(/\s+/g,' ').trim();
    if(!english)text=text.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？、：；])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？、：；])/gu,'$1');
    return text;
  }
  function copyFor(page,shot){let node=find(leaves[page],shot.text,shot.cross);if(!node&&page===0)node=leaves[1]?.querySelector(shot.text);if(!node&&spread&&page%2===0)node=find(leaves[page+1],shot.text);return{node,text:textOf(node)};}
  function label(){skip.textContent=({'zh-Hant':'跳過動畫 · 閱讀本頁',en:'Skip animation · Read page',ja:'演出をスキップ・読む'})[document.documentElement.lang]||'跳過動畫 · 閱讀本頁';}
  function restoreSources(){while(restorers.length)restorers.pop()();}
  function clearLoopCanvas(){
    if(!loopContext)return;
    // The buffer may still have the previous viewport's dimensions and DPR.
    loopContext.save();loopContext.setTransform(1,0,0,1,0,0);
    loopContext.clearRect(0,0,loopCanvas.width,loopCanvas.height);loopContext.restore();
  }
  function sourceStyle(node,values){const saved=Object.keys(values).map(key=>[key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);for(const [key,value]of Object.entries(values))node.style.setProperty(key,value,'important');restorers.push(()=>{for(const [key,value,priority]of saved)value?node.style.setProperty(key,value,priority):node.style.removeProperty(key);});}
  function stop(why='stopped'){
    if(firstOpening.pending){firstOpening.pending=false;firstOpening.consumed=true;entryStatus('cancelled',why);}
    const hadSequence=!!(run||pending||settling);
    sequence++;if(frame)cancelAnimationFrame(frame);if(pending)cancelAnimationFrame(pending);frame=0;pending=0;settling=null;
    if(hadSequence&&!['complete','preparing'].includes(why))window.comicSound?.stop?.();
    window.mangaPanelInk?.clear(run?.panelInk);drawing.dataset.panelInkCount='0';
    restoreSources();document.body.removeAttribute('data-impact-playing');overlay.hidden=true;skip.hidden=true;drawing.replaceChildren();overlay.querySelectorAll('.manga-impact-local').forEach(node=>node.remove());drawing.style.transform='none';backdrop.style.opacity='0';caption.textContent='';caption.style.opacity='0';typography.textContent='';typography.hidden=true;typography.style.opacity='0';sfx.textContent='';sfx.hidden=true;sfx.style.opacity='0';balloon.hidden=true;balloonText.textContent='';intro.hidden=true;intro.textContent='';
    overlay.dataset.raceFlashState='idle';overlay.dataset.raceQuestionState='idle';overlay.dataset.parallelQuestion='false';
    clearLoopCanvas();inkState=null;loopCanvas.dataset.loopActive='false';loopCanvas.dataset.loopMarks='0';
    if(!['complete','preparing'].includes(why))loopOrigin=0;
    overlay.dataset.impactPhase='idle';overlay.dataset.impactActive='false';overlay.dataset.characterVisible='false';overlay.dataset.stopReason=why;run=null;reason=why;
    window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:false}}));
  }
  function imageGeometry(art){
    const img=art.querySelector('img.art-image');if(!img?.complete||!img.naturalWidth)return null;
    const r=rect(img.getBoundingClientRect()),style=getComputedStyle(img),fit=style.objectFit;
    let scale=fit==='cover'?Math.max(r.width/img.naturalWidth,r.height/img.naturalHeight):Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);
    if(fit==='fill')scale=r.width/img.naturalWidth;
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    // Every existing source uses the default centred object position. Explicit
    // crop viewports have image bounds in their original source aspect ratio.
    return{img,x:r.x+(r.width-w)/2,y:r.y+(r.height-h)/2,scale,width:img.naturalWidth,height:img.naturalHeight,src:img.currentSrc||img.src};
  }
  function matchingCutout(shot,geometry,art){
    const list=window.MANGA_CUTOUTS||{};
    let candidate=shot.cutout?list[shot.cutout]:null;
    if(shot.autoCutout)candidate=Object.values(list).find(item=>new URL(item.src,location.href).href===geometry.src);
    if(!candidate?.path||!candidate.box||candidate.allowDetached===false||new URL(candidate.src,location.href).href!==geometry.src)return null;
    if(shot.autoCutout){
      const crop=art.querySelector('.art-crop-viewport');
      let sourceVisible=intersect(rect(art.getBoundingClientRect()),rect(stage.getBoundingClientRect()));
      if(crop)sourceVisible=intersect(sourceVisible,rect(crop.getBoundingClientRect()));
      sourceVisible=intersect(sourceVisible,{x:0,y:0,width:innerWidth,height:innerHeight});
      const [x,y,w,h]=candidate.box;
      const body={x:geometry.x+x*geometry.scale,y:geometry.y+y*geometry.scale,width:w*geometry.scale,height:h*geometry.scale};
      const overlap=intersect(sourceVisible,body);
      // A shared filename is not an identity for a visible drawing. The
      // "reality" head crop and the standing figure are separate panels in
      // the same source image. Do not summon a figure outside the source crop.
      if(overlap.width*overlap.height<body.width*body.height*.10)return null;
    }
    return candidate;
  }
  function maskSources(cutout,geometry){
    for(let i=currentPage;i<=Math.min(leaves.length-1,currentPage+(spread?1:0));i++)for(const art of leaves[i].querySelectorAll('.art')){
      const g=imageGeometry(art);if(!g||g.src!==geometry.src)continue;
      const a=rect(art.getBoundingClientRect()),px=g.x-a.x,py=g.y-a.y;
      const content=`<svg xmlns="${ns}" width="${a.width}" height="${a.height}" viewBox="0 0 ${a.width} ${a.height}"><defs><mask id="hole" maskUnits="userSpaceOnUse" x="0" y="0" width="${a.width}" height="${a.height}" style="mask-type:luminance"><rect width="100%" height="100%" fill="white"/><path d="${cutout.path}" fill="black" fill-rule="${cutout.fillRule||'nonzero'}" transform="translate(${px} ${py}) scale(${g.scale})"/></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#hole)"/></svg>`;
      const url=`url("data:image/svg+xml,${encodeURIComponent(content)}")`;
      sourceStyle(art,{'mask-image':url,'-webkit-mask-image':url,'mask-size':'100% 100%','-webkit-mask-size':'100% 100%','mask-repeat':'no-repeat','-webkit-mask-repeat':'no-repeat'});
    }
  }
  function hidePanelSources(art,geometry){
    sourceStyle(art,{opacity:'0'});
    if(!art.closest('.spread-window'))return;
    // Cross-page artwork exists twice in the renderer, with each copy clipped
    // to one leaf. Both pieces are the same photographic plane.
    for(let i=currentPage;i<=Math.min(leaves.length-1,currentPage+(spread?1:0));i++)for(const other of leaves[i].querySelectorAll('.spread-window .art')){
      if(other===art)continue;const g=imageGeometry(other);
      if(g&&g.src===geometry.src&&Math.abs(g.x-geometry.x)<2&&Math.abs(g.y-geometry.y)<2)sourceStyle(other,{opacity:'0'});
    }
  }
  function originalPanelPolygon(art,geometry){
    const clip=getComputedStyle(art).clipPath;if(!clip?.startsWith('polygon('))return null;
    const a=rect(art.getBoundingClientRect()),points=clip.slice(8,-1).split(',').map(pair=>pair.trim().split(/\s+/));
    if(points.some(pair=>pair.length!==2||pair.some(n=>!Number.isFinite(parseFloat(n)))))return null;
    return points.map(([x,y])=>{
      const px=x.endsWith('%')?parseFloat(x)/100*a.width:parseFloat(x),py=y.endsWith('%')?parseFloat(y)/100*a.height:parseFloat(y);
      return`${(a.x+px-geometry.x)/geometry.scale},${(a.y+py-geometry.y)/geometry.scale}`;
    }).join(' ');
  }
  function makeLines(shot,w,h){
    const group=svg('g',{class:'manga-impact-lines'}),ribbon=svg('g',{class:'manga-impact-tones'});
    // The shared canvas below the artwork replaces the old full-screen rays.
    drawing.append(ribbon,group);return{group,ribbon};
  }
  function beginInk(item){
    inkState=null;
    loopCanvas.dataset.loopPage=String(item.page+1);
    loopCanvas.dataset.loopKind='none';loopCanvas.dataset.loopMarks='0';
    loopCanvas.dataset.loopActive='false';loopCanvas.dataset.loopFrame='0';
    clearLoopCanvas();
    if(!inkBeats[item.page]||!loopContext||!window.mangaLoopInk)return;
    const width=innerWidth,height=innerHeight,ratio=Math.min(devicePixelRatio||1,1.5),safeRects=[];
    loopCanvas.width=Math.ceil(width*ratio);loopCanvas.height=Math.ceil(height*ratio);
    loopContext.setTransform(ratio,0,0,ratio,0,0);
    const add=(bounds,pad=9)=>{if(bounds.width>1&&bounds.height>1)safeRects.push({x:bounds.x-pad,y:bounds.y-pad,width:bounds.width+pad*2,height:bounds.height+pad*2});};
    const viewport={x:0,y:0,width,height};
    // The full-screen paper/ink backdrop already hides the original page.
    // Protecting those old rectangular text/art boxes would remove unrelated
    // portions of the foreground speed lines. Local scenes retain page safety.
    for(const leaf of item.local?leaves.slice(currentPage,currentPage+(spread?2:1)):[]){
      const leafBounds=rect(leaf.getBoundingClientRect());
      for(const node of leaf.querySelectorAll('h1,h2,h3,p,.balloon,.word-choice,.art')){
        if(node.closest('.art')&&!node.classList.contains('art'))continue;
        if(!visible(node))continue;
        add(intersect(intersect(rect(node.getBoundingClientRect()),leafBounds),viewport));
      }
    }
    const controls=item.local?[document.querySelector('header'),document.querySelector('.book-controls'),document.querySelector('.reader-help')]:[skip];
    for(const node of controls)if(visible(node))add(intersect(rect(node.getBoundingClientRect()),viewport),6);
    for(const node of [caption,typography,sfx,balloon,intro])if(!node.hidden){
      const r=rect(node.getBoundingClientRect());
      if(node===caption&&caption.textContent.trim()){
        // The paragraph spans 91vw, but its actual ink is centred in that box.
        // Reserve the text and its pop, leaving genuinely empty corner lanes.
        const range=document.createRange();range.selectNodeContents(caption);
        const ink=rect(range.getBoundingClientRect());
        if(ink.width>1&&ink.height>1){add(ink,Math.max(24,ink.width*.07));add({x:r.x+r.width/2-28,y:r.y,width:56,height:8},10);continue;}
      }
      // Reserve the largest lettering pop rather than measuring it every frame.
      const margin=node===intro||node===balloon?Math.max(24,r.width*.12):24;
      add(r,margin);
    }
    // Local scenes reserve both poses. In full-screen scenes the hidden book
    // position must not wipe out a corner; current rotated actor bounds are
    // already added per frame, together with the settled foreground pose.
    if(item.bodyBox&&item.baseline&&item.target){
      const [x,y,w,h]=item.bodyBox;
      for(const p of item.local?[item.baseline,item.target]:[item.target])add({x:p.x+x*p.scale,y:p.y+y*p.scale,width:w*p.scale,height:h*p.scale},32);
    }
    inkState={width,height,ratio,safeRects,beat:inkBeats[item.page],frame:0};
    loopCanvas.dataset.loopPage=String(item.page+1);loopCanvas.dataset.loopSafeCount=String(safeRects.length);
    loopCanvas.dataset.loopActive='true';loopCanvas.dataset.loopFrame='0';
  }
  function paintInk(item,time,t,envelope){
    if(!inkState||!loopContext||!window.mangaLoopInk)return;
    if(!loopOrigin)loopOrigin=time;
    const state=inkState,beat=state.beat;
    loopContext.clearRect(0,0,state.width,state.height);
    const kind=item.shot.opening&&t>.445?'burst':beat.kind;
    const colours=overlay.dataset.palette==='ink'?{ink:'#f6f4ee',paper:'#101010',accent:'#c5323f'}:{ink:'#111',paper:'#fcfbf7',accent:'#b71f30'};
    const rim=Math.min(state.width,state.height)*(innerWidth<600?.13:.18);
    const alpha=envelope*(item.local?.60:.76);
    const marks=window.mangaLoopInk.draw(loopContext,state.width,state.height,
      (time-loopOrigin)/1000+t*beat.span,colours,
      {kind,phase:t,envelope:alpha,side:item.shot.side||((item.page%2)?1:-1),rim,safeRects:item.inkActorBounds?[...state.safeRects,item.inkActorBounds]:state.safeRects,density:beat.density});
    loopCanvas.dataset.loopKind=kind;loopCanvas.dataset.loopMarks=String(marks||0);
    loopCanvas.dataset.loopPhase=t.toFixed(3);loopCanvas.dataset.loopFrame=String(++state.frame);
  }
  function glyphs(parent,text){
    parent.replaceChildren();const english=document.documentElement.lang==='en';
    const units=english?text.split(/(\s+)/):Array.from(text);
    const result=[];
    for(const value of units){if(!value.trim()){parent.append(document.createTextNode(value));continue;}
      const span=document.createElement('span');span.className='impact-ink-unit';span.textContent=value;span.style.opacity='0';parent.append(span);result.push(span);
    }
    return result;
  }
  function localLettering(node,delay=0,reveal=null){
    if(!visible(node))return null;
    const r=rect(node.getBoundingClientRect()),style=getComputedStyle(node),leaf=node.closest('.leaf');
    const ratio=leaf?leaf.getBoundingClientRect().width/450:1;
    const layer=document.createElement('div');layer.className='manga-impact-local manga-impact-lettering';
    Object.assign(layer.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,fontFamily:style.fontFamily,fontWeight:style.fontWeight,fontSize:`${parseFloat(style.fontSize)*ratio}px`,lineHeight:style.lineHeight==='normal'?'1.35':`${parseFloat(style.lineHeight)*ratio}px`,textAlign:style.textAlign,letterSpacing:style.letterSpacing,whiteSpace:'normal'});
    layer.style.setProperty('--unit-ink',style.color);layer.style.color=style.color;
    if(style.whiteSpace==='nowrap')layer.style.whiteSpace='nowrap';
    const rgb=style.color.match(/[\d.]+/g);if(rgb&&Number(rgb[0])+Number(rgb[1])+Number(rgb[2])>600)layer.dataset.contrast='light';
    const units=[];
    function preserve(child,parent){
      if(child.nodeType===3){
        const text=child.textContent,english=document.documentElement.lang==='en';
        for(const value of english?text.split(/(\s+)/):Array.from(text)){
          if(!value.trim()){parent.append(document.createTextNode(value));continue;}
          const span=document.createElement('span');span.className='impact-ink-unit';span.textContent=value;span.style.opacity='0';parent.append(span);units.push(span);
        }
      }else if(child.nodeType===1){
        if(child.tagName==='BR'){parent.append(document.createElement('br'));return;}
        const clone=document.createElement(child.tagName.toLowerCase());
        if(child.hasAttribute('data-comic-word'))clone.style.whiteSpace='nowrap';
        if(['EM','STRONG','I','B'].includes(child.tagName))clone.style.fontWeight=getComputedStyle(child).fontWeight;
        parent.append(clone);for(const descendant of child.childNodes)preserve(descendant,clone);
      }
    }
    for(const child of node.childNodes)preserve(child,layer);
    if(style.letterSpacing!=='normal')layer.style.letterSpacing=`${parseFloat(style.letterSpacing)*ratio}px`;
    overlay.append(layer);sourceStyle(node,{opacity:'0'});
    return{layer,units,delay,reveal};
  }
  function protectedArtGroup(page){
    const id=`safe-art-${++sequence}`,defs=svg('defs'),mask=svg('mask',{id,maskUnits:'userSpaceOnUse',x:0,y:0,width:innerWidth,height:innerHeight,style:'mask-type:luminance'});
    mask.append(svg('rect',{width:innerWidth,height:innerHeight,fill:'white'}));
    for(const leaf of leaves.slice(page,page+(spread?2:1)))for(const node of leaf.querySelectorAll('h1,h2,h3,p,.balloon,.word-choice>span')){
      if(node.closest('.art')||!visible(node))continue;const r=rect(node.getBoundingClientRect());if(r.width<5||r.height<5)continue;
      mask.append(svg('rect',{x:r.x-5,y:r.y-4,width:r.width+10,height:r.height+8,fill:'black'}));
    }
    defs.append(mask);drawing.append(defs);const group=svg('g',{mask:`url(#${id})`});drawing.append(group);return group;
  }
  function startLocal(page,shot,leaf){
    overlay.hidden=false;skip.hidden=false;label();overlay.dataset.palette='local';overlay.dataset.motion=shot.variant;
    overlay.dataset.impactPage=String(page+1);overlay.dataset.impactActive='true';overlay.dataset.impactKind='in-place';overlay.dataset.characterVisible='false';
    drawing.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);backdrop.style.opacity='0';
    const texts=[],inlineTexts=[];
    const text=shot.text?find(leaf,shot.text):null;
    const secondary=shot.secondary?find(leaf,shot.secondary):null;
    if(shot.variant==='ink-emphasis'){
      for(const [i,node]of [text,secondary].entries())if(node){
        const style=getComputedStyle(node),color=style.color,background=style.backgroundColor;sourceStyle(node,{'background-color':background,color,'box-shadow':'none'});inlineTexts.push({node,color,background,delay:i*.43});
      }
    }else{
      if(text){const layer=localLettering(text,shot.variant==='breath'?.30:0,shot.lettering||null);if(layer)texts.push(layer);}
      if(secondary){const layer=localLettering(secondary,.44);if(layer)texts.push(layer);}
    }
    if(spread&&shot.paired){const companion=find(leaves[page+1],shot.paired);if(companion&&!companion.classList.contains('art')){const layer=localLettering(companion,.35);if(layer)texts.push(layer);}}
    // This spread is one simultaneous beat: keep the original runner still,
    // flash ink for 2000ms, and reveal the right-page question on the same clock.
    const raceQuestion=shot.variant==='race-flash'&&spread&&page===currentPage?find(leaves[page+1],shots[3].text):null;
    if(raceQuestion){const layer=localLettering(raceQuestion,0,shots[3].lettering);if(layer)texts.push(layer);}
    // A spread reads as one sequence: keep the question for the second beat.
    // Skip, navigation and reduced motion restore it through the same stack.
    if(spread&&shot.awaitNext&&page===currentPage){const waiting=find(leaves[page+1],shot.awaitNext);if(waiting)sourceStyle(waiting,{opacity:'0'});}
    const art=shot.art?find(leaf,shot.art):null,g=art?imageGeometry(art):null;
    let actor=null,mesh=null,baseline=null,focus=null,lines=null,sourceArt=null;
    if(g&&shot.sourceOnly){
      sourceArt=art;sourceStyle(art,{transform:'none','transform-origin':shot.variant==='breath'?'25% 76%':'50% 50%'});
      overlay.dataset.impactKind='source-image';
    }else if(g){
      const safe=protectedArtGroup(page);
      const a=rect(art.getBoundingClientRect()),crop=art.querySelector('.art-crop-viewport');
      let frameRect=crop?intersect(a,rect(crop.getBoundingClientRect())):a;
      frameRect=intersect(intersect(frameRect,rect(stage.getBoundingClientRect())),{x:0,y:0,width:innerWidth,height:innerHeight});
      if(shot.focusCrop){const[x,y,w,h]=shot.focusCrop;frameRect=intersect(frameRect,{x:g.x+x*g.scale,y:g.y+y*g.scale,width:w*g.scale,height:h*g.scale});}
      const id=`local-clip-${++sequence}`,defs=svg('defs'),clip=svg('clipPath',{id,clipPathUnits:'userSpaceOnUse'});const clipRect=svg('rect',{x:frameRect.x,y:frameRect.y,width:frameRect.width,height:frameRect.height});clip.append(clipRect);defs.append(clip);drawing.append(defs);
      const clipped=svg('g',{'clip-path':`url(#${id})`});actor=svg('g',{'class':'manga-impact-local-art'});
      const image=svg('image',{href:g.src,width:g.width,height:g.height,preserveAspectRatio:'none'}),cutout=matchingCutout(shot,g,art);
      if(cutout&&shot.rig){
        const bid=`local-body-${sequence}`,body=svg('clipPath',{id:bid});body.append(svg('path',{d:cutout.path,'clip-rule':cutout.fillRule||'nonzero'}));defs.append(body);image.setAttribute('clip-path',`url(#${bid})`);
        mesh=window.comicPuppet?.create({defs,actor,image,box:cutout.box,name:shot.rig});maskSources(cutout,g);
      }
      if(!mesh)actor.append(image);
      baseline={x:g.x,y:g.y,scale:g.scale};focus=frameRect;transform(actor,baseline);clipped.append(actor);safe.append(clipped);
      lines=svg('g',{class:'manga-impact-local-lines'});
      if(!['acceleration','footfall'].includes(shot.variant)){
        const pad=shot.variant==='eye-shutter'?3:7;
        lines.append(svg('path',{d:`M${frameRect.x-pad} ${frameRect.y+18}v-18h36 M${frameRect.x+frameRect.width+pad} ${frameRect.y+frameRect.height-18}v18h-36`,stroke:'#111','stroke-width':2.3,fill:'none'}));
      }
      safe.append(lines);
    }
    run={page,shot,local:true,start:0,duration:raceQuestion?shots[3].duration:shot.duration||2400,texts,inlineTexts,sourceArt,actor,mesh,baseline,focus,lines,sounded:false,skipCompanion:shot.variant==='race-flash',raceQuestion:!!raceQuestion};
    if(shot.variant==='race-flash'){overlay.dataset.raceFlashState='active';overlay.dataset.parallelQuestion=String(!!raceQuestion);overlay.dataset.raceQuestionState=raceQuestion?'scheduled':'absent';}
    if(shot.edgeInk&&sourceArt)run.panelInk=window.mangaPanelInk?.prepare({drawing,art:sourceArt,leaves:leaves.slice(currentPage,currentPage+(spread?2:1)),variant:shot.variant});
    beginInk(run);
    reason='playing';overlay.dataset.stopReason='';frame=requestAnimationFrame(tick);return true;
  }
  function tickLocal(item,time){
    if(!item.start)item.start=time;const elapsed=time-item.start,t=clamp(elapsed/item.duration),envelope=smooth(t/.13)*(1-smooth((t-.7)/.3));
    overlay.dataset.impactPhase=t<.15?'anticipation':t<.7?'local-action':'return';
    for(const layer of item.texts){
      if(layer.reveal){
        const options=layer.reveal,span=Math.max(0,options.revealMs-160),gap=span/Math.max(1,layer.units.length-1);
        layer.units.forEach((unit,i)=>{const p=clamp((elapsed-options.delayMs-i*gap)/160),settle=ease(p);unit.style.opacity=String(smooth(p/.55));unit.style.transform=`translateY(${((1-settle)*-options.lift).toFixed(2)}px) scale(${(1+(1-settle)*options.pop).toFixed(4)})`;});
        // Stay readable once revealed, with no fade-out before the source returns.
        layer.layer.style.opacity='1';continue;
      }
      const elapsedText=t-layer.delay,unitSpan=Math.max(.002,Math.min(.058,.32/Math.max(1,layer.units.length-1)));
      layer.units.forEach((unit,i)=>{const p=clamp((elapsedText-i*unitSpan)/.085),settle=ease(p);unit.style.opacity=String(smooth(p/.5));unit.style.transform=`translateY(${((1-settle)*-9).toFixed(2)}px) scale(${(1+(1-settle)*.72).toFixed(4)}) rotate(${((i%2?1:-1)*(1-settle)*4).toFixed(2)}deg)`;});
      layer.layer.style.opacity=String(1-smooth((t-.90)/.1));
    }
    for(const piece of item.inlineTexts){
      const on=t>=piece.delay&&t<piece.delay+.37;
      piece.node.style.setProperty('background-color',on?'#111':piece.background,'important');
      piece.node.style.setProperty('color',on?'#fff':piece.color,'important');
    }
    if(item.sourceArt&&item.shot.variant==='race-flash'){
      const flash=clamp(elapsed/item.shot.artDurationMs);
      window.mangaPanelInk?.paint(item.panelInk,flash);
      overlay.dataset.raceFlashState=flash<1?'active':'complete';
      if(item.raceQuestion)overlay.dataset.raceQuestionState=elapsed<shots[3].lettering.delayMs?'scheduled':elapsed<shots[3].lettering.delayMs+shots[3].lettering.revealMs?'revealing':'complete';
    }else if(item.sourceArt){
      const motionProgress=clamp((elapsed-(item.shot.artDelayMs||0))/(item.shot.artDurationMs||item.duration));
      const motionEnvelope=smooth(motionProgress/.18)*(1-smooth((motionProgress-.60)/.40));
      const variant=item.shot.variant;
      const value=variant==='breath'?`scale(${1+motionEnvelope*.018})`:variant==='eye-shutter'?`scale(${1+motionEnvelope*.023})`:variant==='paper-cut'?`rotate(${-motionEnvelope*.65}deg)`:`translateY(${-motionEnvelope*1.5}px)`;
      item.sourceArt.style.setProperty('transform',value,'important');overlay.dataset.characterVisible='true';
      window.mangaPanelInk?.paint(item.panelInk,motionProgress);
    }
    if(item.actor){
      const shot=item.shot,r=item.focus;let zoom=1,angle=0,dx=0,dy=0;
      if(shot.variant==='breath')zoom=1+envelope*.065;
      if(shot.variant==='eye-shutter')zoom=1+envelope*.038;
      if(shot.variant==='portrait-ink')zoom=1+envelope*.025;
      if(shot.variant==='paper-cut')angle=-1.1*envelope;
      if(shot.variant==='resolve')dy=-2*envelope;
      if(shot.variant==='footfall')dy=Math.sin(t*26)*Math.exp(-t*5)*3;
      const p={x:r.x+r.width/2+(item.baseline.x-r.x-r.width/2)*zoom+dx,y:r.y+r.height/2+(item.baseline.y-r.y-r.height/2)*zoom+dy,scale:item.baseline.scale*zoom};
      transform(item.actor,p,0,0,angle,[(r.x-item.baseline.x)/item.baseline.scale,(r.y-item.baseline.y)/item.baseline.scale,r.width/item.baseline.scale,r.height/item.baseline.scale]);
      item.mesh?.update(elapsed/1000,envelope);overlay.dataset.characterVisible='true';
      if(item.lines){item.lines.style.opacity=String(envelope*.62);item.lines.style.transform=shot.variant==='acceleration'?`translateX(${(t*r.width*.62).toFixed(2)}px)`:'none';}
    }
    if(!item.sounded&&t>.16){item.sounded=true;if(['acceleration','footfall','race-flash'].includes(item.shot.variant))window.comicSound?.play('start');else if(item.shot.variant==='choice')window.comicSound?.play('impact');}
    paintInk(item,time,t,envelope);
    if(t<1)frame=requestAnimationFrame(tick);else finish(item);
  }
  function finish(item){
    const companion=!item.skipCompanion&&spread&&item.page===currentPage&&currentPage%2===0&&leaves[currentPage+1];
    stop('complete');
    // A desktop spread contains two authored beats; portrait mode plays each
    // leaf separately. Only completion continues, never Skip or interruption.
    if(companion&&readerState==='read'&&!reduced.matches&&!document.hidden)start(currentPage+1,false);
  }
  function start(page,asSpread){
    if(readerState!=='read'||reduced.matches||document.hidden||performance.now()<suppressedUntil){stop('start-suppressed');return false;}
    const shot=shots[page],leaf=leaves[page];if(!shot||!leaf){stop('missing-page');return false;}
    if(shot.static&&!shot.edge){stop('static-page');return false;}
    stop('preparing');document.body.dataset.impactPlaying='true';window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:true}}));
    if(shot.inplace)return startLocal(page,shot,leaf);
    const art=shot.art?find(leaf,shot.art):null,copy=copyFor(page,shot);
    if(!shot.type&&!art){stop('source-not-visible');return false;}
    const geometry=art?imageGeometry(art):null;if(art&&!geometry){stop('waiting-for-image');return false;}
    const viewport={x:0,y:0,width:innerWidth,height:innerHeight};
    const bookRect=rect(stage.getBoundingClientRect());if(!intersect(bookRect,viewport).height){stop('book-offscreen');return false;}
    overlay.hidden=false;skip.hidden=false;label();drawing.setAttribute('viewBox',`0 0 ${viewport.width} ${viewport.height}`);
    overlay.dataset.palette=['orbit','cover'].includes(shot.tone)?'ink':'paper';overlay.dataset.motion=shot.move||'type';
    if(shot.opening)backdrop.style.opacity='1';
    const hasBalloon=!!shot.balloon&&!!copy.text;
    balloon.hidden=!hasBalloon;balloonText.textContent=copy.text;
    let questionUnits=null;
    if(shot.opening){
      questionUnits=glyphs(balloonText,copy.text);
      const source=leaf.querySelector('.opening-voice')?.cloneNode(true);
      source?.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode('\n')));
      intro.textContent=source?.textContent.trim()||'';intro.hidden=false;intro.style.opacity='0';
    }
    if(hasBalloon){
      let font=Math.min(innerWidth<600?40:70,innerWidth*.09);
      balloonText.style.fontSize=`${font}px`;
      while(balloon.getBoundingClientRect().height>innerHeight*.55&&font>19){font-=2;balloonText.style.fontSize=`${font}px`;}
      balloon.style.opacity='0';balloon.style.transform='translate(-50%,-50%) scale(.88)';
    }
    const explanation=shot.explain?textOf(leaves[page+1]?.querySelector(shot.explain)||leaf.querySelector(shot.explain)):'';
    // Measure the caption in its centred reading position before reserving ink
    // space. A blank transform would measure its left edge at 50vw instead.
    caption.textContent=explanation||copy.text;caption.hidden=hasBalloon||shot.type||!copy.text;caption.style.fontSize=shot.glyph?'clamp(19px,3vw,32px)':'';caption.style.transform='translateX(-50%)';
    typography.hidden=!(shot.type||shot.glyph);typography.textContent=shot.type?copy.text:'';
    let glyphUnits=null;
    if(shot.glyph){glyphUnits=glyphs(typography,copy.text);typography.style.fontFamily='';typography.style.fontSize='';typography.style.width='';typography.style.left='50%';typography.style.top='42%';typography.style.transform='translate(-50%,-50%)';}
    const effects=makeLines(shot,viewport.width,viewport.height);
    const cutout=geometry?matchingCutout(shot,geometry,art):null;
    const soundScene=leaf.dataset.scene;
    const showSfx=(!!cutout||soundScene==='quotation')&&['opening','race','ambition','quotation'].includes(soundScene);
    sfx.textContent=showSfx?(soundWords[document.documentElement.lang]||soundWords['zh-Hant'])[soundScene]:'';sfx.hidden=!showSfx;
    sfx.style.left=cutout||shot.side>0?`${innerWidth*.035}px`:'auto';sfx.style.right=cutout||shot.side>0?'auto':`${innerWidth*.035}px`;sfx.style.top=`${innerHeight*(cutout?.13:.56)}px`;sfx.style.opacity='0';
    let actor=null,clipRect=null,baseline=null,target=null,startClip=null,endClip=null,typeStart=null,typeTarget=null,detach=null,bodyBox=null,mesh=null;
    if(shot.type){
      if(!copy.node||!copy.text){stop('text-not-visible');return false;}
      const source=rect(copy.node.getBoundingClientRect()),style=getComputedStyle(copy.node),font=style.fontFamily;
      typography.style.fontFamily=font;typography.style.fontSize=`${Math.min(innerWidth<600?48:90,Math.max(35,innerWidth/(copy.text.length>35?16:12)))}px`;
      typography.style.width=`${Math.min(innerWidth*.86,1100)}px`;typography.style.left='0';typography.style.top='0';typography.style.transform='none';
      const box=rect(typography.getBoundingClientRect());
      typeTarget={x:(innerWidth-box.width)/2,y:(innerHeight-box.height)/2-15,scale:1};
      typeStart={x:source.x+(source.width-box.width)/2,y:source.y+(source.height-box.height)/2,scale:Math.min(source.width/box.width,source.height/box.height)};
      sourceStyle(copy.node,{opacity:'0'});
    }else{
      const frameRect=rect(art.getBoundingClientRect()),crop=art.querySelector('.art-crop-viewport');
      const panelRect=crop?intersect(frameRect,rect(crop.getBoundingClientRect())):frameRect;
      startClip=intersect(intersect(panelRect,bookRect),viewport);
      if(startClip.width<5||startClip.height<5){stop('source-clipped');return false;}
      const clipId=`manga-impact-clip-${++sequence}`,bodyId=`manga-impact-body-${sequence}`;
      const defs=svg('defs'),outerClip=svg('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});clipRect=svg('rect');outerClip.append(clipRect);defs.append(outerClip);
      actor=svg('g',{class:'manga-impact-actor'});const image=svg('image',{href:geometry.src,x:0,y:0,width:geometry.width,height:geometry.height,preserveAspectRatio:'none'});
      if(cutout){
        const body=svg('clipPath',{id:bodyId,clipPathUnits:'userSpaceOnUse'});body.append(svg('path',{d:cutout.path,'clip-rule':cutout.fillRule||'nonzero'}));defs.append(body);image.setAttribute('clip-path',`url(#${bodyId})`);
        detach=()=>maskSources(cutout,geometry);
      }
      else if(shot.focusCrop){
        const[x,y,w,h]=shot.focusCrop,focusClip=svg('clipPath',{id:bodyId,clipPathUnits:'userSpaceOnUse'});focusClip.append(svg('rect',{x,y,width:w,height:h}));defs.append(focusClip);image.setAttribute('clip-path',`url(#${bodyId})`);
      }else{
        const polygon=originalPanelPolygon(art,geometry);
        if(polygon){const panelClip=svg('clipPath',{id:bodyId,clipPathUnits:'userSpaceOnUse'});panelClip.append(svg('polygon',{points:polygon}));defs.append(panelClip);image.setAttribute('clip-path',`url(#${bodyId})`);}
        detach=()=>hidePanelSources(art,geometry);
      }
      if(cutout&&shot.rig)mesh=window.comicPuppet?.create({defs,actor,image,box:cutout.box,name:shot.rig});
      if(!mesh)actor.append(image);const clipped=svg('g',{'clip-path':`url(#${clipId})`});clipped.append(actor);drawing.append(defs,clipped);
      baseline={x:geometry.x,y:geometry.y,scale:geometry.scale};
      const capHeight=caption.hidden?0:caption.getBoundingClientRect().height;
      const top=innerWidth<600?76:58,bottom=innerHeight-capHeight-(caption.hidden?86:65),availableH=Math.max(160,bottom-top),availableW=innerWidth*(cutout?.92:.84);
      const box=cutout?cutout.box:shot.focusCrop||[(panelRect.x-geometry.x)/geometry.scale,(panelRect.y-geometry.y)/geometry.scale,panelRect.width/geometry.scale,panelRect.height/geometry.scale];
      bodyBox=box;
      let scale=Math.min(availableW/box[2],availableH/box[3]);
      if(!cutout)scale=Math.min(scale,geometry.scale*(shot.tone==='eye'?2.3:1.75));
      // Preserve the complete pose at the settled peak. Energy comes from
      // the entry path and cut, not from hiding hands or feet off screen.
      const x=(innerWidth-box[2]*scale)/2-box[0]*scale,y=top+(availableH-box[3]*scale)/2-box[1]*scale;
      target={x,y,scale};
      if(cutout){
        const actorBottom=target.y+(box[1]+box[3])*target.scale;
        const captionTop=caption.hidden?innerHeight-24:caption.getBoundingClientRect().top;
        // The foreground can overshoot the viewport, but lettering must never
        // sit on a body. If there is no separate lower text zone, leave the
        // original wording on the readable paper after the return.
        if(!caption.hidden&&actorBottom>captionTop-32)caption.hidden=true;
        if(innerWidth<600){
          const clearBottom=caption.hidden?innerHeight-28:caption.getBoundingClientRect().top-32;
          sfx.style.top='0px';sfx.style.transform='rotate(-13deg) scale(1.42)';
          const soundBounds=sfx.hidden?{top:0,height:0}:sfx.getBoundingClientRect();
          const soundTop=actorBottom+30;
          if(!sfx.hidden&&soundTop+soundBounds.height<=clearBottom){
            sfx.style.left=`${innerWidth*.06}px`;sfx.style.right='auto';sfx.style.top=`${soundTop-soundBounds.top}px`;
          }else sfx.hidden=true;
        }
      }
      endClip=cutout?viewport:{x:x+box[0]*scale,y:y+box[1]*scale,width:box[2]*scale,height:box[3]*scale};
      setRect(clipRect,startClip);
      transform(actor,baseline);actor.style.opacity=hasBalloon||shot.glyph?'0':'1';
      if(!hasBalloon&&!shot.glyph){detach?.();detach=null;}
    }
    const duration=shot.opening?5400:shot.glyph?4400:shot.type?2850:hasBalloon?4200:2750;
    overlay.dataset.impactPage=String(page+1);overlay.dataset.impactPhase='anticipation';overlay.dataset.impactActive='true';
    run={page,spread:asSpread,shot,cutout:!!cutout,hasBalloon,phase:'anticipation',start:0,duration,actor,clipRect,baseline,target,startClip,endClip,typeStart,typeTarget,effects,burstSound:false,prepSound:false,progress:0,detach,bodyBox,mesh,glyphUnits,questionUnits};
    overlay.dataset.impactKind=cutout?'character':shot.type?'type':'panel';
    beginInk(run);
    reason='playing';overlay.dataset.stopReason='';frame=requestAnimationFrame(tick);return true;
  }
  function transform(actor,p,shakeX=0,shakeY=0,rotate=0,box=null){const cx=box?box[0]+box[2]/2:0,cy=box?box[1]+box[3]/2:0;actor.setAttribute('transform',`translate(${(p.x+shakeX).toFixed(3)} ${(p.y+shakeY).toFixed(3)}) scale(${p.scale.toFixed(6)}) rotate(${rotate.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);}
  function tick(time){
    frame=0;const item=run;if(!item)return;
    if(readerState!=='read'||reduced.matches||document.hidden){stop('interrupted');return;}
    if(item.local){tickLocal(item,time);return;}
    if(!item.start)item.start=time;const t=clamp((time-item.start)/item.duration);item.progress=t;
    const anticipation=item.shot.opening?2500/item.duration:item.shot.glyph?.30:item.hasBalloon?.28:.12,burstEnd=item.shot.opening?3150/item.duration:item.shot.glyph?.48:item.hasBalloon?.43:.25,holdEnd=item.shot.opening?4250/item.duration:item.shot.glyph?.82:item.hasBalloon?.68:.51;
    let amount,phase;
    if(t<anticipation){phase=item.shot.opening&&t*item.duration<1530?'intro':item.hasBalloon?'balloon':'anticipation';amount=item.hasBalloon?0:-.035*smooth(t/anticipation);}
    else if(t<burstEnd){phase='burst';amount=ease((t-anticipation)/(burstEnd-anticipation));}
    else if(t<holdEnd){phase='hold';amount=1;}
    else{phase='return';amount=1-smooth((t-holdEnd)/(1-holdEnd));}
    item.phase=phase;overlay.dataset.phase=phase;overlay.dataset.impactPhase=phase;overlay.dataset.shot=item.shot.tone;
    const enter=smooth(t/.065),exit=1-smooth((t-.85)/.15);
    backdrop.style.opacity=((item.shot.opening?1:enter)*exit*.998).toFixed(4);
    const burstProgress=clamp((t-anticipation)/(burstEnd-anticipation));
    const shake=phase==='burst'?Math.pow(1-burstProgress,2)*(item.cutout?8:3.5):0;
    const sx=Math.sin(t*570)*shake,sy=Math.cos(t*430)*shake*.55;
    drawing.style.transform=`translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
    item.effects.group.style.opacity=(enter*exit*(phase==='balloon'?.15:phase==='burst'?.82:.40)).toFixed(3);
    item.effects.ribbon.style.opacity=(enter*exit*.16).toFixed(3);
    const sfxStart=innerWidth<600&&item.cutout?burstEnd:anticipation+.035;
    const sfxAmount=smooth((t-sfxStart)/.04)*(1-smooth((t-(holdEnd-.12))/.09));
    sfx.style.opacity=sfxAmount.toFixed(4);sfx.style.transform=`rotate(${item.shot.side*9-3}deg) skewX(-7deg) scale(${(1+.16*(1-sfxAmount)).toFixed(4)})`;
    const strong=item.cutout||['resolve','eye'].includes(item.shot.tone);
    if(!item.prepSound&&t>=Math.max(0,anticipation-.065)){item.prepSound=true;if(strong)window.comicSound?.play('prepare');}
    if(!item.burstSound&&t>=anticipation){item.burstSound=true;if(strong)window.comicSound?.play(item.shot.tone==='track'||item.shot.tone==='feet'?'start':'impact');}
    if(item.hasBalloon){
      const milliseconds=t*item.duration;
      const pop=item.shot.opening?smooth((milliseconds-1530)/140):smooth(t/.075),shrink=item.shot.opening?smooth((milliseconds-2220)/260):smooth((t-.19)/.09),fade=item.shot.opening?1-smooth((milliseconds-2290)/210):1-smooth((t-.225)/.055);
      const size=mix(.84,1.08,pop)*(1-.27*shrink);
      balloon.style.opacity=(pop*fade).toFixed(4);
      balloon.style.transform=`translate(-50%,-50%) translateY(${-20*shrink}px) scale(${size.toFixed(4)}) rotate(${(-2+2*shrink).toFixed(3)}deg)`;
      if(item.questionUnits){
        item.questionUnits.forEach((unit,i)=>{const p=clamp((milliseconds-1590-i*42)/70);unit.style.opacity=String(smooth(p/.65));unit.style.transform=`scale(${(1+(1-ease(p))*1.15).toFixed(4)})`;});
        const appear=smooth(milliseconds/100),leave=1-smooth((milliseconds-1350)/190);
        intro.style.opacity=String(appear*leave);intro.style.transform=`translate(-50%,-50%) scale(${(1+.16*(1-ease(milliseconds/220))).toFixed(4)})`;
      }
    }
    if(item.glyphUnits){
      const span=.15/Math.max(1,item.glyphUnits.length-1);
      item.glyphUnits.forEach((unit,i)=>{const p=clamp((t-.02-i*span)/.035);unit.style.opacity=String(smooth(p/.5));unit.style.transform=`scale(${(1+(1-ease(p))*2).toFixed(4)}) rotate(${((i%2?1:-1)*(1-ease(p))*7).toFixed(2)}deg)`;});
      typography.style.opacity=String(1-smooth((t-.22)/.06));
    }
    if(item.actor){
      const shown=(!item.hasBalloon&&!item.shot.glyph)||t>=anticipation;
      overlay.dataset.characterVisible=String(shown);
      if(shown&&item.detach){item.detach();item.detach=null;}
      const p={x:mix(item.baseline.x,item.target.x,amount),y:mix(item.baseline.y,item.target.y,amount),scale:mix(item.baseline.scale,item.target.scale,amount)};
      const travel=phase==='burst'?Math.sin(burstProgress*Math.PI)*(1-burstProgress):0;
      let dx=0,dy=0,angle=0;
      if(item.shot.move==='sprint-left'){dx=-innerWidth*.18*travel;dy=innerHeight*.06*travel;}
      if(item.shot.move==='sprint-right'){dx=innerWidth*.16*travel;dy=-innerHeight*.08*travel;}
      if(item.shot.move==='rise'){dy=innerHeight*.22*travel;}
      if(item.shot.move==='slide-left')dx=-innerWidth*.21*travel;
      if(item.shot.move==='slide-right')dx=innerWidth*.20*travel;
      if(item.shot.move==='diagonal'){dx=innerWidth*.14*travel;dy=innerHeight*.16*travel;angle=4*travel;}
      if(item.shot.move==='tilt'){dx=-innerWidth*.10*travel;angle=-7*travel;}
      if(item.shot.move==='orbit'){dx=-innerWidth*.10*travel;dy=-innerHeight*.12*travel;angle=5*travel;}
      if(item.shot.move==='cut')dx=innerWidth*.08*travel;
      transform(item.actor,p,dx,dy,angle,item.bodyBox);
      if(item.bodyBox){
        const [x,y,w,h]=item.bodyBox,bw=w*p.scale,bh=h*p.scale,a=Math.abs(angle)*Math.PI/180;
        const rw=Math.abs(bw*Math.cos(a))+Math.abs(bh*Math.sin(a)),rh=Math.abs(bw*Math.sin(a))+Math.abs(bh*Math.cos(a));
        const cx=p.x+dx+(x+w/2)*p.scale,cy=p.y+dy+(y+h/2)*p.scale;
        item.inkActorBounds={x:cx-rw/2-18,y:cy-rh/2-18,width:rw+36,height:rh+36};
      }
      item.mesh?.update(Math.max(0,(time-item.start-anticipation*item.duration)/1000),Math.max(0,amount)*smooth((t-anticipation)/.06)*(1-smooth((t-holdEnd)/.20)));
      const release=item.cutout?clamp(amount*2.4):clamp(amount),r={};for(const key of ['x','y','width','height'])r[key]=mix(item.startClip[key],item.endClip[key],release);setRect(item.clipRect,r);
      item.actor.style.opacity=shown?'1':'0';
    }
    if(item.shot.type){
      const p={x:mix(item.typeStart.x,item.typeTarget.x,amount),y:mix(item.typeStart.y,item.typeTarget.y,amount),scale:mix(item.typeStart.scale,item.typeTarget.scale,amount)};
      typography.style.transform=`translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px) scale(${p.scale.toFixed(5)})`;
      typography.style.opacity=t>.93?String(1-smooth((t-.93)/.07)):String(smooth(t/.035));
    }else{
      const cap=item.shot.glyph?smooth((t-.58)/.05)*(1-smooth((t-.86)/.14)):smooth((t-.22)/.06)*(1-smooth((t-.57)/.17));caption.style.opacity=cap.toFixed(4);caption.style.transform=`translateX(-50%) translateY(${(18*(1-cap)).toFixed(2)}px) scale(${(1+.12*(1-cap)).toFixed(4)})`;
    }
    paintInk(item,time,t,enter*exit);
    if(t<1)frame=requestAnimationFrame(tick);else finish(item);
  }
  function queue(){
    if(firstOpening.eligible&&!firstOpening.consumed&&currentPage===0){queueFirstOpening();return;}
    stop('queued');if(reduced.matches||readerState!=='read'||document.hidden)return;
    window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:true}}));
    const token=sequence,page=currentPage,mode=spread;
    pending=requestAnimationFrame(()=>{pending=requestAnimationFrame(()=>{pending=0;if(token===sequence&&page===currentPage&&mode===spread)start(page,mode);});});
  }
  function entryStatus(state,why=''){
    overlay.dataset.firstEntryState=state;overlay.dataset.firstEntryReason=why;
  }
  function firstOpeningPending(){return firstOpening.pending&&settling?.kind==='first-entry';}
  function wakeFirstOpening(){
    if(!firstOpeningPending())return;
    if(document.hidden){
      if(pending)cancelAnimationFrame(pending);pending=0;
      settling.snapshot='';settling.quietSince=performance.now();entryStatus('waiting','visibility');return;
    }
    if(!pending)pending=requestAnimationFrame(waitForFirstOpening);
  }
  function queueFirstOpening(){
    if(firstOpeningPending()){
      if(settling.mode!==spread){settling.mode=spread;settling.snapshot='';settling.quietSince=performance.now();}
      wakeFirstOpening();return;
    }
    stop('first-entry-queued');
    if(reduced.matches||readerState!=='read'){firstOpening.consumed=true;entryStatus('cancelled',reduced.matches?'reduced-motion':'reader-state');return;}
    firstOpening.pending=true;
    settling={kind:'first-entry',token:sequence,page:currentPage,mode:spread,began:performance.now(),quietSince:performance.now(),snapshot:''};
    // Startup is passive: do not summon the overlay, disable corners or scroll
    // the reader while fonts, images and native fragment positioning settle.
    entryStatus('waiting','document');wakeFirstOpening();
  }
  function waitForFirstOpening(time){
    pending=0;const request=settling;
    if(!firstOpeningPending()||!request)return;
    if(request.token!==sequence||currentPage!==0||request.page!==currentPage||request.mode!==spread||readerState!=='read'||reduced.matches){stop('first-entry-interrupted');return;}
    if(document.hidden){wakeFirstOpening();return;}
    const art=leaves[0]?.querySelector(shots[0].art),img=art?.querySelector('img.art-image');
    const needs=document.readyState!=='complete'?'document':stage.dataset.ready!=='true'?'book':
      stage.dataset.turnState&&stage.dataset.turnState!=='read'?'book-turn':
      !img?.complete||!img.naturalWidth?'image':document.fonts&&document.fonts.status!=='loaded'?'fonts':'';
    if(needs){request.snapshot='';request.quietSince=time;entryStatus('waiting',needs);return;}
    const r=stage.getBoundingClientRect();
    // Source art can already have its normal page-pan transform. It is not
    // layout movement and must not postpone the entrance until that pan ends.
    const snapshot=[scrollX,scrollY,innerWidth,innerHeight,r.x,r.y,r.width,r.height].map(value=>Math.round(value*10)/10).join(',');
    if(snapshot!==request.snapshot){request.snapshot=snapshot;request.quietSince=time;}
    entryStatus('settling','layout');
    if(time-request.quietSince<180||time<suppressedUntil){pending=requestAnimationFrame(waitForFirstOpening);return;}
    // Consume before starting, so the start/finish cleanup cannot queue a
    // second entrance. A transient geometry failure may wait for a real wake.
    firstOpening.pending=false;firstOpening.consumed=true;settling=null;entryStatus('starting');
    const played=start(0,request.mode);
    if(played){firstOpening.starts++;overlay.dataset.firstEntryStarts=String(firstOpening.starts);entryStatus('started');return;}
    if(['waiting-for-image','source-not-visible','book-offscreen','start-suppressed'].includes(reason)){
      firstOpening.pending=true;firstOpening.consumed=false;
      settling={...request,token:sequence,quietSince:time,snapshot:''};entryStatus('waiting',reason);
      if(reason==='start-suppressed')wakeFirstOpening();
    }else entryStatus('cancelled',reason);
  }
  function replayAfterLayout(){
    stop('replay-settling');if(reduced.matches||readerState!=='read'||document.hidden)return;
    window.dispatchEvent(new CustomEvent('manga:impactstate',{detail:{active:true}}));
    // Focusing an off-centre replay button can scroll the document after its
    // click. Wait for that native focus/layout adjustment before measuring the
    // source; wheel/touch gestures still cancel this pending request normally.
    settling={token:sequence,page:currentPage,mode:spread,began:performance.now(),quietSince:performance.now(),snapshot:''};
    // Replaying from the controls should bring the drawing back into view,
    // rather than animate lettering above the reader's viewport.
    stage.scrollIntoView({block:'center',behavior:'instant'});
    pending=requestAnimationFrame(waitForReplayLayout);
  }
  function waitForReplayLayout(time){
    pending=0;const request=settling;if(!request)return;
    if(request.token!==sequence||request.page!==currentPage||request.mode!==spread||readerState!=='read'||reduced.matches||document.hidden){stop('replay-interrupted');return;}
    const r=stage.getBoundingClientRect();
    const snapshot=[scrollX,scrollY,innerWidth,innerHeight,r.x,r.y,r.width,r.height].map(value=>Math.round(value*10)/10).join(',');
    if(snapshot!==request.snapshot){request.snapshot=snapshot;request.quietSince=time;}
    if(time-request.quietSince>=110&&time-request.began>=140&&time>=suppressedUntil){
      settling=null;start(request.page,request.mode);return;
    }
    if(time-request.began>1100){stop('replay-layout-unstable');return;}
    pending=requestAnimationFrame(waitForReplayLayout);
  }
  const originalSync=window.comicMotion.sync.bind(window.comicMotion),originalSelection=window.comicMotion.selection.bind(window.comicMotion);
  window.comicMotion.sync=(page,asSpread,nextState)=>{
    if(nextState==='fold_corner'&&(run||pending||settling))nextState='read';
    originalSync(page,asSpread,nextState);
    const playPage=nextState==='flipping'&&readerState!=='flipping';
    const key=`${page}-${asSpread?'spread':'single'}`,changed=key!==lastKey;
    if(changed&&lastKey&&nextState==='read'&&readerState==='read'&&reduced.matches)window.comicSound?.play('page');
    currentPage=page;spread=asSpread;readerState=nextState;
    if(firstOpeningPending()&&page!==0)stop('first-entry-navigation');
    if(nextState!=='read'){stop('page-turn');if(playPage)window.comicSound?.play('page');return;}
    if(changed){lastKey=key;queue();}
  };
  window.comicMotion.selection=()=>{originalSelection();if(leaves[currentPage]?.dataset.scene==='reflection')queue();};
  document.querySelector('.motion-replay')?.addEventListener('click',replayAfterLayout);
  skip.addEventListener('click',()=>{stop('skipped');stage.focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{
    if(firstOpeningPending()&&event.isTrusted){stop('first-entry-key');return;}
    if(event.key==='Escape'&&(run||settling||pending)){stop('skipped');event.preventDefault();return;}
    if(!settling)return;
    const controls=event.target.closest('button,a,input,textarea,select');
    if(['PageUp','PageDown'].includes(event.key)||(!controls&&['ArrowUp','ArrowDown',' '].includes(event.key))||(!event.target.closest('.book-stage')&&['Home','End'].includes(event.key)))stop('user-scroll');
  });
  window.addEventListener('manga:languagechange',()=>{stop('language-change');label();});
  window.addEventListener('resize',()=>{suppressedUntil=performance.now()+350;if(settling){settling.quietSince=performance.now();if(firstOpeningPending())wakeFirstOpening();return;}stop('resize');},{passive:true});
  window.addEventListener('scroll',()=>{if(settling){settling.quietSince=performance.now();if(firstOpeningPending())wakeFirstOpening();return;}if(run||pending)stop('scroll');},{passive:true});
  const cancelFirstOpeningIntent=event=>{if(firstOpeningPending()&&event.isTrusted)stop('first-entry-intent');};
  for(const name of ['pointerdown','touchstart'])window.addEventListener(name,cancelFirstOpeningIntent,{passive:true,capture:true});
  const cancelUserScroll=()=>{if(settling||run||pending)stop('user-scroll');};
  window.addEventListener('wheel',cancelUserScroll,{passive:true,capture:true});
  window.addEventListener('touchmove',cancelUserScroll,{passive:true,capture:true});
  document.addEventListener('visibilitychange',()=>{if(firstOpeningPending()){wakeFirstOpening();return;}if(document.hidden)stop('hidden');});
  window.addEventListener('pagehide',()=>stop('pagehide'));
  window.addEventListener('beforeprint',()=>stop('print'));
  matchMedia('print').addEventListener('change',event=>{if(event.matches)stop('print');});
  reduced.addEventListener('change',()=>stop('motion-preference'));
  document.addEventListener('load',event=>{if(firstOpeningPending()){wakeFirstOpening();return;}if(event.target.matches?.('#comic-book img.art-image')&&reason==='waiting-for-image'&&readerState==='read')queue();},true);
  window.addEventListener('load',wakeFirstOpening,{passive:true});
  document.fonts?.addEventListener('loadingdone',wakeFirstOpening);
  document.fonts?.addEventListener('loadingerror',wakeFirstOpening);
  const entryObserver=new MutationObserver(()=>wakeFirstOpening());
  entryObserver.observe(stage,{attributes:true,attributeFilter:['data-ready','data-turn-state','data-mode']});
  window.comicImpact=Object.freeze({stop:()=>stop('manual'),getState:()=>({active:!!run,pending:!!pending,page:currentPage,spread,phase:run?.phase||'idle',progress:run?.progress||0,kind:run?(run.cutout?'character':run.shot.type?'type':'panel'):null,reason,sourceMasks:restorers.length})});
  label();
})();
