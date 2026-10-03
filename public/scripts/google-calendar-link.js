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

  const eventDate = document.getElementById('eventDate');
  const gregorianDatePicker = document.getElementById('gregorianDatePicker');
  const persianDatePicker = document.getElementById('persianDatePicker');
  const gregorianEquivalent = document.getElementById('gregorianEquivalent');
  const persianEquivalent = document.getElementById('persianEquivalent');
  const persianDay = document.getElementById('persianDay');
  const persianMonth = document.getElementById('persianMonth');
  const persianYear = document.getElementById('persianYear');
  const calendarOptions = [...document.querySelectorAll('[data-calendar-type]')];

  const MAX_REMINDERS = 5;
  const PERSIAN_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];
  let calendarType = 'gregorian';

  function faNumber(value) {
    return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  // Gregorian <-> Jalali conversion. Kept client-side so no date data leaves the browser.
  function gregorianToJalali(gy, gm, gd) {
    const gDayMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy <= 1600 ? 0 : 979;
    gy -= gy <= 1600 ? 621 : 1600;
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = (365 * gy) +
      Math.floor((gy2 + 3) / 4) -
      Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) -
      80 + gd + gDayMonth[gm - 1];

    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;

    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }

    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }

  function jalaliToGregorian(jy, jm, jd) {
    jy += 1595;
    let days = -355668 +
      (365 * jy) +
      (Math.floor(jy / 33) * 8) +
      Math.floor(((jy % 33) + 3) / 4) +
      jd +
      (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);

    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;

    if (days > 36524) {
      gy += 100 * Math.floor((--days) / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }

    gy += 4 * Math.floor(days / 1461);
    days %= 1461;

    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }

    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 1;

    for (; gm <= 12; gm++) {
      if (gd <= monthDays[gm]) break;
      gd -= monthDays[gm];
    }

    return [gy, gm, gd];
  }

  function isJalaliLeapYear(year) {
    const [gy1, gm1, gd1] = jalaliToGregorian(year, 1, 1);
    const [gy2, gm2, gd2] = jalaliToGregorian(year + 1, 1, 1);
    const start = Date.UTC(gy1, gm1 - 1, gd1);
    const next = Date.UTC(gy2, gm2 - 1, gd2);
    return Math.round((next - start) / 86400000) === 366;
  }

  function jalaliMonthDays(year, month) {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    return isJalaliLeapYear(year) ? 30 : 29;
  }

  function populatePersianYears() {
    const today = new Date();
    const [currentJY] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const start = Math.min(1380, currentJY - 10);
    const end = Math.max(1450, currentJY + 25);

    for (let year = start; year <= end; year++) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = faNumber(year);
      persianYear.appendChild(option);
    }
  }

  function populatePersianMonths() {
    PERSIAN_MONTHS.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index + 1);
      option.textContent = name;
      persianMonth.appendChild(option);
    });
  }

  function populatePersianDays(preferredDay = null) {
    const year = Number(persianYear.value);
    const month = Number(persianMonth.value);
    const previous = preferredDay ?? Number(persianDay.value);

    persianDay.innerHTML = '<option value="">روز</option>';
    if (!year || !month) return;

    const count = jalaliMonthDays(year, month);
    for (let day = 1; day <= count; day++) {
      const option = document.createElement('option');
      option.value = String(day);
      option.textContent = faNumber(day);
      persianDay.appendChild(option);
    }

    if (previous && previous <= count) persianDay.value = String(previous);
  }

  function setPersianFromGregorian(dateValue) {
    if (!dateValue) {
      persianYear.value = '';
      persianMonth.value = '';
      populatePersianDays();
      persianEquivalent.textContent = '';
      gregorianEquivalent.textContent = '';
      return;
    }

    const [gy, gm, gd] = dateValue.split('-').map(Number);
    if (!gy || !gm || !gd) return;
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);

    persianYear.value = String(jy);
    persianMonth.value = String(jm);
    populatePersianDays(jd);
    persianDay.value = String(jd);

    gregorianEquivalent.textContent = `معادل شمسی: ${faNumber(jy)}/${faNumber(pad(jm))}/${faNumber(pad(jd))}`;
    persianEquivalent.textContent = `معادل میلادی: ${gy}/${pad(gm)}/${pad(gd)}`;
  }

  function setGregorianFromPersian() {
    const jy = Number(persianYear.value);
    const jm = Number(persianMonth.value);
    const jd = Number(persianDay.value);

    if (!jy || !jm || !jd) {
      eventDate.value = '';
      persianEquivalent.textContent = '';
      return;
    }

    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    eventDate.value = `${gy}-${pad(gm)}-${pad(gd)}`;
    persianEquivalent.textContent = `معادل میلادی: ${gy}/${pad(gm)}/${pad(gd)}`;
    gregorianEquivalent.textContent = `معادل شمسی: ${faNumber(jy)}/${faNumber(pad(jm))}/${faNumber(pad(jd))}`;
  }

  function setCalendarType(type) {
    calendarType = type === 'persian' ? 'persian' : 'gregorian';

    calendarOptions.forEach((button) => {
      const active = button.dataset.calendarType === calendarType;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    gregorianDatePicker.hidden = calendarType !== 'gregorian';
    persianDatePicker.hidden = calendarType !== 'persian';

    if (calendarType === 'persian' && eventDate.value) setPersianFromGregorian(eventDate.value);
    if (calendarType === 'gregorian' && persianYear.value && persianMonth.value && persianDay.value) {
      setGregorianFromPersian();
    }
  }

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
    if (!dateValue) {
      return calendarType === 'persian'
        ? 'تاریخ شمسی ایونت را کامل انتخاب کن.'
        : 'تاریخ ایونت را انتخاب کن.';
    }
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
    const dateValue = eventDate.value;
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

  calendarOptions.forEach((button) => {
    button.addEventListener('click', () => setCalendarType(button.dataset.calendarType));
  });

  eventDate.addEventListener('change', () => {
    if (eventDate.value) setPersianFromGregorian(eventDate.value);
    else {
      gregorianEquivalent.textContent = '';
      persianEquivalent.textContent = '';
    }
  });

  persianYear.addEventListener('change', () => {
    populatePersianDays();
    setGregorianFromPersian();
  });
  persianMonth.addEventListener('change', () => {
    populatePersianDays();
    setGregorianFromPersian();
  });
  persianDay.addEventListener('change', setGregorianFromPersian);

  addReminderButton.addEventListener('click', addReminder);
  copyButton.addEventListener('click', copyLink);

  resetButton.addEventListener('click', () => {
    form.reset();
    reminderRows.innerHTML = '';
    makeReminderRow();

    persianYear.value = '';
    persianMonth.value = '';
    populatePersianDays();
    gregorianEquivalent.textContent = '';
    persianEquivalent.textContent = '';
    setCalendarType('gregorian');

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

  populatePersianYears();
  populatePersianMonths();
  populatePersianDays();
  setCalendarType('gregorian');
  makeReminderRow();
})();
