/**
 * MOS-DIS 内容管理后台 V1.0
 * Google Apps Script + Google Sheets
 *
 * 目标：内容总览 / 周管理 / 日内容 / 人工审核 / 版本记录 / 发布管理
 * 不包含：用户社交、积分、排名、AI神学评分、教师CRM
 */

const MOS = {
  VERSION: 'MOS-DIS ADMIN 1.0',
  SHEETS: {
    WEEKS: 'MOS_WEEKS',
    DAYS: 'MOS_DAYS',
    RESEARCH: 'MOS_RESEARCH',
    VERSIONS: 'MOS_VERSIONS',
    SETTINGS: 'MOS_SETTINGS',
    LOG: 'MOS_LOG'
  },
  DAY_HEADERS: [
    'day_id','day_seq','week','phase','eight_step','season','primary_lq','secondary_lq',
    'week_function','core_life_question','pain_point','reference','p_evidence','l_evidence',
    'j_evidence','nt_principle','theology','week_theme','week_guide','day_type','daily_core',
    'question','choice_text','option_a','option_b','option_c','practice','share','mission',
    'fruit','evidence_grade','review_status','review_note','content_status','version','updated_at','updated_by','published_at'
  ],
  WEEK_HEADERS: ['week','eight_step','season','reference','sunday_theme','guide_sentence','review_status','review_note','content_status','version','updated_at','updated_by'],
  VERSION_HEADERS: ['version_id','entity_type','entity_id','version_no','action','snapshot_json','updated_at','updated_by'],
  SETTINGS_HEADERS: ['key','value','note','updated_at'],
  LOG_HEADERS: ['log_id','action','entity_type','entity_id','detail','created_at','created_by']
};

function doGet() {
  assertAdmin_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('MOS-DIS 内容管理后台 V1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, MOS.SHEETS.WEEKS, MOS.WEEK_HEADERS);
  ensureSheet_(ss, MOS.SHEETS.DAYS, MOS.DAY_HEADERS);
  ensureSheet_(ss, MOS.SHEETS.RESEARCH, ['entity_type','entity_id','field','value','source','note','updated_at','updated_by']);
  ensureSheet_(ss, MOS.SHEETS.VERSIONS, MOS.VERSION_HEADERS);
  ensureSheet_(ss, MOS.SHEETS.SETTINGS, MOS.SETTINGS_HEADERS);
  ensureSheet_(ss, MOS.SHEETS.LOG, MOS.LOG_HEADERS);
  writeSetting_('system_version', MOS.VERSION, '后台版本');
  writeSetting_('publish_mode', 'manual', '管理员审核后发布');
  writeSetting_('content_units', '364', '52周×7日');
  writeSetting_('review_rule', 'A=通过；B=小修；C=重写', '人工审核，不以分数代替判断');
  return {ok:true, version:MOS.VERSION};
}

function getDashboard() {
  assertAdmin_();
  const days = getRows_(MOS.SHEETS.DAYS);
  const weeks = getRows_(MOS.SHEETS.WEEKS);
  return {
    version: MOS.VERSION,
    days: days.length,
    weeks: weeks.length,
    review: summarizeStatus_(days, 'review_status'),
    content: summarizeStatus_(days, 'content_status'),
    phases: summarizePhases_(days)
  };
}

function getWeeks(filters) {
  assertAdmin_();
  let rows = getRows_(MOS.SHEETS.WEEKS);
  filters = filters || {};
  if (filters.status) rows = rows.filter(r => String(r.review_status || '') === String(filters.status));
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    rows = rows.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(q)));
  }
  return rows;
}

function getDays(filters) {
  assertAdmin_();
  let rows = getRows_(MOS.SHEETS.DAYS);
  filters = filters || {};
  if (filters.week) rows = rows.filter(r => Number(r.week) === Number(filters.week));
  if (filters.day_type) rows = rows.filter(r => String(r.day_type || '') === String(filters.day_type));
  if (filters.review_status) rows = rows.filter(r => String(r.review_status || '') === String(filters.review_status));
  if (filters.content_status) rows = rows.filter(r => String(r.content_status || '') === String(filters.content_status));
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    rows = rows.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(q)));
  }
  return rows;
}

