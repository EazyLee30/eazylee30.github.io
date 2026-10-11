/* Public GitHub metadata: a fresh browser snapshot with a tracked offline fallback. */
(() => {
  const language = document.documentElement.lang;
  const localized = language === 'en' ? {updated:'Updated', unavailable:'Saved GitHub snapshot'} : language === 'zh-TW' ? {updated:'更新於',unavailable:'GitHub 已儲存的快照'} : {updated:'更新于',unavailable:'GitHub 已保存的快照'};
  const activity = document.querySelector('[data-github-activity]');
  const gallery = document.querySelector('.works-grid');
  const cards = gallery ? Array.from(gallery.querySelectorAll('[data-project-name]')) : [];
  const status = document.querySelector('[data-github-status]');
  const key = 'eazylee-github-v1';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const date = value => value?.slice(0,10).replaceAll('-','.') || '';
  function render(data, saved=false) {
    if (!Array.isArray(data.repositories)) return;
    if (cards.length) {
      const repositories = new Map(data.repositories.map(repo=>[repo.name,repo]));
      const ordered = cards.slice().sort((a,b)=>(repositories.get(b.dataset.projectName)?.pushed_at||'').localeCompare(repositories.get(a.dataset.projectName)?.pushed_at||''));
      for (const card of ordered) {
        const repo = repositories.get(card.dataset.projectName);
        card.hidden = !repo || repo.fork || repo.archived;
        if (!repo) continue;
        const time = card.querySelector('time');
        if (time) {time.dateTime=repo.pushed_at||'';time.textContent=(repo.pushed_at||'').slice(0,10);}
        const language = card.querySelector('[data-project-language]');
        if (language && repo.language) language.textContent=repo.language;
        gallery.append(card);
      }
      if (status) status.textContent=(saved?localized.unavailable:localized.updated)+' '+date(data.fetched_at);
    }
    if (!activity) return;
    const rows = data.repositories.filter(r => !r.fork && !r.archived && !['EazyLee30','eazylee30.github.io','whooper-privacy'].includes(r.name)).sort((a,b)=>(b.pushed_at||'').localeCompare(a.pushed_at||'')).slice(0,4);
    if (!rows.length) return;
    const fragment = document.createDocumentFragment();
    for (const repo of rows) {
      if (typeof repo.name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(repo.name)) continue;
      const row=document.createElement('a'); row.className='activity-row'; row.href='https://github.com/EazyLee30/'+encodeURIComponent(repo.name);
      const label=document.createElement('span');
      label.innerHTML='<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#github"/></svg>';
      const title=document.createElement('strong'); title.textContent=repo.name; const detail=document.createElement("span");detail.append(title);
      if(repo.description){const summary=document.createElement("small");summary.lang="en";summary.textContent=repo.description;detail.append(summary);}
      label.append(detail);
      const time=document.createElement('time'); time.dateTime=repo.pushed_at||''; time.textContent=date(repo.pushed_at);
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg'); arrow.setAttribute('class','icon'); arrow.setAttribute('aria-hidden','true');
      const use=document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href','/assets/icons.svg#arrow-up-right');arrow.append(use);
      row.append(label,time,arrow); fragment.append(row);
    }
    if (!fragment.childNodes.length) return;
    activity.replaceChildren(fragment);
    if (status) status.textContent=(saved?localized.unavailable:localized.updated)+' '+date(data.fetched_at);
  }
  async function sync() {
    let cached;
    try { cached=JSON.parse(localStorage.getItem(key)); if (cached?.repositories) render(cached,true); } catch (_) {}
    if (cached?.fetched_at && Date.now()-Date.parse(cached.fetched_at)<300000) {render(cached);return;}
    try {
      const response=await fetch('https://api.github.com/users/EazyLee30/repos?per_page=100&sort=pushed',{signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('GitHub unavailable');
      const repositories=await response.json(); if (!Array.isArray(repositories)) throw new Error('Invalid response');
      const data={repositories,fetched_at:new Date().toISOString()}; render(data);
      try {localStorage.setItem(key,JSON.stringify(data));}catch(_){}
    } catch (_) {
      if (cached?.repositories) return;
      try { const response=await fetch('/assets/data/github.json'); if(response.ok)render(await response.json(),true); } catch (_) { /* Server-rendered snapshot remains readable. */ }
    }
  }
  if (activity || cards.length) { sync(); document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();}); setInterval(()=>{if(!document.hidden)sync();},300000); }
  // The latest contribution weeks stay in view on narrow screens.
  const calendar = document.querySelector('.contribution-scroll');
  if (calendar) calendar.scrollLeft=calendar.scrollWidth;
  document.querySelectorAll('.demo-switch').forEach(button=>button.addEventListener('click',()=>{
    const ink=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(ink));button.closest('.muse-art').dataset.ink=String(ink);
  }));
  // A still firmware render replaces its animated image when the reader requests less motion.
  const muse=document.querySelector('.muse-screen img');
  const updateMotion=()=>{if(muse)muse.src='https://raw.githubusercontent.com/EazyLee30/muse-charm/main/docs/charm-ui.'+(motion.matches?'png':'gif');};
  updateMotion();motion.addEventListener('change',updateMotion);
})();
