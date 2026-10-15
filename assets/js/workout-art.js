/* Workout detail figures.
   Frames come from bryllim/workout-guide (CC BY-SA 4.0, credited on the
   page) via jsDelivr; they are recolored to currentColor at runtime so the
   figures follow the active site theme. Cycles frames while visible;
   honors prefers-reduced-motion; degrades to a static mark offline. */
(() => {
  const CDN = 'https://cdn.jsdelivr.net/gh/bryllim/workout-guide@main/packages/workout-guide/assets';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function inlineFrame(svgText, on) {
    const inner = svgText
      .replace(/#ffffff/gi, 'currentColor')
      .replace(/#fff/gi, 'currentColor')
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    return `<svg class="wframe${on ? ' on' : ''}" viewBox="0 0 512 512" aria-hidden="true">${inner}</svg>`;
  }

  async function hydrate(fig) {
    const slug = fig.dataset.art;
    if (!slug) return;
    try {
      const texts = await Promise.all([1, 2, 3].map(async (n) => {
        const res = await fetch(`${CDN}/${slug}/frame-${n}.svg`);
        if (!res.ok) throw new Error('frame');
        return res.text();
      }));
      fig.innerHTML = texts.map((t, i) => inlineFrame(t, i === 0)).join('');
      const frames = fig.querySelectorAll('.wframe');
      if (frames.length < 2 || reduce) return;
      let i = 0;
      let timer = null;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && timer === null) {
            timer = setInterval(() => {
              frames[i].classList.remove('on');
              i = (i + 1) % frames.length;
              frames[i].classList.add('on');
            }, 650);
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

  document.querySelectorAll('.wfig[data-art]').forEach(hydrate);
})();
