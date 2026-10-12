/* Omarchy-style command navigation: text focus stays in Go while rows are selected. */
(() => {
  const trigger=document.querySelector('[data-site-menu]'),menu=document.getElementById('site-menu');
  if(!trigger||!menu)return;
  const root=document.documentElement,motion=matchMedia('(prefers-reduced-motion: reduce)');
  const search=menu.querySelector('.site-menu-search'),results=menu.querySelector('[data-menu-panel="results"]'),body=menu.querySelector('.site-menu-body'),backButton=menu.querySelector('[data-menu-back]'),status=menu.querySelector('[data-menu-status]');
  const panels=[...menu.querySelectorAll('[data-menu-panel]')],branches=[...menu.querySelectorAll('[data-menu-go]')];
  const normalize=s=>s.normalize('NFKC').toLocaleLowerCase().trim();
  const index=[...menu.querySelectorAll('[data-menu-search]')].map((row,n)=>{
    row.id='menu-option-'+n;row.setAttribute('role','option');row.tabIndex=-1;
    const panel=row.closest('[data-menu-panel]');return {row,title:normalize(row.querySelector('span')?.textContent||row.textContent),text:normalize(row.dataset.menuSearch),panel:panel.dataset.menuPanel,group:panel.dataset.menuLabel||'',key:row.getAttribute('href')||row.dataset.menuGo||'themes'};
  });
  let current='main',selected=0,closing=false,timer,resize,lastPointer={x:-1,y:-1};
  function rows(){return [...menu.querySelectorAll('[data-menu-panel]:not([hidden]) .site-menu-row')];}
  function select(at,scroll=true){
    const list=rows();selected=Math.max(0,Math.min(list.length-1,at));
    list.forEach((row,i)=>{row.classList.toggle('is-selected',i===selected);row.setAttribute('aria-selected',String(i===selected));});
    const row=list[selected];if(!row){search.removeAttribute('aria-activedescendant');return;}
    search.setAttribute('aria-activedescendant',row.id);
    if(scroll){const box=body.getBoundingClientRect(),r=row.getBoundingClientRect();if(r.top<box.top)body.scrollTop-=box.top-r.top;else if(r.bottom>box.bottom)body.scrollTop+=r.bottom-box.bottom;}
  }
  function show(name){
    resize?.cancel();const before=menu.getBoundingClientRect().height;
    panels.forEach(panel=>{panel.hidden=panel.dataset.menuPanel!==name;});
    branches.forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.menuGo===name)));
    const active=panels.find(panel=>!panel.hidden);search.setAttribute('aria-controls',active.id);
    backButton.hidden=current==='main';search.placeholder=current==='main'?search.dataset.rootPlaceholder:(panels.find(p=>p.dataset.menuPanel===current).dataset.menuLabel+'…');
    body.scrollTop=0;select(0,false);
    const after=menu.getBoundingClientRect().height;
    if(menu.open&&!motion.matches&&Math.abs(before-after)>1)resize=menu.animate([{height:before+'px'},{height:after+'px'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  function open(){
    if(menu.open)return;
    if(root.dataset.navOpen==='true')document.querySelector('.mobile-nav-toggle')?.click();
    document.querySelectorAll('.language-control[open]').forEach(el=>{el.open=false;});
    current='main';search.value='';status.textContent='';show(current);menu.classList.remove('is-closing');closing=false;menu.showModal();
    root.classList.add('site-menu-open');trigger.setAttribute('aria-expanded','true');search.setAttribute('aria-expanded','true');search.focus({preventScroll:true});select(0,false);
  }
  function close(after){
    if(!menu.open||closing)return;closing=true;resize?.cancel();menu.classList.add('is-closing');
    timer=setTimeout(()=>{menu.close();if(after)after();},motion.matches?0:140);
  }
  function enter(name){search.value='';status.textContent='';current=name;show(name);search.focus({preventScroll:true});}
  function back(){search.value='';status.textContent='';current='main';show(current);search.focus({preventScroll:true});}
  function theme(){close(()=>document.querySelector('.theme-trigger')?.click());}
  function filter(){
    const query=normalize(search.value),terms=query.split(/\s+/).filter(Boolean);
    if(!query){status.textContent='';show(current);return;}
    const seen=new Set(),scope=current==='main'?index:index.filter(item=>item.panel===current);
    const matches=scope.filter(item=>terms.every(term=>(current==='main'?item.text:item.title).includes(term)));
    results.replaceChildren();
    for(const item of matches){
      if(seen.has(item.key))continue;seen.add(item.key);const row=item.row.cloneNode(true);row.id='menu-result-'+seen.size;
      if(current==='main'&&item.group){const group=document.createElement('small');group.className='site-menu-meta';group.textContent=item.group;row.append(group);}
      results.append(row);
    }
    const count=results.children.length;status.textContent=root.lang.startsWith('zh')?`${count} 项结果`:`${count} ${count===1?'result':'results'}`;
    if(!count){const empty=document.createElement('p');empty.className='site-menu-empty';empty.textContent=menu.dataset.menuEmpty;results.append(empty);}
    show('results');
  }
  trigger.addEventListener('click',open);search.addEventListener('input',filter);
  menu.addEventListener('wheel',event=>{if(!event.target.closest('.site-menu-body'))event.preventDefault();},{passive:false});
  menu.addEventListener('touchmove',event=>{if(event.target===menu)event.preventDefault();},{passive:false});
  menu.addEventListener('pointerdown',event=>{if(event.target.closest('.site-menu-row,[data-menu-back]'))event.preventDefault();});
  menu.addEventListener('pointermove',event=>{const row=event.target.closest('.site-menu-row');if(!row||event.clientX===lastPointer.x&&event.clientY===lastPointer.y)return;lastPointer={x:event.clientX,y:event.clientY};select(rows().indexOf(row),false);});
  menu.addEventListener('click',event=>{
    const branch=event.target.closest('[data-menu-go]');if(branch){enter(branch.dataset.menuGo);return;}
    if(event.target.closest('[data-menu-back]')){back();return;}
    if(event.target.closest('[data-menu-theme]')){theme();return;}
    if(event.target===menu){const b=menu.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();}
  });
  function escape(){if(search.value){search.value='';filter();search.focus();}else if(current!=='main')back();else close();}
  menu.addEventListener('cancel',event=>{event.preventDefault();escape();});
  menu.addEventListener('close',()=>{clearTimeout(timer);resize?.cancel();closing=false;menu.classList.remove('is-closing');root.classList.remove('site-menu-open');trigger.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});});
  menu.addEventListener('keydown',event=>{
    if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='Escape'){event.preventDefault();escape();return;}
    if((event.key==='Backspace'||event.key==='ArrowLeft')&&!search.value&&current!=='main'){event.preventDefault();back();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();select(selected+(event.key==='ArrowDown'?1:-1));return;}
    const row=rows()[selected];
    if(event.key==='Enter'||event.key==='ArrowRight'&&row?.dataset.menuGo){event.preventDefault();row?.click();}
  });
  document.addEventListener('keydown',event=>{
    if(menu.open||event.target.isContentEditable||event.target.closest('input,textarea,select'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'||event.key==='/'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();open();}
  });
})();
