/** Homepage live artwork plus the persistent stage-three header handoff. */
const artwork = document.querySelector<HTMLElement>('[data-home5-live] .live-composition');
const story = document.getElementById('story');
const realHeader = document.querySelector<HTMLElement>('.slide-real .stage-header');

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

let persistentHeader: HTMLElement | null = null;

const positionPersistentHeader = () => {
  if (!persistentHeader || !realHeader) return;
  const rect = realHeader.getBoundingClientRect();
  persistentHeader.style.top = `${rect.top}px`;
  persistentHeader.style.left = `${rect.left}px`;
  persistentHeader.style.width = `${rect.width}px`;
  persistentHeader.style.height = `${rect.height}px`;
};

const mountPersistentHeader = () => {
  if (!realHeader || persistentHeader) return;
  persistentHeader = realHeader.cloneNode(true) as HTMLElement;
  persistentHeader.classList.add('persistent-stage-header');
  persistentHeader.setAttribute('aria-label', 'منوی اصلی وبیگرام');
  document.body.appendChild(persistentHeader);
  document.body.classList.add('has-persistent-stage-header');
  positionPersistentHeader();
};

const unmountPersistentHeader = () => {
  persistentHeader?.remove();
  persistentHeader = null;
  document.body.classList.remove('has-persistent-stage-header');
};

const syncPersistentHeader = () => {
  if (document.body.dataset.stage === '2') {
    mountPersistentHeader();
    positionPersistentHeader();
  } else {
    unmountPersistentHeader();
  }
};

const syncNarrativeRelease = () => {
  if (!story) return;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const complete = story.getBoundingClientRect().bottom <= viewportHeight + 1;
  document.body.classList.toggle('section-exit-complete', complete);
};

const bodyObserver = new MutationObserver(syncPersistentHeader);
bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });

window.addEventListener('scroll', syncNarrativeRelease, { passive: true });
window.addEventListener('resize', () => {
  positionPersistentHeader();
  syncNarrativeRelease();
});
window.visualViewport?.addEventListener('resize', () => {
  positionPersistentHeader();
  syncNarrativeRelease();
});
window.addEventListener('pageshow', () => {
  syncPersistentHeader();
  syncNarrativeRelease();
});

syncPersistentHeader();
syncNarrativeRelease();
