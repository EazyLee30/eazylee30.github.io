/* Workout detail figures.
   Frames come from bryllim/workout-guide (CC BY-SA 4.0, credited on the
   page). They are fetched as SVG, recolored #fff -> currentColor at runtime
   so the figures follow the active site theme, inlined, then cycled.
   Resilient loading: bundled exercises load locally first; other slugs go
   directly to jsDelivr and fall back to raw.githubusercontent.com without
   wasting retries on 404s. */
(() => {
  const LOCAL_BASE = '/assets/art/workout/guide';
  const LOCAL_SLUGS = new Set([
    'barbell-row',
    'bench-press',
    'bicep-curl',
    'cable-fly',
    'close-grip-lat-pulldown',
    'deadlift',
    'dip',
    'dumbbell-bench-press',
    'face-pull',
    'hammer-curl',
    'incline-bench-press',
    'incline-dumbbell-press',
    'lat-pulldown',
    'lateral-raise',
    'leg-curl',
    'leg-extension',
    'leg-press',
    'machine-chest-press',
    'overhead-press',
    'pec-deck',
    'pull-up',
    'push-up',
    'romanian-deadlift',
    'seated-dumbbell-press',
    'seated-row',
    'squat',
    'tricep-pushdown',
    'wide-grip-lat-pulldown',
  ]);
  const REMOTE_CDNS = [
    'https://cdn.jsdelivr.net/gh/bryllim/workout-guide@main/packages/workout-guide/assets',
    'https://raw.githubusercontent.com/bryllim/workout-guide/main/packages/workout-guide/assets',
  ];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cache = new Map();

  async function fetchFromBase(base, slug, n) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/${slug}/frame-${n}.svg`);
        if (res.status === 404) throw Object.assign(new Error('http 404'), { status: 404 });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const text = await res.text();
        if (!text.includes('<svg')) throw new Error('not svg');
        return text;
      } catch (err) {
        lastError = err;
        if (err && err.status === 404) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
      }
    }
    throw lastError || new Error('frame failed');
  }

  async function fetchFrames(slug) {
    if (cache.has(slug)) return cache.get(slug);
    const promise = (async () => {
      const bases = LOCAL_SLUGS.has(slug) ? [LOCAL_BASE, ...REMOTE_CDNS] : REMOTE_CDNS;
      let lastError = null;
      for (const base of bases) {
        try {
          return await Promise.all([1, 2, 3].map((n) => fetchFromBase(base, slug, n)));
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error('frames failed');
    })();
    cache.set(slug, promise);
    promise.catch(() => {
      if (cache.get(slug) === promise) cache.delete(slug);
    });
    return promise;
  }

  function inlineFrame(svgText, on) {
    const viewBox = svgText.match(/viewBox="([^"]+)"/i)?.[1] || '0 0 512 512';
    const inner = svgText
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/#ffffff\b/gi, 'currentColor')
      .replace(/#fff\b/gi, 'currentColor')
      .replace(/fill="white"/gi, 'fill="currentColor"')
      .replace(/stroke="white"/gi, 'stroke="currentColor"')
      .replace(/^[\s\S]*?<svg[^>]*>/i, '')
      .replace(/<\/svg>\s*$/i, '');
    return `<svg class="wframe${on ? ' on' : ''}" viewBox="${viewBox}" aria-hidden="true">${inner}</svg>`;
  }

  async function hydrate(fig) {
    if (fig.dataset.hydrated) return;
    fig.dataset.hydrated = 'true';
    const slug = fig.dataset.art;
    if (!slug) return;
    try {
      const texts = await fetchFrames(slug);
      if (!fig.isConnected) return;
      fig.innerHTML = texts.map((t, i) => inlineFrame(t, i === 0)).join('');
      const frames = fig.querySelectorAll('.wframe');
      if (frames.length < 2 || reduce) return;
      let i = 0, lastFrame = 0;
      let timer = null;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && timer === null) {
            timer = setInterval(() => {
              const now = performance.now();
              const interval = fig.closest('.nudge-sent') ? 180 : 650;
              if (now - lastFrame < interval) return;
              lastFrame = now;
              if (!fig.isConnected) { clearInterval(timer); io.disconnect(); return; }
              frames[i].classList.remove('on');
              i = (i + 1) % frames.length;
              frames[i].classList.add('on');
            }, 130);
          } else if (!e.isIntersecting && timer !== null) {
            clearInterval(timer);
            timer = null;
          }
        });
      });
      io.observe(fig);
    } catch {
      if (!fig.isConnected) return;
      fig.innerHTML = '';
      fig.classList.add('wfig-none');
      fig.closest('.wcard')?.classList.add('wcard-no-art');
    }
  }

  const refresh = () => document.querySelectorAll('.wfig[data-art]').forEach(hydrate);
  document.addEventListener('workout:updated', refresh);
  refresh();
})();
