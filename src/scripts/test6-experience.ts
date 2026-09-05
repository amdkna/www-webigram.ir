import type { Finish, OrbitalScene } from './test6-scene';

const canvas = document.querySelector<HTMLCanvasElement>('#orbital-canvas')!;
const controls = document.querySelector<HTMLElement>('#experience-controls')!;
const surface = document.querySelector<HTMLElement>('#model-surface')!;
const hint = document.querySelector<HTMLElement>('#interaction-hint')!;
const status = document.querySelector<HTMLElement>('#render-status')!;
const fallback = document.querySelector<HTMLElement>('#scene-fallback')!;
const motionButton = document.querySelector<HTMLButtonElement>('#motion-control')!;
const unfoldButton = document.querySelector<HTMLButtonElement>('#assemble-control')!;
const progressBar = document.querySelector<HTMLElement>('#reading-progress')!;
const chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
const chapterLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-chapter-link]')];
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
let engine: OrbitalScene | null = null;
let paused = media.matches;
let unfolded = false;
let uiFrame = 0;
let activeChapter = -1;
let dragging = false;
let pointerId: number | null = null;
let previousX = 0;
let previousY = 0;
let observer: IntersectionObserver | null = null;
let disposed = false;
const abort = new AbortController();
const signal = abort.signal;

function updateMotion() {
  document.body.classList.toggle('motion-paused', paused);
  document.documentElement.style.scrollBehavior = paused ? 'auto' : '';
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
  motionButton.title = paused ? 'Resume animation' : 'Pause animation';
  document.querySelector('#pause-icon')!.toggleAttribute('hidden', paused);
  document.querySelector('#play-icon')!.toggleAttribute('hidden', !paused);
  engine?.setPaused(paused);
}

function showFallback() {
  engine?.dispose();
  document.body.classList.remove('scene-ready');
  document.body.classList.remove('motion-enabled');
  document.body.classList.add('scene-unavailable');
  status.hidden = true;
  controls.hidden = true;
  surface.hidden = true;
  hint.hidden = true;
  fallback.hidden = activeChapter > 0;
}

function updatePage() {
  uiFrame = 0;
  const y = window.scrollY;
  let index = 0;
  for (let i = 1; i < chapters.length; i++) {
    if (y >= chapters[i].offsetTop) index = i;
  }
  const next = chapters[Math.min(index + 1, chapters.length - 1)];
  const start = chapters[index].offsetTop;
  const length = Math.max(1, next.offsetTop - start);
  const fraction = index === chapters.length - 1 ? 0 : Math.min(1, Math.max(0, (y - start) / length));
  const progress = index + fraction;
  engine?.setProgress(progress);
  const selected = Math.min(3, Math.floor(progress + .4));
  if (selected !== activeChapter) {
    activeChapter = selected;
    chapterLinks.forEach((link, i) => i === selected ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
    document.body.dataset.chapter = String(selected);
    surface.style.left = selected === 1 ? '2%' : selected === 3 ? '27%' : '49%';
    surface.style.top = selected === 3 ? '10%' : '16%';
    surface.style.height = selected === 3 ? '38%' : '65%';
    hint.style.left = selected === 1 ? '26%' : selected === 3 ? '50%' : '73%';
    hint.style.opacity = selected === 3 ? '0' : '1';
    if (document.body.classList.contains('scene-unavailable')) fallback.hidden = selected !== 0;
  }
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  progressBar.style.transform = `scaleX(${Math.min(1, y / maxScroll)})`;
}

function queuePageUpdate() { if (!uiFrame) uiFrame = requestAnimationFrame(updatePage); }

// The HTML is visible first. Motion is added only after the reveal observer is
// available, so a failed 3D import cannot leave the marketing content hidden.
if ('IntersectionObserver' in window && !media.matches) {
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer?.unobserve(entry.target); }
    });
  }, { threshold: .08 });
  document.querySelectorAll<HTMLElement>('.reveal').forEach((item, i) => {
    item.style.transitionDelay = `${i % 3 * 65}ms`;
    observer!.observe(item);
  });
  document.body.classList.add('motion-enabled');
}
updateMotion();
window.addEventListener('scroll', queuePageUpdate, { passive: true, signal });
window.addEventListener('resize', () => { engine?.resize(); queuePageUpdate(); }, { passive: true, signal });
media.addEventListener('change', event => { paused = event.matches; updateMotion(); }, { signal });
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); }, { signal });
unfoldButton.addEventListener('click', () => {
  unfolded = !unfolded;
  unfoldButton.setAttribute('aria-pressed', String(unfolded));
  unfoldButton.querySelector('span')!.textContent = unfolded ? 'Fold' : 'Unfold';
  unfoldButton.title = unfolded ? 'Return to the scroll-driven sculpture' : 'Separate the sculpture’s components';
  engine?.setExploded(unfolded);
}, { signal });

document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-material]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    engine?.setFinish(button.dataset.material as Finish);
  }, { signal });
});

function resetView() {
  unfolded = false;
  unfoldButton.setAttribute('aria-pressed', 'false');
  unfoldButton.querySelector('span')!.textContent = 'Unfold';
  unfoldButton.title = 'Separate the sculpture’s components';
  engine?.reset();
}
document.querySelector('#reset-control')!.addEventListener('click', resetView, { signal });

surface.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  dragging = true;
  pointerId = event.pointerId;
  previousX = event.clientX;
  previousY = event.clientY;
  surface.setPointerCapture(event.pointerId);
  hint.style.opacity = '0';
}, { signal });
surface.addEventListener('pointermove', event => {
  if (!dragging || event.pointerId !== pointerId) return;
  engine?.rotate((event.clientX - previousX) * .007, (event.clientY - previousY) * .004);
  previousX = event.clientX;
  previousY = event.clientY;
}, { signal });
function endDrag() { dragging = false; pointerId = null; }
surface.addEventListener('pointerup', endDrag, { signal });
surface.addEventListener('pointercancel', endDrag, { signal });
surface.addEventListener('lostpointercapture', endDrag, { signal });
surface.addEventListener('keydown', event => {
  const rotations: Record<string, [number, number]> = { ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1] };
  if (rotations[event.key]) { event.preventDefault(); engine?.rotate(...rotations[event.key]); }
  if (event.key.toLowerCase() === 'r') resetView();
}, { signal });
window.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && !dragging) engine?.setPointer(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
}, { passive: true, signal });

async function start() {
  try {
    const { OrbitalScene } = await import('./test6-scene');
    if (disposed) return;
    engine = new OrbitalScene(canvas, showFallback, paused);
    controls.hidden = false;
    surface.hidden = false;
    hint.hidden = false;
    status.hidden = true;
    document.body.classList.add('scene-ready');
    updatePage();
  } catch (error) {
    console.warn('Webigram 3D experience could not initialize.', error);
    engine?.dispose();
    engine = null;
    showFallback();
  }
}

window.addEventListener('pagehide', event => {
  // A bfcache entry must keep its live event listeners and GPU resources.
  if (event.persisted) { engine?.setPaused(true); return; }
  disposed = true;
  abort.abort();
  if (uiFrame) cancelAnimationFrame(uiFrame);
  observer?.disconnect();
  engine?.dispose();
}, { signal });
window.addEventListener('pageshow', event => {
  if (event.persisted) { engine?.setPaused(paused); queuePageUpdate(); }
}, { signal });
document.fonts.ready.then(queuePageUpdate);
updatePage();
start();
