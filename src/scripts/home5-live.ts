/** Only decorative CSS motion: no timers, pointer tracking, or render loop. */
const artwork = document.querySelector<HTMLElement>('[data-home5-live] .live-composition');
if (artwork) {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncPlayback = () => {
    artwork.toggleAttribute('data-live-playing',
      document.body.dataset.stage === '2' && !document.hidden && !motionPreference.matches);
  };
  const observer = new MutationObserver(syncPlayback);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });
  document.addEventListener('visibilitychange', syncPlayback);
  motionPreference.addEventListener('change', syncPlayback);
  window.addEventListener('pageshow', syncPlayback);
  window.addEventListener('pagehide', () => artwork.removeAttribute('data-live-playing'));
  syncPlayback();
}
