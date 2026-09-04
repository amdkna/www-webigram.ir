import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import net from 'node:net';
import { performance } from 'node:perf_hooks';

const PORT = Number(process.env.PORT || 8787);
const REQUEST_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 750000;
const MAX_REDIRECTS = 5;
const RATE_WINDOW_MS = 60000;
const RATE_LIMIT = Number(process.env.DOCTOR_RATE_LIMIT || 12);
const MAX_ACTIVE_SCANS = Number(process.env.DOCTOR_MAX_ACTIVE_SCANS || 20);
const USER_AGENT = 'Webigram-Website-Doctor/1.0 (+https://webigram.ir/tools/website-doctor/)';
let activeScans = 0;
const rateBuckets = new Map();

function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(body);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean);
  return forwarded.at(-1) || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const fresh = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) { rateBuckets.set(ip, fresh); return true; }
  fresh.push(now); rateBuckets.set(ip, fresh);
  return false;
}

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(n => n < 0 || n > 255)) return true;
  const [a,b,c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8:')) return true;
  if (v.startsWith('::ffff:') && net.isIP(v.slice(7)) === 4) return isPrivateIPv4(v.slice(7));
  return false;
}

function isPublicIp(ip) {
  const version = net.isIP(ip);
  return version === 4 ? !isPrivateIPv4(ip) : version === 6 ? !isPrivateIPv6(ip) : false;
}

function normalizeInput(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) throw new Error('آدرس سایت معتبر نیست.');
  let value = raw.trim(); if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url; try { url = new URL(value); } catch { throw new Error('آدرس سایت را به شکل example.com وارد کنید.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('فقط آدرس‌های HTTP و HTTPS قابل بررسی هستند.');
  if (url.username || url.password) throw new Error('آدرس شامل نام کاربری یا رمز قابل بررسی نیست.');
  if (url.port && !['80','443'].includes(url.port)) throw new Error('برای امنیت، فقط پورت‌های استاندارد 80 و 443 بررسی می‌شوند.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) throw new Error('آدرس‌های داخلی یا محلی قابل بررسی نیستند.');
  url.hostname = host; url.hash = ''; return url;
}

async function resolvePublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('آدرس‌های IP داخلی یا رزروشده قابل بررسی نیستند.');
    return [{ address: hostname, family: net.isIP(hostname) }];
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error('دامنه به هیچ IP عمومی متصل نیست.');
  if (records.some(r => !isPublicIp(r.address))) throw new Error('این دامنه به یک آدرس داخلی یا رزروشده اشاره می‌کند و قابل بررسی عمومی نیست.');
  return records;
}

function pinnedLookup(records) {
  return (_host, options, cb) => {
    const family = typeof options === 'object' ? Number(options.family || 0) : Number(options || 0);
    const selected = (family ? records.find(r => r.family === family) : records[0]) || records[0];
    selected ? cb(null, selected.address, selected.family) : cb(new Error('No resolved address'));
  };
}

async function singleRequest(url, { maxBytes = MAX_HTML_BYTES, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const records = await resolvePublicHost(url.hostname);
  const client = url.protocol === 'https:' ? https : http;
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let settled = false, bytes = 0, headersAt = 0; const chunks = [];
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    const req = client.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method: 'GET', lookup: pinnedLookup(records),
      servername: net.isIP(url.hostname) ? undefined : url.hostname, rejectUnauthorized: false,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Encoding': 'gzip, deflate, br', 'Connection': 'close' }
    }, res => {
      headersAt = performance.now();
      res.on('data', chunk => {
        if (settled) return; bytes += chunk.length; if (bytes <= maxBytes) chunks.push(chunk);
        if (bytes > maxBytes) { res.destroy(); finish(pack(res, true)); }
      });
      res.on('end', () => finish(pack(res, false)));
      function pack(response, truncated) { return { url: url.toString(), statusCode: response.statusCode || 0, statusMessage: response.statusMessage || '', headers: response.headers, httpVersion: response.httpVersion, body: Buffer.concat(chunks).toString('utf8'), bodyBytes: bytes, truncated, ttfbMs: Math.round(headersAt - started), totalMs: Math.round(performance.now() - started), addresses: records }; }
    });
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', error => { if (!settled) reject(error); }); req.end();
  });
}