function getDay(dayId) {
  assertAdmin_();
  const row = findBy_(MOS.SHEETS.DAYS, 'day_id', dayId);
  if (!row) throw new Error('找不到日内容：' + dayId);
  return row;
}

function getWeek(weekNo) {
  assertAdmin_();
  const row = findBy_(MOS.SHEETS.WEEKS, 'week', Number(weekNo));
  if (!row) throw new Error('找不到第 ' + weekNo + ' 周');
  return row;
}

function saveDay(payload) {
  assertAdmin_();
  if (!payload || !payload.day_id) throw new Error('day_id 不能为空');
  const current = getDay(payload.day_id);
  const user = getUser_();
  const now = new Date();
  const next = Object.assign({}, current, payload, {
    updated_at: now.toISOString(),
    updated_by: user,
    version: bumpVersion_(current.version)
  });
  snapshot_('day', payload.day_id, next, 'edit');
  updateByKey_(MOS.SHEETS.DAYS, 'day_id', payload.day_id, next);
  log_('EDIT_DAY', 'day', payload.day_id, '保存每日内容');
  return next;
}

function saveWeek(payload) {
  assertAdmin_();
  if (!payload || !payload.week) throw new Error('week 不能为空');
  const current = getWeek(payload.week);
  const user = getUser_();
  const now = new Date();
  const next = Object.assign({}, current, payload, {
    updated_at: now.toISOString(),
    updated_by: user,
    version: bumpVersion_(current.version)
  });
  snapshot_('week', String(payload.week), next, 'edit');
  updateByKey_(MOS.SHEETS.WEEKS, 'week', Number(payload.week), next);
  log_('EDIT_WEEK', 'week', String(payload.week), '保存周内容');
  return next;
}

function reviewDay(dayId, reviewStatus, note) {
  assertAdmin_();
  if (!['A','B','C'].includes(String(reviewStatus))) throw new Error('审核状态必须为 A / B / C');
  const current = getDay(dayId);
  const user = getUser_();
  const next = Object.assign({}, current, {
    review_status: String(reviewStatus),
    review_note: String(note || ''),
    updated_at: new Date().toISOString(),
    updated_by: user
  });
  updateByKey_(MOS.SHEETS.DAYS, 'day_id', dayId, next);
  log_('REVIEW_DAY', 'day', dayId, reviewStatus + '｜' + (note || ''));
  return next;
}

function reviewWeek(weekNo, reviewStatus, note) {
  assertAdmin_();
  if (!['A','B','C'].includes(String(reviewStatus))) throw new Error('审核状态必须为 A / B / C');
  const current = getWeek(weekNo);
  const user = getUser_();
  const next = Object.assign({}, current, {
    review_status: String(reviewStatus),
    review_note: String(note || ''),
    updated_at: new Date().toISOString(),
    updated_by: user
  });
  updateByKey_(MOS.SHEETS.WEEKS, 'week', Number(weekNo), next);
  log_('REVIEW_WEEK', 'week', String(weekNo), reviewStatus + '｜' + (note || ''));
  return next;
}

function publishDay(dayId) {
  assertAdmin_();
  const current = getDay(dayId);
  if (String(current.review_status) !== 'A') throw new Error('只有审核状态 A 才能发布');
  const user = getUser_();
  const next = Object.assign({}, current, {
    content_status: '已发布',
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: user
  });
  updateByKey_(MOS.SHEETS.DAYS, 'day_id', dayId, next);
  log_('PUBLISH_DAY', 'day', dayId, '发布');
  return next;
}

