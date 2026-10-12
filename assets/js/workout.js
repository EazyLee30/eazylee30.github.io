(() => {
  const card = document.querySelector('[data-workout]');
  if (!card) return;
  const copy = JSON.parse(document.getElementById('workout-copy').textContent);
  const find = name => card.querySelector(`[data-workout-${name}]`);
  const button = find('nudge');
  const retry = find('retry');
  const endpoint = 'https://whooper.ccwu.cc/api/public/workout';
  let visitor;
  try {
    visitor = localStorage.getItem('eazylee-workout-visitor');
    if (!/^[0-9a-f-]{36}$/i.test(visitor || '')) {
      visitor = crypto.randomUUID();
      localStorage.setItem('eazylee-workout-visitor', visitor);
    }
  } catch { visitor = crypto.randomUUID(); }
  let current, loading = false, sending = false;
  function render(data) {
    current = data;
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
      if (response.ok || response.status === 409) render(result);
      else { find('feedback').textContent = response.status === 429 ? copy.Limited : copy.Error; }
    } catch { find('feedback').textContent = copy.Error; }
    finally { sending = false; button.disabled = current?.nudged || false; }
  });
  retry.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  refresh();
})();