const isRedirect = code => [301,302,303,307,308].includes(code);
async function requestChain(start, options = {}) {
  let current = new URL(start); const redirects = [];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await singleRequest(current, options);
    if (!isRedirect(response.statusCode) || !response.headers.location) return { ...response, finalUrl: current.toString(), redirects };
    if (i === MAX_REDIRECTS) throw new Error('تعداد تغییر مسیرهای سایت بیش از حد معمول است.');
    const next = new URL(response.headers.location, current);
    if (!['http:','https:'].includes(next.protocol) || (next.port && !['80','443'].includes(next.port))) throw new Error('سایت به یک آدرس غیرمجاز تغییر مسیر می‌دهد.');
    await resolvePublicHost(next.hostname); redirects.push({ from: current.toString(), to: next.toString(), statusCode: response.statusCode }); current = next;
  }
}

async function checkTls(hostname) {
  let records; try { records = await resolvePublicHost(hostname); } catch (e) { return { available:false, valid:false, error:e.message }; }
  const target = records.find(r => r.family === 4) || records[0];
  return new Promise(resolve => {
    const socket = tls.connect({ host: target.address, port:443, servername: net.isIP(hostname) ? undefined : hostname, rejectUnauthorized:false, timeout:8000 });
    let done = false; const finish = payload => { if (done) return; done = true; socket.destroy(); resolve(payload); };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate(true) || {}; const to = cert.valid_to ? Date.parse(cert.valid_to) : NaN; const from = cert.valid_from ? Date.parse(cert.valid_from) : NaN; const now = Date.now();
      finish({ available:true, valid:Boolean(socket.authorized && from <= now && to >= now), authorized:Boolean(socket.authorized), authorizationError:socket.authorizationError || null, subject:cert.subject?.CN || null, issuer:cert.issuer?.O || cert.issuer?.CN || null, validFrom:cert.valid_from || null, validTo:cert.valid_to || null, daysRemaining:Number.isFinite(to) ? Math.floor((to-now)/86400000) : null, protocol:socket.getProtocol() || null, cipher:socket.getCipher()?.name || null });
    });
    socket.once('timeout', () => finish({available:false,valid:false,error:'TLS timeout'})); socket.once('error', e => finish({available:false,valid:false,error:e.code || e.message}));
  });
}

const clean = s => String(s || '').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
function attr(tag, name) { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i')); return clean(m?.[1] ?? m?.[2] ?? m?.[3] ?? ''); }
function meta(html,key,value) { for (const tag of html.match(/<meta\b[^>]*>/gi) || []) if (attr(tag,key).toLowerCase() === value.toLowerCase()) return attr(tag,'content'); return ''; }
function link(html,rel) { for (const tag of html.match(/<link\b[^>]*>/gi) || []) if (attr(tag,'rel').toLowerCase().split(/\s+/).includes(rel)) return attr(tag,'href'); return ''; }
function parseHtml(html) { const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); return { title:clean(m?.[1]), description:meta(html,'name','description'), viewport:meta(html,'name','viewport'), robots:meta(html,'name','robots'), canonical:link(html,'canonical'), ogTitle:meta(html,'property','og:title'), ogDescription:meta(html,'property','og:description'), ogImage:meta(html,'property','og:image'), h1Count:(html.match(/<h1\b/gi)||[]).length }; }
const hv = (headers,name) => Array.isArray(headers?.[name]) ? headers[name].join(', ') : String(headers?.[name] || '');
const statusFactor = { ok:1, warn:.55, info:.75, error:0 };
const priorityRank = p => ({urgent:0,high:1,medium:2,low:3})[p] ?? 4;
const gradeFor = score => score >= 90 ? {label:'عالی',tone:'excellent'} : score >= 75 ? {label:'خوب',tone:'good'} : score >= 55 ? {label:'نیاز به توجه',tone:'warning'} : {label:'مشکل جدی',tone:'critical'};

