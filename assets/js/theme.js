/* Apply a saved palette before styles load; the picker previews without changing it. */
(() => {
  const palettes = [
    {id:'flexoki',name:'Flexoki Light',bg:'#fffcf0',ink:'#205ea6'},
    {id:'monochrome',name:'Monochrome',labels:{'zh-CN':'黑白','zh-TW':'黑白'},bg:'#f7f7f7',ink:'#181818'},
    {id:'latte',name:'Catppuccin Latte',bg:'#eff1f5',ink:'#8839ef'},
    {id:'tokyo',name:'Tokyo Night',bg:'#1a1b26',ink:'#7aa2f7'},
    {id:'gruvbox',name:'Gruvbox',bg:'#282828',ink:'#d8a657'},
    {id:'nord',name:'Nord',bg:'#2e3440',ink:'#88c0d0'},
    {id:'rose',name:'Rosé Pine',bg:'#191724',ink:'#ebbcba'},
    {id:'matrix',name:'Matrix',bg:'#050a06',ink:'#00ff70'}
  ];
  const key='eazylee-theme',root=document.documentElement,motion=matchMedia('(prefers-reduced-motion: reduce)');
  const themeName=id=>{const p=palettes.find(p=>p.id===id);return p?.labels?.[root.lang]||p?.name||'';};
  let current=palettes[0].id,transition;
  try { const saved=localStorage.getItem(key);if(palettes.some(p=>p.id===saved))current=saved; } catch(_){}
  root.dataset.theme=current;
  root.classList.add('field-preparing');
  setTimeout(()=>root.classList.remove('field-preparing'),4000);
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
  function apply(theme,persist=true){
    if(!palettes.some(p=>p.id===theme)||theme===current)return;
    current=theme;
    const update=()=>{root.dataset.theme=theme;document.querySelector('.theme-trigger')?.setAttribute('title',themeName(theme)+' · T');};
    if(document.startViewTransition&&!motion.matches){transition?.skipTransition();transition=document.startViewTransition(update);}else update();
    if(persist)try{localStorage.setItem(key,theme);}catch(_){}
    const status=document.getElementById('theme-status');if(status)status.textContent=themeName(theme);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const zh=root.lang.startsWith('zh'),traditional=root.lang==='zh-TW';
    const label=zh?(traditional?'切換主題':'切换主题'):'Change theme';
    const controls=document.createElement('div');controls.className='theme-control';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='theme-trigger';
    trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','theme-picker');
    trigger.title=themeName(current)+' · T';trigger.innerHTML=icon('palette');controls.append(trigger);
    const slot=document.querySelector('[data-theme-control]');
    if(slot)slot.append(controls);
    else{
      const toolbar=document.createElement('div');toolbar.className='reading-toolbar';
      const home=document.createElement('a');home.href=traditional?'/tw/':zh?'/cn/':'/';home.textContent='eazylee';
      const languages=document.createElement('nav');languages.className='language-options';languages.setAttribute('aria-label','Language');
      const route=location.pathname.replace(/^\/(cn|tw)\//,'/');
      [['en','','EN'],['zh-CN','/cn','简'],['zh-TW','/tw','繁']].forEach(([locale,prefix,label])=>{
        const link=document.createElement('a');link.href=prefix+route;link.lang=locale;link.textContent=label;
        if(locale===root.lang)link.setAttribute('aria-current','page');languages.append(link);
      });
      const actions=document.createElement('div');actions.className='header-actions';actions.append(controls,languages);toolbar.append(home,actions);document.body.prepend(toolbar);
    }
    const dialog=document.createElement('dialog');dialog.id='theme-picker';dialog.className='theme-picker';dialog.setAttribute('aria-label',label);
    dialog.innerHTML=`<button class="picker-close" type="button" aria-label="${zh?'关闭':'Close'}"><span aria-hidden="true">×</span></button><div class="theme-deck"></div><div class="picker-caption"><button type="button" data-step="-1" aria-label="${zh?'上一个主题':'Previous theme'}">${icon('arrow-left')}</button><span id="picker-name" aria-live="polite"></span><button type="button" data-step="1" aria-label="${zh?'下一个主题':'Next theme'}">${icon('arrow-right')}</button></div><button class="picker-apply" type="button">${zh?(traditional?'套用主題':'应用主题'):'Apply theme'} <kbd>↵</kbd></button><div class="picker-hint" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd><span>${zh?'浏览':'Browse'}</span><kbd>Esc</kbd><span>${zh?'关闭':'Close'}</span></div>`;
    const deck=dialog.querySelector('.theme-deck');let selected=0,restoreFocus;
    let ignoreClickUntil=0;
    const cards=palettes.map((p,i)=>{
      const card=document.createElement('button');card.type='button';card.className='theme-preview';card.dataset.setTheme=p.id;card.setAttribute('aria-label',themeName(p.id));
      card.style.setProperty('--preview-bg',p.bg);card.style.setProperty('--preview-ink',p.ink);
      card.innerHTML='<span class="mini-site" aria-hidden="true"><span class="mini-header">E<span>Journal &nbsp; Writing</span></span><span class="mini-word">EAZYLEE</span><span class="mini-intro">Hardware, software<br>& everyday experiments.</span><span class="mini-actions"><i></i><i></i></span><span class="mini-dither"></span></span>';
      card.addEventListener('click',()=>{if(performance.now()<ignoreClickUntil)return;if(i===selected)choose();else{selected=i;arrange();}});deck.append(card);return card;
    });
    function arrange(){
      cards.forEach((card,i)=>{
        let distance=(i-selected+palettes.length)%palettes.length;if(distance>palettes.length/2)distance-=palettes.length;
        card.style.setProperty('--distance',distance);card.style.setProperty('--magnitude',Math.abs(distance));card.style.zIndex=String(10-Math.abs(distance));
        card.dataset.active=String(distance===0);card.setAttribute('aria-pressed',String(distance===0));card.tabIndex=distance===0?0:-1;
        card.setAttribute('aria-hidden',String(Math.abs(distance)>2));
      });
      dialog.querySelector('#picker-name').textContent=themeName(palettes[selected].id);
    }
    function close(){dialog.close();root.classList.remove('picker-open');trigger.setAttribute('aria-expanded','false');restoreFocus?.focus({preventScroll:true});}
    function open(){restoreFocus=document.activeElement;selected=palettes.findIndex(p=>p.id===current);arrange();dialog.showModal();root.classList.add('picker-open');trigger.setAttribute('aria-expanded','true');dialog.querySelector('.picker-apply').focus({preventScroll:true});}
    function step(delta){selected=(selected+delta+palettes.length)%palettes.length;arrange();}
    function choose(){close();apply(palettes[selected].id);}
    dialog.querySelector('.picker-close').addEventListener('click',close);dialog.querySelector('.picker-apply').addEventListener('click',choose);
    dialog.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>step(Number(b.dataset.step))));
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    let swipe;
    deck.addEventListener('pointerdown',e=>{swipe={x:e.clientX,y:e.clientY};});
    deck.addEventListener('pointerup',e=>{if(swipe&&Math.abs(e.clientX-swipe.x)>50&&Math.abs(e.clientX-swipe.x)>Math.abs(e.clientY-swipe.y)){step(e.clientX<swipe.x?1:-1);ignoreClickUntil=performance.now()+350;swipe=null;}});
    document.body.append(dialog);trigger.addEventListener('click',()=>dialog.open?close():open());
    document.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||event.target.closest('input,textarea,select,[role="textbox"]'))return;
      if(event.key.toLowerCase()==='t'){event.preventDefault();dialog.open?close():open();}
      else if(dialog.open&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}
      else if(dialog.open&&event.key==='Enter'){event.preventDefault();choose();}
    });
    document.addEventListener('pointerdown',e=>{document.querySelectorAll('.language-control[open]').forEach(el=>{if(!el.contains(e.target))el.open=false;});});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.language-control[open]').forEach(el=>{el.open=false;el.querySelector('summary').focus();});});
    const status=document.createElement('span');status.id='theme-status';status.className='sr-only';status.setAttribute('role','status');document.body.append(status);
    // Reveals progressively enhance the document; unsupported browsers keep everything visible.
    if ('IntersectionObserver' in window && !motion.matches) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); } });
      }, {threshold:.12});
      document.querySelectorAll('.reveal').forEach((el,index) => {
        el.style.setProperty('--reveal-delay', `${Math.min(index % 2 * 80, 80)}ms`);
        el.classList.add('will-reveal'); observer.observe(el);
      });
    }
  });
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue||palettes[0].id,false);});
})();
