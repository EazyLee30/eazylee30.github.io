/* One lattice for the Omarchy-Font outline, drifting dither and cursor light. */
(() => {
  const host=document.querySelector('.hero');
  const target=document.querySelector('.wordmark-target');
  const data=document.getElementById('wordmark-data');
  if (!host || !target || !data) return;
  const glyph=JSON.parse(data.textContent);
  const canvas=document.createElement('canvas');canvas.className='hero-field';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const bayer=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
  const hash=n=>{let k=Math.imul(n+127,1597334677);k^=k>>>15;return (k>>>0)/4294967295;};
  const noise=new Float32Array(64*64);
  for(let i=0;i<noise.length;i++)noise[i]=hash(i);
  for(let pass=0;pass<3;pass++){
    const copy=noise.slice();
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=copy[((y+dy+64)&63)*64+((x+dx+64)&63)];noise[y*64+x]=sum/9;
    }
  }
  const range=[Math.min(...noise),Math.max(...noise)];for(let i=0;i<noise.length;i++)noise[i]=(noise[i]-range[0])/(range[1]-range[0]);
  function sample(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;const a=noise[(yi&63)*64+(xi&63)],b=noise[(yi&63)*64+((xi+1)&63)],c=noise[((yi+1)&63)*64+(xi&63)],d=noise[((yi+1)&63)*64+((xi+1)&63)];return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;}
  const rgb=color=>{const probe=document.createElement('span');probe.style.color=color;probe.hidden=true;document.body.append(probe);const v=getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0,3).map(Number)||[0,0,0];probe.remove();return v;};
  const mix=(a,b,n)=>'rgb('+a.map((v,i)=>Math.round(v*(1-n)+b[i]*n)).join(',')+')';
  let palette,visible=true,frame=0,last=0,origin=performance.now()+180,geom,quiet=[];
  let effect=null,effectPending=!motion.matches,effectToken=0,effectModule;
  async function restartEffect(){
    const token=++effectToken;effect?.free();effect=null;if(motion.matches){effectPending=false;return;}effectPending=true;
    try{effectModule??=import('/assets/js/word-effects.js?v=20261011l');const mod=await effectModule;const next=await mod.createEffect(glyph,palette.bands);if(token!==effectToken){next.free();return;}effect=next;effectPending=false;canvas.dataset.effect=next.name;start();}
    catch(_){if(token!==effectToken)return;effectPending=false;origin=performance.now();start();}
  }
  const pointer={x:-1000,y:-1000,power:0,target:0};let pings=[];
  function colors(){
    const style=getComputedStyle(document.documentElement),bg=rgb(style.getPropertyValue('--bg')),ink=rgb(style.getPropertyValue('--accent'));
    const light=style.colorScheme==='light';
    palette={bg:mix(bg,bg,0),bands:light?[mix(ink,[0,0,0],.32),mix(ink,[0,0,0],.1),mix(ink,bg,.08),mix(ink,bg,.38),mix(ink,bg,.66)]:[mix(ink,[255,255,255],.3),mix(ink,[255,255,255],.12),mix(ink,bg,0),mix(ink,bg,.25),mix(ink,bg,.56)]};
  }
  function measure(){
    const box=host.getBoundingClientRect(),word=target.getBoundingClientRect();if(!box.width||!word.width)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    geom={w,h,dpr,x:(word.left-box.left)*dpr,y:(word.top-box.top)*dpr,cw:word.width*dpr/glyph.width,ch:word.height*dpr/glyph.height};
    quiet=[...host.querySelectorAll('.hero-intro h2,.hero-intro p,.hero-actions')].map(e=>{const b=e.getBoundingClientRect();return {l:(b.left-box.left)*dpr,r:(b.right-box.left)*dpr,t:(b.top-box.top)*dpr,b:(b.bottom-box.top)*dpr,pad:(e.matches('.hero-actions')?28:65)*dpr};});
  }
  function paint(now){
    if(!geom)return;const {w,h,dpr,x,y,cw,ch}=geom;const t=motion.matches?0:now/1000;
    ctx.fillStyle=palette.bg;ctx.fillRect(0,0,w,h);pointer.power+=(pointer.target-pointer.power)*.18;
    pings=pings.filter(p=>now-p.born<1300);
    const glow=(cx,cy)=>{
      const distance=Math.hypot(cx-pointer.x*dpr,cy-pointer.y*dpr),reach=140*dpr;
      let power=distance<reach?Math.pow(1-distance/reach,2)*pointer.power:0;
      for(const p of pings){const r=(now-p.born)/1300*280*dpr;const delta=Math.abs(Math.hypot(cx-p.x*dpr,cy-p.y*dpr)-r);if(delta<20*dpr)power=Math.max(power,(1-delta/(20*dpr))*(1-(now-p.born)/1300));}
      return power;
    };
    const col0=Math.floor(-x/cw),row0=Math.floor(-y/ch),col1=Math.ceil((w-x)/cw),row1=Math.ceil((h-y)/ch);
    for(let row=row0;row<row1;row++)for(let col=col0;col<col1;col++){
      if(row>=0&&row<glyph.height&&col>=0&&col<glyph.width&&glyph.rows[row][col]==='1')continue;
      const cx=x+(col+.5)*cw,cy=y+(row+.5)*ch;
      let clear=1;for(const q of quiet){const dist=Math.hypot(Math.max(q.l-cx,0,cx-q.r),Math.max(q.t-cy,0,cy-q.b));clear=Math.min(clear,Math.min(1,Math.pow(dist/q.pad,3)));}
      const nx=cx/w*2-1,py=cy/h,side=Math.pow(Math.abs(nx),4);
      const drift=sample(col/16+t*.15,row/16-t*.07),light=glow(cx,cy);
      // Denser edges settle into a slowly shifting pixel bank along the bottom.
      const shoreline=.77+.075*Math.sin(nx*5.5+t*.1)+.06*(drift-.5);
      const bank=Math.pow(Math.max(0,Math.min(1,(py-shoreline)/(1-shoreline))),.8);
      const brightness=clear*Math.min(.74,.007+side*(.11+.33*drift)+bank*(.48+.23*drift)+light*.9);
      const threshold=.8*(bayer[(row&7)*8+(col&7)]+.5)/64+.2*hash((row&63)*64+(col&63));if(brightness<threshold)continue;
      const brighter=light>.08||(bank>.55&&hash((row&63)*64+(col&63))>.58);
      ctx.fillStyle=palette.bands[light>.3?2:brighter?3:4];
      const xx=Math.round(x+col*cw),yy=Math.round(y+row*ch);ctx.fillRect(xx,yy,Math.round(x+(col+1)*cw)-xx,Math.round(y+(row+1)*ch)-yy);
    }
    // The entry renderer and the finished word share one spatial color field.
    // ttfx supplies movement and symbols; its temporary colors never reach the canvas.
    const wordInk=(col,row)=>{
      const hit=glow(x+(col+.5)*cw,y+(row+.5)*ch);
      const band=hit>.5?0:hit>.12?1:row<9?0:row<14?1:row<20?2:row<28?3:4;
      return palette.bands[band];
    };
    if(effect&&!effect.draw(ctx,geom,now,wordInk)){effect.free();effect=null;origin=now-3000;}
    const elapsed=(now-origin)/1000;
    for(let row=0;!effectPending&&!effect&&row<glyph.height;row++)for(let col=0;col<glyph.width;col++){
      if(glyph.rows[row][col]!=='1')continue;
      const id=row*glyph.width+col;
      const raw=motion.matches?1:Math.max(0,Math.min(1,(elapsed-hash(id)*.75)/1.75));
      const progress=1-Math.pow(1-raw,4);if(progress<=0)continue;
      const xx=x+col*cw+(hash(id*3)-.5)*w*.9*(1-progress),yy=y+row*ch+(hash(id*5)-.5)*h*.85*(1-progress);
      ctx.fillStyle=wordInk((xx-x)/cw,(yy-y)/ch);ctx.globalAlpha=.15+.85*progress;
      const x0=Math.round(xx),y0=Math.round(yy);ctx.fillRect(x0,y0,Math.round(xx+cw)-x0,Math.round(yy+ch)-y0);
    }
    ctx.globalAlpha=1;host.classList.add('field-ready');document.documentElement.classList.remove('field-preparing');
    canvas.dataset.assembled=String(!effectPending&&!effect&&(elapsed>=2.5||motion.matches));
  }
  function loop(now){frame=0;if(!visible||document.hidden)return;if(now-last>32){paint(now);last=now;}if(!motion.matches)frame=requestAnimationFrame(loop);}
  function start(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(loop);}
  colors();measure();restartEffect();start();
  new ResizeObserver(()=>{measure();if(motion.matches)paint(performance.now());start();}).observe(host);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)start();else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'80px'}).observe(host);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
  new MutationObserver(()=>{colors();origin=performance.now();restartEffect();if(motion.matches)paint(performance.now());start();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  motion.addEventListener('change',()=>{cancelAnimationFrame(frame);frame=0;restartEffect();paint(performance.now());start();});
  host.addEventListener('pointermove',event=>{const box=host.getBoundingClientRect();pointer.x=event.clientX-box.left;pointer.y=event.clientY-box.top;pointer.target=1;});
  host.addEventListener('pointerleave',()=>{pointer.target=0;});
  host.addEventListener('pointerdown',event=>{if(event.target.closest('a,button,header'))return;const box=host.getBoundingClientRect();pings.push({x:event.clientX-box.left,y:event.clientY-box.top,born:performance.now()});});
  target.addEventListener('click',()=>{document.querySelector('.theme-trigger')?.click();});
})();