async function scanWebsite(rawUrl) {
  const started = performance.now(), input = normalizeInput(rawUrl), host = input.hostname, checks = [], actions = [];
  const add = (id,category,status,title,summary,weight,technical='',action=null) => { checks.push({id,category,status,title,summary,weight,technical}); if (action && ['warn','error'].includes(status)) actions.push(action); };
  let dnsRecords = [];
  try { dnsRecords = await resolvePublicHost(host); add('dns','دامنه و اتصال','ok','دامنه به سرور متصل است',`دامنه به ${dnsRecords.length} آدرس IP عمومی پاسخ می‌دهد.`,10,dnsRecords.map(r=>`${r.address} (IPv${r.family})`).join(', ')); }
  catch (e) { add('dns','دامنه و اتصال','error','دامنه به سرور قابل دسترس متصل نیست',e.message,10,e.message,{priority:'urgent',title:'DNS دامنه را بررسی کنید',description:'Nameserver و رکوردهای A/AAAA دامنه را در پنل DNS یا شرکت هاست بررسی کنید.'}); throw Object.assign(new Error(e.message),{partialChecks:checks,partialActions:actions}); }

  let main = null, mainError = null;
  try { main = await requestChain(input); }
  catch (first) { if (input.protocol === 'https:') { const fallback = new URL(input); fallback.protocol='http:'; fallback.port=''; try { main = await requestChain(fallback); main.httpsFallbackError = first.code || first.message; } catch (e) { mainError=e; } } else mainError=first; }
  const tlsInfo = await checkTls(host);

  if (!main) add('availability','دسترسی سایت','error','وب‌سایت پاسخ نمی‌دهد','دامنه پیدا می‌شود، اما وب‌سرور پاسخ قابل استفاده‌ای برنمی‌گرداند.',18,mainError?.code || mainError?.message || 'No HTTP response',{priority:'urgent',title:'وضعیت هاست یا وب‌سرور را بررسی کنید',description:'سرویس وب، فایروال و دسترسی پورت‌های 80 و 443 را بررسی کنید.'});
  else {
    const httpStatus = main.statusCode >= 200 && main.statusCode < 300 ? 'ok' : main.statusCode >= 300 && main.statusCode < 400 ? 'warn' : 'error';
    add('availability','دسترسی سایت',httpStatus,httpStatus==='ok'?'سایت در دسترس است':`سایت با خطای HTTP ${main.statusCode} پاسخ می‌دهد.`,httpStatus==='ok'?`سرور با وضعیت ${main.statusCode} پاسخ داده است.`:`کد پاسخ نهایی ${main.statusCode} است و نیاز به بررسی دارد.`,18,`HTTP ${main.statusCode}; HTTP/${main.httpVersion}`,httpStatus==='error'?{priority:'urgent',title:`خطای HTTP ${main.statusCode} را رفع کنید`,description:'تنظیمات وب‌سرور، برنامه یا CDN را بررسی کنید تا صفحه با پاسخ موفق 2xx باز شود.'}:null);
    const final = new URL(main.finalUrl);
    add('https','امنیت و SSL',final.protocol==='https:'?'ok':'warn',final.protocol==='https:'?'سایت با HTTPS باز می‌شود':'سایت روی HTTP باز می‌شود',final.protocol==='https:'?'ارتباط کاربر با سایت رمزنگاری می‌شود.':'نسخه نهایی سایت هنوز از HTTPS استفاده نمی‌کند.',8,`Final URL: ${main.finalUrl}`,final.protocol!=='https:'?{priority:'high',title:'HTTPS را اجباری کنید',description:'برای نسخه HTTP یک Redirect دائمی به HTTPS تنظیم کنید.'}:null);
    const rc = main.redirects.length; add('redirects','دسترسی سایت',rc<=2?'ok':'warn',rc===0?'تغییر مسیر اضافی وجود ندارد':`${rc} تغییر مسیر تا صفحه نهایی`,rc<=2?'مسیر رسیدن کاربر به سایت طبیعی است.':'تعداد Redirectها زیاد است و می‌تواند سرعت و سئو را ضعیف کند.',4,main.redirects.map(r=>`${r.statusCode}: ${r.from} -> ${r.to}`).join(' | ')||'No redirects',rc>2?{priority:'medium',title:'زنجیره Redirect را کوتاه کنید',description:'آدرس اولیه را مستقیم به URL نهایی هدایت کنید.'}:null);
    const speed = main.ttfbMs<=800?'ok':main.ttfbMs<=1800?'warn':'error'; add('speed','سرعت',speed,speed==='ok'?'پاسخ اولیه سرور سریع است':speed==='warn'?'پاسخ اولیه سرور کمی کند است':'پاسخ اولیه سرور کند است',`زمان دریافت اولین پاسخ حدود ${main.ttfbMs} میلی‌ثانیه بود.`,10,`TTFB=${main.ttfbMs}ms`,speed!=='ok'?{priority:speed==='error'?'high':'medium',title:'زمان پاسخ سرور را کاهش دهید',description:'کش، دیتابیس، منابع سرور، CDN و کد سمت سرور را بررسی کنید.'}:null);
    const encoding=hv(main.headers,'content-encoding'), contentType=hv(main.headers,'content-type'), isHtml=/text\/html|application\/xhtml\+xml/i.test(contentType);
    add('compression','سرعت',!isHtml||encoding?'ok':'warn',encoding?`فشرده‌سازی ${encoding.toUpperCase()} فعال است`:isHtml?'فشرده‌سازی پاسخ فعال نیست':'پاسخ HTML نیست',encoding?'حجم داده ارسالی به مرورگر کاهش پیدا می‌کند.':isHtml?'فعال کردن Brotli یا Gzip می‌تواند حجم انتقال را کمتر کند.':'این تست برای HTML کاربرد اصلی دارد.',4,`Content-Encoding: ${encoding||'none'}`,isHtml&&!encoding?{priority:'low',title:'فشرده‌سازی را فعال کنید',description:'Brotli یا Gzip را در وب‌سرور یا CDN فعال کنید.'}:null);
    if (isHtml) {
      const h=parseHtml(main.body), ts=h.title&&h.title.length>=10&&h.title.length<=65?'ok':h.title?'warn':'error';
      add('title','SEO و نمایش',ts,h.title?'عنوان صفحه پیدا شد':'عنوان صفحه وجود ندارد',h.title?`عنوان فعلی: «${h.title.slice(0,90)}${h.title.length>90?'…':''}»`:'تگ title برای صفحه پیدا نشد.',7,`title length=${h.title.length}`,ts!=='ok'?{priority:h.title?'low':'high',title:'عنوان صفحه را اصلاح کنید',description:'یک Title واضح و منحصربه‌فرد قرار دهید.'}:null);
      const ds=h.description&&h.description.length>=50&&h.description.length<=180?'ok':h.description?'warn':'error'; add('description','SEO و نمایش',ds,h.description?'توضیح صفحه پیدا شد':'Meta Description وجود ندارد',h.description?`توضیح صفحه ${h.description.length} کاراکتر است.`:'گوگل و شبکه‌های اجتماعی توضیح مشخصی از این صفحه دریافت نمی‌کنند.',6,`description length=${h.description.length}`,ds!=='ok'?{priority:'medium',title:'Meta Description را تکمیل کنید',description:'یک توضیح کوتاه و روشن درباره صفحه بنویسید.'}:null);
      add('viewport','نمایش موبایل',h.viewport?'ok':'error',h.viewport?'تنظیمات موبایل وجود دارد':'Viewport موبایل پیدا نشد',h.viewport?'صفحه برای نمایش Responsive آماده شده است.':'نمایش سایت روی موبایل می‌تواند مشکل داشته باشد.',5,h.viewport||'missing viewport',!h.viewport?{priority:'high',title:'Meta Viewport را اضافه کنید',description:'برای نمایش درست سایت روی موبایل viewport استاندارد را اضافه کنید.'}:null);
      add('h1','SEO و ساختار',h.h1Count===1?'ok':'warn',h.h1Count===1?'ساختار H1 مناسب است':h.h1Count===0?'تیتر اصلی H1 پیدا نشد':`${h.h1Count} تیتر H1 در صفحه وجود دارد`,h.h1Count===1?'صفحه یک تیتر اصلی مشخص دارد.':'بهتر است صفحه یک H1 واضح داشته باشد.',4,`H1 count=${h.h1Count}`,h.h1Count!==1?{priority:'low',title:'ساختار تیتر اصلی را اصلاح کنید',description:'یک H1 مشخص برای موضوع اصلی صفحه در نظر بگیرید.'}:null);
      add('canonical','SEO و ساختار',h.canonical?'ok':'warn',h.canonical?'Canonical مشخص شده است':'Canonical پیدا نشد',h.canonical?'آدرس اصلی صفحه برای موتور جستجو مشخص است.':'Canonical به جلوگیری از ابهام URLهای تکراری کمک می‌کند.',3,h.canonical||'missing canonical',!h.canonical?{priority:'low',title:'Canonical صفحه را مشخص کنید',description:'یک rel=canonical معتبر اضافه کنید.'}:null);
      const noindex=h.robots.toLowerCase().includes('noindex'); add('indexing','SEO و ساختار',noindex?'error':'ok',noindex?'صفحه برای ایندکس گوگل بسته شده است':'Meta Robots مانع ایندکس نیست',noindex?'در meta robots مقدار noindex دیده شد.':'در خود صفحه دستور noindex دیده نشد.',5,h.robots||'no robots meta',noindex?{priority:'urgent',title:'اگر عمدی نیست، noindex را حذف کنید',description:'noindex باعث می‌شود صفحه در گوگل نمایش داده نشود.'}:null);
      const og=Boolean(h.ogTitle&&h.ogDescription&&h.ogImage); add('open-graph','SEO و نمایش',og?'ok':'warn',og?'پیش‌نمایش شبکه‌های اجتماعی کامل است':'Open Graph کامل نیست',og?'عنوان، توضیح و تصویر اشتراک‌گذاری مشخص شده‌اند.':'og:title، og:description و og:image را کامل کنید.',4,`og:title=${!!h.ogTitle}, og:description=${!!h.ogDescription}, og:image=${!!h.ogImage}`,!og?{priority:'low',title:'Open Graph را کامل کنید',description:'عنوان، توضیح و تصویر مناسب برای اشتراک‌گذاری تعریف کنید.'}:null);
    }
    const sh=['strict-transport-security','content-security-policy','x-content-type-options','referrer-policy','permissions-policy'], present=sh.filter(n=>hv(main.headers,n)), sec=present.length>=4?'ok':present.length>=2?'warn':'error';
    add('security-headers','امنیت و SSL',sec,sec==='ok'?'هدرهای امنیتی وضعیت خوبی دارند':'هدرهای امنیتی سایت کامل نیستند',`${present.length} مورد از ${sh.length} هدر امنیتی پیشنهادی پیدا شد.`,6,`Present: ${present.join(', ')||'none'}`,sec!=='ok'?{priority:sec==='error'?'high':'medium',title:'هدرهای امنیتی را تکمیل کنید',description:'HSTS، CSP، X-Content-Type-Options و Referrer-Policy را بررسی کنید.'}:null);
    for (const [id,path,pattern,titleOk,titleBad,weight] of [['robots-file','/robots.txt',/user-agent\s*:/i,'robots.txt در دسترس است','robots.txt معتبر پیدا نشد',3],['sitemap','/sitemap.xml',/<(urlset|sitemapindex)\b/i,'Sitemap پیدا شد','Sitemap استاندارد پیدا نشد',3]]) {
      try { const r=await requestChain(new URL(path,main.finalUrl),{maxBytes:120000,timeoutMs:6000}), ok=r.statusCode>=200&&r.statusCode<300&&pattern.test(r.body); add(id,'SEO و ساختار',ok?'ok':'warn',ok?titleOk:titleBad,ok?'فایل استاندارد قابل دریافت است.':'وجود یا مسیر این فایل را بررسی کنید.',weight,`HTTP ${r.statusCode}`,!ok?{priority:'low',title:`${id==='sitemap'?'Sitemap':'robots.txt'} را بررسی کنید`,description:'فایل استاندارد را ایجاد یا مسیر و محتوای آن را اصلاح کنید.'}:null); }
      catch { add(id,'SEO و ساختار','warn',`${id==='sitemap'?'Sitemap':'robots.txt'} قابل دریافت نبود`,'در مسیر استاندارد پاسخی دریافت نشد.',weight,'request failed'); }
    }
  }

  if (tlsInfo.available) { const st=tlsInfo.valid&&(tlsInfo.daysRemaining===null||tlsInfo.daysRemaining>14)?'ok':tlsInfo.valid?'warn':'error'; add('ssl','امنیت و SSL',st,st==='ok'?'گواهی SSL معتبر است':st==='warn'?'SSL معتبر است اما به انقضا نزدیک می‌شود':'گواهی SSL معتبر نیست',tlsInfo.daysRemaining!==null?`حدود ${tlsInfo.daysRemaining} روز تا پایان اعتبار باقی مانده است.`:(tlsInfo.authorizationError||'اعتبار گواهی تایید نشد.'),12,`authorized=${tlsInfo.authorized}; issuer=${tlsInfo.issuer||'unknown'}; protocol=${tlsInfo.protocol||'unknown'}`,st!=='ok'?{priority:st==='error'?'urgent':'high',title:'گواهی SSL را بررسی یا تمدید کنید',description:'اعتبار و زنجیره گواهی و تنظیمات HTTPS را بررسی کنید.'}:null); }
  else add('ssl','امنیت و SSL','error','SSL روی پورت 443 قابل تایید نیست','اتصال TLS معتبر برای دامنه برقرار نشد.',12,tlsInfo.error||'TLS unavailable',{priority:'urgent',title:'HTTPS و SSL را فعال کنید',description:'گواهی SSL و دسترسی پورت 443 را بررسی کنید.'});

  const weighted=checks.filter(c=>c.weight>0), max=weighted.reduce((s,c)=>s+c.weight,0), earned=weighted.reduce((s,c)=>s+c.weight*(statusFactor[c.status]??0),0), score=max?Math.round(earned/max*100):0, grade=gradeFor(score);
  const uniqueActions=Array.from(new Map(actions.map(a=>[`${a.title}|${a.description}`,a])).values()).sort((a,b)=>priorityRank(a.priority)-priorityRank(b.priority)).slice(0,8);
  const errors=checks.filter(c=>c.status==='error'), warnings=checks.filter(c=>c.status==='warn');
  const site=main?{hostname:host,finalUrl:main.finalUrl,statusCode:main.statusCode,statusText:main.statusMessage||'',ttfbMs:main.ttfbMs,totalMs:main.totalMs,redirects:main.redirects,ipAddresses:[...new Set(main.addresses.map(r=>r.address))],server:hv(main.headers,'server')||null,poweredBy:hv(main.headers,'x-powered-by')||null,httpVersion:main.httpVersion,contentType:hv(main.headers,'content-type')||null,contentEncoding:hv(main.headers,'content-encoding')||null,pageSizeBytes:Number(hv(main.headers,'content-length'))||main.bodyBytes}:{hostname:host,finalUrl:null,statusCode:null,statusText:null,ttfbMs:null,totalMs:null,redirects:[],ipAddresses:dnsRecords.map(r=>r.address),server:null,poweredBy:null,httpVersion:null,contentType:null,contentEncoding:null,pageSizeBytes:null};
  const technicalReport=['Webigram Website Doctor',`Scan time: ${new Date().toISOString()}`,`Input: ${input}`,`Final URL: ${site.finalUrl||'unavailable'}`,`Score: ${score}/100 (${grade.label})`,site.statusCode?`HTTP: ${site.statusCode} ${site.statusText}`:'HTTP: unavailable',`IPs: ${site.ipAddresses.join(', ')||'none'}`,`TTFB: ${site.ttfbMs??'n/a'} ms`,`TLS: ${tlsInfo.available?`${tlsInfo.valid?'valid':'invalid'}, ${tlsInfo.protocol||'unknown'}, expires ${tlsInfo.validTo||'unknown'}`:'unavailable'}`,'',...checks.map(c=>`[${c.status.toUpperCase()}] ${c.title} — ${c.technical||c.summary}`)].join('\n');
  return {ok:true,inputUrl:rawUrl,normalizedUrl:input.toString(),scannedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started),score,grade,summary:{headline:errors.length?`${errors.length} مشکل مهم پیدا شد`:warnings.length?'سایت کار می‌کند، اما چند مورد قابل بهبود است':'سایت از نظر بررسی‌های اصلی سالم است',message:errors.length?'اول موارد قرمز را برطرف کنید؛ بعد سراغ پیشنهادهای زرد بروید.':warnings.length?'مشکل بحرانی دیده نشد. با اصلاح موارد زرد کیفیت سایت بهتر می‌شود.':'در این بررسی سریع مورد مهمی که نیاز به اقدام فوری داشته باشد دیده نشد.',errors:errors.length,warnings:warnings.length,passed:checks.filter(c=>c.status==='ok').length},site,ssl:tlsInfo,checks,actions:uniqueActions,technicalReport,privacy:'این بررسی فقط هنگام درخواست شما انجام می‌شود و Website Doctor تاریخچه مرور شما را ذخیره نمی‌کند.'};
}

