/* Continuous motion between registered views, with pointer drag and angular inertia. */
import {silhouetteDistance} from '/assets/js/avatar-silhouette.js?v=20261011l';
(() => {
  const canvas=document.querySelector('.avatar-turn');if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const host=canvas.closest('.portrait'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const locale=document.documentElement.lang,zh=locale.startsWith('zh'),tw=locale==='zh-TW';
  const labels=zh?{rotate:tw?'旋轉 EazyLee':'旋转 EazyLee',left:tw?'向左旋轉':'向左旋转',right:tw?'向右旋轉':'向右旋转',pause:tw?'暫停旋轉':'暂停旋转',play:tw?'自動旋轉':'自动旋转'}:{rotate:'Rotate EazyLee',left:'Rotate left',right:'Rotate right',pause:'Pause rotation',play:'Auto rotate'};
  canvas.setAttribute('role','slider');canvas.tabIndex=0;canvas.setAttribute('aria-label',labels.rotate);canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax','359');canvas.setAttribute('aria-orientation','horizontal');
  let automatic=!motion.matches,turnTarget=null;
  let views=[],athleticViews=[],angle=0,velocity=0,last=0,raf=0,visible=false,hover=false,drag=null,lastPaint=-1,colors,lightTheme,gpu;
  let athletic=0,lastAthletic=-1,overTorso=false,textures=[],bareTextures=[];
  let sampleFrames=0,sampleStart=0,paintTotal=0;
  const wrap=x=>(x%360+360)%360;
  const state=()=>{const rounded=Math.round(wrap(angle))%360;canvas.setAttribute('aria-valuenow',rounded);canvas.setAttribute('aria-valuetext',rounded+'°');canvas.dataset.angle=String(rounded);canvas.dataset.frame=String(Math.floor(wrap(angle)/30));};
  function color(){const s=getComputedStyle(document.documentElement),probe=document.createElement('span');probe.hidden=true;probe.style.color=s.getPropertyValue('--accent');document.body.append(probe);colors=getComputedStyle(probe).color.match(/[\d.]+/g).slice(0,3).map(Number);lightTheme=s.colorScheme==='light';probe.remove();lastPaint=-1;if(!gpu){textures=tint(views);bareTextures=tint(athleticViews);}}
  function tint(list){return list.map(view=>{const surface=document.createElement('canvas');surface.width=canvas.width;surface.height=canvas.height;const pixels=new ImageData(canvas.width,canvas.height),alpha=view[lightTheme?'light':'dark'];for(let i=0;i<alpha.length;i++){const j=i*4;pixels.data[j]=colors[0];pixels.data[j+1]=colors[1];pixels.data[j+2]=colors[2];pixels.data[j+3]=alpha[i];}surface.getContext('2d').putImageData(pixels,0,0);return surface;});}
  function updateAuto(){canvas.dataset.automatic=String(automatic);}
  function paint(){
    if(!views.length||!colors)return;const position=wrap(angle)/30,index=Math.floor(position),fraction=position-index;
    if(Math.abs(angle-lastPaint)<.03&&Math.abs(athletic-lastAthletic)<.003)return;lastPaint=angle;lastAthletic=athletic;
    const began=performance.now();ctx.clearRect(0,0,canvas.width,canvas.height);
    // Linear angular phase has no stop at a keyframe. GPU motion fields move contours between views.
    if(gpu)ctx.drawImage(gpu.draw(index,fraction,athletic,lightTheme,colors),0,0);
    else{
      const next=(index+1)%views.length,bare=bareTextures.length?bareTextures:textures;
      const layers=[[textures[index],(1-fraction)*(1-athletic)],[textures[next],fraction*(1-athletic)],[bare[index],(1-fraction)*athletic],[bare[next],fraction*athletic]];
      ctx.globalCompositeOperation='lighter';for(const [image,weight]of layers){if(weight>0){ctx.globalAlpha=weight;ctx.drawImage(image,0,0);}}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
    paintTotal+=performance.now()-began;canvas.dataset.outfit=athletic>.85?'athletic':athletic>.05?'changing':'puffer';state();
  }
  function loop(now){
    raf=0;if(!visible||document.hidden)return;const dt=Math.min((now-last)/1000,.05);last=now;
    const active=athleticViews.length&&overTorso&&hover;
    const target=active?1:0;athletic+=(target-athletic)*(1-Math.exp(-dt*7));if(athletic<.003)athletic=0;if(athletic>.997)athletic=1;
    if(!drag){
      if(turnTarget!==null){angle+=(turnTarget-angle)*(1-Math.exp(-dt*10));if(Math.abs(turnTarget-angle)<.03){angle=turnTarget;turnTarget=null;}}
      else if(Math.abs(velocity)>.3){angle+=velocity*dt;velocity*=Math.pow(.04,dt);}
      else if(automatic&&!motion.matches)angle+=18*dt;
    }
    paint();if(!sampleStart)sampleStart=now;if(++sampleFrames===60){canvas.dataset.fps=(60000/(now-sampleStart)).toFixed(1);canvas.dataset.paintMs=(paintTotal/60).toFixed(2);sampleFrames=0;sampleStart=now;paintTotal=0;}
    if(drag||turnTarget!==null||Math.abs(target-athletic)>.003||Math.abs(velocity)>.3||(automatic&&!motion.matches))raf=requestAnimationFrame(loop);
  }
  function start(){if(!raf&&visible&&!document.hidden){last=performance.now();sampleStart=0;sampleFrames=0;paintTotal=0;raf=requestAnimationFrame(loop);}}
  function turn(delta){automatic=false;updateAuto();turnTarget=(turnTarget??angle)+delta;velocity=0;start();}updateAuto();
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;turnTarget=null;drag={id:e.pointerId,x:e.clientX,angle,previous:e.clientX,time:e.timeStamp,moved:false};velocity=0;canvas.setPointerCapture(e.pointerId);host.classList.add('is-dragging');canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',e=>{
    const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)/box.width,y=(e.clientY-box.top)/box.height;overTorso=x>.27&&x<.73&&y>.23&&y<.55;
    start();if(!drag)return;
    if(e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>4)drag.moved=true;
    const sensitivity=360/Math.max(canvas.getBoundingClientRect().width,160),dt=Math.max((e.timeStamp-drag.time)/1000,.008);
    angle=drag.angle+dx*sensitivity;velocity=Math.max(-240,Math.min(240,(e.clientX-drag.previous)*sensitivity/dt))*.55+velocity*.45;
    drag.previous=e.clientX;drag.time=e.timeStamp;
  });
  function release(e){if(!drag||e.pointerId!==drag.id)return;if(!drag.moved)velocity=0;drag=null;host.classList.remove('is-dragging');start();}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',e=>{velocity=0;release(e);});
  canvas.addEventListener('pointerenter',()=>{hover=true;});canvas.addEventListener('pointerleave',()=>{hover=false;overTorso=false;start();});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();turn(e.key==='ArrowLeft'?-15:15);}else if(e.key==='Home'){e.preventDefault();turn(-wrap(angle));}else if(e.key===' '){e.preventDefault();automatic=!automatic;velocity=0;updateAuto();start();}});
  new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible){lastPaint=-1;start();}else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else start();});
  new MutationObserver(()=>{color();paint();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  motion.addEventListener('change',()=>{automatic=!motion.matches;velocity=0;updateAuto();start();});
  async function decodeViews(url,boxes){
    const image=new Image();image.src=url;await image.decode();
    const sheet=document.createElement('canvas');sheet.width=image.naturalWidth;sheet.height=image.naturalHeight;const sc=sheet.getContext('2d',{willReadFrequently:true});sc.drawImage(image,0,0);
    if(canvas.width!==240)canvas.width=240;if(canvas.height!==440)canvas.height=440;
    const frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;const fc=frame.getContext('2d',{willReadFrequently:true});
    const decoded=[];for(const box of boxes){
      fc.clearRect(0,0,frame.width,frame.height);const scale=410/box.height,drawWidth=box.width*scale;
      fc.save();if(box.flip){fc.translate(frame.width,0);fc.scale(-1,1);}
      fc.drawImage(sheet,box.x,box.y,box.width,box.height,(frame.width-drawWidth)/2,15,drawWidth,410);fc.restore();
      const pixels=fc.getImageData(0,0,frame.width,frame.height).data,ink=new Uint8Array(frame.width*frame.height),highlight=new Uint8Array(ink.length),alpha=new Uint8Array(ink.length);
      for(let i=0;i<ink.length;i++){const j=i*4,luminance=pixels[j]*.2126+pixels[j+1]*.7152+pixels[j+2]*.0722;ink[i]=Math.round(pixels[j+3]*Math.pow(1-luminance/255,.82));highlight[i]=Math.round(pixels[j+3]*Math.pow(luminance/255,.9));alpha[i]=pixels[j+3];}
      decoded.push({light:ink,dark:highlight,silhouette:silhouetteDistance(alpha,frame.width,frame.height)});
    }return decoded;
  }
  async function load(){
    const cells=await fetch('/assets/data/avatar-frames.json').then(r=>{if(!r.ok)throw new Error('Frames unavailable');return r.json();});
    views=await decodeViews('/assets/art/eazylee-turnaround-v3.png',cells.frames);
    color();paint();host.classList.add('turn-ready');canvas.dataset.frames=String(views.length);start();
    canvas.dataset.renderer='canvas-blend';
    if(cells.athletic){athleticViews=await decodeViews('/assets/art/eazylee-athletic-v3.png',cells.athletic);bareTextures=tint(athleticViews);canvas.dataset.athleticReady='true';start();}
    try{
      const [module,motionBytes]=await Promise.all([import('/assets/js/avatar-gpu.js?v=20261011l'),fetch('/assets/data/avatar-flow.bin?v=20261011l').then(r=>{if(!r.ok)throw new Error('Motion unavailable');return r.arrayBuffer();})]);
      gpu=module.createRenderer(canvas,views,athleticViews,new Uint8Array(motionBytes));if(gpu){textures=[];bareTextures=[];canvas.dataset.renderer='webgl-motion';lastPaint=-1;paint();start();}
    }catch(_){/* Pre-tinted Canvas frames remain fluid on devices without WebGL. */}
  }
  load().catch(()=>{canvas.hidden=true;});
})();
