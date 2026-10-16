(() => {
  const card = document.querySelector('[data-workout]');
  if (!card) return;
  const copy = JSON.parse(document.getElementById('workout-copy').textContent);
  const find = name => card.querySelector(`[data-workout-${name}]`);
  const button = find('nudge');
  const retry = find('retry');
  const endpoint = 'https://whooper.eazylee.si/api/public/workout';
  let visitor;
  try {
    visitor = localStorage.getItem('eazylee-workout-visitor');
    if (!/^[0-9a-f-]{36}$/i.test(visitor || '')) {
      visitor = crypto.randomUUID();
      localStorage.setItem('eazylee-workout-visitor', visitor);
    }
  } catch { visitor = crypto.randomUUID(); }
  let current, loading = false, sending = false;
  const en = document.documentElement.lang === 'en';
  const words = en ? {week:'nudges this week',trained:'workout recorded',pending:'no workout yet',unknown:'unknown',nudges:'nudges',sample:'More days needed to compare nudges and training.',on:'Sound on',off:'Sound off',trainedAvg:'On training days',restAvg:'On days without a workout',average:'nudges / day',relation:'Same-day association',replay:'Animation preview · no nudge added'} : {week:'本周催练',trained:'已训练',pending:'暂无训练',unknown:'未知',nudges:'人催',sample:'还在攒样本，暂时看不出催和练的关系。',on:'音效 开',off:'音效 关',trainedAvg:'练了的日子',restAvg:'暂无训练的日子',average:'人催 / 天',relation:'同日关联',replay:'动效预览，不增加催练人数'};
  let effectTimer;
  const number = card.querySelector('[data-nudge-number]');
  function celebrate() {
    card.classList.remove('nudge-sent');
    void card.offsetWidth;
    card.classList.add('nudge-sent');
    const particles=card.querySelector('.nudge-particles');particles.replaceChildren();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      for(let i=0;i<24;i++){
        const spark=document.createElement('i');spark.className='nudge-spark';
        const angle=(i/24)*Math.PI*2;
        spark.style.setProperty('--i',i);spark.style.setProperty('--dx',`${Math.cos(angle)*(55+Math.random()*75)}px`);spark.style.setProperty('--dy',`${Math.sin(angle)*(35+Math.random()*60)-20}px`);particles.append(spark);
      }
    }
    clearTimeout(effectTimer);effectTimer=setTimeout(()=>{card.classList.remove('nudge-sent');particles.replaceChildren();},1600);
  }
  function renderHistory(history) {
    const chart=card.querySelector('[data-nudge-chart]');
    if(!Array.isArray(history)||!history.length){chart.textContent=en?'Daily records are not available yet.':'每日记录暂不可用。';card.querySelector('[data-nudge-insight]').textContent=words.sample;return;}
    const days=history.filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.date)).map(day=>({...day,nudges:Math.max(0,Number(day.nudges)||0)}));
    const max=Math.max(1,...days.map(day=>day.nudges));
    chart.replaceChildren();
    const chosen=card.dataset.selectedDay||days.at(-1)?.date;
    function select(day){card.dataset.selectedDay=day.date;chart.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.date===day.date)));card.querySelector('[data-nudge-day-detail]').textContent=`${day.date} · ${day.nudges} ${words.nudges} · ${day.trained===null?words.unknown:day.trained?words.trained:words.pending}`;}
    days.forEach(day=>{
      const button=document.createElement('button');button.type='button';button.className='nudge-day';button.dataset.date=day.date;button.setAttribute('aria-label',`${day.date}: ${day.nudges} ${words.nudges}, ${day.trained===null?words.unknown:day.trained?words.trained:words.pending}`);button.setAttribute('aria-pressed',String(day.date===chosen));
      button.style.setProperty('--nudge-level',day.nudges/max);
      button.innerHTML=`<span class="nudge-day-plot"><span class="nudge-day-count">${day.nudges}</span><span class="nudge-day-bar"></span></span><span class="nudge-day-label">${day.date.slice(5).replace('-','/')}</span><span class="nudge-day-status">${day.trained===null?'?':day.trained?'●':'○'}</span>`;
      button.addEventListener('click',()=>select(day));chart.append(button);
    });
    select(days.find(day=>day.date===chosen)||days.at(-1));
    card.querySelector('[data-nudge-week-total]').textContent=`${days.reduce((n,day)=>n+day.nudges,0)} · ${words.week}`;
    const known=days.filter(day=>typeof day.trained==='boolean' && day.date<current.date);const trained=known.filter(day=>day.trained);const rest=known.filter(day=>!day.trained);
    const insight=card.querySelector('[data-nudge-insight]');insight.replaceChildren();
    for(const [group,title] of [[trained,words.trainedAvg],[rest,words.restAvg]]){
      const item=document.createElement('div');item.className='nudge-insight-item';
      const label=document.createElement('span');label.textContent=`${title} · ${group.length}${en?' days':'天'}`;
      const value=document.createElement('strong');value.textContent=group.length?(group.reduce((n,d)=>n+d.nudges,0)/group.length).toFixed(1):'—';
      const unit=document.createElement('span');unit.textContent=words.average;item.append(label,value,unit);insight.append(item);
    }
    const note=document.createElement('p');note.className='nudge-relation';
    const avg=known.reduce((n,d)=>n+d.nudges,0)/(known.length||1);const rate=trained.length/(known.length||1);
    const variance=known.reduce((n,d)=>n+(d.nudges-avg)**2,0);const binary=known.reduce((n,d)=>n+(Number(d.trained)-rate)**2,0);
    if(known.length>=5&&variance>0&&binary>0){const covariance=known.reduce((n,d)=>n+(d.nudges-avg)*(Number(d.trained)-rate),0);note.textContent=`${words.relation} r = ${(covariance/Math.sqrt(variance*binary)).toFixed(2)} · n=${known.length}`;}else note.textContent=words.sample;
    insight.append(note);
  }

  function render(data) {
    current = data;
    number.textContent = Number(data.nudges).toLocaleString(document.documentElement.lang);
    renderHistory(data.history);
    card.dataset.state = data.status;
    find('date').textContent = data.date;
    find('date').dateTime = data.date;
    find('state').textContent = copy[data.status === 'recorded' ? 'Recorded' : data.status === 'not_recorded' ? 'Pending' : 'Unknown'];
    find('complete').hidden = data.status !== 'recorded';
    button.hidden = data.status !== 'not_recorded';
    button.disabled = data.nudged || sending;
    button.textContent = data.nudged ? copy.Nudged : copy.Nudge;
    find('count').textContent = data.nudges === 1 ? copy.CountOne : copy.Count.replace('{n}', data.nudges.toLocaleString(document.documentElement.lang));
    find('rule').hidden = data.status !== 'not_recorded';
    retry.hidden = data.status !== 'unavailable';
    find('checked').textContent = data.checkedAt ? `${copy.Checked} ${new Intl.DateTimeFormat(document.documentElement.lang,{timeZone:data.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(data.checkedAt))} · ${data.timezone}` : '';
  }
  function unavailable() {
    card.dataset.state = 'unavailable';
    find('state').textContent = copy.Unknown;
    button.hidden = true;
    find('complete').hidden = true;
    find('rule').hidden = true;
    retry.hidden = false;
    find('count').textContent = '—';
    number.textContent='—';
    card.querySelector('[data-nudge-chart]').textContent=en?'Daily records unavailable.':'每日记录暂不可用。';
    card.querySelector('[data-nudge-insight]').textContent=words.sample;
  }
  async function refresh() {
    if (loading || sending) return;
    loading = true;
    retry.disabled = true;
    try {
      const response = await fetch(`${endpoint}?visitor=${encodeURIComponent(visitor)}`, {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)});
      if (!response.ok) throw new Error('status');
      render(await response.json());
    } catch { unavailable(); }
    finally { loading = false; retry.disabled = false; }
  }
  button.addEventListener('click', async () => {
    if (sending || current?.status !== 'not_recorded' || current.nudged) return;
    sending = true;
    button.disabled = true;
    find('feedback').textContent = '';
    try {
      const response = await fetch(endpoint, {method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor,date:current.date}),signal:AbortSignal.timeout(25000)});
      const result = await response.json();
      if (response.ok || response.status === 409) { const added=response.ok&&!current?.nudged&&result.nudged; render(result); if(added)celebrate(); }
      else { find('feedback').textContent = response.status === 429 ? copy.Limited : copy.Error; }
    } catch { find('feedback').textContent = copy.Error; }
    finally { sending = false; button.disabled = current?.nudged || false; }
  });
  retry.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  refresh();
})();
