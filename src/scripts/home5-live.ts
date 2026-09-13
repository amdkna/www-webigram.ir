/** Homepage live artwork plus the stage-three header handoff. */
const artwork = document.querySelector<HTMLElement>('[data-home5-live] .live-composition');
const story = document.getElementById('story');
const frame = document.querySelector<HTMLElement>('.frame');
const realHeader = document.querySelector<HTMLElement>('.slide-real .stage-header');

if (artwork) {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncPlayback = () => {
    artwork.toggleAttribute(
      'data-live-playing',
      document.body.dataset.stage === '2' && !document.hidden && !motionPreference.matches,
    );
  };
  const observer = new MutationObserver(syncPlayback);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });
  document.addEventListener('visibilitychange', syncPlayback);
  motionPreference.addEventListener('change', syncPlayback);
  window.addEventListener('pageshow', syncPlayback);
  window.addEventListener('pagehide', () => artwork.removeAttribute('data-live-playing'));
  syncPlayback();
}

/*
 * Keep exactly one navigation visible.
 *
 * The stage-three header stays inside the slide while sections 2 -> 3 are
 * transitioning. Only when the dedicated 3 -> 4 handoff starts do we move the
 * original header to <body> and make it fixed. This prevents the real header
 * from sitting on top of section two's header and creating the doubled/shadowed
 * menu that appeared during the previous implementation.
 */
const headerMarker = realHeader ? document.createComment('webigram-stage-header-home') : null;
let headerDetached = false;
let headerFrameRatios: { top: number; left: number; width: number; height: number } | null = null;

if (realHeader && headerMarker && realHeader.parentNode) {
  realHeader.parentNode.insertBefore(headerMarker, realHeader);
}

const clearHeaderInlineGeometry = () => {
  if (!realHeader) return;
  realHeader.style.removeProperty('top');
  realHeader.style.removeProperty('left');
  realHeader.style.removeProperty('right');
  realHeader.style.removeProperty('width');
  realHeader.style.removeProperty('height');
};

const captureHeaderGeometry = () => {
  if (!realHeader || !frame) return null;
  const headerRect = realHeader.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (!frameRect.width || !frameRect.height) return null;

  return {
    top: (headerRect.top - frameRect.top) / frameRect.height,
    left: (headerRect.left - frameRect.left) / frameRect.width,
    width: headerRect.width / frameRect.width,
    height: headerRect.height / frameRect.height,
  };
};

const positionDetachedHeader = () => {
  if (!headerDetached || !realHeader || !frame || !headerFrameRatios) return;
  const frameRect = frame.getBoundingClientRect();
  realHeader.style.top = `${frameRect.top + frameRect.height * headerFrameRatios.top}px`;
  realHeader.style.left = `${frameRect.left + frameRect.width * headerFrameRatios.left}px`;
  realHeader.style.right = 'auto';
  realHeader.style.width = `${frameRect.width * headerFrameRatios.width}px`;
  realHeader.style.height = `${frameRect.height * headerFrameRatios.height}px`;
};

const detachOriginalHeader = () => {
  if (!realHeader || headerDetached) return;
  headerFrameRatios = captureHeaderGeometry();
  if (!headerFrameRatios) return;

  document.body.appendChild(realHeader);
  realHeader.classList.add('persistent-stage-header');
  realHeader.setAttribute('data-original-header-persistent', '');
  headerDetached = true;
  document.body.classList.add('has-persistent-stage-header');
  positionDetachedHeader();
};

const restoreOriginalHeader = () => {
  if (!realHeader || !headerMarker || !headerDetached || !headerMarker.parentNode) return;
  headerMarker.parentNode.insertBefore(realHeader, headerMarker.nextSibling);
  realHeader.classList.remove('persistent-stage-header');
  realHeader.removeAttribute('data-original-header-persistent');
  clearHeaderInlineGeometry();
  headerDetached = false;
  headerFrameRatios = null;
  document.body.classList.remove('has-persistent-stage-header');
};

const syncPersistentHeader = () => {
  const handoffActive =
    document.body.classList.contains('section-exiting') ||
    document.body.classList.contains('section-exit-complete');

  if (handoffActive) {
    detachOriginalHeader();
    positionDetachedHeader();
  } else {
    restoreOriginalHeader();
  }
};

const syncNarrativeRelease = () => {
  if (!story) return;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const complete = story.getBoundingClientRect().bottom <= viewportHeight + 1;
  document.body.classList.toggle('section-exit-complete', complete);
};

/* renderExit() toggles section-exiting on body, so watch body.class directly. */
const bodyObserver = new MutationObserver(syncPersistentHeader);
bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('scroll', syncNarrativeRelease, { passive: true });
window.addEventListener('resize', () => {
  positionDetachedHeader();
  syncNarrativeRelease();
});
window.visualViewport?.addEventListener('resize', () => {
  positionDetachedHeader();
  syncNarrativeRelease();
});
window.addEventListener('pageshow', () => {
  syncPersistentHeader();
  syncNarrativeRelease();
});

syncPersistentHeader();
syncNarrativeRelease();
