(() => {
  const form = document.getElementById('brandForm');
  const input = document.getElementById('brandNames');
  const submit = document.getElementById('brandSubmit');
  const count = document.getElementById('brandCount');
  const errorBox = document.getElementById('brandFormError');
  const intro = document.getElementById('brandIntro');
  const loading = document.getElementById('brandLoading');
  const results = document.getElementById('brandResults');
  const tableBody = document.getElementById('brandTableBody');
  const mobileResults = document.getElementById('brandMobileResults');
  const summary = document.getElementById('brandSummary');
  const summaryCards = document.getElementById('brandSummaryCards');
  const resultNote = document.getElementById('brandResultNote');
  const reset = document.getElementById('brandReset');
  const copyAvailable = document.getElementById('brandCopyAvailable');
  const serviceOrder = ['ir', 'com', 'net', 'instagram', 'linkedin', 'youtube'];
  const statusMeta = {
    available: { label: 'آزاد', icon: '✓' },
    taken: { label: 'گرفته', icon: '×' },
    unknown: { label: 'نامشخص', icon: '?' },
    invalid: { label: 'نامعتبر', icon: '!' },
  };
  let lastReport = null;

  const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const formatNumber = value => new Intl.NumberFormat('fa-IR').format(value);

  function parsedNames() {
    return [...new Set(input.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
  }

  function updateCount() {
    const names = parsedNames();
    count.textContent = `${formatNumber(names.length)} نام`;
    count.classList.toggle('over', names.length > 20);
  }

  function setView(view) {
    intro.hidden = view !== 'intro';
    loading.hidden = view !== 'loading';
    results.hidden = view !== 'results';
  }

  function statusCell(check) {
    const meta = statusMeta[check?.status] || statusMeta.unknown;
    const title = escapeHtml(check?.detail || '');
    const value = escapeHtml(check?.value || '');
    const inner = `<span class="brand-status brand-status--${escapeHtml(check?.status || 'unknown')}" title="${title}"><b>${meta.icon}</b><span>${meta.label}</span></span><small dir="ltr">${value}</small>`;
    if (check?.url) return `<a class="brand-cell-link" href="${escapeHtml(check.url)}" target="_blank" rel="noreferrer noopener">${inner}</a>`;
    return `<div class="brand-cell-link no-link">${inner}</div>`;
  }

  function render(report) {
    lastReport = report;
    const rows = report.results || [];
    const allChecks = rows.flatMap(row => serviceOrder.map(id => row.checks?.[id]).filter(Boolean));
    const totals = {
      available: allChecks.filter(item => item.status === 'available').length,
      taken: allChecks.filter(item => item.status === 'taken').length,
      unknown: allChecks.filter(item => item.status === 'unknown').length,
      invalid: allChecks.filter(item => item.status === 'invalid').length,
    };
    summary.textContent = `${formatNumber(rows.length)} نام و ${formatNumber(allChecks.length)} وضعیت بررسی شد.`;
    summaryCards.innerHTML = `
      <div><strong>${formatNumber(totals.available)}</strong><span>آزاد</span></div>
      <div><strong>${formatNumber(totals.taken)}</strong><span>گرفته شده</span></div>
      <div><strong>${formatNumber(totals.unknown)}</strong><span>نامشخص</span></div>
      <div><strong>${formatNumber(totals.invalid)}</strong><span>نامعتبر</span></div>`;

    tableBody.innerHTML = rows.map(row => `<tr><th scope="row"><strong dir="ltr">${escapeHtml(row.name || row.input)}</strong>${row.input !== row.name ? `<small>ورودی: ${escapeHtml(row.input)}</small>` : ''}</th>${serviceOrder.map(id => `<td>${statusCell(row.checks?.[id])}</td>`).join('')}</tr>`).join('');

    mobileResults.innerHTML = rows.map(row => `<article class="brand-mobile-card"><header><strong dir="ltr">${escapeHtml(row.name || row.input)}</strong></header><div>${serviceOrder.map(id => { const check = row.checks?.[id] || {}; return `<section><span>${escapeHtml(check.label || id)}</span>${statusCell(check)}</section>`; }).join('')}</div></article>`).join('');
    resultNote.textContent = report.note || '';
  }

  async function copyText(text, button, successLabel) {
    if (!text) return;
    const original = button.textContent;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    button.textContent = successLabel;
    setTimeout(() => { button.textContent = original; }, 1600);
  }

  async function runCheck() {
    errorBox.textContent = '';
    const names = parsedNames();
    if (!names.length) { errorBox.textContent = 'حداقل یک نام وارد کن.'; input.focus(); return; }
    if (names.length > 20) { errorBox.textContent = 'در هر بار حداکثر ۲۰ نام قابل بررسی است.'; input.focus(); return; }
    submit.disabled = true;
    setView('loading');
    loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      const response = await fetch('/api/brand-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'بررسی نام‌ها ناموفق بود.');
      render(data);
      setView('results');
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setView('intro');
      errorBox.textContent = error.message || 'بررسی نام‌ها ناموفق بود. دوباره تلاش کن.';
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submit.disabled = false;
    }
  }

  input.addEventListener('input', updateCount);
  form.addEventListener('submit', event => { event.preventDefault(); runCheck(); });
  reset.addEventListener('click', () => { setView('intro'); input.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  copyAvailable.addEventListener('click', () => {
    if (!lastReport) return;
    const lines = [];
    for (const row of lastReport.results || []) {
      for (const id of serviceOrder) {
        const item = row.checks?.[id];
        if (item?.status === 'available') lines.push(`${row.name}\t${item.label}\t${item.value}`);
      }
    }
    copyText(lines.join('\n'), copyAvailable, lines.length ? 'کپی شد' : 'مورد آزادی نیست');
  });

  const params = new URLSearchParams(location.search);
  const preset = params.get('names');
  if (preset) input.value = preset.split(',').join('\n');
  updateCount();
})();
