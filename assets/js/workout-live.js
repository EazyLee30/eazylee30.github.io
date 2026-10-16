/* Public, minimized Whooper data. Credentials never enter this static site. */
(() => {
  const root = document.querySelector('[data-workout-views], [data-share-view]');
  if (!root) return;
  const shared = root.matches('[data-share-view]');
  const generic = root.hasAttribute('data-live-share');
  const params = new URLSearchParams(location.search);
  const locale = document.documentElement.lang;
  const zh = locale.startsWith('zh');
  const tw = locale === 'zh-TW';
  const words = zh ? {movement:tw?'動作示範':'动作演示',sheet:tw?'手寫訓練單':'手写训练单',body:tw?'自重':'自重',reps:tw?'次':'次',sets:tw?'組':'组',exercises:tw?'個動作':'个动作',min:tw?'分鐘':'分钟',volume:tw?'總量':'总量',unavailable:tw?'暫時無法更新訓練記錄。':'暂时无法更新训练记录。',retry:tw?'重新讀取':'重新读取',live:tw?'已與 WHOOP 同步':'已与 WHOOP 同步',empty:tw?'這一天沒有已完成的力量訓練。':'这一天没有已完成的力量训练。'} : {movement:'Movement',sheet:'Handwritten',body:'Bodyweight',reps:'reps',sets:'sets',exercises:'exercises',min:'min',volume:'volume',unavailable:'Unable to refresh training records.',retry:'Retry',live:'Synced with WHOOP',empty:'No completed strength session on this date.'};
  const prefix = locale === 'zh-CN' ? '/cn' : locale === 'zh-TW' ? '/tw' : '';
  const requestedDate = shared ? (generic ? params.get('date') : root.dataset.sessionDate) : null;
  const view = generic ? (params.get('view') === 'sheet' ? 'sheet' : 'movement') : root.dataset.shareView;
  if (shared) root.dataset.shareView = view;
  const escaped = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => value === null || value === undefined ? '—' : Number(value).toLocaleString(locale, {maximumFractionDigits:1});
  const arts = {OVERHANDGRIPPULLUPS:'pull-up',SEATEDROW_PULLEYMACHINE:'seated-row',LATPULLDOWNFRONT_PULLEYMACHINE:'lat-pulldown',NARROWGRIPLATPULLDOWNFRONT_PULLEYMACHINE:'lat-pulldown'};
  const status = document.createElement('p'); status.className = 'workout-live-status'; status.setAttribute('role','status'); root.insertBefore(status, shared ? root.querySelector('.wcredit') : null);
  const shareURL = (w, type) => `${prefix}/workout/share/?${new URLSearchParams({date:w.date,workout:w.activity_id,view:type})}`;
  function source(w, paper) {
    return `<div class="workout-paper-source"><div><span>${num(w.duration_min)} MIN</span><span>${num(w.strain)} STRAIN</span><span>${num(w.total_volume_kg)} KG VOLUME</span>${paper?'<small>WEIGHT IN LBS · B.W. = BODYWEIGHT</small>':''}</div><div class="whoop-credit"><small>DATA FROM</small><img src="/assets/brand/whoop/wordmark-black.svg" width="90" height="24" alt="WHOOP"></div></div>`;
  }
  function movement(w) {
    const cards = w.exercises.map(ex => `<article class="wcard"><div class="wcard-head"><h3>${escaped(ex.name)}</h3></div>${arts[ex.id]?`<div class="wfig" data-art="${arts[ex.id]}" role="img" aria-label="${escaped(ex.name)}"><span class="wfig-loading" aria-hidden="true">…</span></div>`:'<div class="wfig wfig-none" aria-hidden="true">·</div>'}<div class="wsets">${ex.sets.map((set,i)=>`<div class="wset"><span class="wset-n">SET ${String(i+1).padStart(2,'0')}</span><span class="wset-r">${num(set.reps)} ${words.reps}</span><span class="wset-w">${set.weight===null?'—':set.weight===0?words.body:`${num(set.weight)} ${escaped(set.units)}`}</span></div>`).join('')}</div></article>`).join('');
    return `<div class="wdetail-meta"><span>${escaped(w.date.replaceAll('-','.'))}</span><span>${num(w.duration_min)} ${words.min} · strain ${num(w.strain)}</span><span>${num(w.total_volume_kg)} kg ${words.volume} · ${w.set_count} ${words.sets} · ${w.exercise_count} ${words.exercises}</span></div><div class="wgrid">${cards}</div>${source(w,false)}`;
  }
  function paper(w) {
    const groups=[];
    for (const ex of w.exercises) for (const set of ex.sets) {
      const key=JSON.stringify([ex.id,set.weight,set.units,set.reps]);
      if(groups.length && groups.at(-1).key===key) groups.at(-1).count++;
      else groups.push({key,name:ex.name,...set,count:1});
    }
    const positions=[30.80,37.05,43.30,49.55,55.80,62,68,73.85,79.60,86.05];
    const date=new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'2-digit',year:'numeric'}).toUpperCase();
    const pages=[];
    for(let offset=0;offset<groups.length;offset+=10){
      const rows=groups.slice(offset,offset+10).map((g,i)=>{
        const weight=g.weight===null?'—':g.weight===0?'B.W.':Number((g.units==='kg'?g.weight*2.2046226218:g.weight).toFixed(1)).toString();
        return `<div class="sheet-entry" style="top:${positions[i]}%"><span>${escaped(g.name)}</span><span>${g.count}</span><span>${weight}</span><span>${num(g.reps)}</span><span>${escaped(g.name)}</span></div>`;
      }).join('');
      pages.push(`<figure class="training-sheet" aria-label="EazyLee · ${w.date} · Exercise list"><img class="sheet-original" src="/assets/art/workout/exercise-list-original.png" width="1086" height="1448" alt="Original exercise sheet · EAZY LEE"><time class="sheet-date hand" datetime="${w.date}">${date}</time><div class="sheet-entries hand">${rows}</div></figure>`);
    }
    return `<div class="training-sheets">${pages.join('')}</div>${source(w,true)}`;
  }
  let signature = '', loading = false;
  async function refresh() {
    if (loading || document.hidden) return;
    loading=true;
    try {
      const query = new URLSearchParams();
      if (requestedDate) query.set('date',requestedDate);
      if (shared && params.get('workout')) query.set('workout',params.get('workout'));
      const response = await fetch(`https://whooper.ccwu.cc/api/public/workout/strength?${query}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(115000)});
      if(!response.ok) throw new Error(response.status===404?'empty':'unavailable');
      const {session:w}=await response.json();
      if (!w || !Array.isArray(w.exercises) || !/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !/^[a-f0-9-]{36}$/i.test(w.activity_id)) throw new Error('invalid');
      if (requestedDate && w.date!==requestedDate) throw new Error('invalid date');
      const {fetched_at,...values}=w;
      if (signature!==JSON.stringify(values)) {
        signature=JSON.stringify(values);
        root.dataset.sessionDate=w.date;
        if(shared){
          root.querySelector('[data-share-content]').innerHTML = view==='sheet'?paper(w):`<div class="movement-share-content">${movement(w)}</div>`;
          root.querySelector('.share-date time').dateTime=w.date;root.querySelector('.share-date time').textContent=w.date;
          root.querySelector('.share-view-label strong').textContent=words[view];
          const other=root.querySelector('.share-view-label a');other.textContent=`${words[view==='sheet'?'movement':'sheet']} ↔`;other.href=shareURL(w,view==='sheet'?'movement':'sheet');
          root.dataset.loading='false';
          root.querySelectorAll('.share-toolbar button').forEach(b=>b.disabled=false);
          document.title=`${w.date} · ${words[view]} · EazyLee`;
        } else {
          root.querySelector('#motion-view').innerHTML=movement(w);
          root.querySelector('#sheet-view').innerHTML=paper(w);
          const link=root.querySelector('[data-view-share]');link.dataset.sheetUrl=shareURL(w,'sheet');link.dataset.movementUrl=shareURL(w,'movement');
          link.href=shareURL(w,root.querySelector('[aria-selected=true]').id==='sheet-tab'?'sheet':'movement');
          root.querySelector('.workout-data-note').textContent=`WHOOP · ${w.date}`;
        }
        document.dispatchEvent(new Event('workout:updated'));
      }
      status.textContent=`${words.live} · ${new Intl.DateTimeFormat(locale,{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date(fetched_at))}`;
    }catch(error){
      if(generic && !signature) {root.dataset.loading='false';root.querySelector('[data-share-content]').replaceChildren();root.querySelector('.share-date').style.visibility='hidden';root.querySelectorAll('.share-toolbar button').forEach(b=>b.disabled=true);}
      status.textContent=error.message==='empty'?words.empty:words.unavailable;
      const button=document.createElement('button');button.type='button';button.className='inline-link';button.textContent=words.retry;button.addEventListener('click',refresh);status.append(' ',button);
    }finally {loading=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(refresh,60000);
  refresh();
})();
