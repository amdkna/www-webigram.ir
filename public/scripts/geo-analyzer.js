(() => {
  const form = document.getElementById('geoForm');
  const input = document.getElementById('geoUrl');
  const submit = document.getElementById('geoSubmit');
  const formError = document.getElementById('geoFormError');
  const intro = document.getElementById('geoIntro');
  const loading = document.getElementById('geoLoading');
  const results = document.getElementById('geoResults');
  const progressText = document.getElementById('geoProgressText');
  const progressBar = document.getElementById('geoProgressBar');
  const rescan = document.getElementById('geoRescan');
  const copyReport = document.getElementById('copyGeoReport');
  let lastReport = null;
  let timer = null;

  const steps = [
    ['دسترسی سایت را بررسی می‌کنیم…', 15],
    ['Robots و Sitemap را بررسی می‌کنیم…', 32],
    ['ساختار صفحه و SEO فنی را می‌خوانیم…', 50],
    ['نشانه‌های Schema و Entity را بررسی می‌کنیم…', 68],
    ['قابلیت پاسخ‌دهی و استناد را ارزیابی می‌کنیم…', 84],
    ['برنامه اقدام GEO را آماده می‌کنیم…', 94],
  ];

  const esc = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fa = n => new Intl.NumberFormat('fa-IR').format(n);
  const statusMeta = { ok:{label:'خوب',icon:'✓'}, warn:{label:'نیاز به بهبود',icon:'!'}, error:{label:'مشکل',icon:'×'}, info:{label:'قابل تشخیص نیست',icon:'i'} };
  const priorityMeta = { urgent:['فوری','urgent'], high:['مهم','high'], medium:['پیشنهادی','medium'], low:['بهبود','low'] };

  function normalizeUrl(value) {
    const v = String(value || '').trim();
    if (!v) throw new Error('آدرس سایت را وارد کنید.');
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  function setView(view) {
    intro.hidden = view !== 'intro';
    loading.hidden = view !== 'loading';
    results.hidden = view !== 'results';
  }

  function startProgress() {
    let i = 0;
    progressText.textContent = steps[0][0];
    progressBar.style.width = steps[0][1] + '%';
    timer = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      progressText.textContent = steps[i][0];
      progressBar.style.width = steps[i][1] + '%';
    }, 1200);
  }

  function stopProgress(ok=true) {
    clearInterval(timer);
    timer = null;
    if (ok) {
      progressText.textContent = 'گزارش GEO آماده شد.';
      progressBar.style.width = '100%';
    }
  }

  function collectText(report) {
    return (report.checks || []).map(c => [c.title,c.summary,c.technical,c.category].filter(Boolean).join(' ')).join(' ').toLowerCase();
  }

  function has(text, terms) {
    return terms.some(t => text.includes(t));
  }

  function checkStatus(report, terms) {
    const matching = (report.checks || []).filter(c => has(([c.title,c.summary,c.technical,c.category].filter(Boolean).join(' ')).toLowerCase(), terms));
    if (!matching.length) return 'info';
    if (matching.some(c => c.status === 'error')) return 'error';
    if (matching.some(c => c.status === 'warn')) return 'warn';
    if (matching.some(c => c.status === 'ok')) return 'ok';
    return 'info';
  }

  function scoreFrom(status, good, warn, bad, unknown) {
    return status === 'ok' ? good : status === 'warn' ? warn : status === 'error' ? bad : unknown;
  }

  function buildGeo(report) {
    const text = collectText(report);
    const robots = checkStatus(report, ['robots']);
    const sitemap = checkStatus(report, ['sitemap']);
    const canonical = checkStatus(report, ['canonical']);
    const title = checkStatus(report, ['title','عنوان']);
    const description = checkStatus(report, ['description','توضیحات متا','meta description']);
    const h1 = checkStatus(report, ['h1']);
    const schema = checkStatus(report, ['schema','structured data','json-ld']);
    const ssl = report.ssl?.valid ? 'ok' : report.ssl?.available ? 'warn' : 'error';
    const reachable = report.site?.statusCode >= 200 && report.site?.statusCode < 400 ? 'ok' : 'error';

    const crawl = Math.round(
      scoreFrom(reachable, 35, 20, 0, 15) +
      scoreFrom(robots, 25, 14, 2, 12) +
      scoreFrom(sitemap, 20, 10, 2, 8) +
      scoreFrom(canonical, 20, 10, 4, 8)
    );

    const structure = Math.round(
      scoreFrom(schema, 50, 25, 5, 15) +
      scoreFrom(h1, 20, 10, 2, 8) +
      scoreFrom(title, 15, 8, 2, 6) +
      scoreFrom(description, 15, 8, 2, 6)
    );

    const clarity = Math.round(
      scoreFrom(title, 30, 17, 3, 10) +
      scoreFrom(description, 30, 16, 3, 10) +
      scoreFrom(h1, 30, 16, 3, 10) +
      (has(text,['article','content','محتوا','heading']) ? 10 : 5)
    );

    const trust = Math.round(
      scoreFrom(ssl, 45, 25, 0, 15) +
      scoreFrom(canonical, 25, 13, 3, 10) +
      (report.site?.finalUrl ? 15 : 5) +
      (report.site?.server || report.site?.httpVersion ? 15 : 7)
    );

    const answerability = Math.round(
      scoreFrom(h1, 28, 15, 3, 10) +
      scoreFrom(description, 22, 12, 3, 8) +
      scoreFrom(schema, 25, 12, 3, 8) +
      (has(text,['faq','article','heading','content','محتوا']) ? 25 : 12)
    );

    const pillars = [
      {label:'دسترسی AI و Crawlability',score:crawl},
      {label:'ساختار و Structured Data',score:structure},
      {label:'وضوح محتوا و موضوع',score:clarity},
      {label:'اعتماد فنی',score:trust},
      {label:'قابلیت پاسخ‌دهی',score:answerability},
    ];

    const score = Math.round(crawl*.25 + structure*.20 + clarity*.20 + trust*.15 + answerability*.20);
    const grade = score >= 85 ? {label:'خیلی خوب',tone:'excellent'} : score >= 70 ? {label:'خوب',tone:'good'} : score >= 50 ? {label:'نیاز به بهبود',tone:'warning'} : {label:'ضعیف',tone:'critical'};

    const checks = [
      {status:reachable,category:'کشف‌پذیری',title:'دسترسی عمومی سایت',summary: reachable === 'ok' ? 'سایت از بیرون پاسخ قابل استفاده می‌دهد.' : 'AI و موتور جستجو برای خواندن سایت ابتدا باید بتوانند به آن دسترسی داشته باشند.'},
      {status:robots,category:'دسترسی خزنده‌ها',title:'Robots.txt',summary:'قواعد Robots نباید خزنده‌های موردنظر شما را ناخواسته مسدود کنند.'},
      {status:sitemap,category:'کشف صفحات',title:'XML Sitemap',summary:'Sitemap کشف صفحات مهم و تغییرات سایت را برای خزنده‌ها ساده‌تر می‌کند.'},
      {status:canonical,category:'هویت منبع',title:'Canonical URL',summary:'Canonical به موتور کمک می‌کند نسخه اصلی محتوا را از نسخه‌های تکراری تشخیص دهد.'},
      {status:schema,category:'خوانایی ماشینی',title:'Structured Data / Schema',summary:'Schema نوع صفحه، موجودیت‌ها، نویسنده، سازمان، مقاله، دوره یا محصول را ماشین‌خوان‌تر می‌کند.'},
      {status:title,category:'وضوح محتوا',title:'Page Title',summary:'عنوان واضح یکی از ساده‌ترین سیگنال‌ها برای فهم موضوع اصلی صفحه است.'},
      {status:description,category:'وضوح محتوا',title:'Meta Description',summary:'توضیح دقیق صفحه به درک سریع موضوع و هدف محتوا کمک می‌کند.'},
      {status:h1,category:'ساختار معنایی',title:'H1 اصلی',summary:'یک H1 واضح باعث می‌شود موضوع اصلی صفحه بدون حدس زدن مشخص باشد.'},
      {status:ssl,category:'اعتماد فنی',title:'HTTPS و SSL',summary:'اتصال امن یک سیگنال پایه برای منبع قابل اعتماد و قابل دسترسی است.'},
    ];

    const actions = [];
    const add = (condition, priority, title, description) => { if (condition) actions.push({priority,title,description}); };
    add(reachable !== 'ok','urgent','اول دسترسی سایت را درست کنید','تا وقتی صفحه پاسخ سالم ندهد، بقیه بهینه‌سازی‌های GEO تقریبا بی‌اثر هستند.');
    add(robots === 'error' || robots === 'warn','urgent','Robots.txt را برای خزنده‌های موردنظر بررسی کنید','مطمئن شوید صفحات عمومی و مهم سایت ناخواسته برای خزنده‌های جستجو و AI مسدود نشده‌اند.');
    add(sitemap !== 'ok','high','Sitemap کامل و به‌روز داشته باشید','صفحات canonical و مهم را در XML Sitemap قرار دهید و آدرس آن را در robots.txt معرفی کنید.');
    add(schema !== 'ok','high','Schema مناسب صفحه اضافه کنید','برای Organization، Person، Article، Course، Event، Breadcrumb و انواع مرتبط از JSON-LD معتبر استفاده کنید.');
    add(title !== 'ok' || description !== 'ok' || h1 !== 'ok','high','موضوع صفحه را بدون ابهام بیان کنید','Title، H1 و Description باید مستقیم بگویند صفحه درباره چیست و چه سوالی را پاسخ می‌دهد.');
    add(canonical !== 'ok','medium','Canonical را مشخص کنید','برای هر صفحه اصلی یک canonical معتبر و سازگار با URL نهایی قرار دهید.');
    add(answerability < 75,'medium','محتوا را Answer-first بنویسید','تعریف یا پاسخ کوتاه را ابتدای بخش قرار دهید و بعد توضیح، مثال، داده و منبع را اضافه کنید.');
    add(structure < 75,'medium','Entityها را واضح کنید','نام سازمان، نویسنده، محصول، دوره و موضوعات اصلی را با صفحات اختصاصی، لینک داخلی و Schema به هم متصل کنید.');
    add(trust < 80,'low','سیگنال‌های اعتماد را کامل کنید','صفحات About و Author، تاریخ انتشار و بروزرسانی، منابع، HTTPS و اطلاعات تماس/سازمان را شفاف نگه دارید.');
    add(true,'low','محتوای اصیل و قابل استناد منتشر کنید','تجربه واقعی، داده، مطالعه موردی، مقایسه و مثال اختصاصی شانس بازیابی و استناد را بیشتر از متن‌های عمومی می‌کند.');

    const counts = checks.reduce((a,c) => { a[c.status]=(a[c.status]||0)+1; return a; }, {});
    const technical = [
      'WEBIGRAM GEO ANALYZER',
      '=====================',
      `Site: ${report.site?.finalUrl || report.normalizedUrl || report.inputUrl || ''}`,
      `GEO readiness score: ${score}/100 (${grade.label})`,
      '',
      ...pillars.map(p => `- ${p.label}: ${p.score}/100`),
      '',
      'Key checks:',
      ...checks.map(c => `- [${c.status.toUpperCase()}] ${c.title}`),
      '',
      'Priority actions:',
      ...actions.map((a,i) => `${i+1}. [${a.priority}] ${a.title} — ${a.description}`),
      '',
      'Note: This is a readiness analysis, not a guarantee of inclusion or citation in AI-generated answers.'
    ].join('\n');

    return {score,grade,pillars,checks,actions,counts,technical};
  }

  function render(report) {
    lastReport = {source:report,geo:buildGeo(report)};
    const geo = lastReport.geo;
    const ring = document.getElementById('geoScoreRing');
    ring.style.setProperty('--score', (geo.score * 3.6) + 'deg');
    ring.dataset.tone = geo.grade.tone;
    document.getElementById('geoScore').textContent = fa(geo.score);
    document.getElementById('geoGrade').textContent = geo.grade.label;
    document.getElementById('geoScannedUrl').textContent = report.site?.hostname || report.normalizedUrl || '';
    document.getElementById('geoHeadline').textContent = geo.score >= 70 ? 'سایتت پایه خوبی برای GEO دارد' : 'چند مانع مهم برای GEO پیدا شد';
    document.getElementById('geoSummaryText').textContent = geo.score >= 85 ? 'ساختار فعلی خوب است؛ حالا بیشترین سود از محتوای اصیل، Entityهای واضح و منابع معتبر می‌آید.' : geo.score >= 70 ? 'پایه فنی مناسب است اما چند بهبود می‌تواند خواندن و بازیابی محتوا توسط AI را آسان‌تر کند.' : geo.score >= 50 ? 'سایت قابل استفاده است اما برای فهم بهتر توسط موتورهای AI چند بخش مهم نیاز به اصلاح دارد.' : 'قبل از تولید محتوای بیشتر، بهتر است مشکلات Crawlability و ساختار پایه را برطرف کنید.';

    document.getElementById('geoSummaryStats').innerHTML =
      `<div><strong>${fa(geo.counts.ok||0)}</strong><span>سیگنال خوب</span></div>`+
      `<div><strong>${fa(geo.counts.warn||0)}</strong><span>نیاز به بهبود</span></div>`+
      `<div><strong>${fa(geo.counts.error||0)}</strong><span>مشکل مهم</span></div>`;

    document.getElementById('geoMetrics').innerHTML = geo.pillars.map(p => `<div class="doctor-metric"><span>${esc(p.label)}</span><strong>${fa(p.score)} / ۱۰۰</strong></div>`).join('');

    document.getElementById('geoChecks').innerHTML = geo.checks.map(c => {
      const m = statusMeta[c.status] || statusMeta.info;
      return `<article class="doctor-check doctor-check--${esc(c.status)}"><div class="doctor-check-icon" aria-hidden="true">${m.icon}</div><div class="doctor-check-body"><div class="doctor-check-top"><span class="doctor-check-category">${esc(c.category)}</span><span class="doctor-check-status">${esc(m.label)}</span></div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p></div></article>`;
    }).join('');

    const actions = document.getElementById('geoActions');
    actions.innerHTML = geo.actions.map((a,i) => {
      const [label,tone] = priorityMeta[a.priority] || priorityMeta.low;
      return `<article class="doctor-action"><div class="doctor-action-number">${fa(i+1)}</div><div><span class="priority priority--${tone}">${label}</span><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></div></article>`;
    }).join('');

    document.getElementById('geoTechnicalReport').textContent = geo.technical;

    const shareUrl = new URL(location.href);
    shareUrl.search = '';
    shareUrl.searchParams.set('url', report.normalizedUrl || report.inputUrl || '');
    document.getElementById('geoCopyLink').onclick = () => copyText(shareUrl.toString(), document.getElementById('geoCopyLink'), 'لینک کپی شد');
  }

  async function copyText(text, button, label) {
    const original = button.textContent;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement('textarea');
      t.value = text; t.style.position='fixed'; t.style.opacity='0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    button.textContent = label;
    setTimeout(() => button.textContent = original, 1600);
  }

  async function run(raw) {
    formError.textContent = '';
    let url;
    try { url = normalizeUrl(raw); } catch (e) { formError.textContent = e.message; return; }
    submit.disabled = true;
    setView('loading');
    startProgress();
    loading.scrollIntoView({behavior:'smooth',block:'center'});
    try {
      const response = await fetch('/api/website-doctor', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'امکان تحلیل سایت وجود نداشت.');
      stopProgress(true);
      render(data);
      setTimeout(() => { setView('results'); results.scrollIntoView({behavior:'smooth',block:'start'}); }, 200);
    } catch (e) {
      stopProgress(false);
      setView('intro');
      formError.textContent = e.message || 'تحلیل سایت ناموفق بود. دوباره تلاش کنید.';
      form.scrollIntoView({behavior:'smooth',block:'center'});
    } finally { submit.disabled = false; }
  }

  form.addEventListener('submit', e => { e.preventDefault(); run(input.value); });
  rescan.addEventListener('click', () => { setView('intro'); input.focus(); window.scrollTo({top:form.getBoundingClientRect().top + window.scrollY - 160,behavior:'smooth'}); });
  copyReport.addEventListener('click', () => { if (lastReport?.geo?.technical) copyText(lastReport.geo.technical, copyReport, 'گزارش کپی شد'); });

  const params = new URLSearchParams(location.search);
  const preset = params.get('url');
  if (preset) { input.value = preset; if (params.get('autostart') === '1') run(preset); }
})();