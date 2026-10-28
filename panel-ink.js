/* Small complete ink strokes beside the live manga art. No masks, copies,
   independent clocks or layout reads while an animation is playing. */
(() => {
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  const clamp=value=>Math.max(0,Math.min(1,value));
  const ease=value=>1-Math.pow(1-clamp(value),3);
  const smooth=value=>{value=clamp(value);return value*value*(3-2*value);};
  const box=r=>({x:r.x??r.left,y:r.y??r.top,width:r.width,height:r.height});
  const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};};
  const expand=(r,x,y=x)=>({x:r.x-x,y:r.y-y,width:r.width+x*2,height:r.height+y*2});
  const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const[key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
  function visible(n){
    if(!n)return false;
    const owner=n.closest?.('.leaf');
    if(owner?.getAttribute('aria-hidden')==='true')return false;
    const r=n.getBoundingClientRect(),style=getComputedStyle(n);
    return r.width>2&&r.height>2&&style.display!=='none'&&style.visibility!=='hidden'&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
  }
  function pictureBox(art,viewport){
    if(!visible(art))return null;
    let r=intersect(box(art.getBoundingClientRect()),viewport);
    const crop=art.querySelector('.art-crop-viewport');
    if(crop)r=intersect(r,box(crop.getBoundingClientRect()));
    const panel=art.closest('.panel,.spread-window,.mobile-word-picture');
    if(panel)r=intersect(r,box(panel.getBoundingClientRect()));
    const leaf=art.closest('.leaf');
    if(leaf)r=intersect(r,box(leaf.getBoundingClientRect()));
    return r.width>8&&r.height>8?r:null;
  }
  function motionMargin(r){
    const base=innerWidth<600?10:14;
    // Cover the existing source-only 1.023 scale, off-centre transform origin,
    // .65 degree rotation and 1.5px rise, even on a large desktop spread.
    const turn=Math.hypot(r.width,r.height)*Math.sin(.65*Math.PI/180);
    return{x:Math.max(base,Math.ceil(r.width*.023+turn+2)),y:Math.max(base,Math.ceil(r.height*.023+turn+3))};
  }
  function segmentSweeps(mark){
    const pad=mark.width/2+1;
    return mark.lines.flatMap(points=>points.slice(1).map((b,index)=>{
      const a=points[index],x=Math.min(a[0],b[0])+Math.min(0,mark.dx)-pad,y=Math.min(a[1],b[1])+Math.min(0,mark.dy)-pad;
      return{x,y,width:Math.abs(a[0]-b[0])+Math.abs(mark.dx)+pad*2,height:Math.abs(a[1]-b[1])+Math.abs(mark.dy)+pad*2};
    }));
  }
  function safe(mark,protectedRects,viewport){
    return segmentSweeps(mark).every(r=>r.x>=viewport.x&&r.y>=viewport.y&&r.x+r.width<=viewport.x+viewport.width&&r.y+r.height<=viewport.y+viewport.height&&!protectedRects.some(p=>overlap(r,p)));
  }
  function candidates(r,variant){
    const compact=innerWidth<600,length=compact?18:26,gap=7;
    const x=r.x,y=r.y,right=x+r.width,bottom=y+r.height;
    const mark=(lines,dx=0,dy=0,width=2.2)=>({lines,dx,dy,width});
    const corners=[
      mark([[[x-gap,y+length],[x-gap,y-gap],[x+length,y-gap]]],-2,-2),
      mark([[[right-length,y-gap],[right+gap,y-gap],[right+gap,y+length]]],2,-2),
      mark([[[right+gap,bottom-length],[right+gap,bottom+gap],[right-length,bottom+gap]]],2,2),
      mark([[[x+length,bottom+gap],[x-gap,bottom+gap],[x-gap,bottom-length]]],-2,2)
    ];
    const upper=mark([[[x+r.width*.32,y-gap],[x+r.width*.32+length,y-gap]],[[x+r.width*.32+7,y-gap-5],[x+r.width*.32+length,y-gap-5]]],2,0,1.6);
    const lower=mark([[[x+r.width*.57,bottom+gap],[x+r.width*.57+length,bottom+gap]],[[x+r.width*.57,bottom+gap+5],[x+r.width*.57+length-7,bottom+gap+5]]],-2,0,1.6);
    const left=mark([[[x-gap,y+r.height*.35],[x-gap,y+r.height*.35+length]]],-2,0);
    const rightMark=mark([[[right+gap,y+r.height*.54],[right+gap,y+r.height*.54+length]]],2,0);
    const ordered={
      breath:[corners[0],corners[2],lower,left,rightMark,upper,...corners],
      'eye-shutter':[upper,lower,rightMark,left,...corners],
      resolve:[corners[1],corners[3],rightMark,upper,lower,left,...corners],
      'paper-cut':[corners[0],corners[2],left,lower,upper,rightMark,...corners]
    };
    return[...new Set(ordered[variant]||ordered.breath)];
  }
  function prepare({drawing,art,leaves,variant='breath'}={}){
    if(!drawing||!art)return null;
    drawing.dataset.panelInkCount='0';
    const viewport={x:5,y:5,width:Math.max(0,innerWidth-10),height:Math.max(0,innerHeight-10)};
    const picture=pictureBox(art,viewport);
    if(!picture)return null;
    const protectedRects=[],roots=Array.from(leaves||document.querySelectorAll('#comic-book>.leaf')).filter(n=>n.getAttribute('aria-hidden')!=='true');
    const arts=new Set([art,...roots.flatMap(leaf=>Array.from(leaf.querySelectorAll('.art')))]);
    for(const other of arts){
      const r=pictureBox(other,viewport);if(!r)continue;
      const pad=motionMargin(r);protectedRects.push(expand(r,pad.x,pad.y));
    }
    // A hidden-opacity source paragraph is still protected: its live lettering
    // counterpart may be animating above it. Display/visibility alone exclude it.
    for(const root of roots)for(const n of root.querySelectorAll('h1,h2,h3,p,[data-book-text],.balloon,.word-choice')){
      if(n.closest('.art')||!visible(n))continue;
      protectedRects.push(expand(box(n.getBoundingClientRect()),7));
    }
    for(const n of document.querySelectorAll('.reader-header,.reader-controls,.reader-help,.reading-hint,.motion-replay,.comic-sound-toggle'))if(visible(n))protectedRects.push(expand(box(n.getBoundingClientRect()),6));
    const pad=motionMargin(picture),outer=expand(picture,pad.x,pad.y),accepted=[],used=[];
    for(const mark of candidates(outer,variant)){
      if(!safe(mark,[...protectedRects,...used],viewport))continue;
      accepted.push(mark);used.push(...segmentSweeps(mark));
      if(accepted.length>=3)break;
    }
    if(!accepted.length)return null;
    const groups=[],steps=[];
    for(const [index,mark]of accepted.entries()){
      const g=node('g',{'data-panel-ink':'true','data-ink-safe':'true','data-ink-variant':variant,'data-ink-step':index,'data-ink-sweeps':JSON.stringify(segmentSweeps(mark)),opacity:0});
      for(const points of mark.lines){const d=points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');g.append(node('path',{d,fill:'none',stroke:'#111','stroke-width':mark.width,'stroke-linecap':'butt','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));}
      drawing.append(g);groups.push(g);steps.push({node:g,dx:mark.dx,dy:mark.dy,delay:index*.045});
    }
    drawing.dataset.panelInkCount=String(groups.length);
    drawing.dataset.panelInkVariant=variant;
    return{drawing,groups,steps,count:groups.length,picture,protectedRects,viewport};
  }
  function paint(result,progress){
    if(!result)return;
    const p=clamp(progress),leave=1-smooth((p-.66)/.34);
    for(const step of result.steps){
      const entered=clamp((p-step.delay)/.18),amount=1-ease(entered);
      step.node.setAttribute('opacity',(smooth((p-step.delay)/.09)*leave*.78).toFixed(3));
      step.node.setAttribute('transform',`translate(${(step.dx*amount).toFixed(3)} ${(step.dy*amount).toFixed(3)})`);
    }
  }
  function clear(result){
    if(!result)return;
    for(const g of result.groups)g.remove();
    if(result.drawing)result.drawing.dataset.panelInkCount='0';
  }
  window.mangaPanelInk=Object.freeze({prepare,paint,clear});
})();