function unpublishDay(dayId) {
  assertAdmin_();
  const current = getDay(dayId);
  const user = getUser_();
  const next = Object.assign({}, current, {
    content_status: '已通过',
    published_at: '',
    updated_at: new Date().toISOString(),
    updated_by: user
  });
  updateByKey_(MOS.SHEETS.DAYS, 'day_id', dayId, next);
  log_('UNPUBLISH_DAY', 'day', dayId, '撤回发布');
  return next;
}

function getVersions(entityType, entityId) {
  assertAdmin_();
  return getRows_(MOS.SHEETS.VERSIONS).filter(r => String(r.entity_type) === String(entityType) && String(r.entity_id) === String(entityId));
}

function importDays(rows) {
  assertAdmin_();
  if (!Array.isArray(rows) || !rows.length) throw new Error('没有可导入的日内容');
  const headers = MOS.DAY_HEADERS;
  const sheet = SpreadsheetApp.getActive().getSheetByName(MOS.SHEETS.DAYS);
  const existing = getRows_(MOS.SHEETS.DAYS);
  const map = {};
  existing.forEach(r => map[String(r.day_id)] = r);
  const user = getUser_();
  const now = new Date().toISOString();
  rows.forEach(raw => {
    const id = String(raw.day_id || '').trim();
    if (!/^W\d{2}D\d{2}$/.test(id)) throw new Error('非法 day_id：' + id);
    const normalized = {};
    headers.forEach(h => normalized[h] = raw[h] !== undefined ? String(raw[h]) : '');
    normalized.version = bumpVersion_(map[id] && map[id].version);
    normalized.updated_at = now;
    normalized.updated_by = user;
    if (!normalized.review_status) normalized.review_status = '待审核';
    if (!normalized.content_status) normalized.content_status = '草稿';
    map[id] = normalized;
  });
  const out = Object.keys(map).sort(daySort_).map(id => headers.map(h => map[id][h] === undefined ? '' : map[id][h]));
  sheet.clearContents();
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  if (out.length) sheet.getRange(2,1,out.length,headers.length).setValues(out);
  log_('IMPORT_DAYS', 'days', 'all', '导入/更新 ' + rows.length + ' 天');
  return {ok:true, total:out.length, imported:rows.length};
}

function importWeeks(rows) {
  assertAdmin_();
  if (!Array.isArray(rows) || !rows.length) throw new Error('没有可导入的周内容');
  const headers = MOS.WEEK_HEADERS;
  const map = {};
  getRows_(MOS.SHEETS.WEEKS).forEach(r => map[String(r.week)] = r);
  const user = getUser_();
  const now = new Date().toISOString();
  rows.forEach(raw => {
    const w = Number(raw.week);
    if (!Number.isInteger(w) || w < 1 || w > 52) throw new Error('非法周次：' + raw.week);
    const n = {};
    headers.forEach(h => n[h] = raw[h] !== undefined ? String(raw[h]) : '');
    n.updated_at = now; n.updated_by = user;
    if (!n.review_status) n.review_status = '待审核';
    if (!n.content_status) n.content_status = '草稿';
    n.version = bumpVersion_(map[String(w)] && map[String(w)].version);
    map[String(w)] = n;
  });
  const out = Object.keys(map).sort((a,b)=>Number(a)-Number(b)).map(k=>headers.map(h=>map[k][h] || ''));
  const sheet = SpreadsheetApp.getActive().getSheetByName(MOS.SHEETS.WEEKS);
  sheet.clearContents(); sheet.getRange(1,1,1,headers.length).setValues([headers]);
  if (out.length) sheet.getRange(2,1,out.length,headers.length).setValues(out);
  log_('IMPORT_WEEKS', 'weeks', 'all', '导入/更新 ' + rows.length + ' 周');
  return {ok:true, total:out.length, imported:rows.length};
}

function exportPublishedDays() {
  assertAdmin_();
  const rows = getRows_(MOS.SHEETS.DAYS).filter(r => r.content_status === '已发布');
  return {headers:MOS.DAY_HEADERS, rows:rows};
}

