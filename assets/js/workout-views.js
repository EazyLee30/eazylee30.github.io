/* Native horizontal scrolling keeps touch gestures and trackpads predictable. */
(() => {
  const root = document.querySelector('[data-workout-views]');
  if (root) {
    const track = root.querySelector('.workout-view-track');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = [...root.querySelectorAll('[role="tabpanel"]')];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, frame, target = null;
    function activate(next) {
      index = next;
      tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].inert = i !== index; });
      root.style.setProperty('--view-index', index);
      const shareLink = root.querySelector('[data-view-share]');
      if (shareLink) {
        shareLink.href = tabs[index].id === 'sheet-tab' ? shareLink.dataset.sheetUrl : shareLink.dataset.movementUrl;
        shareLink.setAttribute('aria-label', `${shareLink.textContent.trim()} · ${tabs[index].textContent.trim()}`);
      }
      // Match the active view's natural height without clipping long sessions.
      track.style.height = `${panels[index].scrollHeight}px`;
    }
    function go(next) {
      target = next;
      activate(next);
      const left = panels[next].offsetLeft - panels[0].offsetLeft;
      if (Math.abs(track.scrollLeft - left) < 2) target = null;
      track.scrollTo({ left, behavior: reduce.matches ? 'instant' : 'smooth' });
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => go(i));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        go(next); tabs[next].focus();
      });
    });
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (target !== null) {
          const left = panels[target].offsetLeft - panels[0].offsetLeft;
          if (Math.abs(track.scrollLeft - left) < 2) target = null;
          return;
        }
        activate(Math.min(tabs.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth))));
      });
    }, { passive: true });
    // A manual gesture takes over immediately from an in-flight tab animation.
    for (const event of ['wheel', 'touchstart', 'pointerdown']) {
      track.addEventListener(event, () => { target = null; }, {passive: true});
    }
    track.addEventListener('scrollend', () => {
      target = null;
      activate(Math.min(tabs.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth))));
    });
    new ResizeObserver(() => {
      activate(index);
      track.scrollTo({left: index * track.clientWidth, behavior: 'instant'});
    }).observe(panels[0]);
    new ResizeObserver(() => { track.style.height = `${panels[index].scrollHeight}px`; }).observe(panels[1]);
    document.fonts.ready.then(() => activate(index));
    activate(0);
  }
  const copyNode = document.getElementById('share-copy');
  if (!copyNode) return;
  const copy = JSON.parse(copyNode.textContent);
  const feedback = document.querySelector('[data-share-feedback]');
  const url = new URL(location.pathname + location.search, 'https://eazylee.xyz').href;
  document.querySelector('[data-share-link]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); feedback.textContent = copy[7]; }
    catch { feedback.textContent = url; }
  });
  document.querySelector('[data-share-native]').addEventListener('click', async () => {
    if (!navigator.share) { feedback.textContent = copy[8]; return; }
    try { await navigator.share({title: document.title, url}); }
    catch (error) { if (error.name !== 'AbortError') feedback.textContent = copy[8]; }
  });
  document.querySelector('[data-share-print]').addEventListener('click', () => window.print());
})();
/* Export the original photograph plus its data layer at the original resolution. */
(() => {
  const button = document.querySelector('[data-share-image]');
  if (!button) return;
  async function saveMovementImage() {
    await document.fonts.ready;
    const content = document.querySelector('.movement-share-content');
    const cards = [...content.querySelectorAll('.wcard')];
    const theme = getComputedStyle(document.documentElement);
    const color = name => theme.getPropertyValue(name).trim();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    const heights = cards.map(card => Math.max(260, 96 + card.querySelectorAll('.wset').length * 46));
    canvas.height = 280 + heights.reduce((sum, h) => sum + h + 24, 0) + 170;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color('--bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = 'top';
    const text = (value, x, y, size, ink = color('--text')) => {
      ctx.fillStyle = ink; ctx.font = `${size}px JetBrains, monospace`; ctx.fillText(value, x, y);
    };
    const date = document.querySelector('.share-date time').dateTime;
    text('EAZYLEE / WORKOUT', 60, 55, 34);
    text(date, 60, 108, 24, color('--muted'));
    const metrics = [...content.querySelectorAll('.wdetail-meta span')].slice(1).map(x => x.textContent);
    metrics.forEach((value, i) => text(value, 60, 158 + i * 36, 20));
    let y = 270;
    for (const [i, card] of cards.entries()) {
      const h = heights[i];
      ctx.strokeStyle = color('--border'); ctx.lineWidth = 2; ctx.strokeRect(60, y, 960, h);
      const title = card.querySelector('h3').textContent;
      text(title, 86, y + 24, 28);
      const frame = card.querySelector('.wframe.on') || card.querySelector('.wframe');
      if (frame) {
        const svg = new XMLSerializer().serializeToString(frame).replace(/currentColor/g, color('--accent'));
        const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await img.decode(); ctx.drawImage(img, 86, y + 78, 180, 180);
      }
      for (const [j, row] of [...card.querySelectorAll('.wset')].entries()) {
        const top = y + 84 + j * 46;
        text(row.querySelector('.wset-n').textContent, 310, top, 20, color('--muted'));
        text(row.querySelector('.wset-r').textContent, 535, top, 22);
        text(row.querySelector('.wset-w').textContent, 790, top, 22, color('--accent'));
      }
      y += h + 24;
    }
    text('DATA FROM', 60, y + 16, 15, color('--muted'));
    const logo = new Image();
    const dark = ['tokyo','gruvbox','nord','rose','matrix'].includes(document.documentElement.dataset.theme);
    logo.src = `/assets/brand/whoop/wordmark-${dark ? 'white' : 'black'}.svg`;
    await logo.decode(); ctx.drawImage(logo, 60, y + 44, 140, 140 * logo.naturalHeight / logo.naturalWidth);
    text('Exercise art: Bryl Lim / Workout Guide + Everkinetic · CC BY-SA 4.0', 60, y + 100, 13, color('--muted'));
    text('github.com/bryllim/workout-guide · creativecommons.org/licenses/by-sa/4.0', 60, y + 123, 12, color('--muted'));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export failed');
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `eazylee-workout-${date}-movement.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    const feedback = document.querySelector('[data-share-feedback]');
    try {
      if (document.querySelector('[data-share-view="movement"]')) {
        await saveMovementImage();
        return;
      }
      await document.fonts.load('400 38px TrainingHand');
      for (const [index, sheet] of [...document.querySelectorAll('.training-sheet')].entries()) {
        const original = sheet.querySelector('.sheet-original');
        await original.decode();
        const canvas = document.createElement('canvas');
        canvas.width = original.naturalWidth; canvas.height = original.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(original, 0, 0);
        const bounds = sheet.getBoundingClientRect();
        const ratio = canvas.width / bounds.width;
        for (const element of sheet.querySelectorAll('.sheet-date, .sheet-entry > span')) {
          const box = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          const size = parseFloat(css.fontSize) * ratio;
          ctx.font = `400 ${size}px TrainingHand`;
          ctx.fillStyle = css.color;
          ctx.textBaseline = 'middle';
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${parseFloat(css.letterSpacing) * ratio || 0}px`;
          const left = (box.left - bounds.left + parseFloat(css.paddingLeft)) * ratio;
          const width = (box.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)) * ratio;
          const text = element.textContent.toUpperCase();
          const lines = []; let line = '';
          for (const word of text.split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
            else line = next;
          }
          if (line) lines.push(line);
          const lineHeight = parseFloat(css.lineHeight) * ratio;
          const middle = (box.top - bounds.top + box.height / 2) * ratio;
          ctx.textAlign = css.textAlign === 'center' ? 'center' : 'left';
          ctx.strokeStyle = css.color;
          ctx.lineWidth = parseFloat(css.webkitTextStrokeWidth) * ratio || 0;
          ctx.lineJoin = 'round';
          lines.forEach((value, i) => {
            const x = left + (ctx.textAlign === 'center' ? width / 2 : 0);
            const y = middle + (i - (lines.length - 1) / 2) * lineHeight;
            if (ctx.lineWidth > 0) ctx.strokeText(value, x, y);
            ctx.fillText(value, x, y);
          });
        }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Image export failed');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        link.download = `eazylee-workout-${sheet.querySelector('time').dateTime}${index ? `-${index + 1}` : ''}.png`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch { feedback.textContent = document.documentElement.lang === 'en' ? 'Unable to save image. Try printing instead.' : '图片保存失败，请尝试打印。'; }
    finally { button.disabled = false; }
  });
})();
