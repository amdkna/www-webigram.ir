import type { HomeScene } from './home6-scene';

const story=document.querySelector<HTMLElement>('#story')!;
const frame=document.querySelector<HTMLElement>('.frame')!;
const slides=[...document.querySelectorAll<HTMLElement>('[data-slide]')];
const visuals=slides.map(slide=>slide.querySelector<HTMLElement>('.visual')!);
const dots=[...document.querySelectorAll<HTMLButtonElement>('.progress button')];
const host=document.querySelector<HTMLElement>('#home6-scene')!;
const canvas=document.querySelector<HTMLCanvasElement>('#home6-canvas')!;
const toolbar=document.querySelector<HTMLElement>('#home6-tools')!;
const status=document.querySelector<HTMLElement>('#home6-status')!;
const pauseButton=document.querySelector<HTMLButtonElement>('#home6-pause')!;
const nightButton=document.querySelector<HTMLButtonElement>('#home6-night')!;
const expandButton=document.querySelector<HTMLButtonElement>('#home6-expand')!;
const media=matchMedia('(prefers-reduced-motion: reduce)');
const abort=new AbortController();const signal=abort.signal;
let scene:HomeScene|null=null;
let paused=media.matches,night=false,expanded=false,disposed=false;
let raf=0,stage=-1,dragPointer:number|null=null,lastX=0,lastY=0;
const labels=['طرح اولیه / ۰۱','طراحی رنگی / ۰۲','ایده ها جان می گیرند / ۰۳'];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function metrics(){const height=document.querySelector<HTMLElement>('.viewport')!.clientHeight;const max=Math.max(1,story.offsetHeight-height);return{max,progress:clamp(-story.getBoundingClientRect().top/max*2,0,2)};}
function update(){
  raf=0;
  const {progress}=metrics();
  const selected=Math.round(progress);
  slides.forEach((slide,i)=>{const inset=`inset(0 0 ${i<2?clamp(progress-i,0,1)*100:0}% 0)`;slide.style.clipPath=inset;slide.style.zIndex=String(3-i);slide.inert=selected!==i;slide.setAttribute('aria-hidden',String(selected!==i));});
  if(selected!==stage){stage=selected;document.body.dataset.stage=String(stage);slides.forEach((slide,i)=>slide.classList.toggle('active',stage===i));dots.forEach((dot,i)=>{dot.classList.toggle('active',stage===i);dot.setAttribute('aria-pressed',String(stage===i));});document.querySelector('#home6-scene-caption')!.textContent=labels[stage];nightButton.disabled=stage!==2;}
  const a=Math.min(1,Math.floor(progress)),blend=progress-a;
  const from=visuals[a],to=visuals[a+1];
  host.style.left=`${from.offsetLeft+(to.offsetLeft-from.offsetLeft)*blend}px`;
  host.style.top=`${from.offsetTop+(to.offsetTop-from.offsetTop)*blend}px`;
  host.style.width=`${from.clientWidth+(to.clientWidth-from.clientWidth)*blend}px`;
  host.style.height=`${from.clientHeight+(to.clientHeight-from.clientHeight)*blend}px`;
  scene?.setProgress(progress);
}
function queue(){if(!raf)raf=requestAnimationFrame(update);}
function setPause(){document.body.classList.toggle('motion-paused',paused);document.documentElement.style.scrollBehavior=paused?'auto':'';pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.querySelector('span:last-child')!.textContent=paused?'ادامه حرکت':'توقف حرکت';scene?.setPaused(paused);}
function fallback(){scene?.dispose();scene=null;document.body.classList.remove('scene-ready');host.hidden=true;toolbar.hidden=true;status.hidden=false;status.textContent='نمایش سه بعدی در این مرورگر در دسترس نیست؛ نسخه اصلی نمایش داده می شود.';}

document.querySelector('#loader')!.classList.add('done');
window.addEventListener('scroll',queue,{passive:true,signal});
window.addEventListener('resize',queue,{passive:true,signal});
window.visualViewport?.addEventListener('resize',queue,{passive:true,signal});
const resize=new ResizeObserver(()=>{queue();scene?.resize();});resize.observe(frame);resize.observe(host);
document.addEventListener('click',event=>{const target=(event.target as Element).closest<HTMLElement>('[data-jump]');if(!target)return;event.preventDefault();const index=clamp(Number(target.dataset.jump),0,2);const {max}=metrics();scrollTo({top:story.offsetTop+max/2*index,behavior:paused?'auto':'smooth'});},{signal});
pauseButton.addEventListener('click',()=>{paused=!paused;setPause();},{signal});
nightButton.addEventListener('click',()=>{night=!night;nightButton.setAttribute('aria-pressed',String(night));nightButton.querySelector('span:last-child')!.textContent=night?'نور روز':'نور شب';scene?.setNight(night);},{signal});
expandButton.addEventListener('click',()=>{expanded=!expanded;expandButton.setAttribute('aria-pressed',String(expanded));expandButton.querySelector('span:last-child')!.textContent=expanded?'جمع شدن اجزا':'باز کردن اجزا';scene?.setExpanded(expanded);},{signal});
function reset(){night=false;expanded=false;nightButton.setAttribute('aria-pressed','false');nightButton.querySelector('span:last-child')!.textContent='نور شب';expandButton.setAttribute('aria-pressed','false');expandButton.querySelector('span:last-child')!.textContent='باز کردن اجزا';scene?.reset();}
document.querySelector('#home6-reset')!.addEventListener('click',reset,{signal});
media.addEventListener('change',event=>{paused=event.matches;setPause();},{signal});
canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;dragPointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;canvas.setPointerCapture(event.pointerId);},{signal});
canvas.addEventListener('pointermove',event=>{if(dragPointer===event.pointerId){scene?.rotate((event.clientX-lastX)*.003,(event.clientY-lastY)*.002);lastX=event.clientX;lastY=event.clientY;}else if(event.pointerType==='mouse'){const rect=canvas.getBoundingClientRect();scene?.pointer((event.clientX-rect.left)/rect.width*2-1,(event.clientY-rect.top)/rect.height*2-1);}},{signal});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragPointer=null;},{signal});
canvas.addEventListener('keydown',event=>{const keys:Record<string,[number,number]>={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.07],ArrowDown:[0,.07]};if(keys[event.key]){event.preventDefault();scene?.rotate(...keys[event.key]);}else if(event.key.toLowerCase()==='r')reset();},{signal});
window.addEventListener('pagehide',event=>{if(event.persisted){scene?.setPaused(true);return;}disposed=true;abort.abort();resize.disconnect();if(raf)cancelAnimationFrame(raf);scene?.dispose();},{signal});
window.addEventListener('pageshow',event=>{if(event.persisted){scene?.setPaused(paused);queue();}},{signal});
setPause();update();
async function start(){try{const {HomeScene}=await import('./home6-scene');if(disposed)return;host.hidden=false;update();scene=new HomeScene(canvas,paused,fallback);toolbar.hidden=false;status.hidden=true;document.body.classList.add('scene-ready');scene.setProgress(metrics().progress);scene.resize();}catch(error){console.warn('Home6 3D is unavailable',error);fallback();}}
start();
