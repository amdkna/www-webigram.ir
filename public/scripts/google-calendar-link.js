(() => {
  const form = document.getElementById('calendarLinkForm');
  if (!form) return;

  const reminderRows = document.getElementById('reminderRows');
  const addReminderButton = document.getElementById('addReminder');
  const result = document.getElementById('calendarResult');
  const output = document.getElementById('calendarLinkOutput');
  const openLink = document.getElementById('openCalendarLink');
  const copyButton = document.getElementById('copyCalendarLink');
  const resetButton = document.getElementById('resetCalendarForm');
  const errorBox = document.getElementById('calendarFormError');
  const copyMessage = document.getElementById('copyMessage');

  const MAX_REMINDERS = 5;

  function makeReminderRow({ value = 75, unit = 'minute', method = 'popup' } = {}) {
    const row = document.createElement('div');
    row.className = 'reminder-row';
    row.setAttribute('role', 'row');
    row.innerHTML = `
      <input class="reminder-value" type="number" min="1" max="40320" step="1" inputmode="numeric" value="${value}" aria-label="مقدار زمان یادآوری" />
      <select class="reminder-unit" aria-label="واحد زمان یادآوری">
        <option value="minute" ${unit === 'minute' ? 'selected' : ''}>دقیقه قبل</option>
        <option value="hour" ${unit === 'hour' ? 'selected' : ''}>ساعت قبل</option>
        <option value="day" ${unit === 'day' ? 'selected' : ''}>روز قبل</option>
      </select>
      <select class="reminder-method" aria-label="روش یادآوری">
        <option value="popup" ${method === 'popup' ? 'selected' : ''}>اعلان (Popup)</option>
        <option value="email" ${method === 'email' ? 'selected' : ''}>ایمیل</option>
      </select>
      <button class="reminder-remove" type="button" aria-label="حذف یادآوری">×</button>
    `;
    row.querySelector('.reminder-remove').addEventListener('click', () => {
      row.remove();
      refreshReminderState();
    });
    reminderRows.appendChild(row);
    refreshReminderState();
  }

  function refreshReminderState() {
    const count = reminderRows.querySelectorAll('.reminder-row').length;
    addReminderButton.disabled = count >= MAX_REMINDERS;
    const empty = reminderRows.querySelector('.reminder-empty');
    if (count === 0 && !empty) {
      const note = document.createElement('div');
      note.className = 'reminder-empty';
      note.textContent = 'فعلا یادآوری تعریف نشده است.';
      reminderRows.appendChild(note);
    } else if (count > 0 && empty) {
      empty.remove();
    }
  }

  function addReminder() {
    const empty = reminderRows.querySelector('.reminder-empty');
    if (empty) empty.remove();
    if (reminderRows.querySelectorAll('.reminder-row').length >= MAX_REMINDERS) return;
    makeReminderRow();
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toCalendarStamp(dateValue, timeValue) {
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    return {
      year, month, day, hour, minute,
      value: `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`
    };
  }

  function addMinutesToStamp(start, minutesToAdd) {
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute));
    d.setUTCMinutes(d.getUTCMinutes() + minutesToAdd);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
  }

  function getReminders() {
    const rows = [...reminderRows.querySelectorAll('.reminder-row')];
    return rows.map((row) => {
      const value = Number(row.querySelector('.reminder-value').value);
      const unit = row.querySelector('.reminder-unit').value;
      const method = row.querySelector('.reminder-method').value;
      const multiplier = unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1;
      return { value, unit, method, minutes: value * multiplier };
    });
  }

  function validate(title, dateValue, timeValue, duration, reminders) {
    if (!title) return 'اسم ایونت را وارد کن.';
    if (!dateValue) return 'تاریخ ایونت را انتخاب کن.';
    if (!timeValue) return 'ساعت ایونت را به وقت ایران وارد کن.';
    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) return 'مدت ایونت باید بین ۱ تا ۱۴۴۰ دقیقه باشد.';
    for (const reminder of reminders) {
      if (!Number.isFinite(reminder.value) || reminder.value < 1) return 'زمان همه یادآوری‌ها باید یک عدد معتبر و بزرگ‌تر از صفر باشد.';
      if (reminder.minutes > 40320) return 'هر یادآوری حداکثر می‌تواند ۴ هفته قبل از ایونت باشد.';
    }
    return '';
  }

  function reminderText(reminders) {
    if (!reminders.length) return '';
    const unitLabel = { minute: 'دقیقه', hour: 'ساعت', day: 'روز' };
    const methodLabel = { popup: 'اعلان', email: 'ایمیل' };
    const lines = reminders.map((r) => `• ${r.value} ${unitLabel[r.unit]} قبل — ${methodLabel[r.method]}`);
    return [
      'یادآوری‌های پیشنهادی:',
      ...lines,
      '',
      'نکته: لینک عمومی Google Calendar یادآوری سفارشی را به صورت خودکار اعمال نمی‌کند؛ این موارد برای تنظیم دستی گیرنده در توضیحات قرار گرفته‌اند.'
    ].join('\n');
  }

  function buildLink() {
    const title = document.getElementById('eventTitle').value.trim();
    const dateValue = document.getElementById('eventDate').value;
    const timeValue = document.getElementById('eventTime').value;
    const duration = Number(document.getElementById('eventDuration').value || 60);
    const details = document.getElementById('eventDetails').value.trim();
    const reminders = getReminders();

    const validationError = validate(title, dateValue, timeValue, duration, reminders);
    if (validationError) {
      errorBox.textContent = validationError;
      return null;
    }

    errorBox.textContent = '';
    const start = toCalendarStamp(dateValue, timeValue);
    const end = addMinutesToStamp(start, duration);
    const reminderBlock = reminderText(reminders);
    const finalDetails = [details, reminderBlock].filter(Boolean).join('\n\n');

    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', title);
    params.set('dates', `${start.value}/${end}`);
    if (finalDetails) params.set('details', finalDetails);
    params.set('ctz', 'Asia/Tehran');

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  async function copyLink() {
    const value = output.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      output.focus();
      output.select();
      document.execCommand('copy');
      window.getSelection()?.removeAllRanges();
    }
    copyMessage.textContent = 'لینک کپی شد ✓';
    copyButton.textContent = 'کپی شد';
    window.setTimeout(() => {
      copyButton.textContent = 'کپی لینک';
      copyMessage.textContent = '';
    }, 1800);
  }

  addReminderButton.addEventListener('click', addReminder);
  copyButton.addEventListener('click', copyLink);

  resetButton.addEventListener('click', () => {
    form.reset();
    reminderRows.innerHTML = '';
    makeReminderRow();
    result.hidden = true;
    output.value = '';
    openLink.href = '#';
    errorBox.textContent = '';
    copyMessage.textContent = '';
    document.getElementById('eventTitle').focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const link = buildLink();
    if (!link) return;
    output.value = link;
    openLink.href = link;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  makeReminderRow();
})();
