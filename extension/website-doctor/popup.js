const loading=document.getElementById('loading'),result=document.getElementById('result'),errorBox=document.getElementById('error'),unsupported=document.getElementById('unsupported');
const loadingHost=document.getElementById('loadingHost'),errorText=document.getElementById('errorText');let activeUrl='';
function show(name){for(const [key,el] of Object.entries({loading,result,error:errorBox,unsupported}))el.hidden=key!==name;}
function fa(v){return new Intl.NumberFormat('fa-IR').format(v??0)}
function render(report){
  const score=Math.max(0,Math.min(100,Number(report.score||0))),ring=document.getElementById('scoreRing');
  ring.style.setProperty('--score',`${score*3.6}deg`);ring.dataset.tone=report.grade?.tone||'warning';
  document.getElementById('scoreValue').textContent=fa(score);document.getElementById('gradeText').textContent=report.grade?.label||'—';
  document.getElementById('summaryText').textContent=report.summary?.headline||'';document.getElementById('siteHost').textContent=report.site?.hostname||'';
  document.getElementById('passedCount').textContent=fa(report.summary?.passed||0);document.getElementById('warningCount').textContent=fa(report.summary?.warnings||0);document.getElementById('errorCount').textContent=fa(report.summary?.errors||0);
  const important=(report.checks||[]).filter(c=>c.status==='error'||c.status==='warn').slice(0,4);document.getElementById('issuesHint').textContent=important.length?`${fa(important.length)} مورد اول`:'همه‌چیز خوب است';
  const list=document.getElementById('issuesList');list.textContent='';
  if(!important.length){const item=document.createElement('div');item.className='issue ok';item.innerHTML='<div class="issue-icon">✓</div><div><strong>مورد مهمی پیدا نشد</strong><span>بررسی‌های اصلی وضعیت خوبی دارند.</span></div>';list.appendChild(item);}
  else important.forEach(check=>{const item=document.createElement('div');item.className=`issue ${check.status}`;const icon=document.createElement('div');icon.className='issue-icon';icon.textContent=check.status==='error'?'×':'!';const copy=document.createElement('div'),title=document.createElement('strong'),summary=document.createElement('span');title.textContent=check.title;summary.textContent=check.summary;copy.append(title,summary);item.append(icon,copy);list.appendChild(item);});
  document.getElementById('fullReport').href=`https://webigram.ir/tools/website-doctor/?url=${encodeURIComponent(report.normalizedUrl||activeUrl)}&autostart=1`;show('result');
}
async function scan(){
  show('loading');
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});activeUrl=tab?.url||'';
    if(!/^https?:\/\//i.test(activeUrl)){show('unsupported');return;}
    const url=new URL(activeUrl);loadingHost.textContent=url.hostname;
    const response=await fetch('https://webigram.ir/api/website-doctor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:activeUrl})});
    const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'امکان بررسی این سایت وجود نداشت.');render(data);
  }catch(error){errorText.textContent=error.message||'خطایی در بررسی سایت رخ داد.';show('error');}
}
document.getElementById('retryButton').addEventListener('click',scan);document.getElementById('rescanButton').addEventListener('click',scan);scan();
