(() => {
  const form = document.getElementById('doctorForm');
  const input = document.getElementById('doctorUrl');
  const submit = document.getElementById('doctorSubmit');
  const formError = document.getElementById('doctorFormError');
  const intro = document.getElementById('doctorIntro');
  const loading = document.getElementById('doctorLoading');
  const results = document.getElementById('doctorResults');
  const progressText = document.getElementById('doctorProgressText');
  const progressBar = document.getElementById('doctorProgressBar');
  const copyReport = document.getElementById('copyTechnicalReport');
  const rescan = document.getElementById('doctorRescan');
  let lastReport = null;
  let progressTimer = null;

  const steps = [
    ['دامنه و DNS را بررسی می‌کنیم…', 16],
    ['ارتباط با سرور را تست می‌کنیم…', 32],
    ['SSL و HTTPS را بررسی می‌کنیم…', 48],
    ['سرعت پاسخ سایت را اندازه می‌گیریم…', 64],
    ['موارد مهم SEO را بررسی می‌کنیم…', 78],
    ['امنیت و تنظیمات فنی را جمع‌بندی می‌کنیم…', 90],
  ];
  const escapeHtml = (value = '') => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const formatNumber = (value) => value === null || value === undefined ? '—' : new Intl.NumberFormat('fa-IR').format(value);
  const formatBytes = (bytes) => !Number.isFinite(bytes) ? '—' : bytes < 1024 ? `${formatNumber(bytes)} B` : bytes < 1048576 ? `${formatNumber(Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const statusMeta = { ok:{label:'سالم',icon:'✓'}, warn:{label:'نیاز به توجه',icon:'!'}, error:{label:'مشکل',icon:'×'}, info:{label:'اطلاعات',icon:'i'} };
  const priorityMeta = { urgent:['فوری','urgent'], high:['مهم','high'], medium:['پیشنهادی','medium'], low:['بهبود','low'] };

  function setView(view) {
    intro.hidden = view !== 'intro';
    loading.hidden = view !== 'loading';
    results.hidden = view !== 'results';
  }
  function startProgress() {
    let index = 0;
    progressText.textContent = steps[0][0]; progressBar.style.width = `${steps[0][1]}%`;
    progressTimer = setInterval(() => { index = Math.min(index + 1, steps.length - 1); progressText.textContent = steps[index][0]; progressBar.style.width = `${steps[index][1]}%`; }, 1300);
  }
  function stopProgress(success = true) {
    clearInterval(progressTimer); progressTimer = null;
    if (success) { progressText.textContent = 'گزارش آماده شد.'; progressBar.style.width = '100%'; }
  }
  function normalizeUserUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) throw new Error('آدرس سایت را وارد کنید.');
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  function render(report) {
    lastReport = report;
    const score = Math.max(0, Math.min(100, Number(report.score || 0)));
    const scoreRing = document.getElementById('doctorScoreRing');
    scoreRing.style.setProperty('--score', `${score * 3.6}deg`);
    scoreRing.dataset.tone = report.grade?.tone || 'warning';
    document.getElementById('doctorScore').textContent = formatNumber(score);
    document.getElementById('doctorGrade').textContent = report.grade?.label || '—';
    document.getElementById('doctorHeadline').textContent = report.summary?.headline || 'گزارش سایت آماده است';
    document.getElementById('doctorSummaryText').textContent = report.summary?.message || '';
    document.getElementById('doctorScannedUrl').textContent = report.site?.hostname || report.normalizedUrl || '';
    document.getElementById('doctorSummaryStats').innerHTML = `<div><strong>${formatNumber(report.summary?.passed || 0)}</strong><span>مورد سالم</span></div><div><strong>${formatNumber(report.summary?.warnings || 0)}</strong><span>نیاز به توجه</span></div><div><strong>${formatNumber(report.summary?.errors || 0)}</strong><span>مشکل مهم</span></div>`;

    const metrics = [
      ['وضعیت سایت', report.site?.statusCode ? `HTTP ${report.site.statusCode}` : 'بدون پاسخ'],
      ['پاسخ سرور', report.site?.ttfbMs != null ? `${formatNumber(report.site.ttfbMs)} ms` : '—'],
      ['SSL', report.ssl?.available ? (report.ssl.valid ? 'معتبر' : 'نیاز به بررسی') : 'در دسترس نیست'],
      ['انقضای SSL', report.ssl?.daysRemaining != null ? `${formatNumber(report.ssl.daysRemaining)} روز` : '—'],
      ['تغییر مسیر', `${formatNumber(report.site?.redirects?.length || 0)} مورد`],
      ['حجم پاسخ', formatBytes(report.site?.pageSizeBytes)],
    ];
    document.getElementById('doctorMetrics').innerHTML = metrics.map(([label,value]) => `<div class="doctor-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    document.getElementById('doctorChecks').innerHTML = (report.checks || []).map(check => {
      const meta = statusMeta[check.status] || statusMeta.info;
      return `<article class="doctor-check doctor-check--${escapeHtml(check.status)}"><div class="doctor-check-icon" aria-hidden="true">${meta.icon}</div><div class="doctor-check-body"><div class="doctor-check-top"><span class="doctor-check-category">${escapeHtml(check.category)}</span><span class="doctor-check-status">${escapeHtml(meta.label)}</span></div><h3>${escapeHtml(check.title)}</h3><p>${escapeHtml(check.summary)}</p>${check.technical ? `<details><summary>جزئیات فنی</summary><code>${escapeHtml(check.technical)}</code></details>` : ''}</div></article>`;
    }).join('');

    const actions = document.getElementById('doctorActions');
    if (!report.actions?.length) actions.innerHTML = '<div class="doctor-empty">اقدام فوری خاصی پیدا نشد. فعلا سایتت حالش خوبه 👌</div>';
    else actions.innerHTML = report.actions.map((action,index) => { const [label,tone] = priorityMeta[action.priority] || priorityMeta.low; return `<article class="doctor-action"><div class="doctor-action-number">${formatNumber(index + 1)}</div><div><div class="doctor-action-meta"><span class="priority priority--${tone}">${label}</span></div><h3>${escapeHtml(action.title)}</h3><p>${escapeHtml(action.description)}</p></div></article>`; }).join('');

    document.getElementById('doctorTechnicalReport').textContent = report.technicalReport || '';
    document.getElementById('doctorFinalUrl').textContent = report.site?.finalUrl || '—';
    document.getElementById('doctorIpList').textContent = report.site?.ipAddresses?.join('، ') || '—';
    document.getElementById('doctorServer').textContent = report.site?.server || 'نامشخص';
    document.getElementById('doctorHttpVersion').textContent = report.site?.httpVersion ? `HTTP/${report.site.httpVersion}` : '—';
    document.getElementById('doctorScanDuration').textContent = report.durationMs != null ? `${formatNumber(report.durationMs)} ms` : '—';
    const shareUrl = new URL(location.href); shareUrl.search = ''; shareUrl.searchParams.set('url', report.normalizedUrl || report.inputUrl || '');
    document.getElementById('doctorCopyLink').onclick = () => copyText(shareUrl.toString(), document.getElementById('doctorCopyLink'), 'لینک کپی شد');
  }
  async function copyText(text, button, successLabel) {
    const original = button.textContent;
    try { await navigator.clipboard.writeText(text); }
    catch { const area = document.createElement('textarea'); area.value = text; area.style.position='fixed'; area.style.opacity='0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); }
    button.textContent = successLabel; setTimeout(() => { button.textContent = original; }, 1600);
  }
  async function runScan(rawUrl) {
    formError.textContent = '';
    let url; try { url = normalizeUserUrl(rawUrl); } catch (error) { formError.textContent = error.message; return; }
    submit.disabled = true; setView('loading'); startProgress(); loading.scrollIntoView({behavior:'smooth',block:'center'});
    try {
      const response = await fetch('/api/website-doctor', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'امکان بررسی سایت وجود نداشت.');
      stopProgress(true); render(data); setTimeout(() => { setView('results'); results.scrollIntoView({behavior:'smooth',block:'start'}); }, 250);
    } catch (error) { stopProgress(false); setView('intro'); formError.textContent = error.message || 'بررسی سایت ناموفق بود. دوباره تلاش کنید.'; form.scrollIntoView({behavior:'smooth',block:'center'}); }
    finally { submit.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); runScan(input.value); });
  rescan.addEventListener('click', () => { setView('intro'); input.focus(); window.scrollTo({top:form.getBoundingClientRect().top + window.scrollY - 160,behavior:'smooth'}); });
  copyReport.addEventListener('click', () => { if (lastReport?.technicalReport) copyText(lastReport.technicalReport, copyReport, 'گزارش کپی شد'); });
  const params = new URLSearchParams(location.search); const preset = params.get('url');
  if (preset) { input.value = preset; if (params.get('autostart') === '1') runScan(preset); }
})();
