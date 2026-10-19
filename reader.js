(() => {
  'use strict';
  const {showArt,fitArt,reflections,reducedMotion}=window.mangaDrawing;
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-word]');if(!button)return;
    const word=button.dataset.word,selection=reflections[word];
    document.querySelectorAll('[data-word]').forEach(other=>other.setAttribute('aria-pressed',String(other.dataset.word===word)));
    document.querySelectorAll('.monologue-text').forEach(text=>text.textContent=selection.text);
    document.querySelectorAll('.word-art').forEach(frame=>showArt(frame,selection.art,true));
    document.querySelectorAll('.selection-art-description').forEach(node=>node.textContent=window.MANGA_ASSETS[selection.art].alt);
    window.comicMotion?.selection();
  });
  document.addEventListener('keydown',event=>{
    const button=event.target.closest('[data-word]');if(!button)return;
    const buttons=[...button.closest('.word-panels').querySelectorAll('[data-word]')],index=buttons.indexOf(button);let next;
    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%buttons.length;
    if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;
    if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
    if(next!==undefined){event.preventDefault();event.stopPropagation();buttons[next].focus();}
  });
  const surface=document.querySelector('#comic-book'),stage=document.querySelector('.book-stage');
  const leaves=[...surface.querySelectorAll('.leaf')];
  const count=document.querySelector('.page-count'),chapter=document.querySelector('.chapter-name');
  const prev=document.querySelector('.page-prev'),next=document.querySelector('.page-next');
  const contents=document.querySelector('#contents'),toggle=document.querySelector('.contents-toggle');
  let book,busy=false,currentPage=0;
  function setContents(open){contents.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.querySelector('span').textContent=open?'−':'＋';}
  toggle.addEventListener('click',()=>setContents(contents.hidden));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!contents.hidden){setContents(false);toggle.focus();}});
  function syncBook(){
    if(!book)return;
    currentPage=book.getCurrentPageIndex();
    const spread=book.getOrientation()==='landscape',last=Math.min(leaves.length-1,currentPage+(spread?1:0));
    count.textContent=String(currentPage+1).padStart(2,'0')+(spread?'–'+String(last+1).padStart(2,'0'):'')+' / '+leaves.length;
    chapter.textContent=leaves[currentPage].dataset.title;
    prev.disabled=currentPage===0||busy;next.disabled=last===leaves.length-1||busy;
    stage.dataset.mode=spread?'spread':'single';
    surface.style.setProperty('--leaf-scale',book.getBoundsRect().pageWidth/450);
    leaves.forEach((leaf,index)=>{
      const visible=index>=currentPage&&index<=last;
      if(!visible&&leaf.contains(document.activeElement))stage.focus({preventScroll:true});
      leaf.inert=!visible;leaf.setAttribute('aria-hidden',String(!visible));
    });
    // The portrait renderer creates a temporary visual copy, never a second focus surface.
    surface.querySelectorAll('.leaf').forEach(leaf=>{if(!leaves.includes(leaf)){leaf.inert=true;leaf.setAttribute('aria-hidden','true');leaf.removeAttribute('id');}});
    window.comicMotion?.sync(currentPage,spread,stage.dataset.turnState||'read');
    const links=[...contents.querySelectorAll('a')];
    links.forEach((link,i)=>{
      const start=leaves.findIndex(leaf=>leaf.id===link.hash.slice(1));
      const end=links[i+1]?leaves.findIndex(leaf=>leaf.id===links[i+1].hash.slice(1)):leaves.length;
      if(currentPage>=start&&currentPage<end)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    });
  }
  function turn(direction){
    if(!book||busy||(direction<0&&prev.disabled)||(direction>0&&next.disabled))return;
    if(reducedMotion.matches){direction>0?book.turnToNextPage():book.turnToPrevPage();syncBook();}
    else{
      // The library's corner-only click check also blocks its synthetic portrait
      // previous-page point. Buttons and swipes have already passed our guard.
      const settings=book.getSettings(),cornerOnly=settings.disableFlipByClick;
      settings.disableFlipByClick=false;
      try{direction>0?book.flipNext('bottom'):book.flipPrev('bottom');}
      finally{settings.disableFlipByClick=cornerOnly;}
    }
  }
  prev.addEventListener('click',()=>turn(-1));next.addEventListener('click',()=>turn(1));
  stage.addEventListener('keydown',event=>{
    if(event.target.closest('button,a,input,select,textarea'))return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();turn(event.key==='ArrowRight'?1:-1);}
    if(event.key==='Home'||event.key==='End'){event.preventDefault();book?.turnToPage(event.key==='Home'?0:leaves.length-1);syncBook();}
  });
  function goToHash(hash,focus=false,closeContents=true){
    const index=leaves.findIndex(leaf=>leaf.id===hash.slice(1));if(index<0||!book)return;
    book.getRender().finishAnimation();busy=false;
    book.turnToPage(index);syncBook();if(closeContents)setContents(false);if(focus)stage.focus({preventScroll:true});
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');if(!link||!leaves.some(leaf=>leaf.id===link.hash.slice(1)))return;
    event.preventDefault();history.replaceState(null,'',link.hash);goToHash(link.hash,true);
  });
  window.addEventListener('hashchange',()=>goToHash(location.hash));
  let touchStart;
  stage.addEventListener('touchstart',event=>{touchStart=null;if(event.touches.length!==1||event.target.closest('button,a'))return;const t=event.touches[0];touchStart={x:t.clientX,y:t.clientY};},{passive:true,capture:true});
  stage.addEventListener('touchmove',event=>{
    if(!touchStart)return;
    const t=event.touches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;
    if(Math.abs(dx)>15&&Math.abs(dx)>Math.abs(dy)*1.4&&event.cancelable)event.preventDefault();
  },{passive:false});
  stage.addEventListener('touchend',event=>{if(!touchStart)return;const t=event.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4){if(event.cancelable)event.preventDefault();turn(dx<0?1:-1);}},{passive:false});
  stage.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});
  function initBook(page=0){
    if(!window.St?.PageFlip)return;
    document.body.classList.add('book-ready');
    book=new St.PageFlip(surface,{width:450,height:700,size:'stretch',minWidth:280,maxWidth:480,minHeight:300,maxHeight:900,usePortrait:true,autoSize:true,showCover:false,startPage:page,drawShadow:!reducedMotion.matches,maxShadowOpacity:.24,flippingTime:720,mobileScrollSupport:false,swipeDistance:45,clickEventForward:true,disableFlipByClick:true,useMouseEvents:true,showPageCorners:!reducedMotion.matches});
    book.on('flip',syncBook);book.on('changeOrientation',()=>requestAnimationFrame(syncBook));
    book.on('changeState',event=>{stage.dataset.turnState=event.data;busy=event.data==='flipping'||event.data==='user_fold';syncBook();if(!busy)requestAnimationFrame(()=>document.querySelectorAll('[data-art]').forEach(fitArt));});
    book.on('init',()=>{syncBook();goToHash(location.hash,false,false);stage.dataset.ready='true';});book.loadFromHTML(leaves);
    requestAnimationFrame(()=>{syncBook();document.querySelectorAll('[data-art]').forEach(fitArt);});
  }
  // Keep a single renderer alive when the OS preference changes.
  // Touch swipes use one directional gesture so vertical reading scroll stays available.
  // Mouse corners still follow the paper fold; reduced-motion swipes stay instant.
  for(const name of ['mousedown','touchstart'])surface.addEventListener(name,event=>{
    if(name==='touchstart'||reducedMotion.matches||event.target.closest('button,a,input,select,textarea'))event.stopPropagation();
  },true);
  reducedMotion.addEventListener('change',()=>{
    if(!book)return;
    book.getRender().finishAnimation();
    const settings=book.getSettings();
    settings.drawShadow=!reducedMotion.matches;settings.showPageCorners=!reducedMotion.matches;
    // The capture gate controls drag after a live preference change.
    settings.useMouseEvents=true;busy=false;syncBook();
  });
  new ResizeObserver(()=>{if(book)requestAnimationFrame(syncBook);}).observe(stage);
  initBook();
})();

