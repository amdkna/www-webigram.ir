import http from "node:http";
import { URL } from "node:url";
import { promises as fsp, createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const CMS = (process.env.CMS_URL || "http://directus:8055").replace(/\/$/, "");
const AUTH_CMS = (process.env.AUTH_CMS_URL || "http://directus:8055").replace(/\/$/, "");
const WEBINAR_CMS = CMS;
const MEDIA_ROOT = process.env.MEDIA_ROOT || "/data";
const ORIGINALS_DIR = path.join(MEDIA_ROOT,"originals");
const CONVERTED_DIR = path.join(MEDIA_ROOT,"converted");
const JOBS_DIR = path.join(MEDIA_ROOT,"jobs");
const SYSTEM_SETTINGS_FILE = path.join(MEDIA_ROOT,"system-settings.json");
const DEFAULT_SYSTEM_SETTINGS = Object.freeze({ session_hours: 24 });
const STUDENT_ROLE = "b674625a-5f9e-4c86-a253-7f30775e1001";
const TEACHER_ROLE = "b674625a-5f9e-4c86-a253-7f30775e1002";
const SUPPORT_ROLE = "b674625a-5f9e-4c86-a253-7f30775e1003";

function json(res, status, value, headers={}) {
  res.writeHead(status, {"content-type":"application/json; charset=utf-8", "cache-control":"no-store, no-cache, must-revalidate", ...headers});
  res.end(JSON.stringify(value));
}

function html(res, status, value, headers={}) {
  res.writeHead(status, {"content-type":"text/html; charset=utf-8", "cache-control":"no-store, no-cache, must-revalidate", ...headers});
  res.end(value);
}

function redirect(res, location) {
  res.writeHead(302, {location});
  res.end();
}

function cookies(req) {
  const out={};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i=part.indexOf("=");
    if(i<0) continue;
    out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  if(req?._learnAccess) out.learn_access=req._learnAccess;
  if(req?._learnRefresh) out.learn_refresh=req._learnRefresh;
  return out;
}

function cookie(name,value,maxAge=900) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function readBody(req) {
  let raw="";
  for await (const chunk of req) {
    raw += chunk;
    if(raw.length > 64_000) throw new Error("body too large");
  }
  if(!raw) return {};
  return JSON.parse(raw);
}

async function cmsFetch(path, options={}) {
  return fetch(CMS + path, {
    ...options,
    headers: {
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
}

async function loginCms(identifier,password) {
  const response = await fetch(AUTH_CMS + "/auth/login", {
    headers: {"content-type":"application/json"},
    method:"POST",
    body:JSON.stringify({ email: identifier.trim(), password, mode:"json" })
  });
  if(!response.ok) {
    const text=await response.text();
    throw Object.assign(new Error(text || "login failed"), {status: response.status});
  }
  const payload=await response.json();
  return payload.data;
}

async function refreshCms(refreshToken) {
  const response = await fetch(AUTH_CMS + "/auth/refresh", {
    headers: {"content-type":"application/json"},
    method:"POST",
    body:JSON.stringify({ refresh_token: refreshToken, mode:"json" })
  });
  if(!response.ok) {
    const text=await response.text();
    throw Object.assign(new Error(text || "refresh failed"), {status: response.status});
  }
  const payload=await response.json();
  return payload.data;
}

async function webinarCmsFetch(path, options={}) {
  return fetch(WEBINAR_CMS + path, {
    ...options,
    headers: {
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
}

async function loginWebinarCms(identifier,password) {
  const response = await webinarCmsFetch("/auth/login", {
    method:"POST",
    body:JSON.stringify({ email: identifier.trim(), password, mode:"json" })
  });
  if(!response.ok) {
    const text=await response.text();
    throw Object.assign(new Error(text || "Learn CMS login failed"), {status: response.status});
  }
  const payload=await response.json();
  return payload.data;
}

async function refreshWebinarCms(refreshToken) {
  const response = await webinarCmsFetch("/auth/refresh", {
    method:"POST",
    body:JSON.stringify({ refresh_token: refreshToken, mode:"json" })
  });
  if(!response.ok) {
    const text=await response.text();
    throw Object.assign(new Error(text || "Learn CMS refresh failed"), {status: response.status});
  }
  const payload=await response.json();
  return payload.data;
}

function normalizeSessionHours(value) {
  const hours=Math.round(Number(value));
  if(!Number.isFinite(hours)) return DEFAULT_SYSTEM_SETTINGS.session_hours;
  return Math.max(1,Math.min(168,hours));
}

async function readSystemSettings() {
  try {
    const raw=await fsp.readFile(SYSTEM_SETTINGS_FILE,"utf8");
    const parsed=JSON.parse(raw);
    return {...DEFAULT_SYSTEM_SETTINGS,session_hours:normalizeSessionHours(parsed?.session_hours)};
  } catch {
    return {...DEFAULT_SYSTEM_SETTINGS};
  }
}

async function writeSystemSettings(next) {
  const settings={...DEFAULT_SYSTEM_SETTINGS,session_hours:normalizeSessionHours(next?.session_hours)};
  await fsp.mkdir(MEDIA_ROOT,{recursive:true});
  const temp=SYSTEM_SETTINGS_FILE+".tmp-"+process.pid;
  await fsp.writeFile(temp,JSON.stringify(settings,null,2),{mode:0o600});
  await fsp.rename(temp,SYSTEM_SETTINGS_FILE);
  return settings;
}

function applyAuthToRequest(req,auth,fallbackRefresh="") {
  if(auth?.access_token) req._learnAccess=auth.access_token;
  req._learnRefresh=auth?.refresh_token || fallbackRefresh || req._learnRefresh || "";
}

async function authCookieHeaders(auth,fallbackRefresh="") {
  const headers=[];
  const settings=await readSystemSettings();
  const maxAge=Math.max(3600,Math.round(settings.session_hours*3600));
  if(auth?.access_token) headers.push(cookie("learn_access",auth.access_token,maxAge));
  const refresh=auth?.refresh_token || fallbackRefresh;
  if(refresh) headers.push(cookie("learn_refresh",refresh,maxAge));
  return headers;
}

async function webinarAuthCookieHeaders(auth,fallbackRefresh="") {
  const headers=[];
  const settings=await readSystemSettings();
  const maxAge=Math.max(3600,Math.round(settings.session_hours*3600));
  if(auth?.access_token) headers.push(cookie("webinar_access",auth.access_token,maxAge));
  const refresh=auth?.refresh_token || fallbackRefresh;
  if(refresh) headers.push(cookie("webinar_refresh",refresh,maxAge));
  return headers;
}

async function directusMutationWithRefresh(req, accessToken, operation) {
  try {
    return {data:await operation(accessToken),auth:null};
  } catch(error) {
    // 401 means the access token may have expired. 403 is an authorization
    // failure and must never log the user out or be reported as session expiry.
    if(Number(error?.status)!==401) throw error;

    const refreshToken=cookies(req).learn_refresh;
    if(!refreshToken) {
      error.refreshRequired=true;
      throw error;
    }

    let auth;
    try {
      auth=await refreshCms(refreshToken);
    } catch(refreshError) {
      if([401,403].includes(Number(refreshError?.status))) refreshError.refreshRequired=true;
      throw refreshError;
    }

    applyAuthToRequest(req,auth,refreshToken);

    try {
      const data=await operation(auth.access_token);
      return {data,auth:{...auth,refresh_token:auth?.refresh_token||refreshToken}};
    } catch(retryError) {
      // A second 401 after a successful refresh means the refreshed session is
      // unusable. A 403 still means permission denied, not expired.
      if(Number(retryError?.status)===401) retryError.refreshRequired=true;
      throw retryError;
    }
  }
}

async function getMe(accessToken) {
  const fields = encodeURIComponent("id,email,first_name,last_name,status,role,role.id,role.name");
  const response = await fetch(`${AUTH_CMS}/users/me?fields=${fields}`, {
    headers:{authorization:`Bearer ${accessToken}`}
  });
  if(!response.ok) throw Object.assign(new Error("session invalid"), {status:response.status});
  const payload=await response.json();
  const user=payload.data;

  // Student, Teacher and Support have stable application role IDs.
  // Administrator is a Directus-native role, so resolve its role details
  // dynamically when the /users/me response only exposes a role UUID.
  const id=roleId(user);
  if(id && typeof user?.role === "string" && ![STUDENT_ROLE,TEACHER_ROLE,SUPPORT_ROLE].includes(id)) {
    try {
      const roleResponse=await fetch(`${AUTH_CMS}/roles/${encodeURIComponent(id)}?fields=id,name`, {
        headers:{authorization:`Bearer ${accessToken}`}
      });
      if(roleResponse.ok) {
        const rolePayload=await roleResponse.json();
        if(rolePayload?.data) user.role=rolePayload.data;
      }
    } catch {}
  }

  return user;
}

function roleId(user) {
  return typeof user?.role === "string" ? user.role : user?.role?.id;
}

function roleName(user) {
  return typeof user?.role === "object" ? String(user.role?.name || "") : "";
}

function accessLevel(user) {
  const id=roleId(user);
  const name=roleName(user).trim().toLowerCase();

  if(id === STUDENT_ROLE) return "student";
  if(id === SUPPORT_ROLE) return "support";
  if(id === TEACHER_ROLE) return "teacher";

  // Directus Administrator (and any explicitly named admin role) is highest.
  if(name === "administrator" || name === "admin" || name.includes("administrator")) return "admin";

  return "none";
}

function canClients(user) {
  return ["student","support","teacher","admin"].includes(accessLevel(user));
}

function canAdmin(user) {
  return ["support","teacher","admin"].includes(accessLevel(user));
}

function canChangeSystemSettings(user) {
  return accessLevel(user)==="admin";
}

async function session(req,res) {
  const jar=cookies(req);
  const access=jar.learn_access;
  const refresh=jar.learn_refresh;

  if(access){
    try {
      return await getMe(access);
    } catch(error) {
      if(Number(error?.status)!==401 || !refresh) return null;
    }
  } else if(!refresh) {
    return null;
  }

  try {
    const auth=await refreshCms(refresh);
    const normalized={...auth,refresh_token:auth?.refresh_token||refresh};
    applyAuthToRequest(req,normalized,refresh);
    if(res && !res.headersSent) res.setHeader("set-cookie",await authCookieHeaders(normalized,refresh));
    return await getMe(normalized.access_token);
  } catch {
    if(res && !res.headersSent){
      res.setHeader("set-cookie",[clearCookie("learn_access"),clearCookie("learn_refresh")]);
    }
    return null;
  }
}

function sanitizeFileName(value="file") {
  const base=path.basename(String(value||"file")).replace(/[^\p{L}\p{N}._ -]+/gu,"_").trim();
  return base.slice(0,180) || "file";
}

async function ensureMediaDirs() {
  await Promise.all([
    fsp.mkdir(ORIGINALS_DIR,{recursive:true}),
    fsp.mkdir(CONVERTED_DIR,{recursive:true}),
    fsp.mkdir(JOBS_DIR,{recursive:true})
  ]);
}

async function streamToFile(req,destination,maxBytes=5*1024*1024*1024) {
  await fsp.mkdir(path.dirname(destination),{recursive:true});
  return await new Promise((resolve,reject)=>{
    const out=createWriteStream(destination,{flags:"wx"});
    let size=0;
    let settled=false;
    const fail=async(error)=>{
      if(settled)return;
      settled=true;
      out.destroy();
      try{await fsp.rm(destination,{force:true});}catch{}
      reject(error);
    };
    req.on("data",chunk=>{
      size+=chunk.length;
      if(size>maxBytes){
        req.destroy();
        fail(Object.assign(new Error("file too large"),{status:413}));
      }
    });
    req.on("error",fail);
    out.on("error",fail);
    out.on("finish",()=>{if(!settled){settled=true;resolve(size)}});
    req.pipe(out);
  });
}

async function runProcess(command,args) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",d=>{stdout+=d.toString();if(stdout.length>1_000_000)stdout=stdout.slice(-1_000_000)});
    child.stderr.on("data",d=>{stderr+=d.toString();if(stderr.length>2_000_000)stderr=stderr.slice(-2_000_000)});
    child.on("error",reject);
    child.on("close",code=>{
      if(code===0)resolve({stdout,stderr});
      else reject(Object.assign(new Error(`${command} exited with code ${code}`),{code,stdout,stderr}));
    });
  });
}

async function probeMedia(filePath) {
  const {stdout}=await runProcess("ffprobe",[
    "-v","error","-print_format","json","-show_format","-show_streams",filePath
  ]);
  return JSON.parse(stdout||"{}");
}

function probeSummary(probe={}) {
  const streams=Array.isArray(probe.streams)?probe.streams:[];
  const video=streams.find(s=>s.codec_type==="video");
  const audio=streams.find(s=>s.codec_type==="audio");
  const duration=Math.round(Number(probe.format?.duration||video?.duration||audio?.duration||0))||null;
  return {
    duration_seconds:duration,
    width:video?.width?Number(video.width):null,
    height:video?.height?Number(video.height):null
  };
}

async function writeJobState(assetId,state) {
  await ensureMediaDirs();
  await fsp.writeFile(path.join(JOBS_DIR,`${assetId}.json`),JSON.stringify({...state,updated_at:new Date().toISOString()},null,2));
}

async function readJobState(assetId) {
  try{return JSON.parse(await fsp.readFile(path.join(JOBS_DIR,`${assetId}.json`),"utf8"))}catch{return null}
}

async function convertMediaAsset(accessToken,asset) {
  const id=asset.id;
  const kind=asset.kind;
  const originalPath=asset.original_path;
  const targetDir=path.join(CONVERTED_DIR,String(id));
  await fsp.mkdir(targetDir,{recursive:true});
  await writeJobState(id,{status:"processing",kind,original_path:originalPath});

  try{
    let convertedPath="";
    let convertedMime="";
    if(kind==="video"){
      convertedPath=path.join(targetDir,"video.mp4");
      await runProcess("ffmpeg",[
        "-y","-i",originalPath,
        "-map","0:v:0","-map","0:a:0?",
        "-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p",
        "-preset","medium","-crf","22",
        "-vf","scale='min(iw,1920)':-2",
        "-r","30","-g","60","-keyint_min","60","-sc_threshold","0",
        "-c:a","aac","-b:a","96k","-ar","48000","-ac","1",
        "-movflags","+faststart",
        convertedPath
      ]);
      convertedMime="video/mp4";
    }else if(kind==="audio"){
      convertedPath=path.join(targetDir,"audio.m4a");
      await runProcess("ffmpeg",[
        "-y","-i",originalPath,
        "-vn","-c:a","aac","-b:a","96k","-ar","48000","-ac","1",
        "-movflags","+faststart",
        convertedPath
      ]);
      convertedMime="audio/mp4";
    }else{
      convertedPath=path.join(targetDir,sanitizeFileName(asset.original_name));
      await fsp.copyFile(originalPath,convertedPath);
      convertedMime=asset.original_mime||"application/octet-stream";
    }

    const probe=kind==="file"?{}:await probeMedia(convertedPath);
    const info=await fsp.stat(convertedPath);
    const summary=probeSummary(probe);
    const patch={
      status:"ready_for_review",
      converted_path:convertedPath,
      converted_mime:convertedMime,
      converted_size:info.size,
      processing_error:null,
      ...summary
    };
    await writeJobState(id,{...patch,status:"ready_for_review"});

    try{
      await directusRequest(accessToken,`/items/learning_media_assets/${id}`,{
        method:"PATCH",body:JSON.stringify(patch)
      });
    }catch(error){
      console.error("media status sync failed",id,error.message);
    }
  }catch(error){
    const message=(error.stderr||error.message||"media conversion failed").slice(-12000);
    await writeJobState(id,{status:"failed",processing_error:message});
    try{
      await directusRequest(accessToken,`/items/learning_media_assets/${id}`,{
        method:"PATCH",body:JSON.stringify({status:"failed",processing_error:message})
      });
    }catch(syncError){
      console.error("media failure sync failed",id,syncError.message);
    }
  }
}

async function reconcileMediaState(accessToken,asset) {
  const state=await readJobState(asset.id);
  if(!state || !["ready_for_review","failed"].includes(state.status)) return asset;
  if(asset.status===state.status) return asset;
  const allowed={status:state.status};
  for(const key of ["converted_path","converted_mime","converted_size","duration_seconds","width","height","processing_error"]){
    if(state[key]!==undefined)allowed[key]=state[key];
  }
  try{
    return await directusRequest(accessToken,`/items/learning_media_assets/${asset.id}`,{
      method:"PATCH",body:JSON.stringify(allowed)
    });
  }catch{return {...asset,...allowed}}
}

function contentTypeFor(filePath) {
  const ext=path.extname(filePath).toLowerCase();
  return ({
    ".mp4":"video/mp4",".m4a":"audio/mp4",".mp3":"audio/mpeg",".pdf":"application/pdf",
    ".zip":"application/zip",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
    ".webp":"image/webp",".txt":"text/plain; charset=utf-8"
  })[ext]||"application/octet-stream";
}

async function sendPrivateFile(req,res,filePath,download=false,fileName="file") {
  const st=await fsp.stat(filePath);
  const range=req.headers.range;
  const headers={
    "accept-ranges":"bytes",
    "cache-control":"private, no-store",
    "content-type":contentTypeFor(filePath),
    ...(download?{"content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`}: {})
  };
  if(range){
    const m=/bytes=(\d*)-(\d*)/.exec(range);
    if(!m)return json(res,416,{message:"range نامعتبر است"});
    const start=m[1]?Number(m[1]):0;
    const end=m[2]?Math.min(Number(m[2]),st.size-1):st.size-1;
    if(start>end||start>=st.size)return json(res,416,{message:"range نامعتبر است"});
    res.writeHead(206,{...headers,"content-range":`bytes ${start}-${end}/${st.size}`,"content-length":end-start+1});
    return createReadStream(filePath,{start,end}).pipe(res);
  }
  res.writeHead(200,{...headers,"content-length":st.size});
  return createReadStream(filePath).pipe(res);
}

function canManageCourses(user) {
  return ["teacher","admin"].includes(accessLevel(user));
}

async function canAccessMediaAsset(accessToken,user,assetId) {
  if(canAdmin(user)) return true;
  if(accessLevel(user)!=="student") return false;
  try{
    const q=new URLSearchParams({
      "filter[media_asset][_eq]":String(assetId),
      fields:"lesson.section.course",
      limit:"20"
    });
    const blocks=await directusRequest(accessToken,`/items/learning_lesson_blocks?${q.toString()}`);
    const courseIds=[...new Set((Array.isArray(blocks)?blocks:[]).map(block=>Number(block?.lesson?.section?.course)).filter(Boolean))];
    for(const courseId of courseIds){
      const enrollQ=new URLSearchParams({
        "filter[student][_eq]":String(user.id),
        "filter[course][_eq]":String(courseId),
        "filter[status][_in]":"active,completed",
        fields:"id",
        limit:"1"
      });
      const rows=await directusRequest(accessToken,`/items/learning_enrollments?${enrollQ.toString()}`);
      if(Array.isArray(rows)&&rows.length)return true;
    }
  }catch(error){
    console.error("media access check failed",assetId,error.message);
  }
  return false;
}

function convertedPathForAsset(asset) {
  const dir=path.join(CONVERTED_DIR,String(asset.id));
  if(asset.kind==="video") return path.join(dir,"video.mp4");
  if(asset.kind==="audio") return path.join(dir,"audio.m4a");
  return path.join(dir,sanitizeFileName(asset.original_name||"file"));
}

function normalizeSlug(value="") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g,"-")
    .replace(/[^\p{L}\p{N}-]+/gu,"")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
}

function normalizeContactPhone(value="") {
  let phone=String(value||"").replace(/[^0-9+]/g,"").trim();
  if(phone.startsWith("+98")) phone="0"+phone.slice(3);
  if(phone.startsWith("0098")) phone="0"+phone.slice(4);
  if(phone.startsWith("98") && phone.length===12) phone="0"+phone.slice(2);
  return phone;
}

function splitFullName(value="") {
  const parts=String(value||"").trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return {first_name:"Student",last_name:""};
  return {first_name:parts[0],last_name:parts.slice(1).join(" ")};
}

function temporaryStudentPassword() {
  return randomBytes(15).toString("base64url")+"A9!";
}

async function getCourseRegistration(token,id) {
  const fields=[
    "id","registration_status","course_slug","full_name","phone","phone_normalized","email",
    "age_range","education_level","field_of_study","job_title","ai_familiarity","ai_usage",
    "programming_level","goals","goals_text","desired_project","payment_preference",
    "agreed_amount","paid_amount","remaining_amount","source","referrer","utm_source",
    "utm_medium","utm_campaign","ip_address","user_agent","crm_contact","student_user",
    "confirmed_at","confirmed_by","date_created","date_updated"
  ].join(",");
  return await directusRequest(token,"/items/course_registrations/"+encodeURIComponent(id)+"?fields="+encodeURIComponent(fields));
}

function crmContactPayloadFromRegistration(registration) {
  const payload={
    full_name:String(registration.full_name||"").trim(),
    phone:String(registration.phone||"").trim()||null,
    phone_normalized:normalizeContactPhone(registration.phone_normalized||registration.phone)||null,
    email:String(registration.email||"").trim().toLowerCase()||null,
    age_range:registration.age_range||null,
    job_title:registration.job_title||null,
    specialty:registration.field_of_study||null,
    education_level:registration.education_level||null,
    field_of_study:registration.field_of_study||null,
    source:"course_registration"
  };
  return payload;
}

async function findCrmContact(token,registration) {
  if(registration.crm_contact){
    try{
      return await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(registration.crm_contact)+"?fields=*");
    }catch(error){
      if(Number(error?.status)!==404) throw error;
    }
  }

  const email=String(registration.email||"").trim().toLowerCase();
  if(email){
    const q=new URLSearchParams({"filter[email][_eq]":email,fields:"*",limit:"1"});
    const rows=await directusRequest(token,"/items/crm_contacts?"+q.toString());
    if(Array.isArray(rows)&&rows[0]) return rows[0];
  }

  const phone=normalizeContactPhone(registration.phone_normalized||registration.phone);
  if(phone){
    const q=new URLSearchParams({"filter[phone_normalized][_eq]":phone,fields:"*",limit:"1"});
    const rows=await directusRequest(token,"/items/crm_contacts?"+q.toString());
    if(Array.isArray(rows)&&rows[0]) return rows[0];
  }

  return null;
}

async function ensureCrmContact(token,registration,{student=false}={}) {
  const existing=await findCrmContact(token,registration);
  const mapped=crmContactPayloadFromRegistration(registration);
  if(existing){
    const payload={};
    for(const [key,value] of Object.entries(mapped)){
      if(value!==null && value!=="" && value!==undefined) payload[key]=value;
    }
    if(student && !["student","customer"].includes(String(existing.contact_status||""))) payload.contact_status="student";
    const data=Object.keys(payload).length
      ? await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(existing.id),{method:"PATCH",body:JSON.stringify(payload)})
      : existing;
    return data;
  }

  return await directusRequest(token,"/items/crm_contacts",{
    method:"POST",
    body:JSON.stringify({...mapped,contact_status:student?"student":"contact"})
  });
}

async function directusRequest(accessToken, path, options={}) {
  const response=await fetch(CMS + path,{
    ...options,
    headers:{
      "content-type":"application/json",
      authorization:`Bearer ${accessToken}`,
      ...(options.headers||{})
    }
  });
  const text=await response.text();
  let payload=null;
  if(text){ try{ payload=JSON.parse(text); }catch{ payload=text; } }
  if(!response.ok){
    const message=payload?.errors?.[0]?.message || payload?.message || "Directus request failed";
    throw Object.assign(new Error(message),{status:response.status,payload});
  }
  return payload?.data ?? payload;
}

async function webinarDirectusRequest(accessToken, path, options={}) {
  const response=await fetch(WEBINAR_CMS + path,{
    ...options,
    headers:{
      "content-type":"application/json",
      authorization:`Bearer ${accessToken}`,
      ...(options.headers||{})
    }
  });
  const text=await response.text();
  let payload=null;
  if(text){ try{ payload=JSON.parse(text); }catch{ payload=text; } }
  if(!response.ok){
    const message=payload?.errors?.[0]?.message || payload?.message || "Learn Directus request failed";
    throw Object.assign(new Error(message),{status:response.status,payload});
  }
  return payload?.data ?? payload;
}

async function webinarRequest(req,res,path,options={}) {
  const jar=cookies(req);
  let access=jar.webinar_access || (CMS===WEBINAR_CMS ? jar.learn_access : "");
  let refresh=jar.webinar_refresh || (CMS===WEBINAR_CMS ? jar.learn_refresh : "");
  if(!access) throw Object.assign(new Error("Learn CMS authentication required"),{status:401,refreshRequired:true});

  try{
    return await webinarDirectusRequest(access,path,options);
  }catch(error){
    if(Number(error?.status)!==401 || !refresh) throw error;
  }

  const auth=await refreshWebinarCms(refresh);
  const normalized={...auth,refresh_token:auth?.refresh_token||refresh};
  if(res && !res.headersSent) res.setHeader("set-cookie",await webinarAuthCookieHeaders(normalized,refresh));
  return await webinarDirectusRequest(normalized.access_token,path,options);
}

async function uniqueCourseSlug(accessToken, requested, title, excludeId=null) {
  const base=normalizeSlug(requested || title) || `course-${Date.now()}`;
  for(let n=1;n<=50;n++){
    const candidate=n===1?base:`${base}-${n}`;
    const q=new URLSearchParams({
      "filter[slug][_eq]":candidate,
      fields:"id",
      limit:"1"
    });
    if(excludeId) q.set("filter[id][_neq]",String(excludeId));
    const found=await directusRequest(accessToken,`/items/learning_courses?${q.toString()}`);
    if(!Array.isArray(found) || found.length===0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function normalizeLandingPage(value="") {
  const landing=String(value||"").trim();
  if(!landing)return null;
  if(!/^\/(?!\/)[^\s]*$/.test(landing)){
    throw Object.assign(new Error("invalid landing page"),{status:400});
  }
  return landing;
}

async function ensureCourseLandingField(accessToken) {
  const fieldPath="/fields/learning_courses/landing_page";
  const check=await fetch(CMS+fieldPath,{headers:{authorization:`Bearer ${accessToken}`}});
  if(check.ok)return;
  if(check.status!==404){
    const message=await check.text();
    throw Object.assign(new Error(message||"cannot inspect landing_page field"),{status:check.status});
  }
  const create=await fetch(CMS+"/fields/learning_courses",{
    method:"POST",
    headers:{"content-type":"application/json",authorization:`Bearer ${accessToken}`},
    body:JSON.stringify({
      field:"landing_page",
      type:"string",
      meta:{
        interface:"input",
        width:"full",
        note:"Landing page path, e.g. /build-with-ai"
      },
      schema:{is_nullable:true,max_length:255}
    })
  });
  if(!create.ok){
    const message=await create.text();
    throw Object.assign(new Error(message||"cannot create landing_page field"),{status:create.status});
  }
}

const css = `
:root{font-family:Vazirmatn,IRANSans,system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:#f7f8fc}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 85% 0,#eef2ff 0,transparent 30%),#f7f8fc}
a{color:inherit;text-decoration:none}.shell{min-height:100vh;display:flex;flex-direction:column}
header{height:72px;background:#fff;border-bottom:1px solid #e7eaf0;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,5vw,72px);position:sticky;top:0;z-index:10}
.brand{font-weight:900;font-size:20px}.brand small{display:block;font-weight:500;font-size:11px;color:#64748b;margin-top:2px}
main{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:56px 0 80px}.card{background:#fff;border:1px solid #e4e8f0;border-radius:28px;box-shadow:0 18px 60px rgba(15,23,42,.07)}
.login{width:min(480px,100%);margin:30px auto 0;padding:32px}.eyebrow{color:#4f46e5;font-weight:900;font-size:13px}.login h1{font-size:30px;margin:8px 0 10px}.muted{color:#64748b;line-height:1.9}.field{display:block;margin-top:20px;font-size:13px;font-weight:800}.field input{width:100%;height:52px;border:1px solid #d9e0ea;border-radius:16px;margin-top:8px;padding:0 15px;font:inherit;outline:none;background:#fbfcfe}.field input:focus{border-color:#6366f1;box-shadow:0 0 0 4px #eef2ff}
button,.btn{border:0;border-radius:16px;height:52px;padding:0 22px;font:inherit;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.primary{width:100%;background:#4f46e5;color:#fff;margin-top:24px}.secondary{background:#eef2ff;color:#3730a3}.danger{background:#fff1f2;color:#be123c}
.error{display:none;margin-top:16px;padding:13px 15px;border-radius:14px;background:#fff1f2;color:#be123c;font-size:13px;font-weight:800}.error.show{display:block}
.top-actions{display:flex;gap:10px;align-items:center}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:30px}.hero h1{font-size:38px;margin:0 0 12px}.badge{display:inline-flex;padding:8px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;font-weight:900;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}.panel-card{padding:24px}.panel-card b{display:block;font-size:18px;margin-bottom:8px}.who{margin-top:26px;padding:22px;display:flex;align-items:center;justify-content:space-between}.avatar{width:52px;height:52px;border-radius:18px;background:#4f46e5;color:white;display:grid;place-items:center;font-size:21px;font-weight:900}.profile{display:flex;gap:14px;align-items:center}.ltr{direction:ltr;text-align:left}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.auth-foot{margin-top:20px;text-align:center;color:#64748b;font-size:13px}.auth-foot a{color:#4338ca;font-weight:900}.hint{font-size:12px;color:#94a3b8;margin-top:7px;line-height:1.8}.success{display:none;margin-top:16px;padding:13px 15px;border-radius:14px;background:#ecfdf5;color:#047857;font-size:13px;font-weight:800}.success.show{display:block}.primary[disabled]{opacity:.65;cursor:not-allowed}
@media(max-width:760px){.form-row{grid-template-columns:1fr}header{padding:0 18px}.grid{grid-template-columns:1fr}.hero{display:block}.hero h1{font-size:30px}.top-actions{margin-top:18px}.who{align-items:flex-start;gap:18px;flex-direction:column}.login{padding:24px}}
body.is-embedded{background:transparent}.embedded-shell{min-height:auto}.embedded-main{width:100%;max-width:520px;margin:0 auto;padding:0}.is-embedded .login{width:100%;margin:0;border:0;border-radius:22px;box-shadow:none}.is-embedded .login h1{font-size:26px}.is-embedded .muted{font-size:13px}
`;

function layout(title, body, embedded=false) {
  const header=embedded?"":`<header><a class="brand" href="/clients">آپدیت شید<small>Learning Center</small></a><div class="top-actions"><a href="/clients" class="btn secondary">پنل کاربر</a><a href="/admin" class="btn secondary">پنل مدرس</a></div></header>`;
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Updateshid Learn</title><style>${css}</style></head><body class="${embedded?"is-embedded":""}"><div class="shell ${embedded?"embedded-shell":""}">${header}<main class="${embedded?"embedded-main":""}">${body}</main></div></body></html>`;
}

function loginPage(target, denied=false, embedded=false) {
  const isAdmin=target==="admin";
  return layout(isAdmin?"ورود مدرس":"ورود کاربر",`
    <section class="card login">
      <div class="eyebrow">${isAdmin?"TEACHER / ADMIN":"CLIENT"}</div>
      <h1>${isAdmin?"ورود به پنل مدرس":"ورود به پنل کاربر"}</h1>
      <p class="muted">با حساب Learn خود وارد شوید. احراز هویت و داده‌های این سامانه فقط از CMS داخلی Learn استفاده می‌کنند.</p>
      ${denied?'<div class="error show">این حساب دسترسی Teacher یا بالاتر ندارد.</div>':""}
      <form id="login-form">
        <label class="field">نام کاربری (ایمیل Directus)<input class="ltr" name="identifier" type="email" autocomplete="username" required></label>
        <label class="field">رمز عبور<input class="ltr" name="password" type="password" autocomplete="current-password" required></label>
        <div id="error" class="error"></div>
        <button class="primary" type="submit">ورود</button>
      </form>
      ${isAdmin?"":`<div class="auth-foot">حساب کاربری ندارید؟ <a href="/register${embedded?"?embed=1":""}">ثبت نام کنید</a></div>`}
    </section>
    <script>
      const form=document.getElementById("login-form"), err=document.getElementById("error");
      form.addEventListener("submit",async(e)=>{
        e.preventDefault(); err.className="error";
        const fd=new FormData(form);
        const res=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier:fd.get("identifier"),password:fd.get("password"),target:"${target}"})});
        const data=await res.json().catch(()=>({}));
        if(res.ok){
          const redirect=data.redirect||"/clients";
          if(${embedded?"true":"false"} && window.parent!==window){
            window.parent.postMessage({type:"updateshid-auth-success",redirect:new URL(redirect,location.origin).href},"*");
            return;
          }
          location.href=redirect; return;
        }
        err.textContent=data.message||"ورود انجام نشد."; err.className="error show";
      });
    </script>
  `, embedded);
}



function registerPage(embedded=false) {
  return layout("ثبت نام",`
    <section class="card login">
      <div class="eyebrow">CREATE ACCOUNT</div>
      <h1>ساخت حساب کاربری</h1>
      <p class="muted">برای استفاده از دوره ها و پنل آموزشی، حساب کاربری خود را بسازید.</p>
      <form id="register-form">
        <div class="form-row">
          <label class="field">نام<input name="first_name" autocomplete="given-name" maxlength="80" required></label>
          <label class="field">نام خانوادگی<input name="last_name" autocomplete="family-name" maxlength="80" required></label>
        </div>
        <label class="field">ایمیل<input class="ltr" name="email" type="email" autocomplete="email" required></label>
        <label class="field">رمز عبور<input class="ltr" name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <div class="hint">حداقل ۸ کاراکتر؛ بهتر است از حروف، عدد و نشانه ها استفاده کنید.</div>
        <label class="field">تکرار رمز عبور<input class="ltr" name="password_confirm" type="password" autocomplete="new-password" minlength="8" required></label>
        <div id="error" class="error"></div>
        <div id="success" class="success"></div>
        <button id="submit" class="primary" type="submit">ساخت حساب کاربری</button>
      </form>
      <div class="auth-foot">قبلا ثبت نام کرده اید؟ <a href="/clients${embedded?"?embed=1":""}">وارد شوید</a></div>
    </section>
    <script>
      const form=document.getElementById("register-form");
      const err=document.getElementById("error");
      const ok=document.getElementById("success");
      const btn=document.getElementById("submit");
      form.addEventListener("submit",async(e)=>{
        e.preventDefault();
        err.className="error";
        ok.className="success";
        const fd=new FormData(form);
        const password=String(fd.get("password")||"");
        const confirm=String(fd.get("password_confirm")||"");
        if(password!==confirm){
          err.textContent="رمز عبور و تکرار آن یکسان نیست.";
          err.className="error show";
          return;
        }
        btn.disabled=true;
        btn.textContent="در حال ساخت حساب...";
        try{
          const res=await fetch("/api/register",{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({
              first_name:fd.get("first_name"),
              last_name:fd.get("last_name"),
              email:fd.get("email"),
              password
            })
          });
          const data=await res.json().catch(()=>({}));
          if(!res.ok){
            err.textContent=data.message||"ثبت نام انجام نشد.";
            err.className="error show";
            return;
          }
          if(data.redirect){
            if(${embedded?"true":"false"} && window.parent!==window){
              window.parent.postMessage({type:"updateshid-auth-success",redirect:new URL(data.redirect,location.origin).href},"*");
              return;
            }
            location.href=data.redirect;
            return;
          }
          ok.textContent=data.message||"حساب شما ساخته شد. حالا می توانید وارد شوید.";
          ok.className="success show";
          form.reset();
        }catch{
          err.textContent="ارتباط با سرور برقرار نشد. دوباره تلاش کنید.";
          err.className="error show";
        }finally{
          btn.disabled=false;
          btn.textContent="ساخت حساب کاربری";
        }
      });
    </script>
  `, embedded);
}

const ADMIN_VIEW_IDS = new Set([
  "dashboard","calendar","tasks","webinars","webinar-registrations","courses","runs","content","assignments","live","certificates",
  "students","contacts","crm-reports","contact-detail","teachers","enrollments","groups","announcements","discussions","notifications","support",
  "orders","payments","coupons","refunds","analytics","progress","engagement","exports",
  "roles","integrations","audit","settings"
]);

function adminDashboard(user, currentView="dashboard", selectedContactId=null) {
  const activeView=ADMIN_VIEW_IDS.has(currentView)?currentView:"dashboard";
  const activeNavView=activeView==="contact-detail"?"contacts":activeView;
  const name=[user.first_name,user.last_name].filter(Boolean).join(" ") || user.email;
  const initial=(name.trim()[0]||"U").toUpperCase();
  const level=accessLevel(user);
  const levelLabel={admin:"ادمین",teacher:"مدرس",support:"پشتیبانی"}[level] || "کاربر";

  const adminCss = `
  :root{
    --bg:#f5f7fb;--panel:#fff;--line:#e7eaf1;--text:#111827;--muted:#6b7280;
    --primary:#4f46e5;--primary-soft:#eef2ff;--success:#0f9f6e;--warning:#d97706;
    --danger:#dc2626;--sidebar:#101827;--sidebar-2:#172033;--shadow:0 10px 30px rgba(15,23,42,.07)
  }
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;font-family:Vazirmatn,IRANSans,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
  button,input,select,textarea{font:inherit}
  button{cursor:pointer}
  a{text-decoration:none;color:inherit}
  .admin-shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 286px;direction:ltr}
  .admin-sidebar{direction:rtl;background:linear-gradient(180deg,var(--sidebar),#0b1220);color:#dbe3f0;position:fixed;right:0;top:0;bottom:0;width:286px;display:flex;flex-direction:column;z-index:50;border-left:1px solid rgba(255,255,255,.05)}
  .side-head{height:78px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08)}
  .brand-mark{display:flex;align-items:center;gap:12px}.brand-logo{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-weight:1000;color:#fff;box-shadow:0 8px 24px rgba(99,102,241,.35)}
  .brand-copy b{display:block;color:#fff;font-size:15px}.brand-copy span{font-size:11px;color:#8ea0bd}
  .side-scroll{padding:16px 12px 24px;overflow:auto;flex:1}
  .nav-section{margin:18px 0 8px;padding:0 10px;color:#71809a;font-size:10px;font-weight:900;letter-spacing:.08em}
  .nav-item{width:100%;border:0;background:transparent;color:#b9c5d7;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;margin:3px 0;text-align:right;transition:.18s}
  .nav-item:hover{background:rgba(255,255,255,.06);color:#fff}.nav-item.active{background:linear-gradient(90deg,rgba(99,102,241,.24),rgba(99,102,241,.11));color:#fff;box-shadow:inset -3px 0 #818cf8}
  .nav-item .ico{width:20px;height:20px;display:grid;place-items:center;font-size:16px;opacity:.95}.nav-item .label{flex:1;font-size:13px;font-weight:800}.nav-item .count{min-width:24px;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.08);font-size:10px;text-align:center;color:#cdd7e6}
  .side-user{padding:14px;border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:10px}.avatar{width:40px;height:40px;border-radius:12px;background:#6366f1;color:#fff;display:grid;place-items:center;font-weight:1000}.side-user .meta{min-width:0;flex:1}.side-user b{display:block;color:#fff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.side-user small{color:#8290a7;font-size:10px}
  .admin-main{direction:rtl;grid-column:1;padding-right:0;min-width:0}
  .topbar{height:78px;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:0 28px;position:sticky;top:0;z-index:30}
  .menu-toggle{display:none;border:0;background:#f3f4f6;width:42px;height:42px;border-radius:12px}
  .searchbox{position:relative;flex:1;max-width:560px}.searchbox input{width:100%;height:44px;border:1px solid #e3e7ee;background:#f8fafc;border-radius:13px;padding:0 44px 0 14px;outline:none}.searchbox input:focus{background:#fff;border-color:#a5b4fc;box-shadow:0 0 0 4px #eef2ff}.search-ico{position:absolute;right:14px;top:12px;color:#94a3b8}
  #live-date-clock{display:none!important}.top-spacer{flex:1}.top-action{height:42px;border:1px solid var(--line);background:#fff;border-radius:12px;padding:0 13px;display:inline-flex;align-items:center;gap:8px;color:#374151;font-weight:800;font-size:12px}.top-action.primary{border-color:transparent;background:var(--primary);color:#fff}.top-action.icon-only{width:42px;padding:0;justify-content:center;position:relative}.dot{position:absolute;width:8px;height:8px;background:#ef4444;border-radius:50%;right:8px;top:8px;border:2px solid #fff}
  .page-wrap{padding:28px;max-width:1700px;margin:0 auto}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}.page-head h1{margin:0;font-size:28px;letter-spacing:-.02em}.page-head p{margin:7px 0 0;color:var(--muted);font-size:13px}.head-actions{display:flex;gap:9px;flex-wrap:wrap}
  .workspace{display:none}.workspace.active{display:block}
  .grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .stat-card,.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}.stat-card{padding:18px}.stat-top{display:flex;align-items:center;justify-content:space-between}.stat-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#f3f4f6;font-size:18px}.stat-card strong{display:block;font-size:25px;margin-top:13px}.stat-card .meta-line{display:flex;align-items:center;gap:8px;margin-top:8px;color:var(--muted);font-size:11px}.up{color:#059669;font-weight:900}.down{color:#dc2626;font-weight:900}
  .card{padding:20px}.card-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.card-title h3{margin:0;font-size:15px}.card-title small{color:var(--muted)}
  .chart{height:220px;display:flex;align-items:flex-end;gap:9px;border-bottom:1px solid #eef0f4;padding-top:20px}.bar{flex:1;min-width:8px;border-radius:8px 8px 2px 2px;background:linear-gradient(180deg,#6366f1,#a5b4fc);position:relative}.bar:hover:after{content:attr(data-v);position:absolute;top:-26px;right:50%;transform:translateX(50%);background:#111827;color:#fff;padding:4px 6px;border-radius:6px;font-size:9px;white-space:nowrap}
  .donut-wrap{display:flex;align-items:center;gap:28px;padding:14px 6px}.donut{width:140px;height:140px;border-radius:50%;background:conic-gradient(#4f46e5 0 62%,#22c55e 62% 79%,#f59e0b 79% 91%,#e5e7eb 91%);position:relative}.donut:after{content:"62%";position:absolute;inset:22px;background:#fff;border-radius:50%;display:grid;place-items:center;font-size:23px;font-weight:1000}.legend{display:grid;gap:10px}.legend span{display:flex;align-items:center;gap:8px;color:#4b5563;font-size:12px}.legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
  .quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.quick{border:1px solid var(--line);background:#fff;border-radius:14px;padding:14px;text-align:right;transition:.18s}.quick:hover{border-color:#c7d2fe;transform:translateY(-2px);box-shadow:0 10px 24px rgba(79,70,229,.08)}.quick b{display:block;font-size:12px;margin-top:9px}.quick span{color:var(--muted);font-size:10px}
  .table-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}.table-tools{padding:15px 17px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line)}.table-tools input,.table-tools select{height:38px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:0 11px;outline:none;color:#374151}.table-tools input{min-width:230px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:760px}th,td{padding:13px 16px;border-bottom:1px solid #f0f2f5;text-align:right;font-size:12px}th{background:#fafbfc;color:#64748b;font-size:10px;font-weight:900;white-space:nowrap}tr:hover td{background:#fafbff}
  .person{display:flex;align-items:center;gap:9px}.mini-avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:#eef2ff;color:#4338ca;font-weight:900}.person b{display:block;font-size:11px}.person small{color:#9ca3af;font-size:9px}
  .status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;background:#f3f4f6;color:#4b5563}.status:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.status.green{background:#ecfdf5;color:#059669}.status.orange{background:#fff7ed;color:#d97706}.status.red{background:#fff1f2;color:#dc2626}.status.blue{background:#eef2ff;color:#4f46e5}
  .progress{height:7px;background:#eef0f4;border-radius:999px;overflow:hidden}.progress i{display:block;height:100%;background:#6366f1;border-radius:999px}
  .kanban{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:12px;overflow:auto;padding-bottom:8px}.kan-col{background:#f7f8fb;border:1px solid #eaedf2;border-radius:16px;padding:12px}.kan-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:900;margin-bottom:10px}.kan-item{background:#fff;border:1px solid #e7eaf0;border-radius:13px;padding:12px;margin:9px 0;box-shadow:0 5px 15px rgba(15,23,42,.04)}.kan-item b{display:block;font-size:11px}.kan-item p{margin:7px 0;color:#6b7280;font-size:10px;line-height:1.7}.kan-meta{display:flex;justify-content:space-between;align-items:center;color:#9ca3af;font-size:9px}
  .content-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.content-toolbar select{height:42px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:0 12px;min-width:260px}.content-layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:14px}.outline-card,.lesson-card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}.outline-head,.lesson-head{padding:15px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.outline-body{padding:10px;max-height:680px;overflow:auto}.section-box{border:1px solid #edf0f4;border-radius:14px;margin-bottom:10px;overflow:hidden}.section-title{padding:11px 12px;background:#fafbfc;font-size:11px;font-weight:900;display:flex;justify-content:space-between}.lesson-item{width:100%;border:0;background:#fff;padding:10px 12px;text-align:right;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f2f3f6}.lesson-item:hover,.lesson-item.active{background:#eef2ff;color:#3730a3}.lesson-main{padding:18px}.lesson-empty{padding:70px 20px;text-align:center;color:#94a3b8}.block-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.block-list{display:grid;gap:10px}.block-item{border:1px solid #e6e9ef;border-radius:14px;padding:14px;background:#fff}.block-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.block-type{font-size:9px;font-weight:900;border-radius:999px;background:#eef2ff;color:#4338ca;padding:5px 8px}.block-item p{font-size:11px;line-height:1.9;color:#4b5563}.media-info{margin-top:10px;padding:10px;border-radius:11px;background:#f8fafc;font-size:10px;color:#64748b;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tiny-actions{display:flex;gap:6px}.tiny-btn{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:6px 9px;font-size:9px;font-weight:800}.tiny-btn.ok{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.processing{color:#d97706}.failed{color:#dc2626}.ready{color:#059669}@media(max-width:1000px){.content-layout{grid-template-columns:1fr}}
    .course-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.course-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}.course-cover{height:118px;padding:16px;display:flex;align-items:flex-end;background:linear-gradient(135deg,#312e81,#6366f1);color:#fff}.course-card:nth-child(2) .course-cover{background:linear-gradient(135deg,#0f766e,#14b8a6)}.course-card:nth-child(3) .course-cover{background:linear-gradient(135deg,#9a3412,#f97316)}.course-body{padding:15px}.course-body h3{font-size:13px;margin:0 0 11px}.course-stats{display:flex;justify-content:space-between;color:#6b7280;font-size:10px;margin-top:12px}
  .empty-module{min-height:420px;background:#fff;border:1px solid var(--line);border-radius:20px;display:grid;place-items:center;text-align:center;padding:40px;box-shadow:var(--shadow)}.empty-module .big-icon{width:72px;height:72px;border-radius:22px;background:#eef2ff;display:grid;place-items:center;font-size:30px;margin:0 auto 18px}.empty-module h2{font-size:19px;margin:0}.empty-module p{color:#6b7280;max-width:520px;line-height:2;font-size:12px;margin:10px auto 20px}
  .activity{display:grid;gap:1px}.activity-row{display:grid;grid-template-columns:40px 1fr auto;gap:11px;padding:12px 0;border-bottom:1px solid #f0f2f5;align-items:center}.activity-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#f4f5f8}.activity-row b{font-size:11px}.activity-row p{margin:3px 0 0;font-size:10px;color:#6b7280}.activity-row time{font-size:9px;color:#9ca3af}
  .modal-backdrop{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:80;padding:24px;align-items:center;justify-content:center}.modal-backdrop.show{display:flex}.modal{width:min(720px,100%);max-height:calc(100vh - 48px);overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.28);border:1px solid #e5e7eb}.modal-head{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.modal-head h2{margin:0;font-size:18px}.modal-close{width:38px;height:38px;border:0;border-radius:11px;background:#f3f4f6;font-size:18px}.modal-body{padding:22px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-field{display:grid;gap:7px}.form-field.full{grid-column:1/-1}.form-field label{font-size:11px;font-weight:900;color:#374151}.form-field input,.form-field textarea,.form-field select{width:100%;border:1px solid #dfe3ea;border-radius:11px;background:#fff;padding:10px 12px;outline:none}.form-field input,.form-field select{height:44px}.form-field textarea{min-height:92px;resize:vertical}.form-field input:focus,.form-field textarea:focus,.form-field select:focus{border-color:#818cf8;box-shadow:0 0 0 4px #eef2ff}.modal-foot{padding:16px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-start;gap:10px}.form-error{display:none;padding:10px 12px;border-radius:10px;background:#fff1f2;color:#be123c;font-size:11px;margin-bottom:14px}.form-error.show{display:block}.loading-row{text-align:center;padding:32px;color:#64748b}.empty-row{text-align:center;padding:32px;color:#94a3b8}.course-price{direction:ltr;display:inline-block}
  .course-registration-name{border:0;background:transparent;padding:0;text-align:right;font:inherit;font-weight:900;color:#111827;cursor:pointer}.course-registration-name:hover{color:#4f46e5;text-decoration:underline;text-underline-offset:3px}
  .crm-report-form-card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:20px;margin-bottom:16px}.crm-report-form-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.crm-autocomplete{position:relative}.crm-autocomplete-results{display:none;position:absolute;top:72px;right:0;left:0;background:#fff;border:1px solid #dfe3ea;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.14);z-index:25;max-height:260px;overflow:auto}.crm-autocomplete-results.show{display:block}.crm-autocomplete-item{width:100%;border:0;border-bottom:1px solid #f1f3f6;background:#fff;text-align:right;padding:10px 12px;display:block}.crm-autocomplete-item:last-child{border-bottom:0}.crm-autocomplete-item:hover{background:#f8faff}.crm-autocomplete-item b{display:block;font-size:11px}.crm-autocomplete-item small{display:block;margin-top:3px;color:#94a3b8;font-size:9px;direction:ltr;text-align:right}.crm-report-form-message{display:none;margin-top:12px;padding:10px 12px;border-radius:10px;font-size:11px}.crm-report-form-message.show{display:block}.crm-report-form-message.ok{background:#ecfdf5;color:#047857}.crm-report-form-message.error{background:#fff1f2;color:#be123c}.crm-report-text-cell{max-width:420px;white-space:normal;line-height:1.9;color:#475569}.crm-next-action-cell{max-width:340px;white-space:normal;line-height:1.9;color:#374151}.crm-chip{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:8px;font-weight:900;margin-top:4px}.crm-chip.student{background:#ecfdf5;color:#047857}.course-registration-modal{width:min(1040px,100%)}.crm-panel{margin-top:18px;border:1px solid #e5e7eb;border-radius:15px;background:#fafbfc;padding:15px}.crm-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.crm-panel-head h3{margin:0;font-size:13px}.crm-state{font-size:10px;color:#64748b}.crm-report-list{display:grid;gap:8px;margin:10px 0}.crm-report-item{border:1px solid #e5e7eb;background:#fff;border-radius:11px;padding:10px 12px}.crm-report-item b{font-size:10px}.crm-report-item p{font-size:10px;line-height:1.8;color:#475569;margin:6px 0}.crm-report-item small{font-size:8px;color:#94a3b8}.crm-action-row{display:flex;gap:8px;flex-wrap:wrap}.top-action.success{background:#059669;color:#fff;border-color:#059669}.top-action.warning{background:#fff7ed;color:#b45309;border-color:#fed7aa}.course-registration-result{display:none;margin-bottom:14px;padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.9}.course-registration-result.show{display:block}.course-registration-result.success{background:#ecfdf5;color:#047857}.course-registration-result.error{background:#fff1f2;color:#be123c}
  .course-status-picker{height:30px;border:1px solid #e5e7eb;border-radius:999px;padding:0 10px;background:#f3f4f6;color:#4b5563;font:inherit;font-size:10px;font-weight:900;cursor:pointer;outline:none}.course-status-picker.green{background:#ecfdf5;color:#059669;border-color:#a7f3d0}.course-status-picker.orange{background:#fff7ed;color:#d97706;border-color:#fed7aa}.course-status-picker:focus{box-shadow:0 0 0 4px #eef2ff;border-color:#818cf8}.course-status-picker:disabled{opacity:.65;cursor:wait}
  .course-title-edit{border:0;background:transparent;padding:0;height:auto;min-height:0;font:inherit;font-weight:900;color:inherit;text-align:right;cursor:pointer}.course-title-edit:hover{color:#4f46e5;text-decoration:underline;text-underline-offset:3px}
  .course-action-picker{width:52px;height:30px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;color:#64748b;font:inherit;font-size:11px;font-weight:900;cursor:pointer;outline:none;padding:0 7px}.course-action-picker:hover,.course-action-picker:focus{background:#f8fafc;border-color:#c7d2fe;box-shadow:0 0 0 4px #eef2ff}
    .calendar-shell{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
    .calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--line)}
    .calendar-title-wrap{display:flex;align-items:center;gap:12px;min-width:0}.calendar-title{margin:0;font-size:20px;font-weight:1000}.calendar-subtitle{font-size:11px;color:var(--muted);margin-top:3px}
    .calendar-nav{display:flex;align-items:center;gap:8px}.calendar-nav button{border:1px solid var(--line);background:#fff;color:#334155;border-radius:10px;min-width:38px;height:38px;padding:0 12px;font-weight:900}.calendar-nav button:hover{background:#f8fafc}.calendar-nav .today-btn{min-width:auto}
    .calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));direction:rtl}
    .calendar-weekday{padding:12px 8px;background:#f8fafc;border-bottom:1px solid var(--line);border-left:1px solid var(--line);font-size:11px;font-weight:900;color:#64748b;text-align:center}.calendar-weekday:last-child{border-left:0}
    .calendar-day{min-height:116px;padding:10px;border-bottom:1px solid var(--line);border-left:1px solid var(--line);background:#fff;position:relative}.calendar-day:nth-child(7n){border-left:0}.calendar-day.empty{background:#fafbfc}.calendar-day.today{background:#f5f7ff;box-shadow:inset 0 0 0 2px #818cf8}.calendar-day.friday .day-number{color:#dc2626}
    .day-number{width:29px;height:29px;border-radius:9px;display:grid;place-items:center;font-size:12px;font-weight:1000;color:#111827}.calendar-day.today .day-number{background:#4f46e5;color:#fff}
    .day-events{margin-top:8px;display:flex;flex-direction:column;gap:5px}.calendar-empty-note{font-size:9px;color:#cbd5e1}
    .calendar-event{display:block;padding:5px 7px;border-radius:7px;background:#eef2ff;color:#3730a3;font-size:9px;font-weight:900;line-height:1.45;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #e0e7ff}.calendar-event:hover{background:#e0e7ff}.calendar-event-time{font-weight:700;color:#6366f1;margin-left:4px}.calendar-loading{padding:10px 20px;font-size:10px;color:#64748b;border-top:1px solid var(--line)}.calendar-loading.error{color:#be123c;background:#fff1f2}
    @media(max-width:700px){.calendar-toolbar{align-items:flex-start;flex-direction:column}.calendar-nav{width:100%}.calendar-nav .today-btn{margin-right:auto}.calendar-day{min-height:82px;padding:7px}.calendar-weekday{font-size:9px;padding:10px 3px}.day-number{width:25px;height:25px;font-size:11px}}
    .calendar-head-actions{display:flex;gap:8px;align-items:center}
    .calendar-toolbar-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.calendar-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:900}.calendar-chip.live{background:#ecfdf5;color:#047857}
    .calendar-day{transition:.15s}.calendar-day:not(.empty):hover{background:#fafbff}.calendar-day-add{position:absolute;top:9px;left:9px;width:24px;height:24px;border:0;border-radius:7px;background:#f3f4f6;color:#64748b;font-size:15px;display:grid;place-items:center;opacity:0;transition:.15s}.calendar-day:hover .calendar-day-add{opacity:1}.calendar-day-add:hover{background:#e0e7ff;color:#4338ca}
    .calendar-event{cursor:pointer;text-align:right;width:100%}.calendar-event.is-all-day{background:#ecfdf5;border-color:#d1fae5;color:#047857}.calendar-event-location{display:block;font-size:8px;font-weight:700;opacity:.72;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .calendar-modal-backdrop{display:none;position:fixed;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(3px);z-index:120;align-items:center;justify-content:center;padding:18px}.calendar-modal-backdrop.show{display:flex}
    .calendar-modal{width:min(620px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.24)}
    .calendar-modal-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 22px;border-bottom:1px solid var(--line)}.calendar-modal-head h3{margin:0;font-size:18px}.calendar-modal-close{width:36px;height:36px;border:1px solid var(--line);border-radius:10px;background:#fff;color:#64748b}
    .calendar-form{padding:20px 22px;display:grid;gap:14px}.calendar-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.calendar-field{display:grid;gap:6px}.calendar-field.full{grid-column:1/-1}.calendar-field label{font-size:11px;font-weight:900;color:#475569}.calendar-field input,.calendar-field textarea{width:100%;border:1px solid #dfe3eb;border-radius:11px;padding:10px 12px;outline:none;background:#fff}.calendar-field input:focus,.calendar-field textarea:focus{border-color:#818cf8;box-shadow:0 0 0 4px #eef2ff}.calendar-field textarea{min-height:95px;resize:vertical}
    .calendar-check{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:900;color:#475569}.calendar-check input{width:16px;height:16px}.calendar-form-actions{display:flex;align-items:center;gap:8px;padding-top:4px}.calendar-form-actions .spacer{flex:1}.calendar-danger{border:1px solid #fecdd3;background:#fff1f2;color:#be123c;border-radius:10px;padding:9px 12px;font-weight:900}.calendar-save{border:0;background:#4f46e5;color:#fff;border-radius:10px;padding:10px 16px;font-weight:900}.calendar-open-google{border:1px solid var(--line);background:#fff;color:#475569;border-radius:10px;padding:9px 12px;font-weight:900}.calendar-form-message{display:none;padding:10px 12px;border-radius:10px;font-size:10px;font-weight:800}.calendar-form-message.show{display:block}.calendar-form-message.error{background:#fff1f2;color:#be123c}.calendar-form-message.success{background:#ecfdf5;color:#047857}
    @media(max-width:700px){.calendar-form-grid{grid-template-columns:1fr}.calendar-field.full{grid-column:auto}.calendar-day-add{opacity:1}.calendar-modal{border-radius:18px}.calendar-form-actions{flex-wrap:wrap}}
    .drawer-backdrop{display:none}
  @media(max-width:1180px){.grid-4{grid-template-columns:repeat(2,1fr)}.course-list{grid-template-columns:repeat(2,1fr)}.quick-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:900px){.admin-shell{display:block}.admin-sidebar{transform:translateX(105%);transition:.22s;width:286px}.admin-sidebar.open{transform:translateX(0)}.drawer-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:40}.drawer-backdrop.show{display:block}.menu-toggle{display:inline-grid;place-items:center}.topbar{padding:0 16px}.page-wrap{padding:20px 16px}.grid-3,.grid-2{grid-template-columns:1fr}.course-list{grid-template-columns:1fr}.page-head{flex-direction:column}.searchbox{max-width:none}.top-action.hide-sm{display:none}}
  @media(max-width:560px){.grid-4{grid-template-columns:1fr}.quick-grid{grid-template-columns:1fr 1fr}.page-head h1{font-size:23px}.top-spacer{display:none}.searchbox{display:none}}
  `;

  const menuGroups = [
    ["نمای کلی",[
      ["dashboard","⌂","داشبورد",""],
      ["calendar","◷","تقویم آموزشی","4"],
      ["tasks","✓","کارهای امروز","7"]
    ]],
    ["وبینار",[
      ["webinars","◉","وبینارها",""],
      ["webinar-registrations","↳","ثبت نام ها",""]
    ]],
    ["آموزش",[
      ["courses","▤","دوره ها","12"],
      ["runs","◫","دوره های در حال برگزاری","3"],
      ["content","▶","محتوا و درس ها",""],
      ["assignments","✎","تکالیف و تمرین ها","18"],
      ["live","●","کلاس های زنده","2"],
      ["certificates","◇","گواهی نامه ها",""]
    ]],
    ["CRM",[
      ["students","♙","دانشجوها",""],
      ["contacts","◎","کاربران",""],
      ["crm-reports","↳","گزارشات",""],
      ["teachers","♜","مدرس ها","8"],
      ["enrollments","↳","ثبت نام دوره ها",""],
      ["groups","◉","گروه ها و Cohort ها",""]
    ]],
    ["تعامل و ارتباط",[
      ["announcements","◔","اطلاعیه ها",""],
      ["discussions","☵","گفتگوها","13"],
      ["notifications","◌","اعلان ها",""],
      ["support","?","پشتیبانی و تیکت ها","6"]
    ]],
    ["فروش و مالی",[
      ["orders","▣","سفارش ها",""],
      ["payments","◈","پرداخت ها",""],
      ["coupons","%","کدهای تخفیف",""],
      ["refunds","↶","بازگشت وجه","2"]
    ]],
    ["گزارش ها",[
      ["analytics","⌁","تحلیل و گزارش ها",""],
      ["progress","◴","پیشرفت آموزشی",""],
      ["engagement","◒","تعامل دانشجوها",""],
      ["exports","⇩","خروجی ها",""]
    ]],
    ["سیستم",[
      ["roles","♢","نقش ها و دسترسی ها",""],
      ["integrations","⌘","اتصال ها",""],
      ["audit","≡","لاگ فعالیت",""],
      ["settings","⚙","تنظیمات",""]
    ]]
  ];

  const menuHtml=menuGroups.map(([group,items])=>`
    <div class="nav-section">${group}</div>
    ${items.map(([id,ico,label,count])=>`<a class="nav-item ${id===activeNavView?"active":""}" href="/admin/${id}" data-view="${id}"><span class="ico">${ico}</span><span class="label">${label}</span>${count?`<span class="count">${count}</span>`:""}</a>`).join("")}
  `).join("");

  const generic = (id,title,desc,icon,actions="") => `
    <section class="workspace" id="view-${id}">
      <div class="page-head">
        <div><h1>${title}</h1><p>${desc}</p></div>
        <div class="head-actions">${actions || '<button class="top-action">خروجی Excel</button><button class="top-action primary">+ ایجاد مورد جدید</button>'}</div>
      </div>
      <div class="empty-module">
        <div>
          <div class="big-icon">${icon}</div>
          <h2>${title}</h2>
          <p>این بخش از نظر ساختار UI و ناوبری آماده شده است. در فاز بک اند، داده های واقعی، فیلترها، فرم ها، اکشن ها و سطح دسترسی هر نقش به همین Workspace متصل می شوند.</p>
          <button class="top-action primary">مشاهده نمونه تعامل</button>
        </div>
      </div>
    </section>`;

  const coursesView=`
    <section class="workspace" id="view-courses">
      <div class="page-head">
        <div><h1>دوره ها</h1><p>ساخت، انتشار و مدیریت دوره ها از دیتابیس مرکزی Updateshid.</p></div>
        <div class="head-actions">
          <button class="top-action">دسته بندی ها</button>
          ${canManageCourses(user)?'<button class="top-action primary" id="new-course-btn">+ دوره جدید</button>':""}
        </div>
      </div>
      <div class="course-list" id="course-cards"><div class="loading-row">در حال دریافت دوره ها...</div></div>
      <div class="table-card" style="margin-top:14px">
        <div class="table-tools">
          <input id="course-search" placeholder="جستجو در دوره ها...">
          <select id="course-status-filter"><option value="">همه وضعیت ها</option><option value="published">منتشر شده</option><option value="draft">پیش نویس</option><option value="archived">آرشیو</option></select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>دوره</th><th>Slug</th><th>قیمت</th><th>تاریخ ایجاد</th><th>وضعیت</th><th></th></tr></thead>
          <tbody id="course-table-body"><tr><td colspan="6" class="loading-row">در حال دریافت داده...</td></tr></tbody>
        </table></div>
      </div>
    </section>

    <div class="modal-backdrop" id="course-modal" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title">
        <div class="modal-head"><h2 id="course-modal-title">ایجاد دوره جدید</h2><button class="modal-close" id="course-modal-close" type="button">×</button></div>
        <form id="course-form">
          <div class="modal-body">
            <div class="form-error" id="course-form-error"></div>
            <div class="form-grid">
              <div class="form-field full"><label>عنوان دوره *</label><input name="title" required maxlength="255" placeholder="مثلا: ساخت با هوش مصنوعی"></div>
              <div class="form-field"><label>Slug</label><input name="slug" dir="ltr" placeholder="build-with-ai"></div>
              <div class="form-field"><label>وضعیت</label><select name="status"><option value="draft">پیش نویس</option><option value="published">منتشر شده</option><option value="archived">آرشیو</option></select></div>
              <div class="form-field"><label>قیمت (تومان)</label><input name="price" type="number" min="0" step="1000" value="0"></div>
              <div class="form-field"><label>واحد پول</label><select name="currency"><option value="IRT">تومان (IRT)</option></select></div>
              <div class="form-field full"><label>لینک صفحه لندینگ</label><input name="landing_page" dir="ltr" placeholder="/build-with-ai" pattern="/(?!/).*" title="لینک را به شکل /build-with-ai وارد کنید"><div class="hint" dir="rtl">مثال: <span dir="ltr">/build-with-ai</span></div></div>
              <div class="form-field full"><label>توضیح کوتاه</label><textarea name="excerpt" maxlength="1000" placeholder="معرفی کوتاه دوره برای لیست دوره ها"></textarea></div>
              <div class="form-field full"><label>توضیحات دوره</label><textarea name="description" placeholder="توضیحات کامل دوره..."></textarea></div>
            </div>
          </div>
          <div class="modal-foot"><button class="top-action primary" id="course-submit" type="submit">ایجاد دوره</button><button class="top-action" id="course-cancel" type="button">انصراف</button></div>
        </form>
      </div>
    </div>`;


  const webinarsView=`
    <section class="workspace" id="view-webinars">
      <div class="page-head">
        <div><h1>وبینارها</h1><p>مدیریت وبینارهای Learn؛ داده ها فقط از CMS داخلی Learn خوانده و ذخیره می شوند.</p></div>
        <div class="head-actions"><button class="top-action" id="webinars-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="table-card">
        <div class="table-tools">
          <input id="webinar-search" placeholder="جستجو در عنوان یا Slug...">
          <select id="webinar-status-filter"><option value="">همه وضعیت ها</option><option value="published">منتشر شده</option><option value="draft">پیش نویس</option><option value="archived">بایگانی شده</option></select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>عنوان</th><th>Slug</th><th>تاریخ برگزاری</th><th>ثبت نام</th><th>وضعیت</th><th></th></tr></thead>
          <tbody id="webinar-table-body"><tr><td colspan="6" class="loading-row">در حال دریافت وبینارها...</td></tr></tbody>
        </table></div>
      </div>
    </section>

    <div class="modal-backdrop" id="webinar-modal" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="webinar-modal-title">
        <div class="modal-head"><h2 id="webinar-modal-title">ویرایش وبینار</h2><button class="modal-close" id="webinar-modal-close" type="button">×</button></div>
        <form id="webinar-form">
          <div class="modal-body">
            <div class="form-error" id="webinar-form-error"></div>
            <div class="form-grid">
              <div class="form-field full"><label>عنوان *</label><input name="title" required maxlength="255"></div>
              <div class="form-field"><label>Slug *</label><input name="slug" dir="ltr" required maxlength="255"></div>
              <div class="form-field"><label>تاریخ برگزاری *</label><input name="start_date" type="date" required></div>
              <div class="form-field"><label>وضعیت</label><select name="status"><option value="draft">پیش نویس</option><option value="published">منتشر شده</option><option value="archived">بایگانی شده</option></select></div>
              <div class="form-field"><label>ثبت نام باز باشد؟</label><select name="registration_open"><option value="true">بله</option><option value="false">خیر</option></select></div>
              <div class="form-field full"><label>توضیحات</label><textarea name="description"></textarea></div>
            </div>
          </div>
          <div class="modal-foot"><button class="top-action primary" id="webinar-submit" type="submit">ذخیره تغییرات</button><button class="top-action" id="webinar-cancel" type="button">انصراف</button></div>
        </form>
      </div>
    </div>`;

  const webinarRegistrationsView=`
    <section class="workspace" id="view-webinar-registrations">
      <div class="page-head">
        <div><h1>ثبت نام های وبینار</h1><p>ثبت نام های وبینارهای Learn از CMS داخلی Learn به همراه وضعیت حضور و پیگیری.</p></div>
        <div class="head-actions"><button class="top-action" id="webinar-registrations-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="table-card">
        <div class="table-tools">
          <input id="webinar-registration-search" placeholder="نام، موبایل، ایمیل یا شغل...">
          <select id="webinar-registration-webinar-filter"><option value="">همه وبینارها</option></select>
          <select id="webinar-registration-status-filter"><option value="">همه وضعیت ها</option><option value="registered">ثبت شده</option><option value="contacted">پیگیری شده</option><option value="cancelled">لغو شده</option></select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th><button type="button" data-webinar-sort="participant" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">شرکت کننده <span data-webinar-sort-icon="participant"></span></button></th>
            <th><button type="button" data-webinar-sort="webinar" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">وبینار <span data-webinar-sort-icon="webinar"></span></button></th>
            <th><button type="button" data-webinar-sort="job" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">شغل <span data-webinar-sort-icon="job"></span></button></th>
            <th><button type="button" data-webinar-sort="ai" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">AI <span data-webinar-sort-icon="ai"></span></button></th>
            <th><button type="button" data-webinar-sort="attendance" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">حضور <span data-webinar-sort-icon="attendance"></span></button></th>
            <th><button type="button" data-webinar-sort="status" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">وضعیت <span data-webinar-sort-icon="status"></span></button></th>
            <th><button type="button" data-webinar-sort="date" style="border:0;background:transparent;font:inherit;color:inherit;cursor:pointer">تاریخ ثبت نام <span data-webinar-sort-icon="date">▼</span></button></th>
            <th></th>
          </tr></thead>
          <tbody id="webinar-registration-table-body"><tr><td colspan="8" class="loading-row">در حال دریافت ثبت نام ها...</td></tr></tbody>
        </table></div>
      </div>
    </section>

    <div class="modal-backdrop" id="webinar-registration-modal" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="webinar-registration-modal-title">
        <div class="modal-head"><h2 id="webinar-registration-modal-title">ویرایش ثبت نام</h2><button class="modal-close" id="webinar-registration-modal-close" type="button">×</button></div>
        <form id="webinar-registration-form">
          <div class="modal-body">
            <div class="form-error" id="webinar-registration-form-error"></div>
            <div class="form-grid">
              <div class="form-field full"><label>نام و نام خانوادگی *</label><input name="full_name" required maxlength="160"></div>
              <div class="form-field"><label>شماره تماس</label><input name="phone" dir="ltr" readonly></div>
              <div class="form-field"><label>ایمیل</label><input name="email" dir="ltr" type="email"></div>
              <div class="form-field"><label>سن</label><input name="age" type="number" min="1" max="120"></div>
              <div class="form-field"><label>تحصیلات</label><select name="education"><option value="">—</option><option value="diploma_or_lower">دیپلم و پایین تر</option><option value="associate">کاردانی</option><option value="bachelor">کارشناسی</option><option value="master">کارشناسی ارشد</option><option value="phd">دکتری</option><option value="other">سایر</option></select></div>
              <div class="form-field"><label>شغل</label><input name="job_title" maxlength="160"></div>
              <div class="form-field"><label>سطح استفاده از AI</label><select name="ai_experience"><option value="">—</option><option value="none">تقریبا استفاده نکرده ام</option><option value="beginner">تازه شروع کرده ام</option><option value="regular">به صورت منظم استفاده میکنم</option><option value="advanced">حرفه ای و پیشرفته</option></select></div>
              <div class="form-field"><label>وضعیت</label><select name="status"><option value="registered">ثبت شده</option><option value="contacted">پیگیری شده</option><option value="cancelled">لغو شده</option></select></div>
              <div class="form-field full"><label>هدف از ثبت نام</label><textarea name="registration_goal"></textarea></div>
              <div class="form-field"><label>حضور</label><select name="attended"><option value="false">حاضر نشده</option><option value="true">حاضر شده</option></select></div>
              <div class="form-field"><label>مدت حضور (دقیقه)</label><input name="attendance_minutes" type="number" min="0" step="1"></div>
              <div class="form-field"><label>تعداد ورود</label><input name="join_count" type="number" min="0" step="1"></div>
            </div>
          </div>
          <div class="modal-foot"><button class="top-action primary" id="webinar-registration-submit" type="submit">ذخیره تغییرات</button><button class="top-action" id="webinar-registration-cancel" type="button">انصراف</button></div>
        </form>
      </div>
    </div>`;



  const courseRegistrationsView=`
    <section class="workspace" id="view-enrollments">
      <div class="page-head">
        <div><h1>ثبت نام های دوره</h1><p>ثبت نام های دوره ها از CMS اصلی Updateshid؛ شامل دوره، وضعیت پیگیری و اطلاعات مالی.</p></div>
        <div class="head-actions"><button class="top-action" id="course-registrations-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><div class="stat-top"><span>کل ثبت نام ها</span><div class="stat-icon">↳</div></div><strong id="course-registrations-total">—</strong><div class="meta-line"><span>همه درخواست های ثبت شده</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>دوره ها</span><div class="stat-icon">▤</div></div><strong id="course-registrations-courses">—</strong><div class="meta-line"><span>دوره های دارای ثبت نام</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>جدید</span><div class="stat-icon">●</div></div><strong id="course-registrations-new">—</strong><div class="meta-line"><span>هنوز پیگیری نشده</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>ثبت نام نهایی</span><div class="stat-icon">✓</div></div><strong id="course-registrations-enrolled">—</strong><div class="meta-line"><span>وضعیت enrolled</span></div></div>
      </div>
      <div class="table-card">
        <div class="table-tools">
          <input id="course-registration-search" placeholder="نام، موبایل، ایمیل یا شغل...">
          <select id="course-registration-course-filter"><option value="">همه دوره ها</option></select>
          <select id="course-registration-status-filter">
            <option value="">همه وضعیت ها</option>
            <option value="new">جدید</option>
            <option value="contacted">تماس گرفته شد</option>
            <option value="confirmed">تایید شده</option>
            <option value="enrolled">ثبت نام نهایی</option>
            <option value="cancelled">لغو شده</option>
          </select>
        </div>
        <div class="table-wrap"><table style="min-width:1180px">
          <thead><tr>
            <th>ثبت نام کننده</th>
            <th>دوره</th>
            <th>وضعیت</th>
            <th>شغل</th>
            <th>سطح AI</th>
            <th>پرداخت</th>
            <th>مبالغ</th>
            <th>تاریخ ثبت نام</th>
          </tr></thead>
          <tbody id="course-registration-table-body"><tr><td colspan="8" class="loading-row">در حال دریافت ثبت نام ها...</td></tr></tbody>
        </table></div>
      </div>
    </section>

    <div class="modal-backdrop" id="course-registration-modal" aria-hidden="true">
      <div class="modal course-registration-modal" role="dialog" aria-modal="true" aria-labelledby="course-registration-modal-title">
        <div class="modal-head"><h2 id="course-registration-modal-title">ویرایش ثبت نام دوره</h2><button class="modal-close" id="course-registration-modal-close" type="button">×</button></div>
        <form id="course-registration-form">
          <div class="modal-body">
            <div class="form-error" id="course-registration-form-error"></div>
            <div class="course-registration-result" id="course-registration-result"></div>
            <div class="form-grid">
              <div class="form-field full"><label>نام و نام خانوادگی *</label><input name="full_name" required maxlength="160"></div>
              <div class="form-field"><label>شماره تماس *</label><input name="phone" dir="ltr" required maxlength="32"></div>
              <div class="form-field"><label>ایمیل</label><input name="email" dir="ltr" type="email" maxlength="254"></div>
              <div class="form-field"><label>دوره *</label><select name="course_slug" required></select></div>
              <div class="form-field"><label>وضعیت ثبت نام</label><select name="registration_status"><option value="new">جدید</option><option value="contacted">تماس گرفته شد</option><option value="confirmed">تایید شده</option><option value="enrolled">ثبت نام نهایی</option><option value="cancelled">لغو شده</option></select></div>
              <div class="form-field"><label>بازه سنی</label><select name="age_range"><option value="">—</option><option value="under_18">زیر ۱۸</option><option value="18_24">۱۸ تا ۲۴</option><option value="25_34">۲۵ تا ۳۴</option><option value="35_44">۳۵ تا ۴۴</option><option value="45_54">۴۵ تا ۵۴</option><option value="55_plus">۵۵ سال و بیشتر</option></select></div>
              <div class="form-field"><label>تحصیلات</label><select name="education_level"><option value="">—</option><option value="high_school">دیپلم یا پایین تر</option><option value="associate">کاردانی</option><option value="bachelor">کارشناسی</option><option value="master">کارشناسی ارشد</option><option value="doctorate">دکتری</option><option value="other">سایر</option></select></div>
              <div class="form-field"><label>رشته تحصیلی</label><input name="field_of_study" maxlength="160"></div>
              <div class="form-field"><label>شغل / حوزه فعالیت</label><input name="job_title" maxlength="200"></div>
              <div class="form-field"><label>آشنایی با AI</label><select name="ai_familiarity"><option value="none">بدون آشنایی</option><option value="casual">مقدماتی</option><option value="daily">متوسط</option><option value="professional">حرفه ای</option><option value="builder">پیشرفته</option></select></div>
              <div class="form-field"><label>میزان استفاده از AI</label><select name="ai_usage"><option value="rarely">خیلی کم</option><option value="monthly">ماهانه</option><option value="weekly">هفتگی</option><option value="daily">روزانه</option><option value="heavy_daily">چند ساعت روزانه</option></select></div>
              <div class="form-field"><label>سطح برنامه نویسی</label><select name="programming_level"><option value="none">هیچ آشنایی ندارم</option><option value="basic">کمی آشنا هستم</option><option value="learned">قبلا آموزش دیده ام</option><option value="can_code">میتوانم کد بنویسم</option><option value="developer">برنامه نویس / توسعه دهنده</option></select></div>
              <div class="form-field"><label>روش پرداخت</label><select name="payment_preference"><option value="cash">نقدی</option><option value="installment">۳ قسط</option><option value="unsure">نامشخص</option></select></div>
              <div class="form-field"><label>مبلغ توافق شده</label><input name="agreed_amount" type="text" inputmode="numeric" dir="ltr" data-money-input autocomplete="off"></div>
              <div class="form-field"><label>مبلغ پرداخت شده</label><input name="paid_amount" type="text" inputmode="numeric" dir="ltr" data-money-input autocomplete="off"></div>
              <div class="form-field"><label>مبلغ باقی مانده</label><input name="remaining_amount" type="text" inputmode="numeric" dir="ltr" data-money-input autocomplete="off"></div>
              <div class="form-field full"><label>اهداف انتخاب شده</label><textarea name="goals_text"></textarea></div>
              <div class="form-field full"><label>اهداف خام JSON</label><textarea name="goals" dir="ltr"></textarea></div>
              <div class="form-field full"><label>پروژه مورد نظر</label><textarea name="desired_project"></textarea></div>
              <div class="form-field"><label>منبع</label><input name="source" maxlength="80"></div>
              <div class="form-field"><label>UTM Source</label><input name="utm_source" dir="ltr" maxlength="160"></div>
              <div class="form-field"><label>UTM Medium</label><input name="utm_medium" dir="ltr" maxlength="160"></div>
              <div class="form-field"><label>UTM Campaign</label><input name="utm_campaign" dir="ltr" maxlength="160"></div>
            </div>

            <div class="crm-panel">
              <div class="crm-panel-head"><h3>CRM و گزارش ها</h3><span class="crm-state" id="course-registration-crm-state">در حال بررسی...</span></div>
              <div class="crm-report-list" id="course-registration-crm-reports"></div>
              <div id="course-registration-report-editor" style="display:none">
                <div class="form-grid">
                  <div class="form-field full"><label>گزارش جدید</label><textarea id="course-registration-report-text" placeholder="خلاصه تماس، جلسه یا پیگیری..."></textarea></div>
                  <div class="form-field"><label>اقدام بعدی</label><input id="course-registration-next-action" placeholder="مثلا تماس برای تکمیل پرداخت"></div>
                  <div class="form-field"><label>تاریخ اقدام بعدی</label><input id="course-registration-next-action-at" type="datetime-local"></div>
                </div>
                <div style="margin-top:10px"><button class="top-action" id="course-registration-add-report" type="button">+ ثبت گزارش</button></div>
              </div>
            </div>
          </div>
          <div class="modal-foot" style="flex-wrap:wrap">
            <button class="top-action primary" id="course-registration-submit" type="submit">ذخیره تغییرات</button>
            <button class="top-action" id="course-registration-add-contact" type="button">اضافه شدن به مخاطبان</button>
            <button class="top-action success" id="course-registration-confirm" type="button">تایید ثبت نام و فعال سازی دوره</button>
            <button class="top-action" id="course-registration-cancel" type="button">بستن</button>
          </div>
        </form>
      </div>
    </div>`;


  const crmReportsView=`
    <section class="workspace" id="view-crm-reports">
      <div class="page-head">
        <div><h1>گزارشات CRM</h1><p>ثبت و مرور تعاملات، تماس ها، پرداخت ها، پشتیبانی و اقدامات بعدی مخاطبان.</p></div>
        <div class="head-actions"><button class="top-action" id="crm-reports-refresh">↻ بروزرسانی</button></div>
      </div>

      <div class="crm-report-form-card">
        <div class="card-title"><h3>ثبت گزارش جدید</h3><small>تاریخ و ساعت به صورت خودکار روی همین لحظه قرار می گیرد و قابل تغییر است.</small></div>
        <form id="crm-report-form">
          <div class="form-grid">
            <div class="form-field"><label>تاریخ و ساعت گزارش *</label><input id="crm-report-at" name="report_at" type="datetime-local" required></div>
            <div class="form-field"><label>نوع گزارش *</label>
              <select id="crm-report-type" name="report_type" required>
                <option value="call">تماس</option>
                <option value="payment">پرداخت</option>
                <option value="support">پشتیبانی</option>
                <option value="follow_up">پیگیری</option>
                <option value="meeting">جلسه</option>
                <option value="message">پیام</option>
                <option value="sales">فروش</option>
                <option value="other">سایر</option>
              </select>
            </div>
            <div class="form-field full crm-autocomplete">
              <label>مخاطب *</label>
              <input type="hidden" id="crm-report-contact-id" name="contact_id">
              <input id="crm-report-contact-search" autocomplete="off" placeholder="شروع به تایپ نام، موبایل یا ایمیل مخاطب کنید..." required>
              <div class="crm-autocomplete-results" id="crm-report-contact-results"></div>
            </div>
            <div class="form-field full"><label>شرح گزارش *</label><textarea id="crm-report-text" name="report_text" required placeholder="شرح کامل تماس، پرداخت، پشتیبانی یا تعامل انجام شده..." style="min-height:140px"></textarea></div>
            <div class="form-field full"><label>اقدام متناسب / اقدام بعدی</label><textarea id="crm-report-next-action" name="next_action" placeholder="چه کاری باید بعد از این گزارش انجام شود؟" style="min-height:120px"></textarea></div>
          </div>
          <div class="crm-report-form-message" id="crm-report-form-message"></div>
          <div class="crm-report-form-actions">
            <button type="submit" class="top-action primary" id="crm-report-submit">ثبت گزارش</button>
            <button type="button" class="top-action" id="crm-report-new">+ جدید</button>
          </div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-tools">
          <input id="crm-reports-search" style="flex:1;min-width:300px" placeholder="جستجو در مخاطب، نوع، شرح گزارش، اقدام بعدی، نویسنده...">
          <select id="crm-reports-type-filter">
            <option value="">همه انواع</option>
            <option value="call">تماس</option>
            <option value="payment">پرداخت</option>
            <option value="support">پشتیبانی</option>
            <option value="follow_up">پیگیری</option>
            <option value="meeting">جلسه</option>
            <option value="message">پیام</option>
            <option value="sales">فروش</option>
            <option value="other">سایر</option>
          </select>
        </div>
        <div class="table-wrap"><table style="min-width:1250px">
          <thead><tr><th>تاریخ و ساعت</th><th>مخاطب</th><th>نوع</th><th>شرح گزارش</th><th>اقدام متناسب</th><th>نویسنده</th></tr></thead>
          <tbody id="crm-reports-table-body"><tr><td colspan="6" class="loading-row">در حال دریافت گزارش ها...</td></tr></tbody>
        </table></div>
      </div>
    </section>`;

  const contactsView=`
    <section class="workspace" id="view-contacts">
      <div class="page-head">
        <div><h1>CRM</h1><p>مدیریت مخاطبان، اطلاعات تماس، وضعیت، تخصص و ارتباط با حساب کاربری.</p></div>
        <div class="head-actions"><button class="top-action" id="contacts-refresh">↻ بروزرسانی</button></div>
      </div>

      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><div class="stat-top"><span>کل مخاطبان</span><div class="stat-icon">◎</div></div><strong id="contacts-total">—</strong><div class="meta-line"><span>همه رکوردهای CRM</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>دانشجو</span><div class="stat-icon">♙</div></div><strong id="contacts-students">—</strong><div class="meta-line"><span>وضعیت student</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>سرنخ</span><div class="stat-icon">◌</div></div><strong id="contacts-leads">—</strong><div class="meta-line"><span>وضعیت lead</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>دارای حساب</span><div class="stat-icon">✓</div></div><strong id="contacts-users">—</strong><div class="meta-line"><span>متصل به Directus User</span></div></div>
      </div>

      <div class="table-card">
        <div class="table-tools">
          <input id="contacts-search" placeholder="نام، موبایل، ایمیل، شغل، تخصص...">
          <select id="contacts-status-filter">
            <option value="">همه وضعیت ها</option>
            <option value="lead">سرنخ</option>
            <option value="contact">مخاطب</option>
            <option value="student">دانشجو</option>
            <option value="customer">مشتری</option>
            <option value="inactive">غیرفعال</option>
          </select>
        </div>
        <div class="table-wrap"><table style="min-width:1250px">
          <thead><tr>
            <th>مخاطب</th>
            <th>وضعیت</th>
            <th>شغل / تخصص</th>
            <th>شرکت</th>
            <th>تحصیلات</th>
            <th>شبکه های اجتماعی</th>
            <th>حساب کاربری</th>
            <th>منبع</th>
            <th>آخرین تغییر</th>
          </tr></thead>
          <tbody id="contacts-table-body"><tr><td colspan="9" class="loading-row">در حال دریافت مخاطبان...</td></tr></tbody>
        </table></div>
      </div>
    </section>`;

  const contactDetailView=`
    <section class="workspace" id="view-contact-detail" data-contact-id="${selectedContactId?escapeHtml(String(selectedContactId)):""}">
      <div class="page-head">
        <div>
          <a href="/admin/contacts" style="display:inline-block;margin-bottom:8px;color:#4f46e5;font-size:11px;font-weight:900">→ بازگشت به CRM</a>
          <h1 id="contact-detail-title">پرونده مخاطب</h1>
          <p id="contact-detail-subtitle">اطلاعات CRM، ثبت نام دوره ها و وضعیت مالی مخاطب.</p>
        </div>
        <div class="head-actions"><button class="top-action" id="contact-detail-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><div class="stat-top"><span>دوره های ثبت نام کرده</span><div class="stat-icon">▤</div></div><strong id="contact-detail-course-count">—</strong><div class="meta-line"><span>تعداد ثبت نام های دوره</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>مجموع توافق</span><div class="stat-icon">◈</div></div><strong id="contact-detail-agreed">—</strong><div class="meta-line"><span>تومان</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>مجموع پرداخت</span><div class="stat-icon">✓</div></div><strong id="contact-detail-paid">—</strong><div class="meta-line"><span>تومان</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>بدهی</span><div class="stat-icon">!</div></div><strong id="contact-detail-debt">—</strong><div class="meta-line"><span>مانده پرداخت</span></div></div>
      </div>
      <div class="grid-2" style="margin-bottom:14px">
        <div class="card">
          <div class="card-title"><h3>اطلاعات CRM</h3><small id="contact-detail-status">—</small></div>
          <div id="contact-detail-profile" class="form-grid"><div class="loading-row" style="grid-column:1/-1">در حال دریافت اطلاعات مخاطب...</div></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>پرونده و گزارش های CRM</h3><small id="contact-detail-report-count">—</small></div>
          <div id="contact-detail-reports" class="crm-report-list"><div class="loading-row">در حال دریافت گزارش ها...</div></div>
        </div>
      </div>
      <div class="table-card">
        <div class="table-tools"><strong style="font-size:13px">دوره ها و وضعیت مالی</strong></div>
        <div class="table-wrap"><table style="min-width:1050px">
          <thead><tr><th>دوره</th><th>وضعیت</th><th>مبلغ توافق</th><th>پرداخت شده</th><th>بدهی</th><th>روش پرداخت</th><th>تاریخ ثبت نام</th></tr></thead>
          <tbody id="contact-detail-registrations"><tr><td colspan="7" class="loading-row">در حال دریافت ثبت نام ها...</td></tr></tbody>
        </table></div>
      </div>
    </section>`;

  const studentsView=`
    <section class="workspace" id="view-students">
      <div class="page-head">
        <div><h1>دانشجوها</h1><p>دانشجوهای Directus مرکزی و دسترسی آنها به دوره ها.</p></div>
        <div class="head-actions"><button class="top-action" id="students-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><div class="stat-top"><span>کل دانشجوها</span><div class="stat-icon">♙</div></div><strong id="students-total">—</strong><div class="meta-line"><span>نقش Student در CMS</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>دارای دوره</span><div class="stat-icon">✓</div></div><strong id="students-assigned">—</strong><div class="meta-line"><span>حداقل یک Enrollment فعال</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>بدون دوره</span><div class="stat-icon">!</div></div><strong id="students-unassigned">—</strong><div class="meta-line"><span>نیازمند تخصیص</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>Enrollment فعال</span><div class="stat-icon">↳</div></div><strong id="students-enrollments">—</strong><div class="meta-line"><span>Active + Completed</span></div></div>
      </div>
      <div class="table-card">
        <div class="table-tools">
          <input id="student-search" placeholder="نام یا ایمیل...">
          <select id="student-course-filter"><option value="">همه دوره ها</option></select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>دانشجو</th><th>وضعیت حساب</th><th>دوره ها</th><th>تعداد دوره</th><th>آخرین ورود</th><th></th></tr></thead>
          <tbody id="students-table-body"><tr><td colspan="6" class="loading-row">در حال دریافت دانشجوها...</td></tr></tbody>
        </table></div>
      </div>
    </section>
    <div class="modal" id="student-courses-modal" aria-hidden="true">
      <div class="modal-card" style="max-width:680px">
        <div class="modal-head"><div><h2 id="student-courses-title">تخصیص دوره</h2><p id="student-courses-subtitle">دوره های قابل دسترسی دانشجو را انتخاب کنید.</p></div><button class="modal-x" id="student-courses-close" type="button">×</button></div>
        <form id="student-courses-form">
          <div class="modal-body">
            <div id="student-courses-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px"></div>
            <div class="form-error" id="student-courses-error"></div>
          </div>
          <div class="modal-foot"><button class="top-action primary" id="student-courses-submit" type="submit">ذخیره دسترسی ها</button><button class="top-action" id="student-courses-cancel" type="button">انصراف</button></div>
        </form>
      </div>
    </div>`;

  const assignmentsView=`
    <section class="workspace" id="view-assignments">
      <div class="page-head"><div><h1>تکالیف و تمرین ها</h1><p>صف بررسی تمرین ها، SLA تصحیح و بازخورد مدرس.</p></div><div class="head-actions"><button class="top-action">فیلتر مدرس</button><button class="top-action primary">+ تمرین جدید</button></div></div>
      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><span>منتظر بررسی</span><strong>18</strong><div class="meta-line"><span class="down">5 مورد بالای 24 ساعت</span></div></div>
        <div class="stat-card"><span>بررسی شده امروز</span><strong>27</strong><div class="meta-line"><span class="up">+8 نسبت به دیروز</span></div></div>
        <div class="stat-card"><span>میانگین نمره</span><strong>84</strong><div class="meta-line"><span>از 100</span></div></div>
        <div class="stat-card"><span>میانگین زمان بررسی</span><strong>6.2h</strong><div class="meta-line"><span class="up">بهبود 18%</span></div></div>
      </div>
      <div class="kanban">
        <div class="kan-col"><div class="kan-head"><span>تحویل جدید</span><span class="count">8</span></div>
          <div class="kan-item"><b>طراحی Landing Page</b><p>مریم احمدی · ساخت با هوش مصنوعی</p><div class="kan-meta"><span>18 دقیقه پیش</span><span>📎 2</span></div></div>
          <div class="kan-item"><b>تمرین Context Engineering</b><p>رضا کریمی · Prompt Engineering</p><div class="kan-meta"><span>43 دقیقه پیش</span><span>🔗</span></div></div>
        </div>
        <div class="kan-col"><div class="kan-head"><span>در حال بررسی</span><span class="count">5</span></div>
          <div class="kan-item"><b>ساخت فرم ثبت نام</b><p>سارا محمدی · مدرس: آرش نادریان</p><div class="kan-meta"><span>2 ساعت</span><span>75%</span></div></div>
        </div>
        <div class="kan-col"><div class="kan-head"><span>نیاز به اصلاح</span><span class="count">3</span></div>
          <div class="kan-item"><b>Deploy روی VPS</b><p>علی رضایی · بار دوم</p><div class="kan-meta"><span>بازخورد ارسال شد</span><span>↻</span></div></div>
        </div>
        <div class="kan-col"><div class="kan-head"><span>تکمیل شده</span><span class="count">27</span></div>
          <div class="kan-item"><b>Git و GitHub</b><p>امیر علیزاده · نمره 92</p><div class="kan-meta"><span>امروز</span><span>✓</span></div></div>
        </div>
      </div>
    </section>`;

  const analyticsView=`
    <section class="workspace" id="view-analytics">
      <div class="page-head"><div><h1>تحلیل و گزارش ها</h1><p>سلامت آموزشی، فروش، تعامل و نقاط خطر در یک نما.</p></div><div class="head-actions"><button class="top-action">30 روز اخیر</button><button class="top-action">دانلود گزارش</button></div></div>
      <div class="grid-4" style="margin-bottom:14px">
        <div class="stat-card"><span>Completion Rate</span><strong>71.4%</strong><div class="meta-line"><span class="up">+5.2%</span></div></div>
        <div class="stat-card"><span>Active Learners</span><strong>329</strong><div class="meta-line"><span>67.6%</span></div></div>
        <div class="stat-card"><span>Avg. Watch Time</span><strong>4h 18m</strong><div class="meta-line"><span class="up">+22m</span></div></div>
        <div class="stat-card"><span>At-risk Learners</span><strong>34</strong><div class="meta-line"><span class="down">نیاز به اقدام</span></div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-title"><h3>تعامل هفتگی دانشجوها</h3><small>8 هفته اخیر</small></div><div class="chart">
          <div class="bar" data-v="198" style="height:42%"></div><div class="bar" data-v="242" style="height:51%"></div><div class="bar" data-v="228" style="height:48%"></div><div class="bar" data-v="276" style="height:62%"></div><div class="bar" data-v="301" style="height:72%"></div><div class="bar" data-v="288" style="height:68%"></div><div class="bar" data-v="324" style="height:83%"></div><div class="bar" data-v="329" style="height:88%"></div>
        </div></div>
        <div class="card"><div class="card-title"><h3>وضعیت یادگیری</h3><small>تمام دوره ها</small></div><div class="donut-wrap"><div class="donut"></div><div class="legend"><span><i style="background:#4f46e5"></i>در حال یادگیری 62%</span><span><i style="background:#22c55e"></i>تکمیل شده 17%</span><span><i style="background:#f59e0b"></i>کم فعالیت 12%</span><span><i style="background:#e5e7eb"></i>شروع نشده 9%</span></div></div></div>
      </div>
    </section>`;

  const supportView=`
    <section class="workspace" id="view-support">
      <div class="page-head">
        <div><h1>پشتیبانی و تیکت ها</h1><p>تیکت های واقعی ثبت شده توسط دانشجوها، پاسخ تیم پشتیبانی و وضعیت رسیدگی.</p></div>
        <div class="head-actions"><button class="top-action" id="support-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="table-card">
        <div class="table-tools">
          <input id="support-search" placeholder="جستجو در تیکت ها...">
          <select id="support-priority-filter"><option value="">همه اولویت ها</option><option value="high">بالا</option><option value="normal">عادی</option></select>
          <select id="support-status-filter"><option value="">همه وضعیت ها</option><option value="open">باز</option><option value="in_progress">در حال بررسی</option><option value="answered">پاسخ داده شده</option><option value="closed">بسته</option></select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>دانشجو</th><th>موضوع</th><th>اولویت</th><th>وضعیت</th><th>تاریخ</th><th>پاسخ</th></tr></thead>
          <tbody id="support-table-body"><tr><td colspan="7" class="loading-row">در حال دریافت تیکت ها...</td></tr></tbody>
        </table></div>
      </div>
    </section>`;

  const dashboardView=`
    <section class="workspace active" id="view-dashboard">
      <div class="page-head">
        <div><h1>سلام ${escapeHtml(name.split(" ")[0] || name)} 👋</h1><p>این نمای مدیریتی امروز سیستم آموزشی شماست.</p></div>
        <div class="head-actions"><button class="top-action primary" data-jump="courses">+ ایجاد دوره</button></div>
      </div>
      <div class="grid-4">
        <div class="stat-card"><div class="stat-top"><span>دانشجوهای فعال</span><div class="stat-icon">♙</div></div><strong>329</strong><div class="meta-line"><span class="up">+12.4%</span><span>نسبت به ماه قبل</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>دوره های فعال</span><div class="stat-icon">▤</div></div><strong>12</strong><div class="meta-line"><span>3 دوره در حال برگزاری</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>تکالیف منتظر بررسی</span><div class="stat-icon">✎</div></div><strong>18</strong><div class="meta-line"><span class="down">5 مورد بالای 24 ساعت</span></div></div>
        <div class="stat-card"><div class="stat-top"><span>درآمد این ماه</span><div class="stat-icon">◈</div></div><strong>186M</strong><div class="meta-line"><span class="up">+21.8%</span><span>تومان</span></div></div>
      </div>
      <div class="grid-2" style="margin-top:14px">
        <div class="card"><div class="card-title"><h3>ثبت نام های 14 روز اخیر</h3><small>مقایسه با دوره قبل</small></div><div class="chart">
          <div class="bar" data-v="12" style="height:30%"></div><div class="bar" data-v="18" style="height:42%"></div><div class="bar" data-v="14" style="height:35%"></div><div class="bar" data-v="26" style="height:58%"></div><div class="bar" data-v="31" style="height:70%"></div><div class="bar" data-v="24" style="height:54%"></div><div class="bar" data-v="39" style="height:86%"></div><div class="bar" data-v="35" style="height:78%"></div><div class="bar" data-v="41" style="height:92%"></div><div class="bar" data-v="29" style="height:64%"></div>
        </div></div>
        <div class="card"><div class="card-title"><h3>سلامت یادگیری</h3><small>همه دانشجوها</small></div><div class="donut-wrap"><div class="donut"></div><div class="legend"><span><i style="background:#4f46e5"></i>در حال یادگیری 62%</span><span><i style="background:#22c55e"></i>تکمیل شده 17%</span><span><i style="background:#f59e0b"></i>کم فعالیت 12%</span><span><i style="background:#e5e7eb"></i>شروع نشده 9%</span></div></div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="card-title"><h3>دسترسی سریع</h3><small>کارهای پرتکرار</small></div><div class="quick-grid">
        <button class="quick" data-jump="students"><span>♙</span><b>افزودن دانشجو</b><span>ثبت کاربر و Enrollment</span></button>
        <button class="quick" data-jump="courses"><span>▤</span><b>ساخت دوره</b><span>Course Builder</span></button>
        <button class="quick" data-jump="assignments"><span>✎</span><b>بررسی تکالیف</b><span>18 مورد منتظر</span></button>
        <button class="quick" data-jump="announcements"><span>◔</span><b>ارسال اطلاعیه</b><span>به یک دوره یا Cohort</span></button>
      </div></div>
      <div class="grid-2" style="margin-top:14px">
        <div class="card"><div class="card-title"><h3>فعالیت های اخیر</h3><small>Timeline سیستم</small></div><div class="activity">
          <div class="activity-row"><div class="activity-icon">✓</div><div><b>مریم احمدی درس 8 را کامل کرد</b><p>دوره ساخت با هوش مصنوعی</p></div><time>5 دقیقه</time></div>
          <div class="activity-row"><div class="activity-icon">◈</div><div><b>پرداخت جدید ثبت شد</b><p>14,900,000 تومان · علی رضایی</p></div><time>12 دقیقه</time></div>
          <div class="activity-row"><div class="activity-icon">✎</div><div><b>تمرین جدید تحویل داده شد</b><p>Context Engineering · سارا محمدی</p></div><time>18 دقیقه</time></div>
          <div class="activity-row"><div class="activity-icon">♙</div><div><b>دانشجوی جدید ثبت نام کرد</b><p>Prompt Engineering</p></div><time>32 دقیقه</time></div>
        </div></div>
        <div class="card"><div class="card-title"><h3>نیازمند توجه</h3><small>پیشنهادهای عملیاتی</small></div><div class="activity">
          <div class="activity-row"><div class="activity-icon">!</div><div><b>34 دانشجو در ریسک ریزش</b><p>بیش از 7 روز بدون فعالیت</p></div><span class="status red">فوری</span></div>
          <div class="activity-row"><div class="activity-icon">✎</div><div><b>5 تمرین از SLA خارج شده</b><p>بیش از 24 ساعت منتظر بررسی</p></div><span class="status orange">پیگیری</span></div>
          <div class="activity-row"><div class="activity-icon">◈</div><div><b>3 پرداخت ناموفق پرتکرار</b><p>بررسی وضعیت Gateway</p></div><span class="status blue">بررسی</span></div>
        </div></div>
      </div>
    </section>`;

  const contentView=`
    <section class="workspace" id="view-content">
      <div class="page-head">
        <div><h1>محتوا و درس ها</h1><p>هر درس می تواند ترکیبی از متن، ویدئو، صدا و فایل باشد.</p></div>
        <div class="head-actions"><button class="top-action" id="content-refresh">↻ بروزرسانی</button></div>
      </div>
      <div class="content-toolbar">
        <select id="content-course-select"><option value="">انتخاب دوره...</option></select>
        <button class="top-action" id="new-section-btn">+ فصل جدید</button>
        <button class="top-action primary" id="new-lesson-btn">+ درس جدید</button>
      </div>
      <div class="content-layout">
        <aside class="outline-card">
          <div class="outline-head"><b>ساختار دوره</b><small id="outline-count" style="color:#94a3b8"></small></div>
          <div class="outline-body" id="content-outline"><div class="empty-row">ابتدا یک دوره انتخاب کنید.</div></div>
        </aside>
        <section class="lesson-card">
          <div class="lesson-head"><div><b id="selected-lesson-title">ویرایش درس</b><div id="selected-lesson-meta" style="font-size:9px;color:#94a3b8;margin-top:4px"></div></div></div>
          <div class="lesson-main" id="lesson-editor"><div class="lesson-empty">از ستون ساختار، یک درس را انتخاب کنید.</div></div>
        </section>
      </div>
      <input id="media-file-input" type="file" hidden>
    </section>`;

  const calendarView=`
    <section class="workspace" id="view-calendar">
      <div class="page-head">
        <div><h1>تقویم من</h1><p>مدیریت رویدادهای Google Calendar در نمای ماهانه شمسی.</p></div>
        <div class="head-actions calendar-head-actions">
          <button type="button" class="top-action" id="calendar-refresh">↻ بروزرسانی</button>
          <button type="button" class="top-action primary" id="calendar-new-event">+ رویداد جدید</button>
        </div>
      </div>

      <div class="calendar-shell">
        <div class="calendar-toolbar">
          <div class="calendar-title-wrap">
            <div>
              <h2 class="calendar-title" id="calendar-month-title">تقویم</h2>
              <div class="calendar-subtitle">هفته از شنبه شروع می شود · زمان ها بر اساس تهران</div>
            </div>
          </div>
          <div class="calendar-toolbar-meta">
            <span class="calendar-chip live">● Google Calendar</span>
            <span class="calendar-chip" id="calendar-event-count">۰ رویداد</span>
          </div>
          <div class="calendar-nav">
            <button type="button" id="calendar-next" aria-label="ماه بعد">‹</button>
            <button type="button" class="today-btn" id="calendar-today">امروز</button>
            <button type="button" id="calendar-prev" aria-label="ماه قبل">›</button>
          </div>
        </div>

        <div class="calendar-grid" id="calendar-grid">
          <div class="calendar-weekday">شنبه</div>
          <div class="calendar-weekday">یکشنبه</div>
          <div class="calendar-weekday">دوشنبه</div>
          <div class="calendar-weekday">سه شنبه</div>
          <div class="calendar-weekday">چهارشنبه</div>
          <div class="calendar-weekday">پنجشنبه</div>
          <div class="calendar-weekday">جمعه</div>
        </div>
        <div class="calendar-loading" id="calendar-loading">در حال دریافت رویدادهای تقویم...</div>
      </div>

      <div class="calendar-modal-backdrop" id="calendar-modal" aria-hidden="true">
        <div class="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
          <div class="calendar-modal-head">
            <div>
              <h3 id="calendar-modal-title">رویداد جدید</h3>
              <div style="font-size:10px;color:#94a3b8;margin-top:3px">Google Calendar</div>
            </div>
            <button type="button" class="calendar-modal-close" id="calendar-modal-close" aria-label="بستن">×</button>
          </div>
          <form class="calendar-form" id="calendar-event-form">
            <input type="hidden" name="event_id">
            <div class="calendar-field full"><label>عنوان رویداد</label><input name="title" maxlength="300" required placeholder="مثلا جلسه کوچینگ"></div>
            <label class="calendar-check"><input type="checkbox" name="all_day"> رویداد تمام روز</label>

            <div class="calendar-form-grid" id="calendar-datetime-fields">
              <div class="calendar-field"><label>شروع</label><input name="start" type="datetime-local" required></div>
              <div class="calendar-field"><label>پایان</label><input name="end" type="datetime-local" required></div>
            </div>

            <div class="calendar-form-grid" id="calendar-allday-fields" style="display:none">
              <div class="calendar-field"><label>تاریخ شروع</label><input name="start_date" type="date"></div>
              <div class="calendar-field"><label>تاریخ پایان</label><input name="end_date" type="date"></div>
            </div>

            <div class="calendar-field full"><label>محل / لینک جلسه</label><input name="location" maxlength="1000" placeholder="اختیاری"></div>
            <div class="calendar-field full"><label>توضیحات</label><textarea name="description" maxlength="10000" placeholder="یادداشت، اطلاعات تماس، لینک و ..."></textarea></div>
            <div class="calendar-form-message" id="calendar-form-message"></div>

            <div class="calendar-form-actions">
              <button type="button" class="calendar-danger" id="calendar-delete-event" style="display:none">حذف رویداد</button>
              <a class="calendar-open-google" id="calendar-open-google" href="#" target="_blank" rel="noopener noreferrer" style="display:none">باز کردن در Google ↗</a>
              <span class="spacer"></span>
              <button type="button" class="top-action" id="calendar-cancel">انصراف</button>
              <button type="submit" class="calendar-save" id="calendar-save-event">ذخیره رویداد</button>
            </div>
          </form>
        </div>
      </div>
    </section>`;

  const settingsView=`
    <section class="workspace" id="view-settings">
      <div class="page-head">
        <div><h1>تنظیمات</h1><p>تنظیمات عمومی Learning، امنیت و رفتار نشست کاربران.</p></div>
      </div>
      <div class="table-card" style="max-width:820px">
        <div style="padding:22px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="big-icon" style="width:48px;height:48px;border-radius:15px;background:#eef2ff;display:grid;place-items:center;font-size:22px">⌛</div>
            <div><b style="font-size:15px">مدت اعتبار نشست کاربر</b><div style="font-size:10px;color:#64748b;margin-top:5px">مدت زمانی که کاربر در صورت عدم فعالیت می تواند بدون ورود مجدد در سیستم بماند.</div></div>
          </div>
        </div>
        <div style="padding:22px">
          <div class="form-grid">
            <div class="form-field full">
              <label for="session-hours">زمان انقضای نشست</label>
              <div style="display:flex;align-items:center;gap:10px">
                <input id="session-hours" type="number" min="1" max="168" step="1" value="24" style="max-width:180px" ${level==="admin"?"":"disabled"}>
                <span style="font-size:12px;color:#64748b">ساعت</span>
              </div>
              <small style="color:#94a3b8;line-height:1.9">حداقل ۱ ساعت و حداکثر ۱۶۸ ساعت (۷ روز). مقدار پیشنهادی برای پنل مدیریت: ۲۴ ساعت.</small>
            </div>
          </div>
          <div style="margin-top:18px;padding:14px 16px;border-radius:13px;background:#f8fafc;border:1px solid #eef2f6;font-size:11px;color:#475569;line-height:2">
            Access Token کوتاه Directus همچنان برای امنیت کوتاه می ماند؛ Learn آن را در پس زمینه با Refresh Token تمدید می کند. تغییر این مقدار نشست فعلی را با زمان جدید تمدید می کند و خطای دسترسی (403) باعث خروج کاربر نمی شود.
          </div>
          <div id="session-settings-message" style="display:none;margin-top:14px;padding:11px 13px;border-radius:11px;font-size:11px;font-weight:800"></div>
          <div style="display:flex;gap:10px;margin-top:18px">
            ${level==="admin"?'<button class="top-action primary" id="save-session-settings">ذخیره تنظیمات</button>':'<span class="status orange">فقط Administrator می تواند این مقدار را تغییر دهد</span>'}
          </div>
        </div>
      </div>
    </section>`;

  const workspaces = [
    dashboardView,
    calendarView,
    generic("tasks","کارهای امروز","Task Center برای کارهای ادمین، مدرس و تیم پشتیبانی.","✓"),
    webinarsView,
    webinarRegistrationsView,
    coursesView,
    courseRegistrationsView,
    generic("runs","دوره های در حال برگزاری","مدیریت Cohort ها، ظرفیت، زمان شروع و پایان و وضعیت هر اجرا.","◫"),
    contentView,
    assignmentsView,
    generic("live","کلاس های زنده","برنامه ریزی جلسه، حضور و غیاب، لینک ورود و Recording.","●"),
    generic("certificates","گواهی نامه ها","صدور، ابطال، اعتبارسنجی و تاریخچه گواهی های آموزشی.","◇"),
    studentsView,
    contactsView,
    crmReportsView,
    contactDetailView,
    generic("teachers","مدرس ها","پروفایل مدرس، دوره های تخصیص داده شده، بار کاری و عملکرد آموزشی.","♜"),
    generic("groups","گروه ها و Cohort ها","تقسیم دانشجوها بر اساس دوره، نوبت، سازمان یا گروه آموزشی.","◉"),
    generic("announcements","اطلاعیه ها","ارسال پیام عمومی یا هدفمند به دوره، Cohort و گروه کاربران.","◔"),
    generic("discussions","گفتگوها","مدیریت Discussion های درس و پاسخ های مدرس و دانشجو.","☵"),
    generic("notifications","اعلان ها","Template و Delivery Center برای اعلان های داخل سیستم، SMS و Email.","◌"),
    supportView,
    generic("orders","سفارش ها","چرخه سفارش از ایجاد تا پرداخت، لغو یا Refund.","▣"),
    generic("payments","پرداخت ها","تراکنش ها، Gateway، Reconciliation و پرداخت های ناموفق.","◈"),
    generic("coupons","کدهای تخفیف","کمپین، محدودیت مصرف، تاریخ انقضا و تحلیل عملکرد کدها.","%"),
    generic("refunds","بازگشت وجه","درخواست Refund، دلیل، تایید و وضعیت تسویه.","↶"),
    analyticsView,
    generic("progress","پیشرفت آموزشی","گزارش عمیق Lesson Completion، زمان یادگیری و دانشجوهای عقب افتاده.","◴"),
    generic("engagement","تعامل دانشجوها","Active Learner، Watch Time، Drop-off و رفتار یادگیری.","◒"),
    generic("exports","خروجی ها","گزارش های CSV/Excel و Export های زمان بندی شده.","⇩"),
    generic("roles","نقش ها و دسترسی ها","Admin، Teacher، Support و Student؛ با Permission Matrix قابل توسعه.","♢"),
    generic("integrations","اتصال ها","Directus، درگاه پرداخت، SMS، Email، ویدئو، Webinar و Webhook ها.","⌘"),
    generic("audit","لاگ فعالیت","Timeline قابل جستجوی تغییرات و عملیات مهم کاربران سیستم.","≡"),
    settingsView
  ].join("");

  const renderedWorkspaces=workspaces
    .replace(/class="workspace active"/g,'class="workspace"')
    .replace(`class="workspace" id="view-${activeView}"`,`class="workspace active" id="view-${activeView}"`);

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پنل مدیریت | Updateshid Learn</title><style>${adminCss}</style></head>
  <body>
    <div class="admin-shell">
      <main class="admin-main">
        <div class="topbar">
          <button class="menu-toggle" id="menu-toggle">☰</button>
          <div class="searchbox"><span class="search-ico">⌕</span><input id="global-search" placeholder="جستجو در دانشجو، دوره، سفارش، تیکت..."></div>
          <div class="top-spacer"></div>
          <button class="top-action hide-sm">+ عملیات سریع</button>
          <button class="top-action icon-only">◔<span class="dot"></span></button>
          <a class="top-action" href="/clients">پنل کاربر ↗</a>
        </div>
        <div class="page-wrap">${renderedWorkspaces}</div>
      </main>

      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="side-head">
          <div class="brand-mark"><div class="brand-logo">U</div><div class="brand-copy"><b>Updateshid Learn</b><span>ADMIN CENTER</span></div></div>
          <span style="color:#65738a;font-size:11px">v0.1</span>
        </div>
        <div class="side-scroll">${menuHtml}</div>
        <div class="side-user">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div class="meta"><b>${escapeHtml(name)}</b><small>${escapeHtml(levelLabel)} · ${escapeHtml(user.email||"")}</small></div>
          <button id="logout" title="خروج" style="border:0;background:transparent;color:#94a3b8;font-size:17px">↪</button>
        </div>
      </aside>
      <div class="drawer-backdrop" id="drawer-backdrop"></div>
    </div>

    <script>
      const sidebar=document.getElementById("admin-sidebar");
      const backdrop=document.getElementById("drawer-backdrop");
      const buttons=[...document.querySelectorAll(".nav-item[data-view]")];
      const views=[...document.querySelectorAll(".workspace")];

      function openView(id){
        const view=document.getElementById("view-"+id) || document.getElementById("view-dashboard");
        views.forEach(v=>v.classList.toggle("active",v===view));
        const navId=id==="contact-detail"?"contacts":id;
        buttons.forEach(b=>b.classList.toggle("active",b.dataset.view===navId));
        const active=buttons.find(b=>b.dataset.view===navId);
        if(active) active.scrollIntoView({block:"nearest"});
        sidebar.classList.remove("open");backdrop.classList.remove("show");
      }

      document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>{location.href="/admin/"+b.dataset.jump}));
      openView("${activeView}");

      document.getElementById("menu-toggle").onclick=()=>{sidebar.classList.add("open");backdrop.classList.add("show")};
      backdrop.onclick=()=>{sidebar.classList.remove("open");backdrop.classList.remove("show")};

      document.getElementById("global-search").addEventListener("keydown",e=>{
        if(e.key==="Enter"){
          const q=e.currentTarget.value.trim();
          if(!q)return;
          const toast=document.createElement("div");
          toast.textContent='جستجوی "'+q+'" در فاز Backend فعال می شود.';
          Object.assign(toast.style,{position:"fixed",left:"24px",bottom:"24px",background:"#111827",color:"#fff",padding:"12px 16px",borderRadius:"12px",zIndex:100,fontSize:"12px",boxShadow:"0 15px 40px rgba(0,0,0,.2)"});
          document.body.appendChild(toast);setTimeout(()=>toast.remove(),2600);
        }
      });



      let webinarData=[];
      let webinarRegistrationData=[];
      let courseRegistrationData=[];
      let courseRegistrationCourses=[];
      const webinarStatusLabel={draft:"پیش نویس",published:"منتشر شده",archived:"بایگانی شده"};
      const registrationStatusLabel={registered:"ثبت شده",contacted:"پیگیری شده",cancelled:"لغو شده"};
      const aiExperienceLabel={none:"بدون تجربه",beginner:"مبتدی",regular:"منظم",advanced:"پیشرفته"};

      function renderWebinars(){
        const body=document.getElementById("webinar-table-body");
        if(!body)return;
        const q=(document.getElementById("webinar-search")?.value||"").trim().toLowerCase();
        const sf=document.getElementById("webinar-status-filter")?.value||"";
        const rows=webinarData.filter(function(w){
          const match=!q||[w.title,w.slug,w.description].join(" ").toLowerCase().includes(q);
          return match&&(!sf||w.status===sf);
        });
        if(!rows.length){body.innerHTML='<tr><td colspan="6" class="empty-row">وبیناری پیدا نشد.</td></tr>';return}
        body.innerHTML=rows.map(function(w){
          return '<tr>'+
            '<td><b>'+safe(w.title||"—")+'</b><div style="color:#9ca3af;font-size:9px;margin-top:4px">'+safe(w.description||"")+'</div></td>'+
            '<td dir="ltr">'+safe(w.slug||"—")+'</td>'+
            '<td>'+(w.start_date?new Date(w.start_date+"T12:00:00").toLocaleDateString("fa-IR"):"—")+'</td>'+
            '<td><span class="status '+(w.registration_open?"green":"red")+'">'+(w.registration_open?"باز":"بسته")+'</span></td>'+
            '<td><span class="status '+(w.status==="published"?"green":w.status==="draft"?"orange":"")+'">'+safe(webinarStatusLabel[w.status]||w.status||"—")+'</span></td>'+
            '<td><button type="button" class="top-action" data-webinar-edit="'+safe(w.id)+'">ویرایش</button></td>'+
          '</tr>';
        }).join("");
      }

      async function loadWebinars(){
        const body=document.getElementById("webinar-table-body");
        if(body)body.innerHTML='<tr><td colspan="6" class="loading-row">در حال دریافت وبینارها...</td></tr>';
        try{
          const res=await fetch("/api/webinars",{headers:{accept:"application/json"}});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"دریافت وبینارها ناموفق بود.");
          webinarData=Array.isArray(data.data)?data.data:[];
          renderWebinars();
          populateWebinarRegistrationFilter();
        }catch(ex){
          if(body)body.innerHTML='<tr><td colspan="6" class="empty-row">'+safe(ex.message||"دریافت وبینارها ناموفق بود.")+'</td></tr>';
        }
      }

      const webinarModal=document.getElementById("webinar-modal");
      let editingWebinarId=null;
      function openWebinarModal(webinar){
        if(!webinarModal||!webinar)return;
        editingWebinarId=String(webinar.id);
        const form=document.getElementById("webinar-form");
        form.querySelector('[name="title"]').value=webinar.title||"";
        form.querySelector('[name="slug"]').value=webinar.slug||"";
        form.querySelector('[name="start_date"]').value=webinar.start_date||"";
        form.querySelector('[name="status"]').value=webinar.status||"draft";
        form.querySelector('[name="registration_open"]').value=webinar.registration_open?"true":"false";
        form.querySelector('[name="description"]').value=webinar.description||"";
        const err=document.getElementById("webinar-form-error");err.textContent="";err.className="form-error";
        webinarModal.classList.add("show");webinarModal.setAttribute("aria-hidden","false");
      }
      function closeWebinarModal(){webinarModal?.classList.remove("show");webinarModal?.setAttribute("aria-hidden","true");editingWebinarId=null}
      document.getElementById("webinar-table-body")?.addEventListener("click",function(e){
        const btn=e.target.closest?.("[data-webinar-edit]");if(!btn)return;
        const row=webinarData.find(function(w){return String(w.id)===String(btn.dataset.webinarEdit)});
        if(row)openWebinarModal(row);
      });
      document.getElementById("webinar-search")?.addEventListener("input",renderWebinars);
      document.getElementById("webinar-status-filter")?.addEventListener("change",renderWebinars);
      document.getElementById("webinars-refresh")?.addEventListener("click",loadWebinars);
      document.getElementById("webinar-modal-close")?.addEventListener("click",closeWebinarModal);
      document.getElementById("webinar-cancel")?.addEventListener("click",closeWebinarModal);
      webinarModal?.addEventListener("click",function(e){if(e.target===webinarModal)closeWebinarModal()});
      document.getElementById("webinar-form")?.addEventListener("submit",async function(e){
        e.preventDefault();if(!editingWebinarId)return;
        const form=e.currentTarget,submit=document.getElementById("webinar-submit"),err=document.getElementById("webinar-form-error");
        submit.disabled=true;err.className="form-error";
        const fd=new FormData(form);
        const payload=Object.fromEntries(fd.entries());
        payload.registration_open=payload.registration_open==="true";
        try{
          const res=await fetch("/api/webinars/"+encodeURIComponent(editingWebinarId),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"ویرایش وبینار ناموفق بود.");
          closeWebinarModal();await loadWebinars();openView("webinars");
        }catch(ex){err.textContent=ex.message||"ویرایش وبینار ناموفق بود.";err.className="form-error show"}
        finally{submit.disabled=false}
      });

      function webinarTitleOf(reg){
        const w=reg.webinar;
        if(!w)return "—";
        if(typeof w==="object")return w.title||w.slug||w.id||"—";
        const found=webinarData.find(function(item){return String(item.id)===String(w)});
        return found?.title||String(w);
      }
      function webinarIdOf(reg){return typeof reg.webinar==="object"?reg.webinar?.id:reg.webinar}
      function populateWebinarRegistrationFilter(){
        const select=document.getElementById("webinar-registration-webinar-filter");
        if(!select)return;
        const current=select.value;
        select.innerHTML='<option value="">همه وبینارها</option>'+webinarData.map(function(w){return '<option value="'+safe(w.id)+'">'+safe(w.title)+'</option>'}).join("");
        select.value=current;
      }
      let webinarRegistrationSort={key:"date",direction:"desc"};
      function webinarRegistrationSortValue(row,key){
        if(key==="participant")return String(row.full_name||"");
        if(key==="webinar")return String(webinarTitleOf(row)||"");
        if(key==="job")return String(row.job_title||"");
        if(key==="ai"){
          const order={none:0,beginner:1,regular:2,advanced:3};
          return Object.prototype.hasOwnProperty.call(order,row.ai_experience)?order[row.ai_experience]:-1;
        }
        if(key==="attendance"){
          return (row.attended?1000000000:0)+Number(row.attendance_minutes||0);
        }
        if(key==="status"){
          const order={registered:0,contacted:1,cancelled:2};
          return Object.prototype.hasOwnProperty.call(order,row.status)?order[row.status]:-1;
        }
        if(key==="date")return row.date_created?new Date(row.date_created).getTime():0;
        return "";
      }
      function updateWebinarRegistrationSortIcons(){
        document.querySelectorAll("[data-webinar-sort-icon]").forEach(function(el){
          el.textContent=el.dataset.webinarSortIcon===webinarRegistrationSort.key
            ?(webinarRegistrationSort.direction==="asc"?"▲":"▼")
            :"";
        });
      }
      function renderWebinarRegistrations(){
        const body=document.getElementById("webinar-registration-table-body");
        if(!body)return;
        const q=(document.getElementById("webinar-registration-search")?.value||"").trim().toLowerCase();
        const wf=document.getElementById("webinar-registration-webinar-filter")?.value||"";
        const sf=document.getElementById("webinar-registration-status-filter")?.value||"";
        const rows=webinarRegistrationData.filter(function(r){
          const hay=[r.full_name,r.phone,r.email,r.job_title,r.registration_goal,webinarTitleOf(r)].join(" ").toLowerCase();
          return (!q||hay.includes(q))&&(!wf||String(webinarIdOf(r))===String(wf))&&(!sf||r.status===sf);
        }).sort(function(a,b){
          const av=webinarRegistrationSortValue(a,webinarRegistrationSort.key);
          const bv=webinarRegistrationSortValue(b,webinarRegistrationSort.key);
          let result=0;
          if(typeof av==="number"&&typeof bv==="number")result=av-bv;
          else result=String(av).localeCompare(String(bv),"fa",{numeric:true,sensitivity:"base"});
          return webinarRegistrationSort.direction==="asc"?result:-result;
        });
        updateWebinarRegistrationSortIcons();
        if(!rows.length){body.innerHTML='<tr><td colspan="8" class="empty-row">ثبت نامی پیدا نشد.</td></tr>';return}
        body.innerHTML=rows.map(function(r){
          return '<tr>'+
            '<td><b>'+safe(r.full_name||"—")+'</b><div dir="ltr" style="color:#64748b;font-size:9px;margin-top:4px">'+safe(r.phone||"")+(r.email?' · '+safe(r.email):"")+'</div></td>'+
            '<td>'+safe(webinarTitleOf(r))+'</td>'+
            '<td>'+safe(r.job_title||"—")+'</td>'+
            '<td>'+safe(aiExperienceLabel[r.ai_experience]||r.ai_experience||"—")+'</td>'+
            '<td><select class="course-status-picker '+(r.attended?"green":"orange")+'" data-webinar-attendance data-registration-id="'+safe(r.id)+'"><option value="false"'+(!r.attended?" selected":"")+'>حاضر نشده</option><option value="true"'+(r.attended?" selected":"")+'>حاضر شده</option></select>'+(r.attended?'<div style="color:#64748b;font-size:9px;margin-top:4px">'+safe(r.attendance_minutes||0)+' دقیقه · '+safe(r.join_count||0)+' ورود</div>':'')+'</td>'+
            '<td><select class="course-status-picker '+(r.status==="cancelled"?"red":r.status==="contacted"?"green":"orange")+'" data-webinar-registration-status data-registration-id="'+safe(r.id)+'"><option value="registered"'+(r.status==="registered"?" selected":"")+'>ثبت شده</option><option value="contacted"'+(r.status==="contacted"?" selected":"")+'>پیگیری شده</option><option value="cancelled"'+(r.status==="cancelled"?" selected":"")+'>لغو شده</option></select></td>'+
            '<td>'+(r.date_created?new Date(r.date_created).toLocaleString("fa-IR"):"—")+'</td>'+
            '<td><button type="button" class="top-action" data-webinar-registration-edit="'+safe(r.id)+'">ویرایش</button></td>'+
          '</tr>';
        }).join("");
      }
      async function loadWebinarRegistrations(){
        const body=document.getElementById("webinar-registration-table-body");
        if(body)body.innerHTML='<tr><td colspan="8" class="loading-row">در حال دریافت ثبت نام ها...</td></tr>';
        try{
          const res=await fetch("/api/webinar-registrations",{headers:{accept:"application/json"}});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"دریافت ثبت نام ها ناموفق بود.");
          webinarRegistrationData=Array.isArray(data.data)?data.data:[];
          renderWebinarRegistrations();
        }catch(ex){if(body)body.innerHTML='<tr><td colspan="8" class="empty-row">'+safe(ex.message||"دریافت ثبت نام ها ناموفق بود.")+'</td></tr>'}
      }
      async function patchWebinarRegistration(id,payload){
        const res=await fetch("/api/webinar-registrations/"+encodeURIComponent(id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        const data=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(data.message||"ویرایش ثبت نام ناموفق بود.");
        const index=webinarRegistrationData.findIndex(function(r){return String(r.id)===String(id)});
        if(index>=0)webinarRegistrationData[index]={...webinarRegistrationData[index],...(data.data||{})};
        renderWebinarRegistrations();
      }
      const registrationModal=document.getElementById("webinar-registration-modal");
      let editingWebinarRegistrationId=null;
      function openWebinarRegistrationModal(row){
        editingWebinarRegistrationId=String(row.id);
        const form=document.getElementById("webinar-registration-form");
        form.querySelector('[name="full_name"]').value=row.full_name||"";
        form.querySelector('[name="phone"]').value=row.phone||"";
        form.querySelector('[name="email"]').value=row.email||"";
        form.querySelector('[name="age"]').value=row.age??"";
        form.querySelector('[name="education"]').value=row.education||"";
        form.querySelector('[name="job_title"]').value=row.job_title||"";
        form.querySelector('[name="ai_experience"]').value=row.ai_experience||"";
        form.querySelector('[name="status"]').value=row.status||"registered";
        form.querySelector('[name="registration_goal"]').value=row.registration_goal||"";
        form.querySelector('[name="attended"]').value=row.attended?"true":"false";
        form.querySelector('[name="attendance_minutes"]').value=Number(row.attendance_minutes||0);
        form.querySelector('[name="join_count"]').value=Number(row.join_count||0);
        const err=document.getElementById("webinar-registration-form-error");err.textContent="";err.className="form-error";
        registrationModal.classList.add("show");registrationModal.setAttribute("aria-hidden","false");
      }
      function closeWebinarRegistrationModal(){registrationModal?.classList.remove("show");registrationModal?.setAttribute("aria-hidden","true");editingWebinarRegistrationId=null}
      document.getElementById("webinar-registration-table-body")?.addEventListener("change",async function(e){
        const statusSelect=e.target.closest?.("[data-webinar-registration-status]");
        const attendanceSelect=e.target.closest?.("[data-webinar-attendance]");
        const select=statusSelect||attendanceSelect;
        if(!select)return;
        select.disabled=true;
        try{
          if(statusSelect){
            await patchWebinarRegistration(select.dataset.registrationId,{status:select.value});
          }else{
            await patchWebinarRegistration(select.dataset.registrationId,{attended:select.value==="true"});
          }
        }catch(ex){
          alert(ex.message||"ویرایش ناموفق بود.");
          await loadWebinarRegistrations();
        }finally{select.disabled=false}
      });
      document.getElementById("webinar-registration-table-body")?.addEventListener("click",function(e){
        const btn=e.target.closest?.("[data-webinar-registration-edit]");if(!btn)return;
        const row=webinarRegistrationData.find(function(r){return String(r.id)===String(btn.dataset.webinarRegistrationEdit)});
        if(row)openWebinarRegistrationModal(row);
      });
      document.querySelectorAll("[data-webinar-sort]").forEach(function(btn){
        btn.addEventListener("click",function(){
          const key=btn.dataset.webinarSort;
          if(webinarRegistrationSort.key===key){
            webinarRegistrationSort.direction=webinarRegistrationSort.direction==="asc"?"desc":"asc";
          }else{
            webinarRegistrationSort.key=key;
            webinarRegistrationSort.direction=key==="date"?"desc":"asc";
          }
          renderWebinarRegistrations();
        });
      });
            document.getElementById("webinar-registration-search")?.addEventListener("input",renderWebinarRegistrations);
      document.getElementById("webinar-registration-webinar-filter")?.addEventListener("change",renderWebinarRegistrations);
      document.getElementById("webinar-registration-status-filter")?.addEventListener("change",renderWebinarRegistrations);
      document.getElementById("webinar-registrations-refresh")?.addEventListener("click",loadWebinarRegistrations);
      document.getElementById("webinar-registration-modal-close")?.addEventListener("click",closeWebinarRegistrationModal);
      document.getElementById("webinar-registration-cancel")?.addEventListener("click",closeWebinarRegistrationModal);
      registrationModal?.addEventListener("click",function(e){if(e.target===registrationModal)closeWebinarRegistrationModal()});
      document.getElementById("webinar-registration-form")?.addEventListener("submit",async function(e){
        e.preventDefault();if(!editingWebinarRegistrationId)return;
        const form=e.currentTarget,submit=document.getElementById("webinar-registration-submit"),err=document.getElementById("webinar-registration-form-error");
        submit.disabled=true;err.className="form-error";
        const fd=new FormData(form);
        const payload=Object.fromEntries(fd.entries());
        payload.age=payload.age?Number(payload.age):null;
        payload.attended=payload.attended==="true";
        payload.attendance_minutes=Math.max(0,Number(payload.attendance_minutes||0));
        payload.join_count=Math.max(0,Number(payload.join_count||0));
        try{
          await patchWebinarRegistration(editingWebinarRegistrationId,payload);
          closeWebinarRegistrationModal();openView("webinar-registrations");
        }catch(ex){err.textContent=ex.message||"ویرایش ثبت نام ناموفق بود.";err.className="form-error show"}
        finally{submit.disabled=false}
      });



      const courseRegistrationStatusLabel={
        new:"جدید",
        contacted:"تماس گرفته شد",
        confirmed:"تایید شده",
        enrolled:"ثبت نام نهایی",
        cancelled:"لغو شده"
      };
      const courseRegistrationPaymentLabel={cash:"نقدی",installment:"۳ قسط",unsure:"نامشخص"};
      const courseRegistrationAiLabel={none:"بدون آشنایی",casual:"مقدماتی",daily:"متوسط",professional:"حرفه ای",builder:"پیشرفته"};

      function courseRegistrationTitle(row){
        return row.course_title||row.course_slug||"—";
      }
      function courseRegistrationMoney(value){
        const amount=Number(value);
        if(!Number.isFinite(amount))return "—";
        return amount.toLocaleString("fa-IR")+" تومان";
      }
      function renderCourseRegistrations(){
        const body=document.getElementById("course-registration-table-body");
        if(!body)return;
        const q=(document.getElementById("course-registration-search")?.value||"").trim().toLowerCase();
        const course=document.getElementById("course-registration-course-filter")?.value||"";
        const status=document.getElementById("course-registration-status-filter")?.value||"";
        const rows=courseRegistrationData.filter(function(row){
          const hay=[row.full_name,row.phone,row.email,row.job_title,row.course_slug,row.course_title].join(" ").toLowerCase();
          return (!q||hay.includes(q))&&(!course||String(row.course_slug||"")===course)&&(!status||row.registration_status===status);
        });

        const uniqueCourses=new Set(courseRegistrationData.map(function(row){return String(row.course_slug||"").trim()}).filter(Boolean));
        const total=document.getElementById("course-registrations-total");
        const courses=document.getElementById("course-registrations-courses");
        const fresh=document.getElementById("course-registrations-new");
        const enrolled=document.getElementById("course-registrations-enrolled");
        if(total)total.textContent=courseRegistrationData.length.toLocaleString("fa-IR");
        if(courses)courses.textContent=uniqueCourses.size.toLocaleString("fa-IR");
        if(fresh)fresh.textContent=courseRegistrationData.filter(function(row){return row.registration_status==="new"}).length.toLocaleString("fa-IR");
        if(enrolled)enrolled.textContent=courseRegistrationData.filter(function(row){return row.registration_status==="enrolled"}).length.toLocaleString("fa-IR");

        if(!rows.length){
          body.innerHTML='<tr><td colspan="8" class="empty-row">ثبت نامی پیدا نشد.</td></tr>';
          return;
        }

        body.innerHTML=rows.map(function(row){
          const initial=safe(((row.full_name||"U").trim()[0]||"U").toUpperCase());
          const statusClass=row.registration_status==="enrolled"||row.registration_status==="confirmed"?"green":row.registration_status==="cancelled"?"red":row.registration_status==="contacted"?"blue":"orange";
          const payment=courseRegistrationPaymentLabel[row.payment_preference]||row.payment_preference||"—";
          const ai=courseRegistrationAiLabel[row.ai_familiarity]||row.ai_familiarity||"—";
          const contact=[row.phone,row.email].filter(Boolean).map(function(value){return safe(value)}).join(" · ");
          const amounts='<div style="display:grid;gap:3px;white-space:nowrap">'+
            '<span>توافق: '+safe(courseRegistrationMoney(row.agreed_amount))+'</span>'+
            '<span style="color:#059669">پرداخت: '+safe(courseRegistrationMoney(row.paid_amount))+'</span>'+
            '<span style="color:#d97706">مانده: '+safe(courseRegistrationMoney(row.remaining_amount))+'</span>'+
          '</div>';
          return '<tr>'+
            '<td><div class="person"><div class="mini-avatar">'+initial+'</div><div><button type="button" class="course-registration-name" data-course-registration-open="'+safe(row.id)+'">'+safe(row.full_name||"—")+'</button><small dir="ltr">'+contact+'</small>'+(row.student_user?'<span class="crm-chip student">دانشجو</span>':row.crm_contact?'<span class="crm-chip">CRM</span>':'')+'</div></div></td>'+
            '<td><b>'+safe(courseRegistrationTitle(row))+'</b><div dir="ltr" style="color:#9ca3af;font-size:9px;margin-top:4px">'+safe(row.course_slug||"")+'</div></td>'+
            '<td><span class="status '+statusClass+'">'+safe(courseRegistrationStatusLabel[row.registration_status]||row.registration_status||"—")+'</span></td>'+
            '<td>'+safe(row.job_title||"—")+'</td>'+
            '<td>'+safe(ai)+'</td>'+
            '<td>'+safe(payment)+'</td>'+
            '<td>'+amounts+'</td>'+
            '<td>'+(row.date_created?new Date(row.date_created).toLocaleString("fa-IR"):"—")+'</td>'+
          '</tr>';
        }).join("");
      }

      async function loadCourseRegistrations(){
        const body=document.getElementById("course-registration-table-body");
        if(body)body.innerHTML='<tr><td colspan="8" class="loading-row">در حال دریافت ثبت نام ها...</td></tr>';
        try{
          const res=await fetch("/api/course-registrations",{headers:{accept:"application/json"}});
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"دریافت ثبت نام های دوره ناموفق بود.");
          courseRegistrationData=Array.isArray(payload.data)?payload.data:[];
          courseRegistrationCourses=Array.isArray(payload.courses)?payload.courses:[];
          const filter=document.getElementById("course-registration-course-filter");
          if(filter){
            const current=filter.value;
            const bySlug=new Map();
            courseRegistrationCourses.forEach(function(course){
              const slug=String(course.slug||"").trim();
              if(slug)bySlug.set(slug,course.title||slug);
            });
            courseRegistrationData.forEach(function(row){
              const slug=String(row.course_slug||"").trim();
              if(slug&&!bySlug.has(slug))bySlug.set(slug,row.course_title||slug);
            });
            filter.innerHTML='<option value="">همه دوره ها</option>'+[...bySlug.entries()].map(function(entry){
              return '<option value="'+safe(entry[0])+'">'+safe(entry[1])+'</option>';
            }).join("");
            if(current&&bySlug.has(current))filter.value=current;
          }
          renderCourseRegistrations();
        }catch(error){
          if(body)body.innerHTML='<tr><td colspan="8" class="empty-row">'+safe(error.message||"دریافت ثبت نام های دوره ناموفق بود.")+'</td></tr>';
        }
      }


      const courseRegistrationModal=document.getElementById("course-registration-modal");
      const canConfirmCourseRegistration=${accessLevel(user)==="admin"?"true":"false"};
      let editingCourseRegistrationId=null;
      let editingCourseRegistrationContext={contact:null,reports:[]};

      function setCourseRegistrationResult(message,type){
        const el=document.getElementById("course-registration-result");
        if(!el)return;
        if(!message){el.textContent="";el.className="course-registration-result";return}
        el.textContent=message;
        el.className="course-registration-result show "+(type||"success");
      }

      function populateCourseRegistrationCourseOptions(currentSlug){
        const select=document.querySelector('#course-registration-form [name="course_slug"]');
        if(!select)return;
        const map=new Map();
        courseRegistrationCourses.forEach(function(course){
          const slug=String(course.slug||"").trim();
          if(slug)map.set(slug,course.title||slug);
        });
        courseRegistrationData.forEach(function(row){
          const slug=String(row.course_slug||"").trim();
          if(slug&&!map.has(slug))map.set(slug,row.course_title||slug);
        });
        if(currentSlug&&!map.has(currentSlug))map.set(currentSlug,currentSlug);
        select.innerHTML=[...map.entries()].map(function(entry){
          return '<option value="'+safe(entry[0])+'">'+safe(entry[1])+'</option>';
        }).join("");
        select.value=currentSlug||"";
      }

      function renderCourseRegistrationCrmContext(){
        const state=document.getElementById("course-registration-crm-state");
        const list=document.getElementById("course-registration-crm-reports");
        const editor=document.getElementById("course-registration-report-editor");
        const contact=editingCourseRegistrationContext.contact;
        const reports=Array.isArray(editingCourseRegistrationContext.reports)?editingCourseRegistrationContext.reports:[];
        if(state){
          state.textContent=contact
            ? "مخاطب CRM #"+contact.id+" · "+(contact.contact_status||"contact")
            : "هنوز به مخاطبان اضافه نشده";
        }
        if(editor)editor.style.display=contact?"block":"none";
        if(!list)return;
        if(!contact){
          list.innerHTML='<div style="font-size:10px;color:#94a3b8">برای ثبت گزارش ابتدا شخص را به مخاطبان اضافه کنید.</div>';
          return;
        }
        if(!reports.length){
          list.innerHTML='<div style="font-size:10px;color:#94a3b8">هنوز گزارشی برای این مخاطب ثبت نشده است.</div>';
          return;
        }
        list.innerHTML=reports.map(function(report){
          const author=report.author&&typeof report.author==="object"
            ? [report.author.first_name,report.author.last_name].filter(Boolean).join(" ")||report.author.email||"—"
            : "—";
          return '<div class="crm-report-item">'+
            '<b>'+safe(author)+' · '+safe(report.date_created?new Date(report.date_created).toLocaleString("fa-IR"):"—")+'</b>'+
            '<p>'+safe(report.report_text||"")+'</p>'+
            (report.next_action?'<small>اقدام بعدی: '+safe(report.next_action)+(report.next_action_at?' · '+safe(new Date(report.next_action_at).toLocaleString("fa-IR")):'')+'</small>':'')+
          '</div>';
        }).join("");
      }

      async function loadCourseRegistrationContext(id){
        editingCourseRegistrationContext={contact:null,reports:[]};
        renderCourseRegistrationCrmContext();
        try{
          const res=await fetch("/api/course-registrations/"+encodeURIComponent(id)+"/context",{headers:{accept:"application/json"}});
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"دریافت اطلاعات CRM ناموفق بود.");
          editingCourseRegistrationContext={
            contact:payload.contact||null,
            reports:Array.isArray(payload.reports)?payload.reports:[]
          };
          renderCourseRegistrationCrmContext();
        }catch(error){
          const state=document.getElementById("course-registration-crm-state");
          if(state)state.textContent=error.message||"دریافت اطلاعات CRM ناموفق بود.";
        }
      }

      function formatMoneyString(value){
        const raw=String(value??"").replace(/[^0-9]/g,"");
        return raw?Number(raw).toLocaleString("en-US"):"";
      }
      function moneyInputNumber(value){
        const raw=String(value??"").replace(/[^0-9]/g,"");
        return raw?Number(raw):0;
      }
      function formatMoneyInput(input){
        if(!input)return;
        input.value=formatMoneyString(input.value);
      }

      function openCourseRegistrationModal(row){
        editingCourseRegistrationId=String(row.id);
        const form=document.getElementById("course-registration-form");
        populateCourseRegistrationCourseOptions(row.course_slug||"");
        const values={
          full_name:row.full_name||"",
          phone:row.phone||"",
          email:row.email||"",
          course_slug:row.course_slug||"",
          registration_status:row.registration_status||"new",
          age_range:row.age_range||"",
          education_level:row.education_level||"",
          field_of_study:row.field_of_study||"",
          job_title:row.job_title||"",
          ai_familiarity:row.ai_familiarity||"none",
          ai_usage:row.ai_usage||"rarely",
          programming_level:row.programming_level||"none",
          payment_preference:row.payment_preference||"unsure",
          agreed_amount:row.agreed_amount??0,
          paid_amount:row.paid_amount??0,
          remaining_amount:row.remaining_amount??0,
          goals_text:row.goals_text||"",
          goals:row.goals?JSON.stringify(row.goals,null,2):"",
          desired_project:row.desired_project||"",
          source:row.source||"",
          utm_source:row.utm_source||"",
          utm_medium:row.utm_medium||"",
          utm_campaign:row.utm_campaign||""
        };
        Object.entries(values).forEach(function(entry){
          const input=form.querySelector('[name="'+entry[0]+'"]');
          if(input)input.value=entry[1];
        });
        form.querySelectorAll("[data-money-input]").forEach(formatMoneyInput);
        const err=document.getElementById("course-registration-form-error");
        if(err){err.textContent="";err.className="form-error"}
        setCourseRegistrationResult("");
        const confirmBtn=document.getElementById("course-registration-confirm");
        if(confirmBtn)confirmBtn.style.display=canConfirmCourseRegistration?"inline-flex":"none";
        courseRegistrationModal.classList.add("show");
        courseRegistrationModal.setAttribute("aria-hidden","false");
        loadCourseRegistrationContext(row.id);
      }

      function closeCourseRegistrationModal(){
        courseRegistrationModal?.classList.remove("show");
        courseRegistrationModal?.setAttribute("aria-hidden","true");
        editingCourseRegistrationId=null;
        editingCourseRegistrationContext={contact:null,reports:[]};
      }

      function courseRegistrationFormPayload(){
        const form=document.getElementById("course-registration-form");
        const fd=new FormData(form);
        const payload=Object.fromEntries(fd.entries());
        for(const field of ["agreed_amount","paid_amount","remaining_amount"]){
          payload[field]=Math.max(0,moneyInputNumber(payload[field]));
        }
        const rawGoals=String(payload.goals||"").trim();
        if(rawGoals){
          try{payload.goals=JSON.parse(rawGoals)}catch{throw new Error("JSON اهداف معتبر نیست.")}
        }else{
          delete payload.goals;
        }
        return payload;
      }

      async function saveCourseRegistration(){
        if(!editingCourseRegistrationId)throw new Error("ثبت نام انتخاب نشده است.");
        const payload=courseRegistrationFormPayload();
        const res=await fetch("/api/course-registrations/"+encodeURIComponent(editingCourseRegistrationId),{
          method:"PATCH",
          headers:{"content-type":"application/json"},
          body:JSON.stringify(payload)
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(data.message||"ذخیره تغییرات ناموفق بود.");
        await loadCourseRegistrations();
        return data.data||null;
      }

      document.getElementById("course-registration-table-body")?.addEventListener("click",function(event){
        const btn=event.target.closest?.("[data-course-registration-open]");
        if(!btn)return;
        const row=courseRegistrationData.find(function(item){return String(item.id)===String(btn.dataset.courseRegistrationOpen)});
        if(row)openCourseRegistrationModal(row);
      });

      document.getElementById("course-registration-form")?.addEventListener("input",function(event){
        if(event.target?.matches?.("[data-money-input]"))formatMoneyInput(event.target);
      });
      document.getElementById("course-registration-modal-close")?.addEventListener("click",closeCourseRegistrationModal);
      document.getElementById("course-registration-cancel")?.addEventListener("click",closeCourseRegistrationModal);
      courseRegistrationModal?.addEventListener("click",function(event){if(event.target===courseRegistrationModal)closeCourseRegistrationModal()});

      document.getElementById("course-registration-form")?.addEventListener("submit",async function(event){
        event.preventDefault();
        const submit=document.getElementById("course-registration-submit");
        const err=document.getElementById("course-registration-form-error");
        submit.disabled=true;
        if(err){err.textContent="";err.className="form-error"}
        try{
          await saveCourseRegistration();
          setCourseRegistrationResult("تغییرات ثبت نام ذخیره شد.","success");
        }catch(error){
          if(err){err.textContent=error.message||"ذخیره تغییرات ناموفق بود.";err.className="form-error show"}
        }finally{submit.disabled=false}
      });

      document.getElementById("course-registration-add-contact")?.addEventListener("click",async function(){
        if(!editingCourseRegistrationId)return;
        const btn=this,err=document.getElementById("course-registration-form-error");
        btn.disabled=true;if(err){err.className="form-error";err.textContent=""}
        try{
          await saveCourseRegistration();
          const res=await fetch("/api/course-registrations/"+encodeURIComponent(editingCourseRegistrationId)+"/add-contact",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"اضافه کردن مخاطب ناموفق بود.");
          setCourseRegistrationResult("مخاطب با موفقیت در CRM ایجاد یا به روز شد.","success");
          await loadCourseRegistrationContext(editingCourseRegistrationId);
          await loadCourseRegistrations();
        }catch(error){
          if(err){err.textContent=error.message||"اضافه کردن مخاطب ناموفق بود.";err.className="form-error show"}
        }finally{btn.disabled=false}
      });

      document.getElementById("course-registration-confirm")?.addEventListener("click",async function(){
        if(!editingCourseRegistrationId||!canConfirmCourseRegistration)return;
        const btn=this,err=document.getElementById("course-registration-form-error");
        btn.disabled=true;if(err){err.className="form-error";err.textContent=""}
        try{
          await saveCourseRegistration();
          const res=await fetch("/api/course-registrations/"+encodeURIComponent(editingCourseRegistrationId)+"/confirm",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"تایید ثبت نام ناموفق بود.");
          let message="ثبت نام تایید شد، مخاطب CRM متصل شد و دسترسی دوره فعال شد.";
          if(data.created_user&&data.temporary_password){
            message+=" حساب دانشجو ساخته شد. ایمیل: "+data.user.email+" | رمز موقت: "+data.temporary_password;
          }
          setCourseRegistrationResult(message,"success");
          await loadCourseRegistrations();
          const fresh=courseRegistrationData.find(function(item){return String(item.id)===String(editingCourseRegistrationId)});
          if(fresh){
            document.querySelector('#course-registration-form [name="registration_status"]').value=fresh.registration_status||"enrolled";
          }
          await loadCourseRegistrationContext(editingCourseRegistrationId);
        }catch(error){
          if(err){err.textContent=error.message||"تایید ثبت نام ناموفق بود.";err.className="form-error show"}
        }finally{btn.disabled=false}
      });

      document.getElementById("course-registration-add-report")?.addEventListener("click",async function(){
        if(!editingCourseRegistrationId)return;
        const textInput=document.getElementById("course-registration-report-text");
        const nextAction=document.getElementById("course-registration-next-action");
        const nextAt=document.getElementById("course-registration-next-action-at");
        const reportText=String(textInput?.value||"").trim();
        if(!reportText)return alert("متن گزارش را وارد کنید.");
        const btn=this;btn.disabled=true;
        try{
          const res=await fetch("/api/course-registrations/"+encodeURIComponent(editingCourseRegistrationId)+"/reports",{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({
              report_text:reportText,
              next_action:String(nextAction?.value||"").trim(),
              next_action_at:nextAt?.value||null
            })
          });
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"ثبت گزارش ناموفق بود.");
          if(textInput)textInput.value="";
          if(nextAction)nextAction.value="";
          if(nextAt)nextAt.value="";
          await loadCourseRegistrationContext(editingCourseRegistrationId);
        }catch(error){alert(error.message||"ثبت گزارش ناموفق بود.")}
        finally{btn.disabled=false}
      });

      document.getElementById("course-registration-search")?.addEventListener("input",renderCourseRegistrations);
      document.getElementById("course-registration-course-filter")?.addEventListener("change",renderCourseRegistrations);
      document.getElementById("course-registration-status-filter")?.addEventListener("change",renderCourseRegistrations);
      document.getElementById("course-registrations-refresh")?.addEventListener("click",loadCourseRegistrations);


      let contactData=[];
      const contactStatusLabel={lead:"سرنخ",contact:"مخاطب",student:"دانشجو",customer:"مشتری",inactive:"غیرفعال"};

      function contactStatusClass(status){
        if(status==="student"||status==="customer")return "green";
        if(status==="lead")return "orange";
        if(status==="inactive")return "red";
        return "blue";
      }

      function contactUserLabel(contact){
        const user=contact.directus_user;
        if(!user)return "—";
        if(typeof user==="string")return "متصل";
        const name=[user.first_name,user.last_name].filter(Boolean).join(" ");
        return name||user.email||"متصل";
      }

      function renderContacts(){
        const body=document.getElementById("contacts-table-body");
        if(!body)return;
        const q=(document.getElementById("contacts-search")?.value||"").trim().toLowerCase();
        const status=document.getElementById("contacts-status-filter")?.value||"";

        const rows=contactData.filter(function(contact){
          const hay=[
            contact.full_name,contact.phone,contact.email,contact.job_title,contact.specialty,
            contact.company,contact.field_of_study,contact.instagram_url,contact.linkedin_url,
            contact.telegram_id,contact.website_url,contact.source
          ].join(" ").toLowerCase();
          return (!q||hay.includes(q))&&(!status||String(contact.contact_status||"")===status);
        });

        const total=document.getElementById("contacts-total");
        const students=document.getElementById("contacts-students");
        const leads=document.getElementById("contacts-leads");
        const users=document.getElementById("contacts-users");
        if(total)total.textContent=contactData.length.toLocaleString("fa-IR");
        if(students)students.textContent=contactData.filter(function(c){return c.contact_status==="student"}).length.toLocaleString("fa-IR");
        if(leads)leads.textContent=contactData.filter(function(c){return c.contact_status==="lead"}).length.toLocaleString("fa-IR");
        if(users)users.textContent=contactData.filter(function(c){return Boolean(c.directus_user)}).length.toLocaleString("fa-IR");

        if(!rows.length){
          body.innerHTML='<tr><td colspan="9" class="empty-row">مخاطبی پیدا نشد.</td></tr>';
          return;
        }

        body.innerHTML=rows.map(function(contact){
          const initial=safe(((contact.full_name||"U").trim()[0]||"U").toUpperCase());
          const phone=contact.phone?'<span dir="ltr">'+safe(contact.phone)+'</span>':"";
          const email=contact.email?'<span dir="ltr">'+safe(contact.email)+'</span>':"";
          const contactLines=[phone,email].filter(Boolean).join(" · ");
          const work=[contact.job_title,contact.specialty].filter(Boolean).map(safe).join(" · ")||"—";
          const education=[contact.education_level,contact.field_of_study].filter(Boolean).map(safe).join(" · ")||"—";
          const socials=[
            contact.instagram_url?"Instagram":"",
            contact.linkedin_url?"LinkedIn":"",
            contact.telegram_id?"Telegram":"",
            contact.website_url?"Website":""
          ].filter(Boolean).join(" · ")||"—";
          const userLabel=safe(contactUserLabel(contact));
          const userEmail=contact.directus_user&&typeof contact.directus_user==="object"&&contact.directus_user.email
            ? '<small dir="ltr">'+safe(contact.directus_user.email)+'</small>'
            : "";
          return '<tr>'+
            '<td><div class="person"><div class="mini-avatar">'+initial+'</div><div><a class="course-registration-name" href="/admin/contacts/'+encodeURIComponent(contact.id)+'">'+safe(contact.full_name||"—")+'</a><small>'+contactLines+'</small></div></div></td>'+
            '<td><span class="status '+contactStatusClass(contact.contact_status)+'">'+safe(contactStatusLabel[contact.contact_status]||contact.contact_status||"—")+'</span></td>'+
            '<td>'+work+'</td>'+
            '<td>'+safe(contact.company||"—")+'</td>'+
            '<td>'+education+'</td>'+
            '<td>'+safe(socials)+'</td>'+
            '<td><b style="font-size:10px">'+userLabel+'</b>'+userEmail+'</td>'+
            '<td>'+safe(contact.source||"—")+'</td>'+
            '<td>'+(contact.date_updated?new Date(contact.date_updated).toLocaleString("fa-IR"):contact.date_created?new Date(contact.date_created).toLocaleString("fa-IR"):"—")+'</td>'+
          '</tr>';
        }).join("");
      }

      async function loadContacts(){
        const body=document.getElementById("contacts-table-body");
        if(body)body.innerHTML='<tr><td colspan="9" class="loading-row">در حال دریافت مخاطبان...</td></tr>';
        try{
          const res=await fetch("/api/crm-contacts",{headers:{accept:"application/json"}});
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"دریافت مخاطبان ناموفق بود.");
          contactData=Array.isArray(payload.data)?payload.data:[];
          renderContacts();
        }catch(error){
          if(body)body.innerHTML='<tr><td colspan="9" class="empty-row">'+safe(error.message||"دریافت مخاطبان ناموفق بود.")+'</td></tr>';
        }
      }

      document.getElementById("contacts-search")?.addEventListener("input",renderContacts);
      document.getElementById("contacts-status-filter")?.addEventListener("change",renderContacts);
      document.getElementById("contacts-refresh")?.addEventListener("click",loadContacts);

      let crmReportData=[];
      const crmReportTypeLabel={
        call:"تماس",payment:"پرداخت",support:"پشتیبانی",follow_up:"پیگیری",
        meeting:"جلسه",message:"پیام",sales:"فروش",other:"سایر"
      };

      function crmReportLocalDateTimeValue(dateValue){
        const d=dateValue instanceof Date?dateValue:new Date(dateValue||Date.now());
        const pad=function(value){return String(value).padStart(2,"0")};
        return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());
      }

      function resetCrmReportForm(){
        const form=document.getElementById("crm-report-form");
        if(!form)return;
        form.reset();
        const at=document.getElementById("crm-report-at");
        const contactId=document.getElementById("crm-report-contact-id");
        const contactSearch=document.getElementById("crm-report-contact-search");
        const results=document.getElementById("crm-report-contact-results");
        const message=document.getElementById("crm-report-form-message");
        if(at)at.value=crmReportLocalDateTimeValue(new Date());
        if(contactId)contactId.value="";
        if(contactSearch)contactSearch.value="";
        if(results){results.innerHTML="";results.classList.remove("show")}
        if(message){message.textContent="";message.className="crm-report-form-message"}
      }

      function crmReportContactMatches(query){
        const q=String(query||"").trim().toLowerCase();
        if(!q)return [];
        return contactData.filter(function(contact){
          const hay=[contact.full_name,contact.phone,contact.email,contact.company,contact.job_title,contact.specialty]
            .filter(Boolean).join(" ").toLowerCase();
          return hay.includes(q);
        }).slice(0,10);
      }

      function renderCrmReportContactResults(query){
        const results=document.getElementById("crm-report-contact-results");
        if(!results)return;
        const rows=crmReportContactMatches(query);
        if(!String(query||"").trim()){
          results.innerHTML="";
          results.classList.remove("show");
          return;
        }
        if(!rows.length){
          results.innerHTML='<div class="empty-row" style="padding:14px">مخاطبی پیدا نشد.</div>';
          results.classList.add("show");
          return;
        }
        results.innerHTML=rows.map(function(contact){
          const meta=[contact.phone,contact.email].filter(Boolean).join(" · ");
          return '<button type="button" class="crm-autocomplete-item" data-crm-contact-id="'+safe(contact.id)+'">'+
            '<b>'+safe(contact.full_name||"بدون نام")+'</b>'+
            '<small>'+safe(meta||"بدون اطلاعات تماس")+'</small>'+
          '</button>';
        }).join("");
        results.classList.add("show");
      }

      function crmReportAuthorLabel(report){
        const author=report.author;
        if(!author)return "—";
        if(typeof author==="string")return author;
        return [author.first_name,author.last_name].filter(Boolean).join(" ")||author.email||"—";
      }

      function crmReportContactLabel(report){
        const contact=report.contact;
        if(!contact)return "—";
        if(typeof contact==="string"||typeof contact==="number")return String(contact);
        return contact.full_name||contact.email||contact.phone||"—";
      }

      function renderCrmReports(){
        const body=document.getElementById("crm-reports-table-body");
        if(!body)return;
        const q=String(document.getElementById("crm-reports-search")?.value||"").trim().toLowerCase();
        const type=String(document.getElementById("crm-reports-type-filter")?.value||"");
        const rows=crmReportData.filter(function(report){
          const contact=report.contact&&typeof report.contact==="object"?report.contact:{};
          const hay=[
            contact.full_name,contact.phone,contact.email,
            crmReportTypeLabel[report.report_type]||report.report_type,
            report.report_text,report.next_action,crmReportAuthorLabel(report)
          ].filter(Boolean).join(" ").toLowerCase();
          return (!q||hay.includes(q))&&(!type||String(report.report_type||"other")===type);
        });

        if(!rows.length){
          body.innerHTML='<tr><td colspan="6" class="empty-row">گزارشی پیدا نشد.</td></tr>';
          return;
        }

        body.innerHTML=rows.map(function(report){
          const contact=report.contact&&typeof report.contact==="object"?report.contact:null;
          const contactName=safe(crmReportContactLabel(report));
          const contactCell=contact
            ? '<a class="course-registration-name" href="/admin/contacts/'+encodeURIComponent(contact.id)+'">'+contactName+'</a>'+
              '<small style="display:block;margin-top:4px;color:#94a3b8" dir="ltr">'+safe([contact.phone,contact.email].filter(Boolean).join(" · "))+'</small>'
            : contactName;
          const occurred=report.report_at||report.date_created;
          return '<tr>'+
            '<td style="white-space:nowrap">'+safe(occurred?new Date(occurred).toLocaleString("fa-IR"):"—")+'</td>'+
            '<td>'+contactCell+'</td>'+
            '<td><span class="status blue">'+safe(crmReportTypeLabel[report.report_type]||report.report_type||"سایر")+'</span></td>'+
            '<td class="crm-report-text-cell">'+safe(report.report_text||"—")+'</td>'+
            '<td class="crm-next-action-cell">'+safe(report.next_action||"—")+'</td>'+
            '<td>'+safe(crmReportAuthorLabel(report))+'</td>'+
          '</tr>';
        }).join("");
      }

      async function loadCrmReports(){
        const body=document.getElementById("crm-reports-table-body");
        if(body)body.innerHTML='<tr><td colspan="6" class="loading-row">در حال دریافت گزارش ها...</td></tr>';
        try{
          const res=await fetch("/api/crm-reports",{headers:{accept:"application/json"}});
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"دریافت گزارش ها ناموفق بود.");
          crmReportData=Array.isArray(payload.data)?payload.data:[];
          renderCrmReports();
        }catch(error){
          if(body)body.innerHTML='<tr><td colspan="6" class="empty-row">'+safe(error.message||"دریافت گزارش ها ناموفق بود.")+'</td></tr>';
        }
      }

      const crmReportContactSearch=document.getElementById("crm-report-contact-search");
      crmReportContactSearch?.addEventListener("input",function(){
        const hidden=document.getElementById("crm-report-contact-id");
        if(hidden)hidden.value="";
        renderCrmReportContactResults(this.value);
      });
      crmReportContactSearch?.addEventListener("focus",function(){
        if(this.value)renderCrmReportContactResults(this.value);
      });

      document.getElementById("crm-report-contact-results")?.addEventListener("click",function(event){
        const button=event.target.closest?.("[data-crm-contact-id]");
        if(!button)return;
        const contact=contactData.find(function(item){return String(item.id)===String(button.dataset.crmContactId)});
        if(!contact)return;
        const hidden=document.getElementById("crm-report-contact-id");
        const search=document.getElementById("crm-report-contact-search");
        if(hidden)hidden.value=String(contact.id);
        if(search)search.value=contact.full_name||contact.email||contact.phone||String(contact.id);
        this.classList.remove("show");
      });

      document.addEventListener("click",function(event){
        const box=event.target.closest?.(".crm-autocomplete");
        if(!box)document.getElementById("crm-report-contact-results")?.classList.remove("show");
      });

      document.getElementById("crm-report-new")?.addEventListener("click",function(){
        resetCrmReportForm();
        document.getElementById("crm-report-contact-search")?.focus();
      });

      document.getElementById("crm-report-form")?.addEventListener("submit",async function(event){
        event.preventDefault();
        const submit=document.getElementById("crm-report-submit");
        const message=document.getElementById("crm-report-form-message");
        const contactId=String(document.getElementById("crm-report-contact-id")?.value||"").trim();
        const reportAt=String(document.getElementById("crm-report-at")?.value||"").trim();
        const reportType=String(document.getElementById("crm-report-type")?.value||"other");
        const reportText=String(document.getElementById("crm-report-text")?.value||"").trim();
        const nextAction=String(document.getElementById("crm-report-next-action")?.value||"").trim();

        if(!contactId){
          if(message){message.textContent="لطفا مخاطب را از نتایج جستجو انتخاب کنید.";message.className="crm-report-form-message show error"}
          return;
        }
        if(!reportAt||!reportText){
          if(message){message.textContent="تاریخ و ساعت و شرح گزارش الزامی هستند.";message.className="crm-report-form-message show error"}
          return;
        }

        submit.disabled=true;
        if(message){message.textContent="";message.className="crm-report-form-message"}
        try{
          const res=await fetch("/api/crm-reports",{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({
              contact:contactId,
              report_at:new Date(reportAt).toISOString(),
              report_type:reportType,
              report_text:reportText,
              next_action:nextAction
            })
          });
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"ثبت گزارش ناموفق بود.");
          resetCrmReportForm();
          if(message){message.textContent="گزارش با موفقیت ثبت شد.";message.className="crm-report-form-message show ok"}
          await loadCrmReports();
        }catch(error){
          if(message){message.textContent=error.message||"ثبت گزارش ناموفق بود.";message.className="crm-report-form-message show error"}
        }finally{
          submit.disabled=false;
        }
      });

      document.getElementById("crm-reports-search")?.addEventListener("input",renderCrmReports);
      document.getElementById("crm-reports-type-filter")?.addEventListener("change",renderCrmReports);
      document.getElementById("crm-reports-refresh")?.addEventListener("click",loadCrmReports);
      resetCrmReportForm();

      const selectedContactId=${selectedContactId?JSON.stringify(String(selectedContactId)):"null"};

      function contactDetailMoney(value){
        const number=Number(value||0);
        return Number.isFinite(number)?number.toLocaleString("en-US"):"0";
      }

      function contactDetailField(label,value,dir){
        const rendered=value===null||value===undefined||value===""?"—":safe(value);
        return '<div class="form-field"><label>'+safe(label)+'</label><div style="min-height:44px;border:1px solid #eef0f4;border-radius:11px;background:#fafbfc;padding:11px 12px;font-size:11px" '+(dir?'dir="'+dir+'"':'')+'>'+rendered+'</div></div>';
      }

      function renderContactDetail(payload){
        const contact=payload.contact||{};
        const reports=Array.isArray(payload.reports)?payload.reports:[];
        const registrations=Array.isArray(payload.registrations)?payload.registrations:[];
        const summary=payload.summary||{};

        const title=document.getElementById("contact-detail-title");
        const subtitle=document.getElementById("contact-detail-subtitle");
        if(title)title.textContent=contact.full_name||"پرونده مخاطب";
        if(subtitle)subtitle.textContent=[contact.phone,contact.email].filter(Boolean).join(" · ")||"اطلاعات CRM و سوابق آموزشی مخاطب";

        const countEl=document.getElementById("contact-detail-course-count");
        const agreedEl=document.getElementById("contact-detail-agreed");
        const paidEl=document.getElementById("contact-detail-paid");
        const debtEl=document.getElementById("contact-detail-debt");
        if(countEl)countEl.textContent=Number(summary.course_count||0).toLocaleString("fa-IR");
        if(agreedEl)agreedEl.textContent=contactDetailMoney(summary.total_agreed);
        if(paidEl)paidEl.textContent=contactDetailMoney(summary.total_paid);
        if(debtEl)debtEl.textContent=contactDetailMoney(summary.total_remaining);

        const status=document.getElementById("contact-detail-status");
        if(status)status.textContent=contactStatusLabel[contact.contact_status]||contact.contact_status||"—";

        const profile=document.getElementById("contact-detail-profile");
        if(profile){
          const linkedUser=contact.directus_user&&typeof contact.directus_user==="object"
            ? ([contact.directus_user.first_name,contact.directus_user.last_name].filter(Boolean).join(" ")||contact.directus_user.email||"متصل")
            : contact.directus_user?"متصل":"—";
          profile.innerHTML=[
            contactDetailField("نام و نام خانوادگی",contact.full_name),
            contactDetailField("وضعیت",contactStatusLabel[contact.contact_status]||contact.contact_status),
            contactDetailField("تلفن",contact.phone,"ltr"),
            contactDetailField("ایمیل",contact.email,"ltr"),
            contactDetailField("سن",contact.age||contact.age_range),
            contactDetailField("شغل",contact.job_title),
            contactDetailField("تخصص",contact.specialty),
            contactDetailField("شرکت / سازمان",contact.company),
            contactDetailField("تحصیلات",contact.education_level),
            contactDetailField("رشته",contact.field_of_study),
            contactDetailField("Instagram",contact.instagram_url,"ltr"),
            contactDetailField("LinkedIn",contact.linkedin_url,"ltr"),
            contactDetailField("Telegram",contact.telegram_id,"ltr"),
            contactDetailField("Website",contact.website_url,"ltr"),
            contactDetailField("حساب کاربری",linkedUser),
            contactDetailField("منبع",contact.source)
          ].join("")+(contact.notes?'<div class="form-field full"><label>یادداشت</label><div style="border:1px solid #eef0f4;border-radius:11px;background:#fafbfc;padding:11px 12px;font-size:11px;line-height:1.9">'+safe(contact.notes)+'</div></div>':'');
        }

        const reportCount=document.getElementById("contact-detail-report-count");
        if(reportCount)reportCount.textContent=reports.length.toLocaleString("fa-IR")+" گزارش";
        const reportList=document.getElementById("contact-detail-reports");
        if(reportList){
          reportList.innerHTML=reports.length?reports.map(function(report){
            const author=report.author&&typeof report.author==="object"
              ? [report.author.first_name,report.author.last_name].filter(Boolean).join(" ")||report.author.email||"—"
              : "—";
            return '<div class="crm-report-item"><b>'+safe(author)+' · '+safe(report.date_created?new Date(report.date_created).toLocaleString("fa-IR"):"—")+'</b>'+
              '<p>'+safe(report.report_text||"")+'</p>'+
              (report.next_action?'<small>اقدام بعدی: '+safe(report.next_action)+(report.next_action_at?' · '+safe(new Date(report.next_action_at).toLocaleString("fa-IR")):'')+'</small>':'')+
            '</div>';
          }).join(""):'<div class="empty-row">هنوز گزارشی در پرونده این مخاطب ثبت نشده است.</div>';
        }

        const tbody=document.getElementById("contact-detail-registrations");
        if(tbody){
          if(!registrations.length){
            tbody.innerHTML='<tr><td colspan="7" class="empty-row">ثبت نام دوره ای برای این مخاطب پیدا نشد.</td></tr>';
          }else{
            tbody.innerHTML=registrations.map(function(row){
              const statusClass=row.registration_status==="enrolled"||row.registration_status==="confirmed"?"green":row.registration_status==="cancelled"?"red":row.registration_status==="contacted"?"blue":"orange";
              return '<tr>'+
                '<td><b>'+safe(row.course_title||row.course_slug||"—")+'</b><div dir="ltr" style="color:#9ca3af;font-size:9px;margin-top:3px">'+safe(row.course_slug||"")+'</div></td>'+
                '<td><span class="status '+statusClass+'">'+safe(courseRegistrationStatusLabel[row.registration_status]||row.registration_status||"—")+'</span></td>'+
                '<td>'+safe(contactDetailMoney(row.agreed_amount))+' تومان</td>'+
                '<td style="color:#059669">'+safe(contactDetailMoney(row.paid_amount))+' تومان</td>'+
                '<td style="color:#d97706">'+safe(contactDetailMoney(row.remaining_amount))+' تومان</td>'+
                '<td>'+safe(courseRegistrationPaymentLabel[row.payment_preference]||row.payment_preference||"—")+'</td>'+
                '<td>'+(row.date_created?new Date(row.date_created).toLocaleString("fa-IR"):"—")+'</td>'+
              '</tr>';
            }).join("");
          }
        }
      }

      async function loadContactDetail(){
        if(!selectedContactId)return;
        try{
          const res=await fetch("/api/crm-contacts/"+encodeURIComponent(selectedContactId),{headers:{accept:"application/json"}});
          const payload=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(payload.message||"دریافت پرونده مخاطب ناموفق بود.");
          renderContactDetail(payload);
        }catch(error){
          const message=safe(error.message||"دریافت پرونده مخاطب ناموفق بود.");
          const profile=document.getElementById("contact-detail-profile");
          if(profile)profile.innerHTML='<div class="empty-row" style="grid-column:1/-1">'+message+'</div>';
          const reports=document.getElementById("contact-detail-reports");
          if(reports)reports.innerHTML="";
          const rows=document.getElementById("contact-detail-registrations");
          if(rows)rows.innerHTML='<tr><td colspan="7" class="empty-row">'+message+'</td></tr>';
        }
      }

      document.getElementById("contact-detail-refresh")?.addEventListener("click",loadContactDetail);

      let studentData=[];
      let studentCourses=[];
      let editingStudentId=null;
      const canManageStudentAssignments=${accessLevel(user)==="admin"?"true":"false"};

      function studentName(student){
        return [student.first_name,student.last_name].filter(Boolean).join(" ") || student.email || "بدون نام";
      }

      function activeStudentEnrollments(student){
        return (student.enrollments||[]).filter(function(enrollment){
          return ["active","completed"].includes(String(enrollment.status||""));
        });
      }

      function renderStudents(){
        const body=document.getElementById("students-table-body");
        if(!body)return;
        const q=(document.getElementById("student-search")?.value||"").trim().toLowerCase();
        const courseFilter=document.getElementById("student-course-filter")?.value||"";
        const activeCount=function(student){return activeStudentEnrollments(student).length};
        const rows=studentData.filter(function(student){
          const hay=(studentName(student)+" "+String(student.email||"")).toLowerCase();
          const matchesQuery=!q || hay.includes(q);
          const matchesCourse=!courseFilter || activeStudentEnrollments(student).some(function(enrollment){
            return String(enrollment.course?.id||enrollment.course||"")===String(courseFilter);
          });
          return matchesQuery&&matchesCourse;
        });

        const totalEnrollments=studentData.reduce(function(sum,student){return sum+activeCount(student)},0);
        const assigned=studentData.filter(function(student){return activeCount(student)>0}).length;
        const totalEl=document.getElementById("students-total");
        const assignedEl=document.getElementById("students-assigned");
        const unassignedEl=document.getElementById("students-unassigned");
        const enrollmentsEl=document.getElementById("students-enrollments");
        if(totalEl)totalEl.textContent=studentData.length.toLocaleString("fa-IR");
        if(assignedEl)assignedEl.textContent=assigned.toLocaleString("fa-IR");
        if(unassignedEl)unassignedEl.textContent=(studentData.length-assigned).toLocaleString("fa-IR");
        if(enrollmentsEl)enrollmentsEl.textContent=totalEnrollments.toLocaleString("fa-IR");

        if(!rows.length){
          body.innerHTML='<tr><td colspan="6" class="empty-row">دانشجویی پیدا نشد.</td></tr>';
          return;
        }

        body.innerHTML=rows.map(function(student){
          const enrollments=activeStudentEnrollments(student);
          const courseTitles=enrollments.map(function(enrollment){
            return '<span class="status blue" style="margin:2px">'+safe(enrollment.course?.title||("دوره "+(enrollment.course?.id||enrollment.course||"")))+'</span>';
          }).join("") || '<span style="color:#9ca3af">بدون دوره</span>';
          const initial=safe((studentName(student).trim()[0]||"U").toUpperCase());
          const lastAccess=student.last_access?new Date(student.last_access).toLocaleString("fa-IR"):"—";
          return '<tr>'+
            '<td><div class="person"><div class="mini-avatar">'+initial+'</div><div><b>'+safe(studentName(student))+'</b><small dir="ltr">'+safe(student.email||"")+'</small></div></div></td>'+
            '<td><span class="status '+(student.status==="active"?"green":"orange")+'">'+safe(student.status||"—")+'</span></td>'+
            '<td style="max-width:390px">'+courseTitles+'</td>'+
            '<td>'+enrollments.length.toLocaleString("fa-IR")+'</td>'+
            '<td>'+safe(lastAccess)+'</td>'+
            '<td>'+(canManageStudentAssignments?'<button class="top-action" type="button" data-student-courses="'+safe(student.id)+'">مدیریت دوره ها</button>':'—')+'</td>'+
          '</tr>';
        }).join("");
      }

      async function loadStudents(){
        const body=document.getElementById("students-table-body");
        if(body)body.innerHTML='<tr><td colspan="6" class="loading-row">در حال دریافت دانشجوها...</td></tr>';
        try{
          const res=await fetch("/api/students",{headers:{"accept":"application/json"}});
          const payload=await res.json();
          if(!res.ok)throw new Error(payload.message||"دریافت دانشجوها ناموفق بود.");
          studentData=Array.isArray(payload.data)?payload.data:[];
          studentCourses=Array.isArray(payload.courses)?payload.courses:[];
          const filter=document.getElementById("student-course-filter");
          if(filter){
            const current=filter.value;
            filter.innerHTML='<option value="">همه دوره ها</option>'+studentCourses.map(function(course){
              return '<option value="'+safe(course.id)+'">'+safe(course.title)+'</option>';
            }).join("");
            if(current&&studentCourses.some(function(course){return String(course.id)===String(current)}))filter.value=current;
          }
          renderStudents();
        }catch(error){
          if(body)body.innerHTML='<tr><td colspan="6" class="empty-row">'+safe(error.message||"دریافت دانشجوها ناموفق بود.")+'</td></tr>';
        }
      }

      function openStudentCourses(student){
        const modal=document.getElementById("student-courses-modal");
        const list=document.getElementById("student-courses-list");
        if(!modal||!list)return;
        editingStudentId=String(student.id);
        const selected=new Set(activeStudentEnrollments(student).map(function(enrollment){
          return String(enrollment.course?.id||enrollment.course||"");
        }));
        document.getElementById("student-courses-title").textContent="دوره های "+studentName(student);
        document.getElementById("student-courses-subtitle").textContent=student.email||"";
        const error=document.getElementById("student-courses-error");
        if(error){error.textContent="";error.className="form-error"}
        list.innerHTML=studentCourses.length?studentCourses.map(function(course){
          const checked=selected.has(String(course.id))?" checked":"";
          return '<label style="display:flex;align-items:center;gap:9px;padding:11px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;cursor:pointer">'+
            '<input type="checkbox" name="course_ids" value="'+safe(course.id)+'"'+checked+'>'+
            '<span><b style="display:block">'+safe(course.title)+'</b><small style="color:#9ca3af">'+safe(course.status||"")+'</small></span>'+
          '</label>';
        }).join(""):'<div class="empty-row">هیچ دوره ای در CMS وجود ندارد.</div>';
        modal.classList.add("show");
        modal.setAttribute("aria-hidden","false");
      }

      function closeStudentCourses(){
        const modal=document.getElementById("student-courses-modal");
        modal?.classList.remove("show");
        modal?.setAttribute("aria-hidden","true");
        editingStudentId=null;
      }

      document.getElementById("student-search")?.addEventListener("input",renderStudents);
      document.getElementById("student-course-filter")?.addEventListener("change",renderStudents);
      document.getElementById("students-refresh")?.addEventListener("click",loadStudents);
      document.getElementById("students-table-body")?.addEventListener("click",function(event){
        const button=event.target.closest?.("[data-student-courses]");
        if(!button)return;
        const student=studentData.find(function(item){return String(item.id)===String(button.dataset.studentCourses)});
        if(student)openStudentCourses(student);
      });
      document.getElementById("student-courses-close")?.addEventListener("click",closeStudentCourses);
      document.getElementById("student-courses-cancel")?.addEventListener("click",closeStudentCourses);
      document.getElementById("student-courses-modal")?.addEventListener("click",function(event){
        if(event.target===event.currentTarget)closeStudentCourses();
      });
      document.getElementById("student-courses-form")?.addEventListener("submit",async function(event){
        event.preventDefault();
        if(!editingStudentId)return;
        const submit=document.getElementById("student-courses-submit");
        const error=document.getElementById("student-courses-error");
        const courseIds=[...event.currentTarget.querySelectorAll('input[name="course_ids"]:checked')].map(function(input){return Number(input.value)}).filter(Number.isFinite);
        submit.disabled=true;
        submit.textContent="در حال ذخیره...";
        if(error){error.textContent="";error.className="form-error"}
        try{
          const res=await fetch("/api/students/"+encodeURIComponent(editingStudentId)+"/courses",{
            method:"PUT",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({course_ids:courseIds})
          });
          const payload=await res.json();
          if(!res.ok)throw new Error(payload.message||"ذخیره دسترسی ها ناموفق بود.");
          closeStudentCourses();
          await loadStudents();
        }catch(ex){
          if(error){error.textContent=ex.message||"ذخیره دسترسی ها ناموفق بود.";error.className="form-error show"}
        }finally{
          submit.disabled=false;
          submit.textContent="ذخیره دسترسی ها";
        }
      });

      let courseData=[];
      const canEditCourses=${canManageCourses(user)?"true":"false"};
      const statusLabel={draft:"پیش نویس",published:"منتشر شده",archived:"آرشیو"};
      const statusClass={draft:"orange",published:"green",archived:""};
      const money=n=>new Intl.NumberFormat("fa-IR").format(Number(n||0))+" تومان";
      const safe=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
      let supportData=[];
      function supportStudentName(ticket){
        const s=ticket.student;
        if(!s)return "—";
        if(typeof s==="string")return s;
        return [s.first_name,s.last_name].filter(Boolean).join(" ")||s.email||s.id||"—";
      }
      function renderSupportTickets(){
        const body=document.getElementById("support-table-body");
        if(!body)return;
        const q=(document.getElementById("support-search")?.value||"").trim().toLowerCase();
        const pf=document.getElementById("support-priority-filter")?.value||"";
        const sf=document.getElementById("support-status-filter")?.value||"";
        const rows=supportData.filter(function(t){
          const hay=[t.id,t.subject,t.message,t.response,supportStudentName(t)].join(" ").toLowerCase();
          return (!q||hay.includes(q))&&(!pf||t.priority===pf)&&(!sf||t.status===sf);
        });
        if(!rows.length){
          body.innerHTML='<tr><td colspan="7" class="empty-row">تیکتی پیدا نشد.</td></tr>';
          return;
        }
        body.innerHTML=rows.map(function(t){
          const status=t.status||"open";
          const studentEmail=(t.student&&typeof t.student==="object")?(t.student.email||""):"";
          return '<tr>'+
            '<td>#'+safe(t.id)+'</td>'+
            '<td><b>'+safe(supportStudentName(t))+'</b><div style="color:#9ca3af;font-size:9px;margin-top:4px">'+safe(studentEmail)+'</div></td>'+
            '<td><b>'+safe(t.subject||"—")+'</b><div style="color:#6b7280;font-size:10px;margin-top:4px;max-width:360px;white-space:normal">'+safe(t.message||"")+'</div></td>'+
            '<td><select data-ticket-priority data-ticket-id="'+safe(t.id)+'"><option value="normal"'+(t.priority==="normal"?' selected':'')+'>عادی</option><option value="high"'+(t.priority==="high"?' selected':'')+'>بالا</option></select></td>'+
            '<td><select data-ticket-status data-ticket-id="'+safe(t.id)+'"><option value="open"'+(status==="open"?' selected':'')+'>باز</option><option value="in_progress"'+(status==="in_progress"?' selected':'')+'>در حال بررسی</option><option value="answered"'+(status==="answered"?' selected':'')+'>پاسخ داده شده</option><option value="closed"'+(status==="closed"?' selected':'')+'>بسته</option></select></td>'+
            '<td>'+(t.date_created?new Date(t.date_created).toLocaleString("fa-IR"):"—")+'</td>'+
            '<td><button type="button" class="top-action" data-ticket-reply="'+safe(t.id)+'">'+(t.response?"ویرایش پاسخ":"ثبت پاسخ")+'</button>'+(t.response?'<div style="margin-top:6px;color:#6b7280;font-size:9px;max-width:260px;white-space:normal">'+safe(t.response)+'</div>':'')+'</td>'+
          '</tr>';
        }).join("");
      }
      async function loadSupportTickets(){
        const body=document.getElementById("support-table-body");
        if(!body)return;
        body.innerHTML='<tr><td colspan="7" class="loading-row">در حال دریافت تیکت ها...</td></tr>';
        try{
          const res=await fetch("/api/support/tickets",{headers:{accept:"application/json"}});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"دریافت تیکت ها ناموفق بود.");
          supportData=Array.isArray(data.data)?data.data:[];
          renderSupportTickets();
        }catch(ex){
          body.innerHTML='<tr><td colspan="7" class="empty-row">'+safe(ex.message||"دریافت تیکت ها ناموفق بود.")+'</td></tr>';
        }
      }
      async function patchSupportTicket(id,payload){
        const res=await fetch("/api/support/tickets/"+encodeURIComponent(id),{
          method:"PATCH",
          headers:{"content-type":"application/json"},
          body:JSON.stringify(payload)
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(data.message||"بروزرسانی تیکت ناموفق بود.");
        const idx=supportData.findIndex(function(t){return String(t.id)===String(id)});
        if(idx>=0)supportData[idx]={...supportData[idx],...(data.data||{})};
        renderSupportTickets();
      }
      document.getElementById("support-search")?.addEventListener("input",renderSupportTickets);
      document.getElementById("support-priority-filter")?.addEventListener("change",renderSupportTickets);
      document.getElementById("support-status-filter")?.addEventListener("change",renderSupportTickets);
      document.getElementById("support-refresh")?.addEventListener("click",loadSupportTickets);
      document.getElementById("support-table-body")?.addEventListener("change",async function(e){
        const status=e.target.closest?.("[data-ticket-status]");
        const priority=e.target.closest?.("[data-ticket-priority]");
        const control=status||priority;
        if(!control)return;
        control.disabled=true;
        try{
          await patchSupportTicket(control.dataset.ticketId,status?{status:control.value}:{priority:control.value});
        }catch(ex){
          alert(ex.message||"بروزرسانی تیکت ناموفق بود.");
          await loadSupportTickets();
        }finally{
          control.disabled=false;
        }
      });
      document.getElementById("support-table-body")?.addEventListener("click",async function(e){
        const btn=e.target.closest?.("[data-ticket-reply]");
        if(!btn)return;
        const ticket=supportData.find(function(t){return String(t.id)===String(btn.dataset.ticketReply)});
        if(!ticket)return;
        const response=prompt("پاسخ پشتیبانی را وارد کنید:",ticket.response||"");
        if(response===null)return;
        try{await patchSupportTicket(ticket.id,{response:response})}
        catch(ex){alert(ex.message||"ثبت پاسخ ناموفق بود.")}
      });

      function courseStatusControl(c){
        if(!canEditCourses)return '<span class="status '+(statusClass[c.status]||"")+'">'+safe(statusLabel[c.status]||c.status)+'</span>';
        const options=Object.entries(statusLabel).map(function(entry){
          return '<option value="'+entry[0]+'"'+(c.status===entry[0]?' selected':'')+'>'+entry[1]+'</option>';
        }).join("");
        return '<select class="course-status-picker '+(statusClass[c.status]||"")+'" data-course-status data-course-id="'+safe(c.id)+'" data-prev="'+safe(c.status)+'" aria-label="تغییر وضعیت دوره">'+options+'</select>';
      }

      function renderCourses(){
        const q=(document.getElementById("course-search")?.value||"").trim().toLowerCase();
        const sf=document.getElementById("course-status-filter")?.value||"";
        const rows=courseData.filter(c=>{
          const match=!q || String(c.title||"").toLowerCase().includes(q) || String(c.slug||"").toLowerCase().includes(q);
          return match && (!sf || c.status===sf);
        });
        const cards=document.getElementById("course-cards");
        const body=document.getElementById("course-table-body");
        if(!cards||!body)return;
        if(!rows.length){
          cards.innerHTML='<div class="empty-row">دوره ای پیدا نشد.</div>';
          body.innerHTML='<tr><td colspan="6" class="empty-row">دوره ای پیدا نشد.</td></tr>';
          return;
        }
        cards.innerHTML=rows.slice(0,6).map(c=>
          '<article class="course-card">'+
            '<div class="course-cover">'+courseStatusControl(c)+'</div>'+
            '<div class="course-body"><h3><button type="button" class="course-title-edit" data-course-edit="'+safe(c.id)+'">'+safe(c.title)+'</button></h3>'+
              '<div style="color:#6b7280;font-size:10px;line-height:1.8;min-height:34px">'+safe(c.excerpt||"بدون توضیح کوتاه")+'</div>'+
              '<div class="course-stats"><span class="course-price">'+money(c.price)+'</span><span>'+safe(c.slug)+'</span></div>'+
            '</div>'+
          '</article>'
        ).join("");
        body.innerHTML=rows.map(c=>
          '<tr>'+
            '<td><button type="button" class="course-title-edit" data-course-edit="'+safe(c.id)+'">'+safe(c.title)+'</button><div style="color:#9ca3af;font-size:9px;margin-top:4px">'+safe(c.excerpt||"")+'</div></td>'+
            '<td dir="ltr">'+safe(c.slug)+'</td>'+
            '<td><span class="course-price">'+money(c.price)+'</span></td>'+
            '<td>'+(c.date_created?new Date(c.date_created).toLocaleDateString("fa-IR"):"—")+'</td>'+
            '<td>'+courseStatusControl(c)+'</td>'+
            '<td>'+(canEditCourses?'<select class="course-action-picker" data-course-action data-course-id="'+safe(c.id)+'" aria-label="عملیات دوره"><option value="" selected>•••</option><option value="edit">ویرایش دوره</option></select>':'—')+'</td>'+
          '</tr>'
        ).join("");
      }

      async function loadCourses(){
        const cards=document.getElementById("course-cards"),body=document.getElementById("course-table-body");
        try{
          const res=await fetch("/api/courses",{headers:{"accept":"application/json"}});
          const data=await res.json();
          if(!res.ok)throw new Error(data.message||"خطا در دریافت دوره ها");
          courseData=Array.isArray(data.data)?data.data:[];
          renderCourses();
          populateContentCourses();
        }catch(err){
          if(cards)cards.innerHTML='<div class="empty-row">دریافت دوره ها ناموفق بود.</div>';
          if(body)body.innerHTML='<tr><td colspan="6" class="empty-row">دریافت دوره ها ناموفق بود.</td></tr>';
        }
      }

      document.getElementById("course-search")?.addEventListener("input",renderCourses);
      document.getElementById("course-status-filter")?.addEventListener("change",renderCourses);

      const courseModal=document.getElementById("course-modal");
      let editingCourseId=null;
      let editingCourseLandingInitial="";
      const openCourseModal=(course=null)=>{
        const form=document.getElementById("course-form");
        if(!form||!courseModal)return;
        form.reset();
        editingCourseId=course?.id?String(course.id):null;
        editingCourseLandingInitial=String(course?.landing_page||"");
        document.getElementById("course-modal-title").textContent=editingCourseId?"ویرایش دوره":"ایجاد دوره جدید";
        document.getElementById("course-submit").textContent=editingCourseId?"ذخیره تغییرات":"ایجاد دوره";
        const err=document.getElementById("course-form-error");
        if(err){err.textContent="";err.className="form-error"}
        if(course){
          form.querySelector('[name="title"]').value=course.title||"";
          form.querySelector('[name="slug"]').value=course.slug||"";
          form.querySelector('[name="status"]').value=course.status||"draft";
          form.querySelector('[name="price"]').value=Number(course.price||0);
          form.querySelector('[name="currency"]').value=course.currency||"IRT";
          form.querySelector('[name="landing_page"]').value=course.landing_page||"";
          form.querySelector('[name="excerpt"]').value=course.excerpt||"";
          form.querySelector('[name="description"]').value=course.description||"";
        }
        courseModal.classList.add("show");
        courseModal.setAttribute("aria-hidden","false");
        form.querySelector('input[name="title"]')?.focus();
      };
      const closeCourseModal=()=>{courseModal?.classList.remove("show");courseModal?.setAttribute("aria-hidden","true")};
      document.getElementById("new-course-btn")?.addEventListener("click",()=>openCourseModal());
      document.getElementById("course-modal-close")?.addEventListener("click",closeCourseModal);
      document.getElementById("course-cancel")?.addEventListener("click",closeCourseModal);
      courseModal?.addEventListener("click",e=>{if(e.target===courseModal)closeCourseModal()});

      async function updateCourseStatus(select){
        const id=select.dataset.courseId;
        const previous=select.dataset.prev||"draft";
        const next=select.value;
        if(!id||next===previous)return;
        select.disabled=true;
        try{
          const res=await fetch("/api/courses/"+encodeURIComponent(id),{
            method:"PATCH",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({status:next})
          });
          const data=await res.json();
          if(!res.ok)throw new Error(data.message||"تغییر وضعیت انجام نشد.");
          const index=courseData.findIndex(function(c){return String(c.id)===String(id)});
          if(index>=0)courseData[index]={...courseData[index],...(data.data||{}),status:next};
          renderCourses();
        }catch(ex){
          select.value=previous;
          select.disabled=false;
          window.alert(ex.message||"تغییر وضعیت انجام نشد.");
        }
      }

      const courseTableBody=document.getElementById("course-table-body");
      const courseCards=document.getElementById("course-cards");
      [courseTableBody,courseCards].forEach(function(root){
        root?.addEventListener("change",function(e){
          const status=e.target.closest?.("[data-course-status]");
          if(status){updateCourseStatus(status);return}
          const action=e.target.closest?.("[data-course-action]");
          if(action){
            const value=action.value;
            action.value="";
            if(value==="edit"){
              const course=courseData.find(function(c){return String(c.id)===String(action.dataset.courseId)});
              if(course)openCourseModal(course);
            }
          }
        });
        root?.addEventListener("click",function(e){
          const edit=e.target.closest?.("[data-course-edit]");
          if(!edit)return;
          const course=courseData.find(function(c){return String(c.id)===String(edit.dataset.courseEdit)});
          if(course)openCourseModal(course);
        });
      });

      document.getElementById("course-form")?.addEventListener("submit",async e=>{
        e.preventDefault();
        const form=e.currentTarget,err=document.getElementById("course-form-error"),submit=document.getElementById("course-submit");
        const isEditing=Boolean(editingCourseId),courseId=editingCourseId;
        err.className="form-error";submit.disabled=true;submit.textContent=isEditing?"در حال ذخیره...":"در حال ایجاد...";
        const fd=new FormData(form);
        const payload=Object.fromEntries(fd.entries());
        payload.price=Number(payload.price||0);
        if(isEditing && String(payload.landing_page||"")===editingCourseLandingInitial){
          delete payload.landing_page;
        }
        try{
          const endpoint=isEditing?"/api/courses/"+encodeURIComponent(courseId):"/api/courses";
          const res=await fetch(endpoint,{method:isEditing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
          const data=await res.json();
          if(!res.ok)throw new Error(data.message||(isEditing?"ویرایش دوره انجام نشد.":"ایجاد دوره انجام نشد."));
          form.reset();closeCourseModal();editingCourseId=null;await loadCourses();openView("courses");
        }catch(ex){
          err.textContent=ex.message;err.className="form-error show";
        }finally{
          submit.disabled=false;submit.textContent=isEditing?"ذخیره تغییرات":"ایجاد دوره";
        }
      });

      let contentSections=[],selectedLessonId=null,selectedSectionId=null,mediaUploadKind=null;

      function populateContentCourses(){
        const select=document.getElementById("content-course-select");
        if(!select)return;
        const current=select.value;
        select.innerHTML='<option value="">انتخاب دوره...</option>'+courseData.map(function(item){
          return '<option value="'+item.id+'">'+safe(item.title)+'</option>';
        }).join("");
        if(current&&courseData.some(function(item){return String(item.id)===String(current)}))select.value=current;
      }

      async function loadSections(){
        const select=document.getElementById("content-course-select");
        const course=select?select.value:"";
        const outline=document.getElementById("content-outline");
        if(!outline)return;
        if(!course){outline.innerHTML='<div class="empty-row">ابتدا یک دوره انتخاب کنید.</div>';return}
        outline.innerHTML='<div class="loading-row">در حال دریافت ساختار...</div>';
        try{
          const res=await fetch("/api/sections?course="+encodeURIComponent(course));
          const data=await res.json();
          if(!res.ok)throw new Error(data.message||"خطا");
          contentSections=data.data||[];
          for(const section of contentSections){
            const lr=await fetch("/api/lessons?section="+section.id);
            const ld=await lr.json();
            section.lessons=lr.ok?(ld.data||[]):[];
          }
          renderOutline();
        }catch{
          outline.innerHTML='<div class="empty-row">دریافت ساختار دوره ناموفق بود.</div>';
        }
      }

      function renderOutline(){
        const outline=document.getElementById("content-outline");
        const count=document.getElementById("outline-count");
        if(!outline)return;
        let lessonCount=0;
        contentSections.forEach(function(s){lessonCount+=(s.lessons||[]).length});
        if(count)count.textContent=contentSections.length+" فصل · "+lessonCount+" درس";
        if(!contentSections.length){outline.innerHTML='<div class="empty-row">هنوز فصلی ساخته نشده است.</div>';return}
        outline.innerHTML=contentSections.map(function(section){
          const lessons=(section.lessons||[]).map(function(lesson){
            const active=String(lesson.id)===String(selectedLessonId)?" active":"";
            const cls=lesson.status==="published"?"green":"orange";
            return '<button class="lesson-item'+active+'" data-lesson-id="'+lesson.id+'" data-section-id="'+section.id+'"><span>'+safe(lesson.title)+'</span><span class="status '+cls+'">'+safe(statusLabel[lesson.status]||lesson.status)+'</span></button>';
          }).join("");
          return '<div class="section-box"><div class="section-title"><span>'+safe(section.title)+'</span><span>#'+section.position+'</span></div>'+(lessons||'<div class="empty-row" style="padding:15px">بدون درس</div>')+'</div>';
        }).join("");
        outline.querySelectorAll("[data-lesson-id]").forEach(function(btn){
          btn.onclick=function(){selectLesson(btn.dataset.lessonId,btn.dataset.sectionId)};
        });
      }

      async function selectLesson(id,sectionId){
        selectedLessonId=Number(id);selectedSectionId=Number(sectionId);
        renderOutline();
        let lesson=null;
        contentSections.forEach(function(section){
          (section.lessons||[]).forEach(function(item){if(Number(item.id)===selectedLessonId)lesson=item});
        });
        const title=document.getElementById("selected-lesson-title");
        const meta=document.getElementById("selected-lesson-meta");
        if(title)title.textContent=lesson?lesson.title:"درس";
        if(meta)meta.textContent=lesson?(statusLabel[lesson.status]||lesson.status)+" · "+lesson.slug:"";
        await loadBlocks();
      }

      async function loadBlocks(){
        const editor=document.getElementById("lesson-editor");
        if(!editor)return;
        if(!selectedLessonId){editor.innerHTML='<div class="lesson-empty">یک درس انتخاب کنید.</div>';return}
        editor.innerHTML='<div class="loading-row">در حال دریافت محتوای درس...</div>';
        try{
          const res=await fetch("/api/lesson-blocks?lesson="+selectedLessonId);
          const data=await res.json();
          if(!res.ok)throw new Error(data.message||"خطا");
          renderBlocks(data.data||[]);
        }catch{
          editor.innerHTML='<div class="empty-row">دریافت محتوای درس ناموفق بود.</div>';
        }
      }

      function renderBlocks(blocks){
        const editor=document.getElementById("lesson-editor");
        if(!editor)return;
        const labels={text:"متن",video:"ویدئو",audio:"صدا",file:"فایل"};
        let html='<div class="block-actions"><button class="top-action" data-add-block="text">+ متن</button><button class="top-action" data-add-block="video">+ ویدئو</button><button class="top-action" data-add-block="audio">+ صدا</button><button class="top-action" data-add-block="file">+ فایل</button></div><div class="block-list">';
        if(!blocks.length)html+='<div class="empty-row">این درس هنوز محتوا ندارد.</div>';
        blocks.forEach(function(block){
          let body="";
          if(block.type==="text"){
            body='<p>'+safe(block.text_content||"")+'</p>';
          }else{
            const media=block.media_asset||{};
            const st=media.status||"unknown";
            const stateClass=(st==="ready"||st==="ready_for_review")?"ready":st==="failed"?"failed":"processing";
            let actions="";
            if(st==="ready_for_review"||st==="ready")actions+='<a class="tiny-btn" target="_blank" href="/api/media/'+media.id+'/preview">پیش نمایش</a>';
            if(st==="ready_for_review")actions+='<button class="tiny-btn ok" data-verify-media="'+media.id+'">تایید سلامت و حذف Original</button>';
            body='<div class="media-info"><span>'+safe(media.original_name||"فایل")+' · <b class="'+stateClass+'">'+safe(st)+'</b></span><span class="tiny-actions">'+actions+'</span></div>';
          }
          html+='<article class="block-item"><div class="block-top"><div><span class="block-type">'+labels[block.type]+'</span> <b>'+safe(block.title||"")+'</b></div><span>#'+block.position+'</span></div>'+body+'</article>';
        });
        html+='</div>';
        editor.innerHTML=html;
        editor.querySelectorAll("[data-add-block]").forEach(function(btn){btn.onclick=function(){addBlock(btn.dataset.addBlock)}});
        editor.querySelectorAll("[data-verify-media]").forEach(function(btn){btn.onclick=function(){verifyMedia(btn.dataset.verifyMedia)}});
      }

      async function addBlock(type){
        if(!selectedLessonId)return alert("ابتدا یک درس انتخاب کنید.");
        if(type==="text"){
          const text=prompt("متن این بخش را وارد کنید:");
          if(!text)return;
          const res=await fetch("/api/lesson-blocks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lesson:selectedLessonId,type:"text",text_content:text,position:100})});
          const data=await res.json();if(!res.ok)return alert(data.message||"خطا");
          return loadBlocks();
        }
        mediaUploadKind=type;
        const input=document.getElementById("media-file-input");
        if(!input)return;
        input.accept=type==="video"?"video/*":type==="audio"?"audio/*":"*/*";
        input.value="";input.click();
      }

      async function uploadMediaFile(file,kind){
        const editor=document.getElementById("lesson-editor");
        const notice=document.createElement("div");
        notice.className="block-item";
        notice.innerHTML='<b>در حال آپلود و پردازش: '+safe(file.name)+'</b><p class="processing">پس از آپلود، تبدیل در پس زمینه ادامه پیدا می کند.</p>';
        editor.prepend(notice);
        const res=await fetch("/api/media/upload?kind="+encodeURIComponent(kind),{
          method:"POST",
          headers:{"content-type":file.type||"application/octet-stream","x-file-name":file.name,"x-download-allowed":kind==="file"?"true":"false"},
          body:file
        });
        const data=await res.json();
        if(!res.ok){notice.remove();return alert(data.message||"آپلود ناموفق بود.")}
        const asset=data.data;
        const br=await fetch("/api/lesson-blocks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lesson:selectedLessonId,type:kind,media_asset:asset.id,position:100,download_allowed:kind==="file"})});
        const bd=await br.json();
        if(!br.ok){notice.remove();return alert(bd.message||"ساخت Block ناموفق بود.")}
        notice.innerHTML='<b>پردازش فایل شروع شد.</b><p class="processing">وضعیت به صورت خودکار بروزرسانی می شود...</p>';
        pollMedia(asset.id,notice);
        await loadBlocks();
      }

      async function pollMedia(id,notice){
        for(let i=0;i<300;i++){
          await new Promise(function(resolve){setTimeout(resolve,2000)});
          try{
            const res=await fetch("/api/media/"+id+"/status");
            const data=await res.json();
            const st=data.data&&data.data.status;
            if(st==="ready_for_review"||st==="ready"||st==="failed"){
              if(notice)notice.remove();
              await loadBlocks();
              return;
            }
          }catch{}
        }
      }

      async function verifyMedia(id){
        if(!confirm("فایل تبدیل شده را بررسی کرده اید؟ با تایید، فایل Original برای همیشه حذف می شود."))return;
        const res=await fetch("/api/media/"+id+"/verify",{method:"POST"});
        const data=await res.json();
        if(!res.ok)return alert(data.message||"تایید ناموفق بود.");
        alert("سلامت فایل تایید شد و Original حذف شد.");
        await loadBlocks();
      }

      const mediaInput=document.getElementById("media-file-input");
      if(mediaInput)mediaInput.addEventListener("change",function(e){
        const file=e.target.files&&e.target.files[0];
        if(file&&mediaUploadKind)uploadMediaFile(file,mediaUploadKind);
      });
      document.getElementById("content-course-select")?.addEventListener("change",function(){selectedLessonId=null;selectedSectionId=null;loadSections()});
      document.getElementById("content-refresh")?.addEventListener("click",loadSections);
      document.getElementById("new-section-btn")?.addEventListener("click",async function(){
        const course=document.getElementById("content-course-select")?.value;
        if(!course)return alert("ابتدا دوره را انتخاب کنید.");
        const title=prompt("عنوان فصل جدید:");
        if(!title)return;
        const res=await fetch("/api/sections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({course:Number(course),title:title,position:contentSections.length+1})});
        const data=await res.json();if(!res.ok)return alert(data.message||"خطا");
        await loadSections();
      });
      document.getElementById("new-lesson-btn")?.addEventListener("click",async function(){
        if(!contentSections.length)return alert("ابتدا یک فصل بسازید.");
        const list=contentSections.map(function(s){return s.id+" - "+s.title}).join("\\n");
        const sid=prompt("شناسه فصل را وارد کنید:\\n"+list,String(selectedSectionId||contentSections[0].id));
        if(!sid)return;
        const section=Number(sid);
        const sec=contentSections.find(function(s){return Number(s.id)===section});
        if(!sec)return alert("فصل معتبر نیست.");
        const title=prompt("عنوان درس جدید:");
        if(!title)return;
        const res=await fetch("/api/lessons",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({section:section,title:title,status:"draft",position:(sec.lessons||[]).length+1})});
        const data=await res.json();if(!res.ok)return alert(data.message||"خطا");
        await loadSections();
        await selectLesson(data.data.id,section);
      });

      loadWebinars();
      loadWebinarRegistrations();
      loadCourseRegistrations();
      loadCourses();
      loadContacts();
      loadCrmReports();
      loadContactDetail();
      loadStudents();
      loadSupportTickets();

      function initPersianCalendar(){
        const grid=document.getElementById("calendar-grid");
        const titleEl=document.getElementById("calendar-month-title");
        const loadingEl=document.getElementById("calendar-loading");
        const countEl=document.getElementById("calendar-event-count");
        const modal=document.getElementById("calendar-modal");
        const form=document.getElementById("calendar-event-form");
        const modalTitle=document.getElementById("calendar-modal-title");
        const formMessage=document.getElementById("calendar-form-message");
        const deleteBtn=document.getElementById("calendar-delete-event");
        const googleLink=document.getElementById("calendar-open-google");
        const saveBtn=document.getElementById("calendar-save-event");
        if(!grid||!titleEl||!form)return;

        const monthNames=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
        const persianParts=new Intl.DateTimeFormat("en-US-u-ca-persian",{year:"numeric",month:"numeric",day:"numeric"});
        const faNumber=new Intl.NumberFormat("fa-IR",{useGrouping:false});
        const timeFmt=new Intl.DateTimeFormat("fa-IR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Tehran"});
        const gregorianParts=new Intl.DateTimeFormat("en-US",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Tehran"});
        const today=new Date();
        today.setHours(12,0,0,0);
        let reference=new Date(today);
        let calendarEvents=[];
        let currentRange=null;

        function parts(date){
          const out={};
          persianParts.formatToParts(date).forEach(function(p){
            if(p.type==="year"||p.type==="month"||p.type==="day")out[p.type]=Number(p.value);
          });
          return out;
        }

        function dateKey(date){
          const out={};
          gregorianParts.formatToParts(date).forEach(function(p){
            if(p.type==="year"||p.type==="month"||p.type==="day")out[p.type]=p.value;
          });
          return out.year+"-"+out.month+"-"+out.day;
        }

        function pad(v){return String(v).padStart(2,"0")}

        function toTehranLocalInput(value){
          if(!value)return "";
          const d=new Date(value);
          if(Number.isNaN(d.getTime()))return "";
          const fmt=new Intl.DateTimeFormat("en-CA",{
            timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
          });
          const out={};
          fmt.formatToParts(d).forEach(function(p){if(["year","month","day","hour","minute"].includes(p.type))out[p.type]=p.value});
          return out.year+"-"+out.month+"-"+out.day+"T"+out.hour+":"+out.minute;
        }

        function tehranIso(localValue){
          if(!localValue)return "";
          return localValue+":00+03:30";
        }

        function sameGregorianDay(a,b){
          return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
        }

        function findFirstDay(year,month,around){
          const start=new Date(around);
          start.setDate(start.getDate()-40);
          start.setHours(12,0,0,0);
          for(let i=0;i<85;i++){
            const d=new Date(start);
            d.setDate(start.getDate()+i);
            const p=parts(d);
            if(p.year===year&&p.month===month&&p.day===1)return d;
          }
          return null;
        }

        function setMessage(text,type){
          if(!formMessage)return;
          formMessage.textContent=text||"";
          formMessage.className="calendar-form-message"+(text?" show":"")+(type?" "+type:"");
        }

        function closeModal(){
          modal?.classList.remove("show");
          modal?.setAttribute("aria-hidden","true");
          setMessage("");
        }

        function toggleAllDay(){
          const checked=form.elements.all_day.checked;
          document.getElementById("calendar-datetime-fields").style.display=checked?"none":"grid";
          document.getElementById("calendar-allday-fields").style.display=checked?"grid":"none";
          form.elements.start.required=!checked;
          form.elements.end.required=!checked;
          form.elements.start_date.required=checked;
          form.elements.end_date.required=checked;
        }

        function openNewEvent(dayKey){
          form.reset();
          form.elements.event_id.value="";
          form.elements.all_day.checked=false;
          toggleAllDay();
          const date=dayKey||dateKey(new Date());
          form.elements.start.value=date+"T10:00";
          form.elements.end.value=date+"T11:00";
          form.elements.start_date.value=date;
          const d=new Date(date+"T12:00:00");
          d.setDate(d.getDate()+1);
          form.elements.end_date.value=dateKey(d);
          modalTitle.textContent="رویداد جدید";
          deleteBtn.style.display="none";
          googleLink.style.display="none";
          setMessage("");
          modal?.classList.add("show");
          modal?.setAttribute("aria-hidden","false");
          setTimeout(()=>form.elements.title.focus(),50);
        }

        function openEditEvent(ev){
          form.reset();
          form.elements.event_id.value=ev.id||"";
          form.elements.title.value=ev.title||"";
          form.elements.description.value=ev.description||"";
          form.elements.location.value=ev.location||"";
          form.elements.all_day.checked=Boolean(ev.all_day);
          if(ev.all_day){
            form.elements.start_date.value=String(ev.start||"").slice(0,10);
            form.elements.end_date.value=String(ev.end||"").slice(0,10);
          }else{
            form.elements.start.value=toTehranLocalInput(ev.start);
            form.elements.end.value=toTehranLocalInput(ev.end);
          }
          toggleAllDay();
          modalTitle.textContent="ویرایش رویداد";
          deleteBtn.style.display="inline-flex";
          googleLink.style.display=ev.html_link?"inline-flex":"none";
          googleLink.href=ev.html_link||"#";
          setMessage("");
          modal?.classList.add("show");
          modal?.setAttribute("aria-hidden","false");
        }

        function eventForDay(ev,key){
          if(!ev?.start)return false;
          if(ev.all_day){
            const start=String(ev.start).slice(0,10);
            const end=String(ev.end||ev.start).slice(0,10);
            return key>=start && key<end;
          }
          const d=new Date(ev.start);
          return !Number.isNaN(d.getTime())&&dateKey(d)===key;
        }

        function appendEvents(cell,dayDate){
          const holder=cell.querySelector(".day-events");
          if(!holder)return;
          const key=dateKey(dayDate);
          const matches=calendarEvents.filter(function(ev){return eventForDay(ev,key)});

          if(!matches.length){
            const empty=document.createElement("div");
            empty.className="calendar-empty-note";
            empty.textContent="رویدادی نیست";
            holder.appendChild(empty);
            return;
          }

          matches.forEach(function(ev){
            const item=document.createElement("button");
            item.type="button";
            item.className="calendar-event"+(ev.all_day?" is-all-day":"");
            item.title=ev.title||"رویداد";
            item.addEventListener("click",function(e){e.stopPropagation();openEditEvent(ev)});

            if(!ev.all_day&&ev.start){
              const time=document.createElement("span");
              time.className="calendar-event-time";
              const d=new Date(ev.start);
              time.textContent=Number.isNaN(d.getTime())?"":timeFmt.format(d);
              item.appendChild(time);
            }

            const label=document.createElement("span");
            label.textContent=ev.title||"(بدون عنوان)";
            item.appendChild(label);

            if(ev.location){
              const loc=document.createElement("small");
              loc.className="calendar-event-location";
              loc.textContent=ev.location;
              item.appendChild(loc);
            }

            holder.appendChild(item);
          });
        }

        async function api(method,body){
          const options={method:method,headers:{accept:"application/json"}};
          if(method!=="GET"){
            options.headers["content-type"]="application/json";
            options.body=JSON.stringify(body||{});
          }
          const url=method==="GET"
            ?"/api/admin/calendar-events?time_min="+encodeURIComponent(body.time_min)+"&time_max="+encodeURIComponent(body.time_max)
            :"/api/admin/calendar-events";
          const res=await fetch(url,options);
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw new Error(data.message||"عملیات تقویم ناموفق بود.");
          return data;
        }

        async function loadEvents(first,last){
          if(loadingEl){loadingEl.textContent="در حال دریافت رویدادهای Google Calendar...";loadingEl.classList.remove("error")}
          const min=new Date(first);min.setDate(min.getDate()-1);min.setHours(0,0,0,0);
          const max=new Date(last);max.setDate(max.getDate()+2);max.setHours(23,59,59,999);
          currentRange={first:new Date(first),last:new Date(last)};
          try{
            const data=await api("GET",{time_min:min.toISOString(),time_max:max.toISOString()});
            calendarEvents=Array.isArray(data.events)?data.events:[];
            if(countEl)countEl.textContent=faNumber.format(calendarEvents.length)+" رویداد";
            if(loadingEl){loadingEl.textContent="همگام با Google Calendar · "+faNumber.format(calendarEvents.length)+" رویداد"}
          }catch(error){
            calendarEvents=[];
            if(countEl)countEl.textContent="۰ رویداد";
            if(loadingEl){loadingEl.textContent=error?.message||"دریافت رویدادهای تقویم ناموفق بود.";loadingEl.classList.add("error")}
          }
        }

        async function render(){
          const target=parts(reference);
          const first=findFirstDay(target.year,target.month,reference);
          if(!first)return;

          titleEl.textContent=monthNames[target.month-1]+" "+faNumber.format(target.year);

          let monthEnd=new Date(first);
          while(true){
            const next=new Date(monthEnd);
            next.setDate(next.getDate()+1);
            const p=parts(next);
            if(p.year!==target.year||p.month!==target.month)break;
            monthEnd=next;
          }

          await loadEvents(first,monthEnd);
          grid.querySelectorAll(".calendar-day").forEach(function(el){el.remove()});

          const offset=(first.getDay()+1)%7;
          for(let i=0;i<offset;i++){
            const empty=document.createElement("div");
            empty.className="calendar-day empty";
            grid.appendChild(empty);
          }

          let cursor=new Date(first);
          while(true){
            const p=parts(cursor);
            if(p.year!==target.year||p.month!==target.month)break;

            const dayDate=new Date(cursor);
            const key=dateKey(dayDate);
            const cell=document.createElement("div");
            cell.className="calendar-day";
            cell.dataset.date=key;
            if(cursor.getDay()===5)cell.classList.add("friday");
            if(sameGregorianDay(cursor,today))cell.classList.add("today");

            const num=document.createElement("div");
            num.className="day-number";
            num.textContent=faNumber.format(p.day);
            cell.appendChild(num);

            const add=document.createElement("button");
            add.type="button";
            add.className="calendar-day-add";
            add.textContent="+";
            add.title="افزودن رویداد";
            add.addEventListener("click",function(e){e.stopPropagation();openNewEvent(key)});
            cell.appendChild(add);

            const events=document.createElement("div");
            events.className="day-events";
            cell.appendChild(events);
            appendEvents(cell,dayDate);

            cell.addEventListener("dblclick",function(){openNewEvent(key)});
            grid.appendChild(cell);
            cursor.setDate(cursor.getDate()+1);
          }

          const dayCells=grid.querySelectorAll(".calendar-day").length;
          const remainder=dayCells%7;
          if(remainder){
            for(let i=remainder;i<7;i++){
              const empty=document.createElement("div");
              empty.className="calendar-day empty";
              grid.appendChild(empty);
            }
          }
        }

        form.elements.all_day.addEventListener("change",toggleAllDay);
        document.getElementById("calendar-modal-close")?.addEventListener("click",closeModal);
        document.getElementById("calendar-cancel")?.addEventListener("click",closeModal);
        modal?.addEventListener("click",function(e){if(e.target===modal)closeModal()});
        document.getElementById("calendar-new-event")?.addEventListener("click",function(){openNewEvent()});
        document.getElementById("calendar-refresh")?.addEventListener("click",function(){void render()});

        form.addEventListener("submit",async function(e){
          e.preventDefault();
          setMessage("");
          const id=String(form.elements.event_id.value||"").trim();
          const allDay=form.elements.all_day.checked;
          const payload={
            event_id:id||undefined,
            title:String(form.elements.title.value||"").trim(),
            description:String(form.elements.description.value||"").trim(),
            location:String(form.elements.location.value||"").trim(),
            all_day:allDay,
            start:allDay?form.elements.start_date.value:tehranIso(form.elements.start.value),
            end:allDay?form.elements.end_date.value:tehranIso(form.elements.end.value)
          };
          if(!payload.title)return setMessage("عنوان رویداد را وارد کنید.","error");
          saveBtn.disabled=true;
          saveBtn.textContent="در حال ذخیره...";
          try{
            await api(id?"PATCH":"POST",payload);
            setMessage("رویداد با موفقیت ذخیره شد.","success");
            await render();
            setTimeout(closeModal,350);
          }catch(error){
            setMessage(error?.message||"ذخیره رویداد ناموفق بود.","error");
          }finally{
            saveBtn.disabled=false;
            saveBtn.textContent="ذخیره رویداد";
          }
        });

        deleteBtn.addEventListener("click",async function(){
          const id=String(form.elements.event_id.value||"").trim();
          if(!id)return;
          if(!confirm("این رویداد از Google Calendar حذف شود؟"))return;
          deleteBtn.disabled=true;
          try{
            await api("DELETE",{event_id:id});
            closeModal();
            await render();
          }catch(error){
            setMessage(error?.message||"حذف رویداد ناموفق بود.","error");
          }finally{
            deleteBtn.disabled=false;
          }
        });

        document.getElementById("calendar-prev")?.addEventListener("click",function(){
          const p=parts(reference), first=findFirstDay(p.year,p.month,reference);
          if(first){first.setDate(first.getDate()-2);reference=first;void render()}
        });
        document.getElementById("calendar-next")?.addEventListener("click",function(){
          const p=parts(reference), first=findFirstDay(p.year,p.month,reference);
          if(first){first.setDate(first.getDate()+35);reference=first;void render()}
        });
        document.getElementById("calendar-today")?.addEventListener("click",function(){
          reference=new Date(today);void render();
        });

        void render();
      }
      initPersianCalendar();

      async function loadSessionSettings(){
        const input=document.getElementById("session-hours");
        if(!input)return;
        try{
          const response=await fetch("/api/settings/session");
          const data=await response.json();
          if(response.ok && data?.data?.session_hours)input.value=String(data.data.session_hours);
        }catch{}
      }

      const saveSessionSettings=document.getElementById("save-session-settings");
      if(saveSessionSettings){
        saveSessionSettings.addEventListener("click",async function(){
          const input=document.getElementById("session-hours");
          const message=document.getElementById("session-settings-message");
          saveSessionSettings.disabled=true;
          message.style.display="none";
          try{
            const response=await fetch("/api/settings/session",{
              method:"PUT",
              headers:{"content-type":"application/json"},
              body:JSON.stringify({session_hours:Number(input.value)})
            });
            const data=await response.json().catch(()=>({}));
            message.textContent=response.ok?"تنظیمات نشست ذخیره شد.":(data.message||"ذخیره تنظیمات ناموفق بود.");
            message.style.display="block";
            message.style.background=response.ok?"#ecfdf5":"#fff1f2";
            message.style.color=response.ok?"#047857":"#be123c";
          }catch{
            message.textContent="ارتباط با سرور برقرار نشد.";
            message.style.display="block";
            message.style.background="#fff1f2";
            message.style.color="#be123c";
          }finally{
            saveSessionSettings.disabled=false;
          }
        });
      }
      loadSessionSettings();

      document.getElementById("logout").onclick=async()=>{await fetch("/api/logout",{method:"POST"});location.href="/admin"};
    </script>
  </body></html>`;
}

function dashboard(user, kind) {
  const name=[user.first_name,user.last_name].filter(Boolean).join(" ") || user.email;
  const initial=(name.trim()[0]||"U").toUpperCase();
  const admin=kind==="admin";
  return layout(admin?"پنل مدرس":"پنل کاربر",`
    <section class="hero">
      <div><span class="badge">${admin?"TEACHER PANEL":"CLIENT PANEL"}</span><h1>${admin?"پنل مدرس":"پنل کاربر"}</h1><p class="muted">${admin?"مدیریت دوره‌ها، دانشجوها و محتوای آموزشی از اینجا توسعه داده می‌شود.":"دوره‌ها، پیشرفت آموزشی و اطلاعات حساب شما از اینجا در دسترس خواهد بود."}</p></div>
      <div class="top-actions"><button class="btn danger" id="logout">خروج</button></div>
    </section>
    <section class="card who"><div class="profile"><div class="avatar">${initial}</div><div><b>${escapeHtml(name)}</b><div class="muted ltr">${escapeHtml(user.email||"")}</div></div></div><div class="badge">${escapeHtml(roleName(user)||roleId(user)||"User")}</div></section>
    <section class="grid">
      <div class="card panel-card"><b>${admin?"دوره‌ها":"دوره‌های من"}</b><span class="muted">مرحله بعدی: اتصال به learning_courses و enrollmentها.</span></div>
      <div class="card panel-card"><b>${admin?"دانشجوها":"پیشرفت من"}</b><span class="muted">ساختار پنل آماده است و از همینجا توسعه میدهیم.</span></div>
      <div class="card panel-card"><b>${admin?"مدیریت محتوا":"حساب کاربری"}</b><span class="muted">هویت مستقیما از CMS مرکزی خوانده میشود.</span></div>
    </section>
    <script>document.getElementById("logout").onclick=async()=>{await fetch("/api/logout",{method:"POST"});location.href="/${admin?"admin":"clients"}";}</script>
  `);
}

function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);

    if(url.pathname==="/healthz") return html(res,200,"ok enrollments-live-v2\n");
    if(url.pathname==="/") return redirect(res,"/clients");

    if(url.pathname==="/api/register" && req.method==="POST"){
      const body=await readBody(req);
      const firstName=String(body.first_name||"").trim();
      const lastName=String(body.last_name||"").trim();
      const email=String(body.email||"").trim().toLowerCase();
      const password=String(body.password||"");
      if(!firstName || !lastName || !email || !password) return json(res,400,{message:"همه فیلدها الزامی هستند."});
      if(firstName.length>80 || lastName.length>80) return json(res,400,{message:"نام یا نام خانوادگی بیش از حد طولانی است."});
      if(!email.includes("@") || email.startsWith("@") || email.endsWith("@") || !email.split("@")[1]?.includes(".")) return json(res,400,{message:"ایمیل معتبر نیست."});
      if(password.length<8) return json(res,400,{message:"رمز عبور باید حداقل ۸ کاراکتر باشد."});
      try{
        const response=await cmsFetch("/users/register",{
          method:"POST",
          body:JSON.stringify({email,password,first_name:firstName,last_name:lastName})
        });
        const raw=await response.text();
        let payload=null;
        if(raw){ try{payload=JSON.parse(raw)}catch{payload=raw} }
        if(!response.ok){
          const detail=String(payload?.errors?.[0]?.message || payload?.message || payload || "").toLowerCase();
          if(response.status===400 && (detail.includes("unique") || detail.includes("already") || detail.includes("email"))){
            return json(res,409,{message:"با این ایمیل قبلا حساب کاربری ساخته شده است."});
          }
          if(response.status===403 || response.status===404){
            return json(res,503,{message:"ثبت نام عمومی در CMS فعال نیست. تنظیمات ثبت نام Directus را بررسی کنید."});
          }
          return json(res,502,{message:"ساخت حساب در CMS ناموفق بود. دوباره تلاش کنید."});
        }
        try{
          const auth=await loginCms(email,password);
          const user=await getMe(auth.access_token);
          if(user.status && user.status!=="active"){
            return json(res,201,{ok:true,message:"حساب ساخته شد و در انتظار فعال سازی است."});
          }
          return json(res,201,{ok:true,redirect:"/clients"},{ "set-cookie": await authCookieHeaders(auth) });
        }catch{
          return json(res,201,{ok:true,message:"حساب ساخته شد. برای ادامه از صفحه ورود وارد شوید."});
        }
      }catch(error){
        console.error("register failed",error);
        return json(res,502,{message:"ارتباط با CMS برقرار نشد. دوباره تلاش کنید."});
      }
    }

    if(url.pathname==="/api/login" && req.method==="POST"){
      const body=await readBody(req);
      const identifier=String(body.identifier||"").trim();
      const password=String(body.password||"");
      const target=body.target==="admin"?"admin":"clients";
      if(!identifier || !password) return json(res,400,{message:"نام کاربری و رمز عبور را وارد کنید."});
      try{
        const auth=await loginCms(identifier,password);
        const user=await getMe(auth.access_token);
        if(user.status && user.status!=="active") return json(res,403,{message:"این حساب فعال نیست."});
        if(target==="admin" && !canAdmin(user)) return json(res,403,{message:"این حساب دسترسی Teacher یا بالاتر ندارد."});
        const authCookies=await authCookieHeaders(auth);
        let webinarAuthOk=false;
        if(target==="admin"){
          try{
            const webinarAuth=await loginWebinarCms(identifier,password);
            authCookies.push(...await webinarAuthCookieHeaders(webinarAuth));
            webinarAuthOk=true;
          }catch(error){
            console.warn("Learn webinar CMS login failed",error?.status||"",error?.message||error);
          }
        }
        return json(res,200,{ok:true,webinar_auth:webinarAuthOk,redirect:target==="admin"?"/admin/dashboard":"/clients"},{ "set-cookie":authCookies });
      }catch(error){
        const status=error.status===401?401:502;
        return json(res,status,{message:status===401?"نام کاربری یا رمز عبور اشتباه است.":"ارتباط با CMS برقرار نشد. دوباره تلاش کنید."});
      }
    }



    if(url.pathname==="/api/sections" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ندارید."});
      const course=Number(url.searchParams.get("course")||0);
      if(!course)return json(res,400,{message:"course الزامی است."});
      try{
        const q=new URLSearchParams({"filter[course][_eq]":String(course),fields:"id,course,title,position,date_created",sort:"position",limit:"200"});
        const data=await directusRequest(access,`/items/learning_sections?${q.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){return json(res,error.status||502,{message:"دریافت فصل ها ناموفق بود."})}
    }

    if(url.pathname==="/api/sections" && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند فصل بسازد."});
      const body=await readBody(req),course=Number(body.course||0),title=String(body.title||"").trim();
      if(!course||!title)return json(res,400,{message:"دوره و عنوان فصل الزامی است."});
      try{
        const result=await directusMutationWithRefresh(req,access,(token)=>
          directusRequest(token,"/items/learning_sections",{
            method:"POST",
            body:JSON.stringify({course,title,position:Math.max(1,Number(body.position)||1)})
          })
        );
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,201,{data:result.data},headers);
      }catch(error){
        console.error("section create failed",error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما مربوط به قبل از تغییر سطح دسترسی است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        if(error.status===403)return json(res,403,{message:"Directus اجازه ساخت فصل را برای این حساب نمی دهد."});
        return json(res,error.status||502,{message:"ایجاد فصل ناموفق بود."});
      }
    }

    if(url.pathname==="/api/lessons" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ندارید."});
      const section=Number(url.searchParams.get("section")||0);
      if(!section)return json(res,400,{message:"section الزامی است."});
      try{
        const q=new URLSearchParams({"filter[section][_eq]":String(section),fields:"id,section,title,slug,status,position,is_preview,date_created,date_updated",sort:"position",limit:"500"});
        const data=await directusRequest(access,`/items/learning_lessons?${q.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){return json(res,error.status||502,{message:"دریافت درس ها ناموفق بود."})}
    }

    if(url.pathname==="/api/lessons" && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند درس بسازد."});
      const body=await readBody(req),section=Number(body.section||0),title=String(body.title||"").trim();
      if(!section||!title)return json(res,400,{message:"فصل و عنوان درس الزامی است."});
      const slug=normalizeSlug(body.slug||title)||`lesson-${Date.now()}`;
      try{
        const created=await directusRequest(access,"/items/learning_lessons",{method:"POST",body:JSON.stringify({
          section,title,slug,status:["draft","published","archived"].includes(body.status)?body.status:"draft",
          type:"text",position:Math.max(1,Number(body.position)||1),is_preview:Boolean(body.is_preview)
        })});
        return json(res,201,{data:created});
      }catch(error){return json(res,error.status||502,{message:"ایجاد درس ناموفق بود."})}
    }

    if(url.pathname==="/api/lesson-blocks" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ندارید."});
      const lesson=Number(url.searchParams.get("lesson")||0);
      if(!lesson)return json(res,400,{message:"lesson الزامی است."});
      try{
        const q=new URLSearchParams({
          "filter[lesson][_eq]":String(lesson),
          fields:"id,lesson,type,position,title,text_content,download_allowed,is_required,media_asset.id,media_asset.kind,media_asset.status,media_asset.original_name,media_asset.converted_mime,media_asset.converted_size,media_asset.duration_seconds,media_asset.download_allowed",
          sort:"position",limit:"500"
        });
        const data=await directusRequest(access,`/items/learning_lesson_blocks?${q.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){return json(res,error.status||502,{message:"دریافت محتوای درس ناموفق بود."})}
    }

    if(url.pathname==="/api/lesson-blocks" && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند محتوا اضافه کند."});
      const body=await readBody(req),lesson=Number(body.lesson||0),type=String(body.type||"");
      if(!lesson||!["text","video","audio","file"].includes(type))return json(res,400,{message:"درس و نوع Block معتبر الزامی است."});
      if(type==="text"&&!String(body.text_content||"").trim())return json(res,400,{message:"محتوای متن خالی است."});
      if(type!=="text"&&!Number(body.media_asset||0))return json(res,400,{message:"برای این Block فایل رسانه الزامی است."});
      try{
        const created=await directusRequest(access,"/items/learning_lesson_blocks",{method:"POST",body:JSON.stringify({
          lesson,type,position:Math.max(1,Number(body.position)||1),title:String(body.title||"").trim()||null,
          text_content:type==="text"?String(body.text_content||"").trim():null,
          media_asset:type==="text"?null:Number(body.media_asset),
          download_allowed:type==="file"?Boolean(body.download_allowed):false,
          is_required:body.is_required!==false
        })});
        return json(res,201,{data:created});
      }catch(error){return json(res,error.status||502,{message:"ایجاد محتوای درس ناموفق بود."})}
    }

    if(url.pathname==="/api/media/upload" && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند فایل آپلود کند."});
      const kind=String(url.searchParams.get("kind")||"");
      if(!["video","audio","file"].includes(kind))return json(res,400,{message:"نوع فایل معتبر نیست."});
      const originalName=sanitizeFileName(req.headers["x-file-name"]||"upload.bin");
      const originalMime=String(req.headers["content-type"]||"application/octet-stream").split(";")[0];
      const downloadAllowed=kind==="file" && String(req.headers["x-download-allowed"]||"true")!=="false";
      let asset=null,originalPath="";
      try{
        await ensureMediaDirs();
        asset=await directusRequest(access,"/items/learning_media_assets",{method:"POST",body:JSON.stringify({
          kind,status:"uploaded",original_name:originalName,original_mime:originalMime,
          download_allowed:downloadAllowed,uploaded_by:user.id
        })});
        const dir=path.join(ORIGINALS_DIR,String(asset.id));
        originalPath=path.join(dir,originalName);
        const size=await streamToFile(req,originalPath);
        const patchResult=await directusMutationWithRefresh(req,cookies(req).learn_access||access,(token)=>
          directusRequest(token,`/items/learning_media_assets/${asset.id}`,{method:"PATCH",body:JSON.stringify({
            original_path:originalPath,original_size:size,status:"processing"
          })})
        );
        asset=patchResult.data;
        if(patchResult.auth && !res.headersSent){
          res.setHeader("set-cookie",await authCookieHeaders(patchResult.auth,cookies(req).learn_refresh));
        }
        const conversionAccess=cookies(req).learn_access||access;
        void convertMediaAsset(conversionAccess,{...asset,original_path:originalPath,original_name:originalName,original_mime:originalMime,kind});
        return json(res,202,{data:{id:asset.id,status:"processing",kind,original_name:originalName}});
      }catch(error){
        console.error("media upload failed",error);
        if(asset?.id){
          try{await directusRequest(access,`/items/learning_media_assets/${asset.id}`,{method:"PATCH",body:JSON.stringify({status:"failed",processing_error:String(error.message||error)})})}catch{}
        }
        return json(res,error.status||500,{message:error.status===413?"حجم فایل بیش از حد مجاز است.":"آپلود فایل ناموفق بود."});
      }
    }

    const mediaStatusMatch=/^\/api\/media\/(\d+)\/status$/.exec(url.pathname);
    if(mediaStatusMatch && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ندارید."});
      try{
        let asset=await directusRequest(access,`/items/learning_media_assets/${mediaStatusMatch[1]}?fields=*`);
        asset=await reconcileMediaState(access,asset);
        const safeAsset={...asset};
        delete safeAsset.original_path;delete safeAsset.converted_path;delete safeAsset.manifest_path;
        return json(res,200,{data:safeAsset});
      }catch(error){return json(res,error.status||404,{message:"فایل پیدا نشد."})}
    }

    const mediaVerifyMatch=/^\/api\/media\/(\d+)\/verify$/.exec(url.pathname);
    if(mediaVerifyMatch && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند سلامت فایل را تایید کند."});
      try{
        let asset=await directusRequest(access,`/items/learning_media_assets/${mediaVerifyMatch[1]}?fields=*`);
        asset=await reconcileMediaState(access,asset);
        if(asset.status!=="ready_for_review")return json(res,409,{message:"فایل هنوز آماده تایید نیست."});
        if(!asset.converted_path)return json(res,409,{message:"فایل تبدیل شده وجود ندارد."});
        await fsp.stat(asset.converted_path);
        if(asset.original_path){
          try{await fsp.rm(asset.original_path,{force:true});await fsp.rm(path.dirname(asset.original_path),{recursive:true,force:true})}catch{}
        }
        const now=new Date().toISOString();
        const updated=await directusRequest(access,`/items/learning_media_assets/${asset.id}`,{method:"PATCH",body:JSON.stringify({
          status:"ready",verified_by:user.id,verified_at:now,original_deleted_at:now,original_path:null
        })});
        await writeJobState(asset.id,{status:"ready",verified_at:now,original_deleted_at:now});
        return json(res,200,{data:updated,message:"سلامت فایل تایید شد و Original حذف شد."});
      }catch(error){return json(res,error.status||500,{message:"تایید فایل ناموفق بود."})}
    }

    const mediaPreviewMatch=/^\/api\/media\/(\d+)\/preview$/.exec(url.pathname);
    if(mediaPreviewMatch && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      try{
        const asset=await directusRequest(access,`/items/learning_media_assets/${mediaPreviewMatch[1]}?fields=id,kind,status,original_name,download_allowed`);
        if(!(await canAccessMediaAsset(access,user,asset.id)))return json(res,403,{message:"به این محتوای آموزشی دسترسی ندارید."});
        const allowedStatus=canAdmin(user)?["ready_for_review","ready"]:["ready"];
        if(!allowedStatus.includes(asset.status))return json(res,409,{message:"فایل هنوز آماده پخش نیست."});
        const filePath=convertedPathForAsset(asset);
        await fsp.stat(filePath);
        return await sendPrivateFile(req,res,filePath,false,asset.original_name);
      }catch(error){return json(res,error.status||404,{message:"فایل آماده نیست."})}
    }

    const mediaDownloadMatch=/^\/api\/media\/(\d+)\/download$/.exec(url.pathname);
    if(mediaDownloadMatch && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      try{
        const asset=await directusRequest(access,`/items/learning_media_assets/${mediaDownloadMatch[1]}?fields=id,kind,status,original_name,download_allowed`);
        if(!(await canAccessMediaAsset(access,user,asset.id)))return json(res,403,{message:"به این فایل آموزشی دسترسی ندارید."});
        if(!asset.download_allowed)return json(res,403,{message:"دانلود این فایل غیرفعال است."});
        if(asset.status!=="ready")return json(res,409,{message:"فایل آماده دانلود نیست."});
        const filePath=convertedPathForAsset(asset);
        await fsp.stat(filePath);
        return await sendPrivateFile(req,res,filePath,true,asset.original_name);
      }catch(error){return json(res,error.status||404,{message:"فایل پیدا نشد."})}
    }

    if(url.pathname==="/api/support/tickets" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به تیکت ها ندارید."});
      try{
        const params=new URLSearchParams({
          fields:"id,subject,message,priority,status,response,answered_at,date_created,student.id,student.first_name,student.last_name,student.email",
          sort:"-date_created",
          limit:"500"
        });
        const data=await directusRequest(access,`/items/learning_support_tickets?${params.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){
        console.error("support tickets list failed",error);
        return json(res,error.status||502,{message:"دریافت تیکت ها از CMS ناموفق بود."});
      }
    }

    const supportTicketMatch=/^\/api\/support\/tickets\/(\d+)$/.exec(url.pathname);
    if(supportTicketMatch && req.method==="PATCH"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به تیکت ها ندارید."});
      const body=await readBody(req);
      const allowedStatuses=new Set(["open","in_progress","answered","closed"]);
      const payload={};
      if(Object.prototype.hasOwnProperty.call(body,"status")){
        if(!allowedStatuses.has(String(body.status)))return json(res,400,{message:"وضعیت تیکت معتبر نیست."});
        payload.status=String(body.status);
      }
      if(Object.prototype.hasOwnProperty.call(body,"priority")){
        const priority=String(body.priority);
        if(!["normal","high"].includes(priority))return json(res,400,{message:"اولویت معتبر نیست."});
        payload.priority=priority;
      }
      if(Object.prototype.hasOwnProperty.call(body,"response")){
        payload.response=String(body.response||"").trim()||null;
        if(payload.response){
          payload.status="answered";
          payload.answered_at=new Date().toISOString();
        }
      }
      if(!Object.keys(payload).length)return json(res,400,{message:"تغییری برای ذخیره ارسال نشده است."});
      try{
        const result=await directusMutationWithRefresh(req,access,(token)=>
          directusRequest(token,`/items/learning_support_tickets/${supportTicketMatch[1]}`,{
            method:"PATCH",
            body:JSON.stringify(payload)
          })
        );
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,{data:result.data,message:"تیکت بروزرسانی شد."},headers);
      }catch(error){
        console.error("support ticket update failed",supportTicketMatch[1],error);
        return json(res,error.status||502,{message:"بروزرسانی تیکت در CMS ناموفق بود."});
      }
    }


    if(url.pathname==="/api/webinars" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به وبینارها ندارید."});
      try{
        const params=new URLSearchParams({
          fields:"id,status,title,slug,description,start_date,registration_open,date_created,date_updated",
          sort:"-start_date",
          limit:"500"
        });
        const data=await webinarRequest(req,res,`/items/webinars?${params.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){
        console.error("webinars list failed",error);
        return json(res,error.status||502,{message:error.status===401?"برای اتصال به CMS اصلی یک بار از حساب خارج و دوباره وارد شوید.":error.status===403?"حساب شما در CMS اصلی دسترسی وبینار ندارد.":"دریافت وبینارها از CMS اصلی ناموفق بود."});
      }
    }

    const webinarItemMatch=/^\/api\/webinars\/(\d+)$/.exec(url.pathname);
    if(webinarItemMatch && req.method==="PATCH"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user))return json(res,403,{message:"فقط ادمین یا مدرس می تواند وبینار را ویرایش کند."});
      const body=await readBody(req);
      const payload={};
      if(Object.prototype.hasOwnProperty.call(body,"title")){
        const title=String(body.title||"").trim();
        if(!title)return json(res,400,{message:"عنوان وبینار الزامی است."});
        payload.title=title.slice(0,255);
      }
      if(Object.prototype.hasOwnProperty.call(body,"slug")){
        const slug=String(body.slug||"").trim();
        if(!slug)return json(res,400,{message:"Slug وبینار الزامی است."});
        payload.slug=slug.slice(0,255);
      }
      if(Object.prototype.hasOwnProperty.call(body,"description"))payload.description=String(body.description||"").trim()||null;
      if(Object.prototype.hasOwnProperty.call(body,"start_date")){
        const startDate=String(body.start_date||"").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return json(res,400,{message:"تاریخ وبینار معتبر نیست."});
        payload.start_date=startDate;
      }
      if(Object.prototype.hasOwnProperty.call(body,"registration_open"))payload.registration_open=Boolean(body.registration_open);
      if(Object.prototype.hasOwnProperty.call(body,"status")){
        const status=String(body.status);
        if(!["draft","published","archived"].includes(status))return json(res,400,{message:"وضعیت وبینار معتبر نیست."});
        payload.status=status;
      }
      if(!Object.keys(payload).length)return json(res,400,{message:"تغییری برای ذخیره ارسال نشده است."});
      try{
        const data=await webinarRequest(req,res,`/items/webinars/${webinarItemMatch[1]}`,{method:"PATCH",body:JSON.stringify(payload)});
        return json(res,200,{data,message:"وبینار بروزرسانی شد."});
      }catch(error){
        console.error("webinar update failed",webinarItemMatch[1],error);
        return json(res,error.status||502,{message:error.status===403?"اجازه ویرایش وبینار برای این حساب وجود ندارد.":"ویرایش وبینار در CMS ناموفق بود."});
      }
    }


    if(url.pathname==="/api/course-registrations" && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به ثبت نام های دوره ندارید."});
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const registrationParams=new URLSearchParams({
            fields:"id,registration_status,course_slug,full_name,phone,phone_normalized,email,age_range,education_level,field_of_study,job_title,ai_familiarity,ai_usage,programming_level,goals,goals_text,desired_project,payment_preference,agreed_amount,paid_amount,remaining_amount,source,referrer,utm_source,utm_medium,utm_campaign,ip_address,user_agent,crm_contact,student_user,confirmed_at,confirmed_by,date_created,date_updated",
            sort:"-date_created",
            limit:"1000"
          });
          const registrationsRaw=await directusRequest(token,"/items/course_registrations?"+registrationParams.toString());
          const registrations=Array.isArray(registrationsRaw)?registrationsRaw:[];

          // Registration data is authoritative. Course metadata is only an
          // optional enhancement, so a permission/schema issue there must not
          // make the whole registrations page fail.
          let courses=[];
          try{
            const courseParams=new URLSearchParams({
              fields:"id,title,slug,status",
              sort:"title",
              limit:"-1"
            });
            const coursesRaw=await directusRequest(token,"/items/learning_courses?"+courseParams.toString());
            courses=Array.isArray(coursesRaw)?coursesRaw:[];
          }catch(courseError){
            console.warn("course title lookup skipped",courseError.status,courseError.message);
          }

          const coursesBySlug=new Map();
          for(const course of courses){
            const slug=String(course.slug||"").trim();
            if(slug)coursesBySlug.set(slug,course);
          }

          const data=registrations.map(function(registration){
            const slug=String(registration.course_slug||"").trim();
            const course=coursesBySlug.get(slug);
            return {...registration,course_title:course?.title||slug||null};
          });

          return {data,courses};
        });

        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("course registrations list failed",error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما منقضی شده است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        return json(res,error.status===403?403:502,{message:error.status===403?"حساب شما در CMS دسترسی خواندن course_registrations را ندارد.":"دریافت ثبت نام های دوره از CMS ناموفق بود."});
      }
    }


    const courseRegistrationItemMatch=/^\/api\/course-registrations\/([^/]+)$/.exec(url.pathname);
    if(courseRegistrationItemMatch && req.method==="PATCH"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ویرایش ثبت نام دوره را ندارید."});
      const id=courseRegistrationItemMatch[1];
      const body=await readBody(req);
      const allowedStrings=[
        "registration_status","course_slug","full_name","phone","email","age_range",
        "education_level","field_of_study","job_title","ai_familiarity","ai_usage",
        "programming_level","goals_text","desired_project","payment_preference","source",
        "utm_source","utm_medium","utm_campaign"
      ];
      const payload={};
      for(const field of allowedStrings){
        if(Object.prototype.hasOwnProperty.call(body,field)){
          const value=body[field];
          payload[field]=value===null?null:String(value).trim();
        }
      }
      for(const field of ["agreed_amount","paid_amount","remaining_amount"]){
        if(Object.prototype.hasOwnProperty.call(body,field)){
          const value=Number(body[field]);
          if(!Number.isFinite(value)||value<0)return json(res,400,{message:"مبالغ باید عدد معتبر و غیرمنفی باشند."});
          payload[field]=Math.round(value);
        }
      }
      if(Object.prototype.hasOwnProperty.call(body,"goals")){
        if(!Array.isArray(body.goals) && (typeof body.goals!=="object" || body.goals===null)){
          return json(res,400,{message:"فیلد goals باید JSON معتبر باشد."});
        }
        payload.goals=body.goals;
      }
      if(payload.email)payload.email=payload.email.toLowerCase();
      if(payload.phone){
        payload.phone_normalized=normalizeContactPhone(payload.phone);
        if(!payload.phone_normalized)return json(res,400,{message:"شماره تماس معتبر نیست."});
      }
      if(payload.full_name!==undefined&&!payload.full_name)return json(res,400,{message:"نام و نام خانوادگی الزامی است."});
      if(payload.course_slug!==undefined&&!payload.course_slug)return json(res,400,{message:"دوره الزامی است."});
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          return await directusRequest(token,"/items/course_registrations/"+encodeURIComponent(id),{
            method:"PATCH",
            body:JSON.stringify(payload)
          });
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,{data:result.data,message:"ثبت نام به روز شد."},headers);
      }catch(error){
        console.error("course registration update failed",id,error.status,error.message,error.payload||"");
        return json(res,error.status||502,{message:error.status===403?"CMS اجازه ویرایش این ثبت نام را نمی دهد.":"ویرایش ثبت نام ناموفق بود."});
      }
    }

    const courseRegistrationContextMatch=/^\/api\/course-registrations\/([^/]+)\/context$/.exec(url.pathname);
    if(courseRegistrationContextMatch && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به اطلاعات CRM ندارید."});
      const id=courseRegistrationContextMatch[1];
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const registration=await getCourseRegistration(token,id);
          let contact=null,reports=[];
          if(registration.crm_contact){
            contact=await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(registration.crm_contact)+"?fields=*");
            const q=new URLSearchParams({
              "filter[contact][_eq]":String(registration.crm_contact),
              "filter[date_deleted][_null]":"true",
              fields:"id,report_type,report_at,report_text,next_action,next_action_at,date_created,date_updated,author.id,author.first_name,author.last_name,author.email",
              sort:"-report_at,-date_created",
              limit:"100"
            });
            const rows=await directusRequest(token,"/items/crm_contact_reports?"+q.toString());
            reports=Array.isArray(rows)?rows:[];
          }
          return {contact,reports};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("course registration CRM context failed",id,error.status,error.message,error.payload||"");
        return json(res,error.status||502,{message:"دریافت اطلاعات CRM ناموفق بود."});
      }
    }

    const courseRegistrationAddContactMatch=/^\/api\/course-registrations\/([^/]+)\/add-contact$/.exec(url.pathname);
    if(courseRegistrationAddContactMatch && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به CRM ندارید."});
      const id=courseRegistrationAddContactMatch[1];
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const registration=await getCourseRegistration(token,id);
          const contact=await ensureCrmContact(token,registration,{student:registration.registration_status==="enrolled"});
          const updated=await directusRequest(token,"/items/course_registrations/"+encodeURIComponent(id),{
            method:"PATCH",
            body:JSON.stringify({crm_contact:contact.id})
          });
          return {contact,registration:updated};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("course registration add contact failed",id,error.status,error.message,error.payload||"");
        return json(res,error.status||502,{message:error.status===403?"CMS اجازه ایجاد یا ویرایش مخاطب را نمی دهد.":"اضافه کردن مخاطب به CRM ناموفق بود."});
      }
    }

    const courseRegistrationReportsMatch=/^\/api\/course-registrations\/([^/]+)\/reports$/.exec(url.pathname);
    if(courseRegistrationReportsMatch && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ثبت گزارش CRM ندارید."});
      const id=courseRegistrationReportsMatch[1];
      const body=await readBody(req);
      const reportText=String(body.report_text||"").trim();
      if(!reportText)return json(res,400,{message:"متن گزارش الزامی است."});
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const registration=await getCourseRegistration(token,id);
          let contact=await ensureCrmContact(token,registration,{student:registration.registration_status==="enrolled"});
          if(String(registration.crm_contact||"")!==String(contact.id)){
            await directusRequest(token,"/items/course_registrations/"+encodeURIComponent(id),{
              method:"PATCH",
              body:JSON.stringify({crm_contact:contact.id})
            });
          }
          const payload={
            contact:contact.id,
            author:user.id,
            report_type:"follow_up",
            report_at:new Date().toISOString(),
            report_text:reportText,
            next_action:String(body.next_action||"").trim()||null,
            next_action_at:body.next_action_at?new Date(body.next_action_at).toISOString():null
          };
          const report=await directusRequest(token,"/items/crm_contact_reports",{
            method:"POST",
            body:JSON.stringify(payload)
          });
          return {contact,report};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,201,result.data,headers);
      }catch(error){
        console.error("course registration report create failed",id,error.status,error.message,error.payload||"");
        return json(res,error.status||502,{message:"ثبت گزارش CRM ناموفق بود."});
      }
    }

    const courseRegistrationConfirmMatch=/^\/api\/course-registrations\/([^/]+)\/confirm$/.exec(url.pathname);
    if(courseRegistrationConfirmMatch && req.method==="POST"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(accessLevel(user)!=="admin")return json(res,403,{message:"فقط Admin می تواند ثبت نام دوره را نهایی و دسترسی ایجاد کند."});
      const id=courseRegistrationConfirmMatch[1];
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const registration=await getCourseRegistration(token,id);
          const email=String(registration.email||"").trim().toLowerCase();
          if(!email){
            throw Object.assign(new Error("برای ساخت حساب دانشجو و فعال کردن دوره، ابتدا ایمیل را در فرم ثبت نام وارد کنید."),{status:400});
          }

          const contact=await ensureCrmContact(token,registration,{student:true});

          // Validate the target course before creating a new user. This avoids
          // orphan student accounts when a registration contains a bad slug.
          const courseQ=new URLSearchParams({"filter[slug][_eq]":String(registration.course_slug||""),fields:"id,title,slug,status",limit:"1"});
          const coursesRaw=await directusRequest(token,"/items/learning_courses?"+courseQ.toString());
          const course=Array.isArray(coursesRaw)?coursesRaw[0]:null;
          if(!course){
            throw Object.assign(new Error("دوره متناظر با course_slug این ثبت نام در learning_courses پیدا نشد."),{status:409});
          }

          let studentUser=null;
          if(registration.student_user){
            try{
              studentUser=await directusRequest(token,"/users/"+encodeURIComponent(registration.student_user)+"?fields=id,email,first_name,last_name,status,role");
            }catch(error){
              if(Number(error?.status)!==404)throw error;
            }
          }
          if(!studentUser){
            const userQ=new URLSearchParams({"filter[email][_eq]":email,fields:"id,email,first_name,last_name,status,role",limit:"1"});
            const usersRaw=await directusRequest(token,"/users?"+userQ.toString());
            studentUser=Array.isArray(usersRaw)?usersRaw[0]:null;
          }
          let createdUser=false;
          let temporaryPassword=null;

          if(studentUser){
            if(studentUser.status!=="active"){
              throw Object.assign(new Error("حساب کاربری با این ایمیل وجود دارد اما فعال نیست. ابتدا وضعیت حساب را بررسی کنید."),{status:409});
            }
          }else{
            const names=splitFullName(registration.full_name);
            temporaryPassword=temporaryStudentPassword();
            studentUser=await directusRequest(token,"/users",{
              method:"POST",
              body:JSON.stringify({
                email,
                first_name:names.first_name,
                last_name:names.last_name,
                password:temporaryPassword,
                role:STUDENT_ROLE,
                status:"active"
              })
            });
            createdUser=true;
          }

          const enrollmentQ=new URLSearchParams({
            "filter[student][_eq]":String(studentUser.id),
            "filter[course][_eq]":String(course.id),
            fields:"id,status,enrolled_at",
            limit:"1"
          });
          const enrollmentsRaw=await directusRequest(token,"/items/learning_enrollments?"+enrollmentQ.toString());
          let enrollment=Array.isArray(enrollmentsRaw)?enrollmentsRaw[0]:null;
          const now=new Date().toISOString();
          if(enrollment){
            enrollment=await directusRequest(token,"/items/learning_enrollments/"+encodeURIComponent(enrollment.id),{
              method:"PATCH",
              body:JSON.stringify({
                status:"active",
                source:"course_registration:"+registration.id,
                enrolled_at:enrollment.enrolled_at||now
              })
            });
          }else{
            enrollment=await directusRequest(token,"/items/learning_enrollments",{
              method:"POST",
              body:JSON.stringify({
                student:studentUser.id,
                course:course.id,
                status:"active",
                source:"course_registration:"+registration.id,
                enrolled_at:now
              })
            });
          }

          const updatedContact=await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(contact.id),{
            method:"PATCH",
            body:JSON.stringify({directus_user:studentUser.id,contact_status:"student"})
          });

          const updatedRegistration=await directusRequest(token,"/items/course_registrations/"+encodeURIComponent(registration.id),{
            method:"PATCH",
            body:JSON.stringify({
              registration_status:"enrolled",
              crm_contact:updatedContact.id,
              student_user:studentUser.id,
              confirmed_at:now,
              confirmed_by:user.id
            })
          });

          return {
            registration:updatedRegistration,
            contact:updatedContact,
            enrollment,
            course,
            user:{id:studentUser.id,email:studentUser.email},
            created_user:createdUser,
            temporary_password:temporaryPassword
          };
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("course registration confirmation failed",id,error.status,error.message,error.payload||"");
        return json(res,error.status||502,{message:error.message||"تایید ثبت نام و فعال سازی دوره ناموفق بود."});
      }
    }

    if(url.pathname==="/api/webinar-registrations" && req.method==="GET"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به ثبت نام های وبینار ندارید."});
      try{
        const params=new URLSearchParams({
          fields:"id,status,full_name,phone,age,education,job_title,ai_experience,email,registration_goal,attended,attendance_minutes,join_count,first_join_at,last_leave_at,source,date_created,date_updated,webinar.id,webinar.title,webinar.slug",
          sort:"-date_created",
          limit:"1000"
        });
        const data=await webinarRequest(req,res,`/items/webinar_registrations?${params.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){
        console.error("webinar registrations list failed",error);
        return json(res,error.status||502,{message:error.status===401?"برای اتصال به CMS اصلی یک بار از حساب خارج و دوباره وارد شوید.":error.status===403?"حساب شما در CMS اصلی دسترسی ثبت نام های وبینار ندارد.":"دریافت ثبت نام های وبینار از CMS اصلی ناموفق بود."});
      }
    }

    const webinarRegistrationMatch=/^\/api\/webinar-registrations\/(\d+)$/.exec(url.pathname);
    if(webinarRegistrationMatch && req.method==="PATCH"){
      const user=await session(req,res),access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به ویرایش ثبت نام های وبینار ندارید."});
      const body=await readBody(req);
      const payload={};
      if(Object.prototype.hasOwnProperty.call(body,"status")){
        const status=String(body.status);
        if(!["registered","contacted","cancelled"].includes(status))return json(res,400,{message:"وضعیت ثبت نام معتبر نیست."});
        payload.status=status;
      }
      if(Object.prototype.hasOwnProperty.call(body,"full_name")){
        const fullName=String(body.full_name||"").trim();
        if(!fullName)return json(res,400,{message:"نام و نام خانوادگی الزامی است."});
        payload.full_name=fullName.slice(0,160);
      }
      if(Object.prototype.hasOwnProperty.call(body,"age")){
        const age=body.age===null||body.age===""?null:Number(body.age);
        if(age!==null&&(!Number.isInteger(age)||age<1||age>120))return json(res,400,{message:"سن معتبر نیست."});
        payload.age=age;
      }
      if(Object.prototype.hasOwnProperty.call(body,"education")){
        const value=String(body.education||"");
        if(value&&!["diploma_or_lower","associate","bachelor","master","phd","other"].includes(value))return json(res,400,{message:"مقطع تحصیلی معتبر نیست."});
        payload.education=value||null;
      }
      if(Object.prototype.hasOwnProperty.call(body,"job_title"))payload.job_title=String(body.job_title||"").trim().slice(0,160)||null;
      if(Object.prototype.hasOwnProperty.call(body,"ai_experience")){
        const value=String(body.ai_experience||"");
        if(value&&!["none","beginner","regular","advanced"].includes(value))return json(res,400,{message:"سطح استفاده از AI معتبر نیست."});
        payload.ai_experience=value||null;
      }
      if(Object.prototype.hasOwnProperty.call(body,"email")){
        const email=String(body.email||"").trim().toLowerCase().slice(0,320);
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{message:"ایمیل معتبر نیست."});
        payload.email=email||null;
      }
      if(Object.prototype.hasOwnProperty.call(body,"registration_goal"))payload.registration_goal=String(body.registration_goal||"").trim().slice(0,5000)||null;
      if(Object.prototype.hasOwnProperty.call(body,"attended"))payload.attended=Boolean(body.attended);
      if(Object.prototype.hasOwnProperty.call(body,"attendance_minutes")){
        const minutes=Number(body.attendance_minutes);
        if(!Number.isInteger(minutes)||minutes<0||minutes>1000000)return json(res,400,{message:"مدت حضور معتبر نیست."});
        payload.attendance_minutes=minutes;
      }
      if(Object.prototype.hasOwnProperty.call(body,"join_count")){
        const joins=Number(body.join_count);
        if(!Number.isInteger(joins)||joins<0||joins>1000000)return json(res,400,{message:"تعداد ورود معتبر نیست."});
        payload.join_count=joins;
      }
      if(!Object.keys(payload).length)return json(res,400,{message:"تغییری برای ذخیره ارسال نشده است."});
      try{
        const data=await webinarRequest(req,res,`/items/webinar_registrations/${webinarRegistrationMatch[1]}`,{method:"PATCH",body:JSON.stringify(payload)});
        return json(res,200,{data,message:"ثبت نام وبینار بروزرسانی شد."});
      }catch(error){
        console.error("webinar registration update failed",webinarRegistrationMatch[1],error);
        return json(res,error.status||502,{message:error.status===403?"اجازه ویرایش این ثبت نام برای حساب شما وجود ندارد.":"ویرایش ثبت نام در CMS ناموفق بود."});
      }
    }



    if(url.pathname==="/api/crm-reports" && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به گزارشات CRM ندارید."});
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const params=new URLSearchParams({
            "filter[date_deleted][_null]":"true",
            fields:"id,report_type,report_at,report_text,next_action,next_action_at,date_created,date_updated,contact.id,contact.full_name,contact.phone,contact.email,author.id,author.first_name,author.last_name,author.email",
            sort:"-report_at,-date_created",
            limit:"-1"
          });
          const rows=await directusRequest(token,"/items/crm_contact_reports?"+params.toString());
          return {data:Array.isArray(rows)?rows:[]};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("CRM reports list failed",error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما منقضی شده است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        return json(res,error.status===403?403:502,{message:error.status===403?"CMS اجازه خواندن گزارشات CRM را به این حساب نمی دهد.":"دریافت گزارشات CRM ناموفق بود."});
      }
    }

    if(url.pathname==="/api/crm-reports" && req.method==="POST"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ثبت گزارش CRM ندارید."});

      const body=await readBody(req);
      const contact=String(body.contact||"").trim();
      const reportText=String(body.report_text||"").trim();
      const nextAction=String(body.next_action||"").trim();
      const reportType=String(body.report_type||"other").trim();
      const allowedTypes=new Set(["call","payment","support","follow_up","meeting","message","sales","other"]);

      if(!contact)return json(res,400,{message:"انتخاب مخاطب الزامی است."});
      if(!reportText)return json(res,400,{message:"شرح گزارش الزامی است."});
      if(!allowedTypes.has(reportType))return json(res,400,{message:"نوع گزارش معتبر نیست."});

      const reportAtDate=body.report_at?new Date(body.report_at):new Date();
      if(!Number.isFinite(reportAtDate.getTime()))return json(res,400,{message:"تاریخ و ساعت گزارش معتبر نیست."});
      const reportAt=reportAtDate.toISOString();

      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const existingContact=await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(contact)+"?fields=id");
          if(!existingContact?.id)throw Object.assign(new Error("مخاطب انتخاب شده پیدا نشد."),{status:404});
          return await directusRequest(token,"/items/crm_contact_reports",{
            method:"POST",
            body:JSON.stringify({
              contact:existingContact.id,
              author:user.id,
              report_type:reportType,
              report_at:reportAt,
              report_text:reportText,
              next_action:nextAction||null
            })
          });
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,201,{data:result.data,message:"گزارش با موفقیت ثبت شد."},headers);
      }catch(error){
        console.error("CRM report create failed",error.status,error.message,error.payload||"");
        return json(res,error.status===404?404:error.status===403?403:502,{
          message:error.status===404?"مخاطب انتخاب شده پیدا نشد.":error.status===403?"CMS اجازه ثبت گزارش CRM را به این حساب نمی دهد.":"ثبت گزارش CRM ناموفق بود."
        });
      }
    }

    if(url.pathname==="/api/crm-contacts" && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به مخاطبان CRM ندارید."});
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const params=new URLSearchParams({
            fields:"id,contact_status,full_name,phone,phone_normalized,email,age,age_range,job_title,specialty,company,education_level,field_of_study,instagram_url,linkedin_url,telegram_id,website_url,source,notes,date_created,date_updated,directus_user.id,directus_user.email,directus_user.first_name,directus_user.last_name,directus_user.status",
            sort:"-date_updated,-date_created",
            limit:"-1"
          });
          const rows=await directusRequest(token,"/items/crm_contacts?"+params.toString());
          return {data:Array.isArray(rows)?rows:[]};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("CRM contacts list failed",error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما منقضی شده است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        return json(res,error.status===403?403:502,{message:error.status===403?"CMS اجازه خواندن مخاطبان CRM را به این حساب نمی دهد.":"دریافت مخاطبان CRM ناموفق بود."});
      }
    }

    const crmContactDetailMatch=/^\/api\/crm-contacts\/([^/]+)$/.exec(url.pathname);
    if(crmContactDetailMatch && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user||!access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به پرونده مخاطب ندارید."});
      const contactId=decodeURIComponent(crmContactDetailMatch[1]);
      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const contact=await directusRequest(token,"/items/crm_contacts/"+encodeURIComponent(contactId)+"?fields="+encodeURIComponent(
            "id,contact_status,full_name,phone,phone_normalized,email,age,age_range,job_title,specialty,company,education_level,field_of_study,instagram_url,linkedin_url,telegram_id,website_url,source,notes,date_created,date_updated,directus_user.id,directus_user.email,directus_user.first_name,directus_user.last_name,directus_user.status"
          ));

          const reportParams=new URLSearchParams({
            "filter[contact][_eq]":String(contactId),
            "filter[date_deleted][_null]":"true",
            fields:"id,report_type,report_at,report_text,next_action,next_action_at,date_created,date_updated,author.id,author.first_name,author.last_name,author.email",
            sort:"-report_at,-date_created",
            limit:"-1"
          });
          const reportsRaw=await directusRequest(token,"/items/crm_contact_reports?"+reportParams.toString());
          const reports=Array.isArray(reportsRaw)?reportsRaw:[];

          const registrationsById=new Map();
          async function addRegistrationRows(params){
            const rows=await directusRequest(token,"/items/course_registrations?"+params.toString());
            for(const row of (Array.isArray(rows)?rows:[]))registrationsById.set(String(row.id),row);
          }
          const registrationFields="id,registration_status,course_slug,full_name,phone,phone_normalized,email,payment_preference,agreed_amount,paid_amount,remaining_amount,date_created,crm_contact,student_user";

          await addRegistrationRows(new URLSearchParams({
            "filter[crm_contact][_eq]":String(contactId),
            fields:registrationFields,
            sort:"-date_created",
            limit:"-1"
          }));

          if(contact.email){
            await addRegistrationRows(new URLSearchParams({
              "filter[email][_eq]":String(contact.email).trim().toLowerCase(),
              fields:registrationFields,
              sort:"-date_created",
              limit:"-1"
            }));
          }
          if(contact.phone_normalized){
            await addRegistrationRows(new URLSearchParams({
              "filter[phone_normalized][_eq]":String(contact.phone_normalized),
              fields:registrationFields,
              sort:"-date_created",
              limit:"-1"
            }));
          }

          let registrations=[...registrationsById.values()].sort(function(a,b){
            return String(b.date_created||"").localeCompare(String(a.date_created||""));
          });

          let courses=[];
          try{
            const slugs=[...new Set(registrations.map(function(r){return String(r.course_slug||"").trim()}).filter(Boolean))];
            if(slugs.length){
              const courseParams=new URLSearchParams({
                "filter[slug][_in]":slugs.join(","),
                fields:"id,title,slug,status",
                limit:"-1"
              });
              const courseRows=await directusRequest(token,"/items/learning_courses?"+courseParams.toString());
              courses=Array.isArray(courseRows)?courseRows:[];
            }
          }catch(error){
            console.warn("contact detail course title lookup skipped",error.status,error.message);
          }

          const coursesBySlug=new Map(courses.map(function(course){return [String(course.slug||""),course]}));
          registrations=registrations.map(function(registration){
            const course=coursesBySlug.get(String(registration.course_slug||""));
            return {...registration,course_title:course?.title||registration.course_slug||null};
          });

          const uniqueCourseSlugs=new Set(registrations.map(function(row){return String(row.course_slug||"").trim()}).filter(Boolean));
          const summary=registrations.reduce(function(acc,row){
            acc.registration_count+=1;
            acc.total_agreed+=Number(row.agreed_amount||0)||0;
            acc.total_paid+=Number(row.paid_amount||0)||0;
            acc.total_remaining+=Number(row.remaining_amount||0)||0;
            return acc;
          },{registration_count:0,total_agreed:0,total_paid:0,total_remaining:0});
          summary.course_count=uniqueCourseSlugs.size;

          return {contact,reports,registrations,summary};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,result.data,headers);
      }catch(error){
        console.error("CRM contact detail failed",contactId,error.status,error.message,error.payload||"");
        return json(res,error.status===404?404:error.status===403?403:502,{
          message:error.status===404?"مخاطب پیدا نشد.":error.status===403?"CMS اجازه خواندن پرونده مخاطب را نمی دهد.":"دریافت پرونده مخاطب ناموفق بود."
        });
      }
    }

    if(url.pathname==="/api/students" && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user || !access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی به فهرست دانشجوها ندارید."});
      try{
        const studentParams=new URLSearchParams({
          "filter[role][_eq]":STUDENT_ROLE,
          fields:"id,email,first_name,last_name,status,date_created,last_access,role",
          sort:"first_name,last_name,email",
          limit:"-1"
        });
        const courseParams=new URLSearchParams({
          fields:"id,title,slug,status",
          sort:"title",
          limit:"-1"
        });
        const [studentsRaw,coursesRaw]=await Promise.all([
          directusRequest(access,"/users?"+studentParams.toString()),
          directusRequest(access,"/items/learning_courses?"+courseParams.toString())
        ]);
        const students=Array.isArray(studentsRaw)?studentsRaw:[];
        const courses=Array.isArray(coursesRaw)?coursesRaw:[];
        let enrollments=[];
        if(students.length){
          const enrollmentParams=new URLSearchParams({
            "filter[student][_in]":students.map(function(student){return student.id}).join(","),
            fields:"id,status,enrolled_at,access_expires_at,completed_at,student,course.id,course.title,course.slug",
            sort:"-enrolled_at",
            limit:"-1"
          });
          const rows=await directusRequest(access,"/items/learning_enrollments?"+enrollmentParams.toString());
          enrollments=Array.isArray(rows)?rows:[];
        }
        const byStudent=new Map();
        for(const enrollment of enrollments){
          const studentId=String(enrollment.student?.id||enrollment.student||"");
          if(!byStudent.has(studentId))byStudent.set(studentId,[]);
          byStudent.get(studentId).push(enrollment);
        }
        return json(res,200,{
          data:students.map(function(student){return {...student,enrollments:byStudent.get(String(student.id))||[]}}),
          courses
        });
      }catch(error){
        console.error("students list failed",error.status,error.message,error.payload||"");
        return json(res,error.status===403?403:502,{message:error.status===403?"CMS اجازه خواندن دانشجوها یا Enrollmentها را به این حساب نمی دهد.":"دریافت دانشجوها از CMS ناموفق بود."});
      }
    }

    const studentCoursesMatch=/^\/api\/students\/([^/]+)\/courses$/.exec(url.pathname);
    if(studentCoursesMatch && req.method==="PUT"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user || !access)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(accessLevel(user)!=="admin")return json(res,403,{message:"فقط Administrator می تواند دوره های دانشجو را تغییر دهد."});
      const studentId=decodeURIComponent(studentCoursesMatch[1]);
      const body=await readBody(req);
      if(!Array.isArray(body.course_ids))return json(res,400,{message:"course_ids باید آرایه باشد."});
      const requestedCourseIds=[...new Set(body.course_ids.map(function(value){return Number(value)}).filter(function(value){return Number.isInteger(value)&&value>0}))];

      try{
        const result=await directusMutationWithRefresh(req,access,async function(token){
          const target=await directusRequest(token,"/users/"+encodeURIComponent(studentId)+"?fields=id,role");
          const targetRole=typeof target?.role==="string"?target.role:target?.role?.id;
          if(targetRole!==STUDENT_ROLE)throw Object.assign(new Error("target user is not a student"),{status:400});

          if(requestedCourseIds.length){
            const courseParams=new URLSearchParams({
              "filter[id][_in]":requestedCourseIds.join(","),
              fields:"id",
              limit:"-1"
            });
            const found=await directusRequest(token,"/items/learning_courses?"+courseParams.toString());
            const foundIds=new Set((Array.isArray(found)?found:[]).map(function(course){return Number(course.id)}));
            if(requestedCourseIds.some(function(id){return !foundIds.has(id)})){
              throw Object.assign(new Error("one or more courses do not exist"),{status:400});
            }
          }

          const existingParams=new URLSearchParams({
            "filter[student][_eq]":studentId,
            fields:"id,status,course",
            limit:"-1"
          });
          const existingRaw=await directusRequest(token,"/items/learning_enrollments?"+existingParams.toString());
          const existing=Array.isArray(existingRaw)?existingRaw:[];
          const rowsByCourse=new Map();
          for(const row of existing){
            const courseId=Number(row.course?.id||row.course||0);
            if(courseId&&!rowsByCourse.has(courseId))rowsByCourse.set(courseId,row);
          }

          const requested=new Set(requestedCourseIds);
          let created=0,reactivated=0,revoked=0;
          for(const courseId of requestedCourseIds){
            const row=rowsByCourse.get(courseId);
            if(!row){
              await directusRequest(token,"/items/learning_enrollments",{
                method:"POST",
                body:JSON.stringify({student:studentId,course:courseId,status:"active",enrolled_at:new Date().toISOString()})
              });
              created++;
              continue;
            }
            if(!["active","completed"].includes(String(row.status||""))){
              await directusRequest(token,"/items/learning_enrollments/"+encodeURIComponent(row.id),{
                method:"PATCH",
                body:JSON.stringify({status:"active",access_expires_at:null})
              });
              reactivated++;
            }
          }

          for(const row of existing){
            const courseId=Number(row.course?.id||row.course||0);
            if(courseId&&!requested.has(courseId)&&["active","completed"].includes(String(row.status||""))){
              await directusRequest(token,"/items/learning_enrollments/"+encodeURIComponent(row.id),{
                method:"PATCH",
                body:JSON.stringify({status:"revoked"})
              });
              revoked++;
            }
          }
          return {student_id:studentId,course_ids:requestedCourseIds,created,reactivated,revoked};
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,{data:result.data,message:"دوره های دانشجو بروزرسانی شد."},headers);
      }catch(error){
        console.error("student course assignment failed",studentId,error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما منقضی شده است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        const code=error.status===403?403:error.status===400?400:502;
        return json(res,code,{message:code===403?"CMS اجازه تغییر Enrollmentها را به این حساب نمی دهد.":code===400?"دانشجو یا دوره های انتخاب شده معتبر نیستند.":"بروزرسانی دوره های دانشجو در CMS ناموفق بود."});
      }
    }

        if(url.pathname==="/api/courses" && req.method==="GET"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user || !access) return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user)) return json(res,403,{message:"دسترسی به مدیریت دوره ها ندارید."});
      try{
        const params=new URLSearchParams({
          sort:"-date_created",
          limit:"100"
        });
        const data=await directusRequest(access,`/items/learning_courses?${params.toString()}`);
        return json(res,200,{data:Array.isArray(data)?data:[]});
      }catch(error){
        console.error("courses list failed",error);
        return json(res,error.status===403?403:502,{message:"دریافت دوره ها از CMS ناموفق بود."});
      }
    }

    if(url.pathname==="/api/courses" && req.method==="POST"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user || !access) return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user)) return json(res,403,{message:"فقط ادمین یا مدرس می تواند دوره جدید بسازد."});
      const body=await readBody(req);
      const title=String(body.title||"").trim();
      if(!title) return json(res,400,{message:"عنوان دوره الزامی است."});
      if(title.length>255) return json(res,400,{message:"عنوان دوره بیش از حد طولانی است."});
      const allowedStatuses=new Set(["draft","published","archived"]);
      const status=allowedStatuses.has(body.status)?body.status:"draft";
      const price=Math.max(0,Math.round(Number(body.price)||0));
      let landingPage=null;
      try{landingPage=normalizeLandingPage(body.landing_page)}catch{return json(res,400,{message:"لینک لندینگ باید به شکل /build-with-ai وارد شود."})}
      try{
        const slug=await uniqueCourseSlug(access,String(body.slug||""),title);
        const payload={
          title,
          slug,
          status,
          excerpt:String(body.excerpt||"").trim() || null,
          description:String(body.description||"").trim() || null,
          price,
          currency:"IRT",
          featured:false,
          ...(landingPage?{landing_page:landingPage}:{}),
          ...(status==="published"?{published_at:new Date().toISOString()}: {})
        };
        const created=await directusRequest(access,"/items/learning_courses",{method:"POST",body:JSON.stringify(payload)});
        return json(res,201,{data:created,message:"دوره با موفقیت ایجاد شد."});
      }catch(error){
        console.error("course create failed",error);
        const statusCode=error.status===403?403:error.status===400?400:502;
        return json(res,statusCode,{message:error.status===403?"اجازه ساخت دوره برای این حساب وجود ندارد.":"ایجاد دوره در CMS ناموفق بود."});
      }
    }

    const courseItemMatch=/^\/api\/courses\/(\d+)$/.exec(url.pathname);
    if(courseItemMatch && req.method==="PATCH"){
      const user=await session(req,res);
      const access=cookies(req).learn_access;
      if(!user || !access) return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canManageCourses(user)) return json(res,403,{message:"فقط ادمین یا مدرس می تواند دوره را ویرایش کند."});
      const courseId=Number(courseItemMatch[1]);
      const body=await readBody(req);
      const has=(key)=>Object.prototype.hasOwnProperty.call(body,key);
      const allowedStatuses=new Set(["draft","published","archived"]);
      if(has("title")){
        const title=String(body.title||"").trim();
        if(!title)return json(res,400,{message:"عنوان دوره الزامی است."});
        if(title.length>255)return json(res,400,{message:"عنوان دوره بیش از حد طولانی است."});
      }
      if(has("status")&&!allowedStatuses.has(body.status))return json(res,400,{message:"وضعیت دوره معتبر نیست."});
      let landingPage;
      if(has("landing_page")){
        try{landingPage=normalizeLandingPage(body.landing_page)}catch{return json(res,400,{message:"لینک لندینگ باید به شکل /build-with-ai وارد شود."})}
      }
      try{
        const result=await directusMutationWithRefresh(req,access,async(token)=>{
          const payload={};
          if(has("title"))payload.title=String(body.title).trim();
          if(has("slug")){
            const requested=String(body.slug||"").trim();
            const fallback=has("title")?String(body.title).trim():`course-${courseId}`;
            payload.slug=await uniqueCourseSlug(token,requested,fallback,courseId);
          }
          if(has("status")){
            payload.status=body.status;
            if(body.status==="published")payload.published_at=new Date().toISOString();
          }
          if(has("excerpt"))payload.excerpt=String(body.excerpt||"").trim()||null;
          if(has("description"))payload.description=String(body.description||"").trim()||null;
          if(has("landing_page"))payload.landing_page=landingPage;
          if(has("price"))payload.price=Math.max(0,Math.round(Number(body.price)||0));
          if(has("currency"))payload.currency="IRT";
          if(!Object.keys(payload).length)throw Object.assign(new Error("no fields"),{status:400});
          return await directusRequest(token,`/items/learning_courses/${courseId}`,{method:"PATCH",body:JSON.stringify(payload)});
        });
        const headers=result.auth?{"set-cookie":await authCookieHeaders(result.auth)}:{};
        return json(res,200,{data:result.data,message:"دوره با موفقیت ویرایش شد."},headers);
      }catch(error){
        console.error("course update failed",courseId,error.status,error.message,error.payload||"");
        if(error.refreshRequired){
          return json(res,401,{message:"نشست شما منقضی شده است. یک بار خارج شوید و دوباره وارد شوید."},{
            "set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh")]
          });
        }
        const statusCode=error.status===403?403:error.status===400?400:502;
        return json(res,statusCode,{message:error.status===403?"اجازه ویرایش دوره برای این حساب وجود ندارد.":error.status===400?"اطلاعات ارسالی برای ویرایش معتبر نیست.":"ویرایش دوره در CMS ناموفق بود."});
      }
    }

    if(url.pathname==="/api/settings/session" && req.method==="GET"){
      const user=await session(req,res);
      if(!user)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canAdmin(user))return json(res,403,{message:"دسترسی ندارید."});
      const settings=await readSystemSettings();
      return json(res,200,{data:settings,editable:canChangeSystemSettings(user)});
    }

    if(url.pathname==="/api/admin/calendar-events" && ["GET","POST","PATCH","DELETE"].includes(req.method)){
      const user=await session(req,res);
      if(!user)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(accessLevel(user)!=="admin")return json(res,403,{message:"این تقویم فقط برای Administrator قابل مدیریت است."});
      return json(res,503,{message:"تقویم Learn فعلا مستقل است و اتصال خارجی برای آن غیرفعال شده است."});
    }

    if(url.pathname==="/api/settings/session" && req.method==="PUT"){
      const user=await session(req,res);
      if(!user)return json(res,401,{message:"ابتدا وارد حساب شوید."});
      if(!canChangeSystemSettings(user))return json(res,403,{message:"فقط Administrator می تواند تنظیمات نشست را تغییر دهد."});
      const body=await readBody(req);
      const hours=Number(body.session_hours);
      if(!Number.isInteger(hours)||hours<1||hours>168){
        return json(res,400,{message:"مدت نشست باید یک عدد صحیح بین ۱ تا ۱۶۸ ساعت باشد."});
      }
      const settings=await writeSystemSettings({session_hours:hours});
      const jar=cookies(req);
      const auth={
        access_token:jar.learn_access||"",
        refresh_token:jar.learn_refresh||""
      };
      const headers=(auth.access_token||auth.refresh_token)
        ? {"set-cookie":await authCookieHeaders(auth,auth.refresh_token)}
        : {};
      return json(res,200,{data:settings,message:"تنظیمات نشست ذخیره شد."},headers);
    }

        if(url.pathname==="/api/logout" && req.method==="POST"){
      return json(res,200,{ok:true},{"set-cookie":[clearCookie("learn_access"),clearCookie("learn_refresh"),clearCookie("webinar_access"),clearCookie("webinar_refresh")]});
    }

    if(url.pathname==="/register"){
      const embedded=url.searchParams.get("embed")==="1";
      const user=await session(req,res);
      if(user && canClients(user)) return redirect(res,"/clients");
      return html(res,200,registerPage(embedded));
    }

    if(url.pathname==="/clients"){
      const embedded=url.searchParams.get("embed")==="1";
      const user=await session(req,res);
      if(!user) return html(res,200,loginPage("clients",false,embedded));
      if(!canClients(user)) return html(res,403,loginPage("clients",true,embedded));
      return html(res,200,dashboard(user,"clients"));
    }

    if(url.pathname==="/admin"){
      const user=await session(req,res);
      if(!user) return html(res,200,loginPage("admin"));
      if(!canAdmin(user)) return html(res,403,loginPage("admin",true));
      return redirect(res,"/admin/dashboard");
    }

    const adminContactDetailMatch=/^\/admin\/contacts\/([^/]+)\/?$/.exec(url.pathname);
    if(adminContactDetailMatch){
      const user=await session(req,res);
      if(!user) return html(res,200,loginPage("admin"));
      if(!canAdmin(user)) return html(res,403,loginPage("admin",true));
      return html(res,200,adminDashboard(user,"contact-detail",decodeURIComponent(adminContactDetailMatch[1])));
    }

    if(url.pathname.startsWith("/admin/")){
      const user=await session(req,res);
      if(!user) return html(res,200,loginPage("admin"));
      if(!canAdmin(user)) return html(res,403,loginPage("admin",true));
      const view=decodeURIComponent(url.pathname.slice("/admin/".length)).replace(/\/+$/,"");
      if(!view || view.includes("/") || !ADMIN_VIEW_IDS.has(view)){
        return html(res,404,layout("404",'<section class="card login"><h1>404</h1><p class="muted">صفحه مدیریت پیدا نشد.</p></section>'));
      }
      return html(res,200,adminDashboard(user,view));
    }

    return html(res,404,layout("404",'<section class="card login"><h1>404</h1><p class="muted">صفحه پیدا نشد.</p></section>'));
  }catch(error){
    console.error(error);
    return json(res,500,{message:"خطای داخلی سرور"});
  }
});

server.listen(PORT,"0.0.0.0",()=>console.log(`Updateshid Learn listening on :${PORT}`));
