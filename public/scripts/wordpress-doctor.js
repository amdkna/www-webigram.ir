(() => {
  const $ = (id) => document.getElementById(id);
  const form=$('wpdForm'), url=$('wpdUrl'), owner=$('wpdOwner'), token=$('wpdToken'), deepFields=$('wpdDeepFields'), error=$('wpdFormError');
  const intro=$('wpdIntro'), loading=$('wpdLoading'), results=$('wpdResults'), progress=$('wpdProgressBar'), progressText=$('wpdProgressText');
  let last=null, lastMode='quick', lastToken='';
  const fa=(v)=>String(v ?? '—').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes=(n)=>{n=Number(n||0);if(!n)return '—';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i? n.toFixed(n>=10?0:1):Math.round(n))+' '+u[i]};
  const tone=(s)=>s>=75?'good':s>=55?'warn':'bad';
  const selectedMode=()=>form.querySelector('input[name="mode"]:checked')?.value||'quick';
  function setMode(){lastMode=selectedMode();deepFields.hidden=lastMode!=='deep';form.querySelectorAll('.wpd-mode label').forEach(x=>x.classList.toggle('active',x.querySelector('input').checked))}
  form.querySelectorAll('input[name="mode"]').forEach(x=>x.addEventListener('change',setMode)); setMode();

  const progressSteps=['WordPress و REST API را شناسایی می‌کنیم…','امنیت و فایل‌های عمومی را بررسی می‌کنیم…','Cache، Cron و Performance را بررسی می‌کنیم…','Email DNS و WooCommerce را بررسی می‌کنیم…','امتیازها و پیشنهادها را می‌سازیم…'];
  let timer;
  function startLoading(){intro.hidden=true;results.hidden=true;loading.hidden=false;let i=0;progress.style.width='12%';progressText.textContent=progressSteps[0];timer=setInterval(()=>{i=Math.min(i+1,progressSteps.length-1);progressText.textContent=progressSteps[i];progress.style.width=(20+i*17)+'%'},1500)}
  function stopLoading(){clearInterval(timer);progress.style.width='100%';loading.hidden=true}
  function stat(label,value){return '<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>'}
  function metric(label,value,note=''){return '<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</article>'}
  function badge(text,cls=''){return '<span class="wpd-badge '+cls+'">'+esc(text)+'</span>'}

  function render(data){
    last=data; results.hidden=false; $('wpdScannedUrl').textContent=data.site?.hostname||''; $('wpdHeadline').textContent=data.summary?.headline||'گزارش آماده است'; $('wpdSummaryText').textContent=data.summary?.message||'';
    $('wpdScore').textContent=fa(data.score); $('wpdGrade').textContent=data.grade?.label||'—'; $('wpdScoreRing').dataset.tone=data.grade?.tone||tone(data.score);
    $('wpdSummaryStats').innerHTML=stat('موفق',fa(data.summary?.passed||0))+stat('نیاز به توجه',fa(data.summary?.warnings||0))+stat('مشکل مهم',fa(data.summary?.errors||0))+stat('زمان اسکن',fa(data.durationMs||0)+' ms');
    $('wpdCategoryScores').innerHTML=Object.entries(data.categoryScores||{}).map(([name,score])=>'<div class="wpd-category-card" data-tone="'+tone(score)+'"><span>'+esc(name)+'</span><strong>'+fa(score)+'/۱۰۰</strong><i><b style="width:'+Math.max(0,Math.min(100,score))+'%"></b></i></div>').join('');
    const w=data.wordpress||{}, s=data.site||{};
    $('wpdMetrics').innerHTML=[
      metric('WordPress',w.version||'تشخیص داده شد',w.latestVersion?'Latest: '+w.latestVersion:''),
      metric('REST API',w.restApi?'سالم':'مشکل دارد'),
      metric('XML-RPC',w.xmlrpc?'فعال':'بسته/غیرفعال'),
      metric('WP-Cron',w.wpCronReachable?'قابل دسترس':'نیاز به بررسی'),
      metric('Plugins',fa(w.plugins?.length||0),data.mode==='deep'?'لیست داخلی':'قابل تشخیص عمومی'),
      metric('Themes',fa(w.themes?.length||0),data.mode==='deep'?'لیست داخلی':'قابل تشخیص عمومی'),
      metric('TTFB',s.ttfbMs!=null?fa(s.ttfbMs)+' ms':'—'),
      metric('HTML size',fmtBytes(s.pageSizeBytes)),
      metric('Compression',s.contentEncoding||'تشخیص داده نشد')
    ].join('');

    const cats=['همه',...new Set((data.checks||[]).map(c=>c.category))];
    $('wpdFilters').innerHTML=cats.map((c,i)=>'<button type="button" data-cat="'+esc(c)+'" class="'+(i===0?'active':'')+'">'+esc(c)+'</button>').join('');
    const drawChecks=(cat='همه')=>{
      const list=(data.checks||[]).filter(c=>cat==='همه'||c.category===cat);
      $('wpdChecks').innerHTML=list.map(c=>'<article class="doctor-check" data-status="'+esc(c.status)+'"><div class="doctor-check-icon"></div><div class="doctor-check-copy"><div><span>'+esc(c.category)+'</span><h3>'+esc(c.title)+'</h3></div><p>'+esc(c.summary)+'</p>'+(c.technical?'<code dir="ltr">'+esc(c.technical)+'</code>':'')+'</div></article>').join('')||'<div class="wpd-empty">موردی در این بخش نیست.</div>';
    };
    drawChecks(); $('wpdFilters').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('wpdFilters').querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');drawChecks(b.dataset.cat)});

    const component=(p)=>'<div class="wpd-component-item"><div class="wpd-component-name"><b>'+esc(p.name||p.slug)+'</b><span dir="ltr">'+esc(p.slug)+(p.version?' · '+esc(p.version):'')+'</span></div><div class="wpd-badges">'+(p.active?badge('Active','active'):'')+(p.updateAvailable?badge('Update '+(p.newVersion||''),'update'):'')+'</div></div>';
    $('wpdPlugins').innerHTML=(w.plugins||[]).map(component).join('')||'<div class="wpd-empty">Plugin قابل تشخیص پیدا نشد.</div>';
    $('wpdThemes').innerHTML=(w.themes||[]).map(component).join('')||'<div class="wpd-empty">Theme قابل تشخیص پیدا نشد.</div>';

    const v=data.vulnerabilities||{}; $('wpdVulnNote').textContent=v.enabled?'بر اساس نسخه‌های قابل تشخیص و WPScan API.':'Vulnerability lookup روی سرور فعال نیست؛ سایر تست‌ها اجرا شده‌اند.';
    $('wpdVulnerabilities').innerHTML=(v.items||[]).map(x=>'<div class="wpd-vuln"><h3>'+esc(x.title)+'</h3><p>'+esc(x.type)+' · '+esc(x.name)+' '+esc(x.version||'')+(x.fixedIn?' · Fix: '+esc(x.fixedIn):'')+'</p></div>').join('')||(v.enabled?'<div class="wpd-empty">برای نسخه‌های قابل تشخیص Match آسیب‌پذیری پیدا نشد.</div>':'<div class="wpd-empty">برای فعال شدن این بخش باید WPSCAN_API_TOKEN روی سرور تنظیم شود.</div>');

    $('wpdActions').innerHTML=(data.actions||[]).map((a,i)=>'<article><div class="doctor-action-index">'+fa(i+1)+'</div><div><span>'+esc(a.priority||'')+'</span><h3>'+esc(a.title)+'</h3><p>'+esc(a.description)+'</p></div></article>').join('')||'<div class="wpd-empty">اقدام فوری پیشنهاد نشده است.</div>';

    const d=data.deep;
    if(d){
      $('wpdDeepStatus').textContent='Connector با موفقیت پاسخ داد؛ داده‌های زیر از داخل WordPress آمده‌اند.';
      const env=d.environment||{}, up=d.updates||{}, cr=d.cron||{}, ca=d.cache||{}, db=d.database||{}, woo=d.woocommerce||{};
      $('wpdDeepContent').innerHTML=[
        ['PHP',env.phpVersion],['Database',env.dbVersion],['Memory Limit',env.phpMemoryLimit],['Upload Limit',env.uploadMaxFilesize],['Max Execution',env.maxExecutionTime+'s'],
        ['Updates',up.total],['Cron Events',cr.events],['Overdue Cron',cr.overdue],['Loopback',cr.loopback===true?'OK':cr.loopback===false?'Failed':'Unknown'],
        ['Object Cache',ca.objectCache?'Active':'Inactive'],['WP_CACHE',ca.wpCache?'On':'Off'],['Autoload',fmtBytes(db.autoloadBytes)],['Disk Free',fmtBytes(env.diskFreeBytes)],
        ['WP_DEBUG',env.wpDebug?'On':'Off'],['Debug Display',env.wpDebugDisplay?'On':'Off'],['Woo Action Queue',woo.actionSchedulerPending??'—']
      ].map(x=>'<div class="wpd-deep-box"><span>'+esc(x[0])+'</span><strong dir="ltr">'+esc(x[1]??'—')+'</strong></div>').join('');
      $('wpdMailTest').hidden=false;
    }else{
      $('wpdDeepStatus').textContent='این اسکن Quick بوده است. برای Updateهای واقعی، PHP، Cron داخلی، Object Cache، Autoload و Mail Test حالت Deep را اجرا کن.';
      $('wpdDeepContent').innerHTML='<div class="wpd-empty">Deep Scan اجرا نشده است.</div>'; $('wpdMailTest').hidden=true;
    }
    $('wpdTechnicalReport').textContent=data.technicalReport||'';
    results.scrollIntoView({behavior:'smooth',block:'start'});
  }

  form.addEventListener('submit',async(e)=>{
    e.preventDefault(); error.textContent=''; const mode=selectedMode(), raw=url.value.trim();
    if(!raw){error.textContent='آدرس سایت را وارد کن.';return}
    if(!owner.checked){error.textContent='تأیید مالکیت یا مجوز بررسی لازم است.';return}
    if(mode==='deep'&&!token.value.trim()){error.textContent='برای Deep Scan توکن Connector را وارد کن.';return}
    lastMode=mode; lastToken=token.value.trim(); startLoading();
    try{
      const r=await fetch('/api/wordpress-doctor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw,mode,connectorToken:lastToken})});
      const data=await r.json(); if(!r.ok||!data.ok)throw new Error(data.error||'اسکن ناموفق بود.'); stopLoading(); render(data);
      const q=new URL(location.href);q.searchParams.set('url',raw);q.searchParams.delete('token');history.replaceState(null,'',q);
    }catch(err){stopLoading();intro.hidden=false;error.textContent=err.message||'اسکن ناموفق بود.'}
  });

  $('wpdRescan').onclick=()=>{results.hidden=true;intro.hidden=false;window.scrollTo({top:0,behavior:'smooth'})};
  $('wpdCopyLink').onclick=async()=>{const u=new URL(location.href);u.searchParams.set('url',url.value.trim());u.searchParams.delete('token');await navigator.clipboard.writeText(u.toString());$('wpdCopyLink').textContent='کپی شد';setTimeout(()=>$('wpdCopyLink').textContent='کپی لینک',1400)};
  $('wpdCopyReport').onclick=async()=>{await navigator.clipboard.writeText(last?.technicalReport||'');$('wpdCopyReport').textContent='کپی شد';setTimeout(()=>$('wpdCopyReport').textContent='کپی گزارش فنی',1400)};
  $('wpdMailForm').addEventListener('submit',async(e)=>{e.preventDefault();const out=$('wpdMailResult'),email=$('wpdMailEmail').value.trim();out.className='wpd-mail-result';out.textContent='در حال ارسال…';try{const r=await fetch('/api/wordpress-doctor/mail-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.value.trim(),connectorToken:lastToken,email})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Mail Test ناموفق بود.');out.className='wpd-mail-result '+(d.accepted?'good':'bad');out.textContent=d.message|| (d.accepted?'WordPress پیام را پذیرفت.':'wp_mail() ناموفق بود.')}catch(err){out.className='wpd-mail-result bad';out.textContent=err.message}});
  const preset=new URLSearchParams(location.search).get('url');if(preset)url.value=preset;
})();
