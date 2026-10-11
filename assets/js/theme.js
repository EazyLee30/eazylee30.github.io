/* Theme engine for eazylee.github.io — vanilla JS, no dependencies.
 *
 * An inline snippet in <head> (see below) sets data-theme before first
 * paint; this module handles persistence, the switcher UI, deep links
 * (?theme=), the "t" shortcut, and <meta name="theme-color"> sync.
 *
 * Inline pre-paint snippet (must run before the CSS links):
 *
 * <script>
 * (function(){try{var T=['matrix','amber','cyan','tokyo-night','catppuccin','gruvbox','paper'];
 * var q=null;try{q=new URLSearchParams(location.search).get('theme');}catch(e){}
 * if(q&&T.indexOf(q)>-1){document.documentElement.setAttribute('data-theme',q);return;}
 * var s=null;try{s=localStorage.getItem('eazylee-theme');}catch(e){}
 * if(s&&T.indexOf(s)>-1){document.documentElement.setAttribute('data-theme',s);return;}
 * document.documentElement.setAttribute('data-theme',
 *   (window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'paper':'matrix');
 * }catch(e){}})();
 * </script>
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'eazylee-theme';

  var THEMES = [
    { id: 'matrix',      label: 'Matrix' },
    { id: 'amber',       label: 'Amber' },
    { id: 'cyan',        label: 'Cyan' },
    { id: 'tokyo-night', label: 'Tokyo Night' },
    { id: 'catppuccin',  label: 'Catppuccin' },
    { id: 'gruvbox',     label: 'Gruvbox' },
    { id: 'paper',       label: 'Paper' }
  ];

  /* Swatch preview colors per theme: [bg, accent, link] */
  var SWATCHES = {
    'matrix':      ['#000000', '#00ff00', '#ffffff'],
    'amber':       ['#0b0700', '#ffb000', '#fff3d6'],
    'cyan':        ['#001014', '#00e5ff', '#e8feff'],
    'tokyo-night': ['#1a1b26', '#7aa2f7', '#e8ecff'],
    'catppuccin':  ['#1e1e2e', '#a6e3a1', '#f5f0ff'],
    'gruvbox':     ['#282828', '#b8bb26', '#fbf1c7'],
    'paper':       ['#f2efe6', '#0d7a3f', '#0f4fd8']
  };

  function themeIds() {
    return THEMES.map(function (t) { return t.id; });
  }

  function isValid(id) {
    return themeIds().indexOf(id) > -1;
  }

  function current() {
    var id = document.documentElement.getAttribute('data-theme');
    return isValid(id) ? id : 'matrix';
  }

  function readToken(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || '').trim();
  }

  function syncMetaThemeColor() {
    var bg = readToken('--bg') || '#000000';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', bg);
  }

  function stripThemeParam() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.has('theme')) {
        url.searchParams.delete('theme');
        window.history.replaceState(null, '', url.toString());
      }
    } catch (e) { /* non-fatal */ }
  }

  function apply(id, opts) {
    if (!isValid(id)) return;
    opts = opts || {};
    document.documentElement.setAttribute('data-theme', id);
    if (opts.save !== false) {
      try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* private mode */ }
    }
    if (opts.stripParam) stripThemeParam();
    syncMetaThemeColor();
    refreshButtonLabel();
    markActiveOption();
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
    } catch (e) { /* old browsers */ }
  }

  function cycle() {
    var ids = themeIds();
    var next = ids[(ids.indexOf(current()) + 1) % ids.length];
    apply(next, { stripParam: true });
  }

  /* ---------- switcher UI ---------- */

  var switcherEl = null;
  var btnLabelEl = null;
  var panelEl = null;

  function labelFor(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i].label;
    }
    return id;
  }

  function refreshButtonLabel() {
    if (btnLabelEl) btnLabelEl.textContent = '$ theme: ' + current();
  }

  function markActiveOption() {
    if (!panelEl) return;
    var cur = current();
    var opts = panelEl.querySelectorAll('.ts-option');
    for (var i = 0; i < opts.length; i++) {
      var active = opts[i].getAttribute('data-theme-id') === cur;
      opts[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      opts[i].querySelector('.ts-marker').textContent = active ? '>' : ' ';
    }
  }

  function buildUI() {
    switcherEl = document.createElement('div');
    switcherEl.id = 'theme-switcher';

    var btn = document.createElement('button');
    btn.id = 'theme-switcher-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btnLabelEl = document.createElement('span');
    var blink = document.createElement('span');
    blink.className = 'cursor-blink';
    btn.appendChild(btnLabelEl);
    btn.appendChild(blink);

    panelEl = document.createElement('div');
    panelEl.id = 'theme-switcher-panel';
    panelEl.setAttribute('role', 'menu');

    var title = document.createElement('div');
    title.className = 'ts-title';
    title.textContent = '// pick a theme';
    panelEl.appendChild(title);

    THEMES.forEach(function (t) {
      var opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'ts-option';
      opt.setAttribute('data-theme-id', t.id);
      opt.setAttribute('role', 'menuitemradio');

      var marker = document.createElement('span');
      marker.className = 'ts-marker';
      marker.textContent = ' ';

      var name = document.createElement('span');
      name.textContent = t.label;

      var sw = document.createElement('span');
      sw.className = 'ts-swatches';
      (SWATCHES[t.id] || []).forEach(function (c) {
        var dot = document.createElement('i');
        dot.style.background = c;
        sw.appendChild(dot);
      });

      opt.appendChild(marker);
      opt.appendChild(name);
      opt.appendChild(sw);
      opt.addEventListener('click', function () {
        apply(t.id, { stripParam: true });
        closePanel();
      });
      panelEl.appendChild(opt);
    });

    var hint = document.createElement('div');
    hint.className = 'ts-hint';
    hint.textContent = 'tip: press [t] to cycle themes';
    panelEl.appendChild(hint);

    function closePanel() {
      switcherEl.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = switcherEl.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (switcherEl.classList.contains('open') && !switcherEl.contains(e.target)) {
        closePanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });

    switcherEl.appendChild(btn);
    switcherEl.appendChild(panelEl);
    document.body.appendChild(switcherEl);
    refreshButtonLabel();
    markActiveOption();
  }

  /* ---------- init ---------- */

  function init() {
    /* Honor ?theme= deep links: apply once without persisting, then strip. */
    var param = null;
    try { param = new URLSearchParams(window.location.search).get('theme'); } catch (e) {}
    if (param && isValid(param)) {
      apply(param, { save: false, stripParam: true });
    } else {
      /* Pre-paint snippet already set data-theme; just sync meta. */
      syncMetaThemeColor();
    }

    if (document.body) {
      buildUI();
    } else {
      document.addEventListener('DOMContentLoaded', buildUI);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 't' && e.key !== 'T') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      cycle();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* tiny public API for inline page scripts */
  window.EazyleeTheme = { apply: apply, cycle: cycle, current: current, themes: themeIds() };
})();