async function readJson(req) { return new Promise((resolve,reject)=>{ let size=0; const chunks=[]; req.on('data',chunk=>{size+=chunk.length;if(size>16384){reject(Object.assign(new Error('Payload too large'),{statusCode:413}));req.destroy();return;}chunks.push(chunk);}); req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'));}catch{reject(Object.assign(new Error('Invalid JSON'),{statusCode:400}));}}); req.on('error',reject); }); }

const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok\n');}
  if(req.method==='OPTIONS'&&['/check','/api/website-doctor'].includes(req.url||''))return json(res,204,{});
  if(req.method!=='POST'||!['/check','/api/website-doctor'].includes(req.url||''))return json(res,404,{ok:false,error:'Not found'});
  const ip=getClientIp(req); if(isRateLimited(ip))return json(res,429,{ok:false,error:'تعداد بررسی‌ها در مدت کوتاه زیاد شده است. یک دقیقه بعد دوباره امتحان کنید.'},{'Retry-After':'60'});
  if(activeScans>=MAX_ACTIVE_SCANS)return json(res,503,{ok:false,error:'در حال حاضر تعداد بررسی‌های همزمان زیاد است. کمی بعد دوباره امتحان کنید.'},{'Retry-After':'15'});
  activeScans++;
  try{const payload=await readJson(req);return json(res,200,await scanWebsite(payload.url));}
  catch(e){return json(res,e.statusCode||400,{ok:false,error:e.message||'امکان بررسی این آدرس وجود ندارد.',partialChecks:e.partialChecks,actions:e.partialActions});}
  finally{activeScans--;}
});
server.headersTimeout=15000;server.requestTimeout=25000;server.keepAliveTimeout=5000;
server.listen(PORT,'0.0.0.0',()=>console.log(`Website Doctor API listening on :${PORT}`));
