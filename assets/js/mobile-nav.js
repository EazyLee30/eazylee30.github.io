/* Mobile drawer navigation: hamburger toggle, scrim/Esc/link close, theme shortcut. */
(() => {
  const root = document.documentElement;
  const toggle = document.querySelector('.mobile-nav-toggle');
  const drawer = document.getElementById('mobile-drawer');
  if (!toggle || !drawer) return;
  const scrim = document.querySelector('.nav-scrim');
  const closeBtn = drawer.querySelector('.drawer-close');
  const isOpen = () => root.dataset.navOpen === 'true';
  function open() {
    root.dataset.navOpen = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function close(returnFocus) {
    if (!isOpen()) return;
    delete root.dataset.navOpen;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => (isOpen() ? close(true) : open()));
  drawer.querySelectorAll('[data-nav-close]').forEach((el) => el.addEventListener('click', () => close(true)));
  if (scrim) scrim.addEventListener('click', () => close(false));
  drawer.querySelectorAll('.drawer-nav a').forEach((a) => a.addEventListener('click', () => close(false)));
  const themeRow = drawer.querySelector('[data-open-theme]');
  if (themeRow) themeRow.addEventListener('click', () => {
    close(false);
    const trigger = document.querySelector('.theme-trigger');
    if (trigger) trigger.click();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  // If the viewport leaves the mobile breakpoint while open, reset state.
  const mq = window.matchMedia('(min-width: 601px)');
  const sync = (e) => { if (e.matches && isOpen()) { delete root.dataset.navOpen; toggle.setAttribute('aria-expanded', 'false'); } };
  if (mq.addEventListener) mq.addEventListener('change', sync);
})();