function exportDaysForCsv() {
  assertAdmin_();
  return {headers:MOS.DAY_HEADERS, rows:getRows_(MOS.SHEETS.DAYS)};
}

function assertAdmin_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const allowed = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if (!allowed.length) throw new Error('未设置 ADMIN_EMAILS。请先运行 setAdminEmails(email1,email2,...)。');
  if (!allowed.includes(email)) throw new Error('无权限访问后台：' + (email || '未知账号'));
}

function setAdminEmails() {
  const emails = Array.prototype.slice.call(arguments).flat().join(',');
  if (!emails) throw new Error('请提供管理员邮箱');
  PropertiesService.getScriptProperties().setProperty('ADMIN_EMAILS', emails);
  return '已设置：' + emails;
}

function getUser_() {
  return Session.getActiveUser().getEmail() || 'admin';
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#315B4F').setFontColor('#FFFFFF');
  return sh;
}

function getRows_(sheetName) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => String(v) !== '')).map(r => {
    const o = {}; headers.forEach((h,i)=>o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]); return o;
  });
}

function findBy_(sheetName, key, value) {
  const rows = getRows_(sheetName);
  return rows.find(r => String(r[key]) === String(value)) || null;
}

function updateByKey_(sheetName, key, value, obj) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const vals = sh.getDataRange().getValues();
  const headers = vals[0].map(String);
  const col = headers.indexOf(key);
  if (col < 0) throw new Error('字段不存在：' + key);
  let rowIndex = -1;
  for (let i=1;i<vals.length;i++) if (String(vals[i][col]) === String(value)) { rowIndex=i+1; break; }
  if (rowIndex < 0) throw new Error('找不到：' + key + '=' + value);
  sh.getRange(rowIndex,1,1,headers.length).setValues([headers.map(h=>obj[h] !== undefined ? obj[h] : '')]);
}

function snapshot_(entityType, entityId, obj, action) {
  const sh = SpreadsheetApp.getActive().getSheetByName(MOS.SHEETS.VERSIONS);
  const no = bumpVersion_(obj.version);
  sh.appendRow(['V'+Date.now(),entityType,String(entityId),no,action,JSON.stringify(obj),new Date(),getUser_()]);
}

function log_(action, entityType, entityId, detail) {
  const sh = SpreadsheetApp.getActive().getSheetByName(MOS.SHEETS.LOG);
  sh.appendRow([Utilities.getUuid(),action,entityType,String(entityId),detail,new Date(),getUser_()]);
}

function writeSetting_(key, value, note) {
  const sh = SpreadsheetApp.getActive().getSheetByName(MOS.SHEETS.SETTINGS);
  const rows = getRows_(MOS.SHEETS.SETTINGS);
  const existing = rows.find(r=>r.key===key);
  if (existing) {
    updateByKey_(MOS.SHEETS.SETTINGS, 'key', key, {key,value,note,updated_at:new Date().toISOString()});
  } else {
    sh.appendRow([key,value,note,new Date()]);
  }
}

function bumpVersion_(v) {
  const n = parseInt(String(v || '0').replace(/^V/i,''),10) || 0;
  return 'V' + (n+1);
}

function summarizeStatus_(rows, field) {
  return rows.reduce((o,r)=>{const k=String(r[field]||'未设置');o[k]=(o[k]||0)+1;return o;},{});
}
function summarizePhases_(rows) {
  return rows.reduce((o,r)=>{const k=String(r.phase||'');if(!k)return o;o[k]=(o[k]||0)+1;return o;},{});
}
function daySort_(a,b) {
  const ma=String(a).match(/^W(\d+)D(\d+)$/), mb=String(b).match(/^W(\d+)D(\d+)$/);
  return (Number(ma&&ma[1]||0)-Number(mb&&mb[1]||0)) || (Number(ma&&ma[2]||0)-Number(mb&&mb[2]||0));
}
