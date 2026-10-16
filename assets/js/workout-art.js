/* Workout detail figures.
   Frames come from bryllim/workout-guide (CC BY-SA 4.0, credited on the
   page). They are fetched as SVG, recolored #fff -> currentColor at runtime
   so the figures follow the active site theme, inlined, then cycled.
   Resilient loading: each frame is retried and falls back from jsDelivr to
   raw.githubusercontent.com before the figure gives up to a static mark. */
(() => {
  const CDNS = [
    '/assets/art/workout/guide',
    'https://cdn.jsdelivr.net/gh/bryllim/workout-guide@main/packages/workout-guide/assets',
    'https://raw.githubusercontent.com/bryllim/workout-guide/main/packages/workout-guide/assets',
  ];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function fetchFrame(slug, n) {
    let lastError = null;
    for (const base of CDNS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${base}/${slug}/frame-${n}.svg`);
          if (!res.ok) throw new Error(`http ${res.status}`);
          const text = await res.text();
          if (!text.includes('<svg')) throw new Error('not svg');
          return text;
        } catch (err) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('frame failed');
  }

  function inlineFrame(svgText, on) {
    const inner = svgText
      .replace(/#ffffff/gi, 'currentColor')
      .replace(/#fff/gi, 'currentColor')
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    return `<svg class="wframe${on ? ' on' : ''}" viewBox="0 0 512 512" aria-hidden="true">${inner}</svg>`;
  }

  async function hydrate(fig) {
    if (fig.dataset.hydrated) return;
    fig.dataset.hydrated = 'true';
    const slug = fig.dataset.art;
    if (!slug) return;
    try {
      const texts = [];
      for (const n of [1, 2, 3]) texts.push(await fetchFrame(slug, n));
      fig.innerHTML = texts.map((t, i) => inlineFrame(t, i === 0)).join('');
      const frames = fig.querySelectorAll('.wframe');
      if (frames.length < 2 || reduce) return;
      let i = 0, lastFrame = 0;
      let timer = null;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && timer === null) {
            timer = setInterval(() => {
              const now=performance.now();
              const interval=fig.closest('.nudge-sent')?180:650;
              if(now-lastFrame<interval)return;
              lastFrame=now;
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
      fig.innerHTML = '<span aria-hidden="true">./</span>';
      fig.classList.add('wfig-none');
    }
  }

  const refresh = () => document.querySelectorAll('.wfig[data-art]').forEach(hydrate);
  document.addEventListener('workout:updated', refresh);
  refresh();
})();
