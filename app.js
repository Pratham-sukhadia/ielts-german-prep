/* =========================================================
   PRATHAM'S IELTS + GERMAN COACH
   app.js — application logic.
   Sections:
     1  storage + state
     2  utilities
     3  score maths and engines
     4  generic CRUD (schema driven forms, tables, CSV)
     5  views
     6  reports, PDF, import/export
     7  boot
   ========================================================= */
'use strict';

/* =========================================================
   1. STORAGE + STATE
   ========================================================= */
const DBNAME = 'pratham-coach';
const LS_KEY = 'pratham-coach-state';
const STATE_VERSION = 1;

const Store = (() => {
  let idb = null, idbFailed = false;

  function open() {
    return new Promise((resolve) => {
      if (idb) return resolve(idb);
      if (idbFailed || !('indexedDB' in window)) return resolve(null);
      let req;
      try { req = indexedDB.open(DBNAME, 1); } catch (e) { idbFailed = true; return resolve(null); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      };
      req.onsuccess = () => { idb = req.result; resolve(idb); };
      req.onerror = () => { idbFailed = true; resolve(null); };
    });
  }

  async function get(store, key) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result ?? null);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function put(store, key, value) {
    const db = await open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const r = key === null ? os.put(value) : os.put(value, key);
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function del(store, key) {
    const db = await open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).delete(key);
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function all(store) {
    const db = await open();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  return { get, put, del, all, usingIdb: () => !!idb };
})();

function blankState() {
  const p = DB.PROFILE;
  return {
    version: STATE_VERSION,
    settings: {
      name: p.name,
      examDate: p.examDate,
      startDate: p.startDate,
      targetOverall: p.targets.overall,
      targetListening: p.targets.listening,
      targetReading: p.targets.reading,
      targetWriting: p.targets.writing,
      targetSpeaking: p.targets.speaking,
      germanLevel: p.germanLevel,
      germanTarget: p.germanTarget,
      mode: 'normal',
      dailyTarget: 105,
      theme: 'dark',
      bgFx: 'on',
      reminder: 'off',
      reminderTime: '08:00',
      satOffset: 0
    },
    ieltsScores: [
      { id: 'sc_base', date: '2026-08-17', test: 'Diagnostic Baseline', listening: 7.0, reading: 5.5, writing: 6.0, speaking: 6.5, notes: 'Initial diagnostic baseline' }
    ], fltTests: [], dailyScores: [], readingSessions: [], readingErrors: [],
    writingSessions: [], writingErrors: [], listeningSessions: [], speakingSessions: [],
    studySessions: [], ieltsVocabulary: [], germanVocabulary: [], pronunciation: [],
    resources: DB.RES_SEED.map((r, i) => ({ id: 'res' + i, ...r, rating: '', notes: r.notes || '' })),
    notes: [], universities: [],
    documents: DB.DOCS_SEED.map((d, i) => ({ id: 'doc' + i, ...d })),
    dailyTasks: {},
    dailyMode: {},
    checkins: {},
    german: { completed: [], cursor: 0 },
    weeklyTargets: {},
    tipLog: [],
    achievements: [],
    meta: { onboarded: false, mistakeReview: {}, teacherMode: 'local', teacherEndpoint: '' }
  };
}

let state = blankState();
let saveTimer = null;

function save(immediate) {
  clearTimeout(saveTimer);
  const doSave = async () => {
    const ok = await Store.put('kv', 'state', state);
    if (!ok) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
      catch (e) { toast('Storage is full or blocked. Export a backup now.', 'bad'); }
    }
  };
  if (immediate) return doSave();
  saveTimer = setTimeout(doSave, 400);
}

async function load() {
  let loaded = await Store.get('kv', 'state');
  if (!loaded) {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) loaded = JSON.parse(raw); } catch (e) { loaded = null; }
  }
  if (loaded && typeof loaded === 'object') {
    state = deepMerge(blankState(), loaded);

    // Sync seed resources so new additions are immediately available while preserving user ratings/completed status
    if (loaded.resources && loaded.resources.length > 0) {
      const userMap = new Map(loaded.resources.map((r) => [r.url || r.title, r]));
      state.resources = DB.RES_SEED.map((s, i) => {
        const existing = userMap.get(s.url || s.title);
        return existing
          ? Object.assign({}, s, existing, { notes: existing.notes || s.notes || '' })
          : { id: 'res' + i, ...s, rating: '', notes: s.notes || '', status: 'Not started' };
      }).concat(loaded.resources.filter((u) => !DB.RES_SEED.some((s) => (s.url && s.url === u.url) || s.title === u.title)));
    }
    if (loaded.documents) state.documents = loaded.documents;
  }

  // Seed baseline score if empty
  if (!state.ieltsScores || !Array.isArray(state.ieltsScores) || state.ieltsScores.length === 0) {
    state.ieltsScores = [
      { id: 'sc_base', date: (state.settings && state.settings.startDate) || '2026-08-17', test: 'Diagnostic Baseline', listening: 7.0, reading: 5.5, writing: 6.0, speaking: 6.5, notes: 'Initial diagnostic baseline' }
    ];
  }

  // Ensure daily tasks for today are populated
  const t = today();
  if (!state.dailyTasks || !state.dailyTasks[t] || !Array.isArray(state.dailyTasks[t]) || state.dailyTasks[t].length === 0) {
    if (!state.dailyTasks) state.dailyTasks = {};
    state.dailyTasks[t] = buildPlan(t, modeFor(t));
  }

  // Seed initial vocabulary if empty so flashcards and search work immediately
  if ((!state.ieltsVocabulary || state.ieltsVocabulary.length === 0) && DB.IELTS_SEED_VOCAB) {
    state.ieltsVocabulary = DB.IELTS_SEED_VOCAB.map((v, i) => ({
      id: 'iv' + i, ...v, mastery: 'New', dateAdded: today(), srs: { due: today(), interval: 0, ease: 2.4 }
    }));
  }
  if ((!state.germanVocabulary || state.germanVocabulary.length === 0) && DB.GERMAN_SEED_VOCAB) {
    state.germanVocabulary = DB.GERMAN_SEED_VOCAB.map((v, i) => ({
      id: 'gv' + i, ...v, localMeaning: '', pronunciation: '', mastery: 'New', dateAdded: today(), srs: { due: today(), interval: 0, ease: 2.4 }
    }));
  }
}

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

/* =========================================================
   2. UTILITIES
   ========================================================= */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iso(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 10);
}
const today = () => iso(new Date());
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}
function fmtDate(s) {
  if (!s) return ' — ';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtShort(s) {
  if (!s) return ' — ';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;           // Monday = 0
  d.setDate(d.getDate() - day);
  return iso(d);
}
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function hhmm(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function mins(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? h + 'h ' + (r ? r + 'm' : '') : r + 'm';
}
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  if (window.anime) anime({ targets: el, opacity: [0, 1], translateY: [10, 0], duration: 240, easing: 'easeOutQuad' });
  setTimeout(() => { el.remove(); }, 4200);
}
function icons() { if (window.lucide) try { lucide.createIcons(); } catch (e) {} }
function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ($('script[src="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}
function mdLite(text) {
  const lines = String(text || '').split('\n');
  let out = '', inList = false;
  for (let raw of lines) {
    let l = esc(raw.trim());
    l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    if (/^###\s/.test(l)) { if (inList) { out += '</ul>'; inList = false; } out += '<h3>' + l.slice(4) + '</h3>'; }
    else if (/^##\s/.test(l)) { if (inList) { out += '</ul>'; inList = false; } out += '<h3>' + l.slice(3) + '</h3>'; }
    else if (/^#\s/.test(l)) { if (inList) { out += '</ul>'; inList = false; } out += '<h2>' + l.slice(2) + '</h2>'; }
    else if (/^[-*]\s/.test(l)) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + l.slice(2) + '</li>'; }
    else if (!l) { if (inList) { out += '</ul>'; inList = false; } }
    else { if (inList) { out += '</ul>'; inList = false; } out += '<p>' + l + '</p>'; }
  }
  if (inList) out += '</ul>';
  return out;
}

/* =========================================================
   3. SCORE MATHS AND ENGINES
   ========================================================= */
const MODULES = ['listening', 'reading', 'writing', 'speaking'];
const MOD_LABEL = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };

/* official-style rounding: .25 -> .5, .75 -> next whole band */
function overallBand(s) {
  if (!s) return null;
  const vals = MODULES.map((m) => num(s[m])).filter((v) => v !== null && !isNaN(v) && v >= 0);
  if (vals.length < 4) return null;
  const avg = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
  const dec = Math.round((avg - Math.floor(avg)) * 1000) / 1000;
  let roundDec = 0;
  if (dec < 0.25) {
    roundDec = 0.0;
  } else if (dec < 0.75) {
    roundDec = 0.5;
  } else {
    roundDec = 1.0;
  }
  return Math.floor(avg) + roundDec;
}

const READING_BAND = [[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3]];
const LISTENING_BAND = [[39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[10,4],[6,3.5]];

function rawToBand(correct, total, table) {
  if (!total || correct == null) return null;
  const scaled = Math.round((correct / total) * 40);
  for (const [raw, band] of table) if (scaled >= raw) return band;
  return 2.5;
}
const readingBand = (c, t) => rawToBand(c, t, READING_BAND);
const listeningBand = (c, t) => rawToBand(c, t, LISTENING_BAND);

/* derived values used by tables and stats */
function derive(kind, row) {
  switch (kind) {
    case 'ieltsScores':
    case 'fltTests': {
      const o = overallBand(row);
      return { overall: o == null ? ' — ' : o.toFixed(1) };
    }
    case 'readingSessions': {
      const a = num(row.attempted), c = num(row.correct), t = num(row.timeTaken);
      const acc = a ? Math.round((c / a) * 100) : null;
      return {
        accuracy: acc == null ? ' — ' : acc + '%',
        perQ: (t && a) ? (t * 60 / a).toFixed(0) + 's' : ' — ',
        band: readingBand(c, a)
      };
    }
    case 'listeningSessions': {
      const b = listeningBand(num(row.correct), num(row.total));
      return { band: b == null ? ' — ' : b.toFixed(1) };
    }
    case 'writingSessions': {
      const c = ['taskResponse', 'coherence', 'lexical', 'grammar'].map((k) => num(row[k])).filter((v) => v !== null);
      if (!c.length) return { band: ' — ' };
      return { band: (Math.round((c.reduce((a, b) => a + b, 0) / c.length) * 2) / 2).toFixed(1) };
    }
    default: return {};
  }
}

/* current estimated module scores: mean of up to 3 most recent logged values,
   falling back to the baseline from the profile. */
function currentScores() {
  const out = {};
  const pool = state.ieltsScores.concat(state.fltTests)
    .filter((r) => r.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  MODULES.forEach((m) => {
    const vals = [];
    for (const r of pool) { const v = num(r[m]); if (v !== null) vals.push(v); if (vals.length === 3) break; }
    if (!vals.length && m === 'reading') {
      const rs = state.readingSessions.slice(-4).map((r) => readingBand(num(r.correct), num(r.attempted))).filter(Boolean);
      if (rs.length) vals.push(rs.reduce((a, b) => a + b, 0) / rs.length);
    }
    if (!vals.length && m === 'listening') {
      const ls = state.listeningSessions.slice(-4).map((r) => listeningBand(num(r.correct), num(r.total))).filter(Boolean);
      if (ls.length) vals.push(ls.reduce((a, b) => a + b, 0) / ls.length);
    }
    if (!vals.length && m === 'writing') {
      const ws = state.writingSessions.slice(-3).map((r) => num(derive('writingSessions', r).band)).filter(Boolean);
      if (ws.length) vals.push(ws.reduce((a, b) => a + b, 0) / ws.length);
    }
    if (!vals.length && m === 'speaking') {
      const ss = state.speakingSessions.slice(-3).map((r) => num(r.band)).filter(Boolean);
      if (ss.length) vals.push(ss.reduce((a, b) => a + b, 0) / ss.length);
    }
    out[m] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2
                         : DB.PROFILE.baseline[m];
    out[m + 'Logged'] = vals.length > 0;
  });
  out.overall = Math.round(((out.listening + out.reading + out.writing + out.speaking) / 4) * 2) / 2;
  return out;
}

const targets = () => ({
  listening: num(state.settings.targetListening) || 7.5,
  reading: num(state.settings.targetReading) || 7,
  writing: num(state.settings.targetWriting) || 7,
  speaking: num(state.settings.targetSpeaking) || 7,
  overall: num(state.settings.targetOverall) || 7
});

function gapInfo(mod) {
  const cur = currentScores()[mod], tgt = targets()[mod];
  const gap = Math.round((tgt - cur) * 10) / 10;
  let level = 'ok', label = 'On target';
  if (gap >= 1.5) { level = 'crit'; label = 'Critical'; }
  else if (gap >= 1) { level = 'high'; label = 'High'; }
  else if (gap > 0) { level = 'med'; label = 'Medium'; }
  return { cur, tgt, gap, level, label };
}

/* ---------- study aggregation ---------- */
function sessionMinutes(dateStr) {
  let total = 0;
  state.studySessions.forEach((s) => { if (s.date === dateStr) total += num(s.minutes) || 0; });
  return total;
}
function minutesByFocus(fromDate) {
  const out = {};
  state.studySessions.forEach((s) => {
    if (fromDate && s.date < fromDate) return;
    out[s.focus] = (out[s.focus] || 0) + (num(s.minutes) || 0);
  });
  return out;
}
function activeDays() {
  const set = new Set();
  state.studySessions.forEach((s) => { if ((num(s.minutes) || 0) > 0) set.add(s.date); });
  Object.keys(state.checkins).forEach((d) => set.add(d));
  Object.keys(state.dailyTasks).forEach((d) => {
    if ((state.dailyTasks[d] || []).some((t) => t.done)) set.add(d);
  });
  return set;
}
function streak() {
  const days = activeDays();
  let s = 0, cur = today();
  if (!days.has(cur)) cur = addDays(cur, -1);   // today still open
  while (days.has(cur)) { s++; cur = addDays(cur, -1); }
  return s;
}
function errorsBetween(from, to) {
  const all = [
    ...state.readingErrors.map((e) => ({ date: e.date })),
    ...state.writingErrors.map((e) => ({ date: e.date }))
  ];
  return all.filter((e) => e.date >= from && e.date <= to).length;
}
function lastPractice(mod) {
  const map = {
    reading: state.readingSessions, writing: state.writingSessions,
    listening: state.listeningSessions, speaking: state.speakingSessions
  };
  const list = (map[mod] || []).filter((r) => r.date).map((r) => r.date).sort();
  const focusHits = state.studySessions.filter((s) => (s.focus || '').toLowerCase() === mod).map((s) => s.date).sort();
  const latest = [list[list.length - 1], focusHits[focusHits.length - 1]].filter(Boolean).sort();
  return latest.length ? latest[latest.length - 1] : null;
}

/* ---------- readiness ---------- */
function readiness() {
  const cur = currentScores(), tgt = targets();
  const modPart = MODULES.reduce((acc, m) => acc + clamp(cur[m] / tgt[m], 0, 1), 0) / 4;

  const flts = state.fltTests.filter((f) => overallBand(f) !== null).sort((a, b) => (a.date < b.date ? 1 : -1));
  const fltPart = flts.length ? clamp(overallBand(flts[0]) / tgt.overall, 0, 1) : modPart * 0.9;

  const st = streak();
  const days = activeDays();
  let recent = 0;
  for (let i = 0; i < 14; i++) if (days.has(addDays(today(), -i))) recent++;
  const consistency = clamp((clamp(st / 14, 0, 1) * 0.5) + (recent / 14 * 0.5), 0, 1);

  const thisWeek = errorsBetween(addDays(today(), -7), today());
  const lastWeek = errorsBetween(addDays(today(), -14), addDays(today(), -8));
  let errPart = 0.5;
  if (lastWeek > 0) errPart = clamp(1 - (thisWeek / lastWeek) * 0.6, 0, 1);
  else if (thisWeek > 0) errPart = 0.6;              // logging honestly counts for something

  const parts = [
    { label: 'Module scores', weight: 0.55, value: modPart },
    { label: 'Latest FLT', weight: 0.15, value: fltPart },
    { label: 'Consistency', weight: 0.20, value: consistency },
    { label: 'Error reduction', weight: 0.10, value: errPart }
  ];
  const pct = Math.round(parts.reduce((a, p) => a + p.weight * p.value, 0) * 100);
  return { pct: clamp(pct, 0, 100), parts };
}

/* ---------- priority engine ---------- */
function modulePriority() {
  const dow = new Date().getDay();
  const classToday = (DB.CLASSES[dow] || {}).name || '';
  const errCount = { reading: 0, writing: 0, listening: 0, speaking: 0 };
  const since = addDays(today(), -14);
  state.readingErrors.forEach((e) => { if (e.date >= since) errCount.reading++; });
  state.writingErrors.forEach((e) => { if (e.date >= since) errCount.writing++; });
  state.listeningSessions.forEach((s) => {
    if (s.date >= since) errCount.listening += Math.max(0, (num(s.total) || 0) - (num(s.correct) || 0));
  });
  state.speakingSessions.forEach((s) => {
    if (s.date >= since && (s.grammarMistakes || s.pronunciationMistakes)) errCount.speaking += 2;
  });

  const flts = state.fltTests.filter((f) => f.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestFlt = flts[0];

  return MODULES.map((m) => {
    const g = gapInfo(m);
    let score = g.gap * 40;
    score += Math.min(errCount[m], 20) * 2;
    const lp = lastPractice(m);
    const stale = lp ? clamp(daysBetween(lp, today()), 0, 14) : 10;
    score += stale * 1.5;
    if (classToday.toLowerCase().includes(m)) score += 10;
    if (latestFlt) {
      const v = num(latestFlt[m]);
      if (v !== null && v < targets()[m]) score += (targets()[m] - v) * 8;
    }
    return { mod: m, label: MOD_LABEL[m], score: Math.round(score), gap: g, errors: errCount[m], lastPractice: lp };
  }).sort((a, b) => b.score - a.score);
}

/* ---------- weakest reading / writing detail ---------- */
function readingTypeStats() {
  const out = {};
  state.readingSessions.forEach((s) => {
    const t = s.questionType; if (!t) return;
    out[t] = out[t] || { attempted: 0, correct: 0, errors: 0 };
    out[t].attempted += num(s.attempted) || 0;
    out[t].correct += num(s.correct) || 0;
  });
  state.readingErrors.forEach((e) => {
    const t = e.questionType; if (!t) return;
    out[t] = out[t] || { attempted: 0, correct: 0, errors: 0 };
    out[t].errors++;
  });
  return Object.keys(out).map((t) => {
    const o = out[t];
    const acc = o.attempted ? Math.round((o.correct / o.attempted) * 100) : null;
    return { type: t, ...o, accuracy: acc };
  }).sort((a, b) => {
    const A = a.accuracy == null ? 999 : a.accuracy, B = b.accuracy == null ? 999 : b.accuracy;
    if (A !== B) return A - B;
    return b.errors - a.errors;
  });
}
function weakestReadingType() {
  const stats = readingTypeStats();
  const scored = stats.filter((s) => s.attempted >= 4 || s.errors >= 2);
  return scored.length ? scored[0] : null;
}
function writingCriteria() {
  const keys = { taskResponse: 'Task response', coherence: 'Coherence & cohesion', lexical: 'Lexical resource', grammar: 'Grammar range & accuracy' };
  const out = [];
  Object.keys(keys).forEach((k) => {
    const vals = state.writingSessions.map((w) => num(w[k])).filter((v) => v !== null);
    out.push({ key: k, label: keys[k], value: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null });
  });
  return out;
}
function freq(list, key) {
  const map = {};
  list.forEach((r) => { const v = r[key]; if (v) map[v] = (map[v] || 0) + 1; });
  return Object.keys(map).map((k) => ({ name: k, count: map[k] })).sort((a, b) => b.count - a.count);
}

/* ---------- phase + saturday cycle ---------- */
function currentPhase() {
  const ex = state.settings.examDate, t = today();
  const resolve = (v) => (v === 'exam' ? ex : v);
  for (const p of DB.PHASES) {
    const from = resolve(p.from), to = resolve(p.to);
    if (t >= from && t <= to) return p;
  }
  return t < resolve(DB.PHASES[0].from) ? DB.PHASES[0] : DB.PHASES[DB.PHASES.length - 1];
}
function saturdayKind(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return null;
  const start = state.settings.startDate || DB.PROFILE.startDate;
  const firstSat = (() => { let s = start; while (new Date(s + 'T00:00:00').getDay() !== 6) s = addDays(s, 1); return s; })();
  const idx = Math.round(daysBetween(firstSat, dateStr) / 7);
  const off = num(state.settings.satOffset) || 0;
  return ((idx + off) % 2 === 0) ? 'FLT' : 'FLT review';
}

/* ---------- tips ---------- */
function tipFor(category) {
  const pool = DB.TIPS[category] || [];
  if (!pool.length) return '';
  const recent = state.tipLog.filter((t) => t.cat === category && daysBetween(t.date, today()) < 14).map((t) => t.i);
  let candidates = pool.map((_, i) => i).filter((i) => !recent.includes(i));
  if (!candidates.length) candidates = pool.map((_, i) => i);
  const seed = daysBetween('2026-01-01', today()) + category.length;
  const i = candidates[seed % candidates.length];
  if (!state.tipLog.some((t) => t.cat === category && t.date === today())) {
    state.tipLog.push({ cat: category, i, date: today() });
    state.tipLog = state.tipLog.filter((t) => daysBetween(t.date, today()) < 40);
    save();
  }
  return pool[i];
}

/* ---------- daily plan ---------- */
function buildPlan(dateStr, mode) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const cls = DB.CLASSES[dow];
  const budget = DB.MODES[mode].minutes;
  const pri = modulePriority();
  const tasks = [];

  tasks.push({ id: uid(), title: 'IELTS class — ' + cls.name, meta: '09:30–13:00 · mandatory', tag: 'ielts', minutes: 0, fixed: true, done: false });
  if (dow === 6) {
    const kind = saturdayKind(dateStr);
    tasks.push({ id: uid(), title: kind === 'FLT' ? 'Full length test' : 'FLT review — analyse every wrong answer',
      meta: kind === 'FLT' ? 'Log the result in FLT / Mock Tests' : 'Log mistakes in the mistake book', tag: 'flt', minutes: 120, done: false });
  }

  /* weights: the weakest two modules get most of the budget */
  const weights = {};
  const totalScore = pri.reduce((a, p) => a + Math.max(p.score, 5), 0);
  pri.forEach((p) => { weights[p.mod] = Math.max(p.score, 5) / totalScore; });

  const shares = mode === 'busy'
    ? { study: 0.75, german: 0.15, vocab: 0.10 }
    : mode === 'normal' ? { study: 0.66, german: 0.22, vocab: 0.12 }
                        : { study: 0.62, german: 0.24, vocab: 0.14 };

  const studyBudget = Math.round(budget * shares.study);
  const ordered = pri.slice(0, mode === 'busy' ? 1 : mode === 'normal' ? 2 : 3);
  const wSum = ordered.reduce((a, p) => a + weights[p.mod], 0);
  ordered.forEach((p) => {
    const m = Math.max(15, Math.round((weights[p.mod] / wSum) * studyBudget / 5) * 5);
    let title = MOD_LABEL[p.mod] + ' — ';
    if (p.mod === 'reading') {
      const wt = weakestReadingType();
      title += wt ? 'timed passage focused on ' + wt.type : 'one timed passage, then analyse every mistake';
    } else if (p.mod === 'writing') {
      const crit = writingCriteria().filter((c) => c.value !== null).sort((a, b) => a.value - b.value)[0];
      title += crit ? 'rewrite with attention to ' + crit.label.toLowerCase() : 'one full task under exam timing';
    } else if (p.mod === 'listening') {
      title += 'one section under exam conditions, then transcript check';
    } else {
      title += 'two recorded answers, then self-analysis';
    }
    tasks.push({ id: uid(), title, meta: mins(m) + ' · gap ' + (p.gap.gap > 0 ? '+' + p.gap.gap : 'on target'), tag: 'ielts', minutes: m, done: false });
  });

  const gMin = Math.max(15, Math.round(budget * shares.german / 5) * 5);
  const lesson = DB.LESSONS[state.german.cursor % DB.LESSONS.length];
  tasks.push({ id: uid(), title: 'German — ' + lesson.level + ' lesson: ' + lesson.topic, meta: mins(gMin) + ' · 10 words + grammar', tag: 'german', minutes: gMin, done: false });

  const vMin = Math.max(10, Math.round(budget * shares.vocab / 5) * 5);
  tasks.push({ id: uid(), title: 'Vocabulary — flashcard review', meta: mins(vMin) + ' · due cards first', tag: 'ielts', minutes: vMin, done: false });

  if (mode !== 'busy') {
    tasks.push({ id: uid(), title: 'Mistake book review', meta: '10m · yesterday\'s errors', tag: 'review', minutes: 10, done: false });
  }
  if (dow === 0) {
    tasks.push({ id: uid(), title: 'Weekly review — read the report and set next week\'s targets', meta: 'Analytics section', tag: 'review', minutes: 20, done: false });
  }
  if (currentPhase().n >= 2) {
    tasks.push({ id: uid(), title: 'Germany 2027 — university research or document work', meta: '20m', tag: 'review', minutes: 20, done: false });
  }
  return tasks;
}

function planFor(dateStr) {
  if (!state.dailyTasks[dateStr] || !Array.isArray(state.dailyTasks[dateStr]) || state.dailyTasks[dateStr].length === 0) {
    state.dailyTasks[dateStr] = buildPlan(dateStr, modeFor(dateStr));
    save();
  }
  return state.dailyTasks[dateStr];
}
function modeFor(dateStr) { return state.dailyMode[dateStr] || state.settings.mode || 'normal'; }

/* ---------- daily success score ---------- */
function successScore(dateStr) {
  const tasks = state.dailyTasks[dateStr] || [];
  const doable = tasks.filter((t) => !t.fixed);
  const doneRatio = doable.length ? doable.filter((t) => t.done).length / doable.length : 0;
  const target = num(state.settings.dailyTarget) || 105;
  const timeRatio = clamp(sessionMinutes(dateStr) / target, 0, 1);
  const ci = state.checkins[dateStr];
  const germanDone = tasks.some((t) => t.tag === 'german' && t.done) || (ci && num(ci.german) > 0) ? 1 : 0;
  const words = state.ieltsVocabulary.filter((v) => v.dateAdded === dateStr).length +
                state.germanVocabulary.filter((v) => v.dateAdded === dateStr).length;
  const vocabPart = clamp(words / 10, 0, 1);
  const reviewPart = state.meta.mistakeReview[dateStr] ? 1 : 0;
  const pct = Math.round((doneRatio * 0.4 + timeRatio * 0.3 + germanDone * 0.1 + vocabPart * 0.1 + reviewPart * 0.1) * 100);
  return clamp(pct, 0, 100);
}

/* =========================================================
   4. GENERIC CRUD — schema driven forms, tables, CSV
   ========================================================= */
const filters = {};
const listFilter = { writingSessions: 'all' };

function getList(kind) {
  const schema = DB.SCHEMAS[kind];
  const rows = (state[kind] || []).slice();
  const key = schema.sort;
  rows.sort((a, b) => {
    const A = a[key] || '', B = b[key] || '';
    if (A === B) return 0;
    return (key === 'title' || key === 'name') ? String(A).localeCompare(String(B)) : (A < B ? 1 : -1);
  });
  const f = (filters[kind] || '').toLowerCase().trim();
  if (!f) return rows;
  return rows.filter((r) => Object.values(r).some((v) => String(v == null ? '' : v).toLowerCase().includes(f)));
}

function columnsFor(kind) {
  const s = DB.SCHEMAS[kind];
  const cols = s.fields.filter((f) => f.col).map((f) => ({ key: f.name, label: f.label, num: f.num, type: f.type }));
  (s.derived || []).filter((d) => d.col).forEach((d) => cols.push({ key: d.key, label: d.label, num: d.num, derived: true }));
  return cols;
}

function renderList(kind) {
  $$('[data-list="' + kind + '"]').forEach((wrap) => {
    let rows = getList(kind);
    if (kind === 'writingSessions' && listFilter.writingSessions !== 'all') {
      rows = rows.filter((r) => r.task === listFilter.writingSessions);
    }
    if (!rows.length) {
      wrap.innerHTML = '<p class="empty-inline">' + emptyText(kind) + '</p>';
      return;
    }
    const cols = columnsFor(kind);
    let html = '<table class="table"><thead><tr>' +
      cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '<th></th></tr></thead><tbody>';
    rows.forEach((r) => {
      const d = derive(kind, r);
      html += '<tr>' + cols.map((c) => {
        let v = c.derived ? d[c.key] : r[c.key];
        if (c.type === 'date') v = fmtShort(v);
        if (v === '' || v == null) v = ' — ';
        return '<td data-label="' + esc(c.label) + '"' + (c.num ? ' class="num"' : '') + '>' + esc(v) + '</td>';
      }).join('') +
        '<td class="td-actions"><div class="row-actions">' +
        '<button data-edit="' + kind + '" data-id="' + r.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button data-del="' + kind + '" data-id="' + r.id + '" aria-label="Delete"><i data-lucide="trash-2"></i></button>' +
        '</div></td></tr>';
    });
    wrap.innerHTML = html + '</tbody></table>';
  });
  icons();
}

function emptyText(kind) {
  const map = {
    ieltsScores: 'No scores yet. Add your first practice or class test result to start the graph.',
    fltTests: 'No full length tests logged yet. Log your first FLT after Saturday class.',
    readingSessions: 'No reading practice yet. Complete one timed passage and log it here.',
    readingErrors: 'No mistakes logged. After every passage, record each wrong answer and why.',
    writingSessions: 'No writing entries yet. Add the essay you wrote in class today.',
    writingErrors: 'No writing errors logged yet.',
    listeningSessions: 'No listening practice logged yet.',
    speakingSessions: 'No speaking sessions yet. Record one answer and log it.',
    studySessions: 'No study sessions yet. Use the library timer on the Today screen.',
    ieltsVocabulary: 'No words yet. Look up a word above and add it in one click.',
    germanVocabulary: 'No German words yet. Save today\'s lesson words to fill this notebook.',
    pronunciation: 'No pronunciation entries yet.',
    resources: 'No resources match this filter.',
    notes: 'No notes yet.',
    universities: 'No universities yet. Add one with its deadline to start the tracker.',
    documents: 'No documents in the checklist.'
  };
  return map[kind] || 'Nothing here yet.';
}

/* ---------- modal ---------- */
let modalOnSave = null;
function openModal(title, bodyHtml, footHtml, onSave) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFoot').innerHTML = footHtml;
  modalOnSave = onSave || null;
  $('#modal').hidden = false;
  icons();
  const first = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (first) setTimeout(() => first.focus(), 60);
}
function closeModal() { $('#modal').hidden = true; modalOnSave = null; }

function fieldHtml(f, value) {
  const v = value == null ? '' : value;
  const attrs = [
    f.required ? 'required' : '', f.step != null ? 'step="' + f.step + '"' : '',
    f.min != null ? 'min="' + f.min + '"' : '', f.max != null ? 'max="' + f.max + '"' : '',
    f.placeholder ? 'placeholder="' + esc(f.placeholder) + '"' : ''
  ].join(' ');
  let input;
  if (f.type === 'select') {
    input = '<select name="' + f.name + '">' + f.options.map((o) =>
      '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + (o === '' ? ' — ' : esc(o)) + '</option>').join('') + '</select>';
  } else if (f.type === 'textarea') {
    input = '<textarea name="' + f.name + '" rows="' + (f.rows || 2) + '" ' + attrs + '>' + esc(v) + '</textarea>';
  } else {
    input = '<input type="' + f.type + '" name="' + f.name + '" value="' + esc(v) + '" ' + attrs + '>';
  }
  return '<label class="field' + (f.type === 'textarea' ? ' field-wide' : '') + '"><span>' + esc(f.label) +
    (f.required ? ' *' : '') + '</span>' + input +
    (f.help ? '<small class="fineprint">' + esc(f.help) + '</small>' : '') + '</label>';
}

function openForm(kind, id) {
  const schema = DB.SCHEMAS[kind];
  const row = id ? (state[kind] || []).find((r) => r.id === id) : null;
  const defaults = { date: today(), dateAdded: today(), mastery: 'New', status: 'Not started', level: state.settings.germanLevel };
  const body = '<form id="entityForm" class="form-grid">' + schema.fields.map((f) =>
    fieldHtml(f, row ? row[f.name] : (defaults[f.name] !== undefined ? defaults[f.name] : ''))).join('') + '</form>';
  const foot = (id ? '<button class="btn btn-danger" id="formDelete">Delete</button>' : '') +
    '<button class="btn" id="formCancel">Cancel</button><button class="btn btn-primary" id="formSave">Save</button>';
  openModal((id ? 'Edit ' : 'Add ') + schema.title.toLowerCase(), body, foot, () => saveForm(kind, id));
  const del = $('#formDelete');
  if (del) del.onclick = () => {
    if (confirm('Delete this entry?')) { deleteRow(kind, id); closeModal(); }
  };
}

function saveForm(kind, id) {
  const form = $('#entityForm');
  if (!form.reportValidity()) return false;
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
  const schema = DB.SCHEMAS[kind];
  schema.fields.forEach((f) => {
    if (f.type === 'number' && data[f.name] !== '') data[f.name] = num(data[f.name]);
  });
  state[kind] = state[kind] || [];
  if (id) {
    const i = state[kind].findIndex((r) => r.id === id);
    state[kind][i] = Object.assign({}, state[kind][i], data);
  } else {
    if (kind === 'ieltsVocabulary' || kind === 'germanVocabulary') {
      data.srs = { due: today(), interval: 0, ease: 2.4 };
      if (!data.dateAdded) data.dateAdded = today();
    }
    if (kind === 'notes') data.updated = today();
    state[kind].unshift(Object.assign({ id: uid() }, data));
  }
  if (kind === 'notes') {
    const i = state.notes.findIndex((r) => r.id === (id || state.notes[0].id));
    if (i > -1) state.notes[i].updated = today();
  }
  save(); checkAchievements(); renderAll();
  toast(schema.title + ' saved.', 'good');
  closeModal();
  return true;
}

function deleteRow(kind, id) {
  state[kind] = (state[kind] || []).filter((r) => r.id !== id);
  save(); renderAll();
  toast('Deleted.', '');
}

/* ---------- CSV ---------- */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv(kind) {
  const schema = DB.SCHEMAS[kind];
  const rows = getList(kind);
  if (!rows.length) return toast('Nothing to export in ' + schema.title.toLowerCase() + '.', 'bad');
  const cols = schema.fields.map((f) => ({ key: f.name, label: f.label }))
    .concat((schema.derived || []).map((d) => ({ key: d.key, label: d.label, derived: true })));
  const lines = [cols.map((c) => csvCell(c.label)).join(',')];
  rows.forEach((r) => {
    const d = derive(kind, r);
    lines.push(cols.map((c) => csvCell(c.derived ? d[c.key] : r[c.key])).join(','));
  });
  download('pratham-' + kind + '-' + today() + '.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  toast('CSV exported.', 'good');
}

/* =========================================================
   5. VIEWS
   ========================================================= */
const charts = {};
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chart(id, config) {
  if (!window.Chart) return;
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const grid = cssVar('--border'), text = cssVar('--muted');
  Chart.defaults.color = text;
  Chart.defaults.font.family = "'Inter',sans-serif";
  Chart.defaults.font.size = 11;
  config.options = Object.assign({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true } } },
    scales: config.type === 'doughnut' || config.type === 'pie' ? undefined : {
      x: { grid: { color: grid }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { grid: { color: grid } }
    }
  }, config.options || {});
  charts[id] = new Chart(el, config);
}
function statCard(label, value, sub) {
  return '<div class="stat"><span class="stat-label">' + esc(label) + '</span>' +
    '<span class="stat-value">' + value + '</span>' +
    (sub ? '<span class="stat-sub">' + sub + '</span>' : '') + '</div>';
}
function pillFor(g) {
  return '<span class="pill pill-' + g.level + '">' + g.label + '</span>';
}
function countdownDays() { return daysBetween(today(), state.settings.examDate); }

/* ---------------- dashboard ---------------- */
function renderDashboard() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = part + ', ' + (state.settings.name || 'Pratham').split(' ')[0] + ' 👋';

  const cur = currentScores(), tgt = targets();
  const phase = currentPhase();
  const d = countdownDays();

  /* ---- readiness ring ---- */
  const r = readiness();
  const circ = 2 * Math.PI * 52;
  const offset = circ - (r.pct / 100) * circ;
  const ring = $('#ringFill');
  if (ring) {
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = offset;
  }
  $('#readinessPct').textContent = r.pct + '%';
  $('#readinessParts').innerHTML = r.parts.map((p) =>
    '<li><span class="rp-label">' + esc(p.label) + '</span>' +
    '<span class="bar"><span class="bar-fill" style="width:' + Math.round(p.value * 100) + '%"></span></span>' +
    '<span class="num">' + Math.round(p.value * 100) + '%</span></li>').join('');

  /* ---- stat grid ---- */
  const st = streak();
  const totalMin = state.studySessions.reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const weekMin = state.studySessions.filter((s) => s.date >= addDays(today(), -7)).reduce((a, s) => a + (num(s.minutes) || 0), 0);
  $('#statGrid').innerHTML = [
    statCard('Overall band', cur.overall.toFixed(1), 'target ' + tgt.overall.toFixed(1)),
    statCard('Days to exam', d > 0 ? d : 'Done', d > 0 ? fmtDate(state.settings.examDate) : 'exam date reached'),
    statCard('Study streak', '🔥 ' + st, 'consecutive days'),
    statCard('This week', mins(weekMin), 'target ' + mins((num(state.settings.dailyTarget) || 105) * 7)),
    statCard('Total study', mins(totalMin), state.studySessions.length + ' sessions'),
    statCard('Phase', phase.n, phase.title)
  ].join('');

  /* ---- one thing ---- */
  const pri = modulePriority();
  const top = pri[0];
  const oneThing = top.gap.gap > 0
    ? top.label + ' is your biggest gap at ' + top.gap.cur.toFixed(1) + '. Spend your first focused block here.'
    : 'All modules near target. Do a full timed practice under exam conditions.';
  $('#oneThing').textContent = oneThing;

  /* ---- roadmap bars ---- */
  $('#roadmapBars').innerHTML = MODULES.map((m) => {
    const g = gapInfo(m);
    const pct = clamp((g.cur - 4) / 5, 0, 1) * 100;
    const tgtPct = clamp((g.tgt - 4) / 5, 0, 1) * 100;
    return '<div class="rm-row"><span>' + MOD_LABEL[m] + '</span>' +
      '<div class="rm-track"><div class="rm-cur" style="width:' + pct + '%"></div>' +
      '<div class="rm-target" style="left:' + tgtPct + '%" title="Target: ' + g.tgt.toFixed(1) + '"></div></div>' +
      '<span class="rm-val">' + g.cur.toFixed(1) + ' → ' + g.tgt.toFixed(1) + '</span></div>';
  }).join('');

  /* ---- mini tasks ---- */
  const tasks = planFor(today());
  const doable = tasks.filter((t) => !t.fixed);
  const doneCount = doable.filter((t) => t.done).length;
  $('#dashTasks').innerHTML = tasks.slice(0, 6).map((t) =>
    '<li class="task' + (t.done ? ' is-done' : '') + '">' +
    '<span class="tag tag-' + t.tag + '">' + t.tag + '</span> ' +
    '<span class="task-title">' + esc(t.title) + '</span>' +
    (t.meta ? '<span class="muted small">' + esc(t.meta) + '</span>' : '') +
    '</li>').join('');
  const pct = doable.length ? Math.round(doneCount / doable.length * 100) : 0;
  $('#successPct').textContent = pct + '%';
  $('#successBar').style.width = pct + '%';

  /* ---- score trend chart ---- */
  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => s.date && overallBand(s) !== null)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  $('#dashChartEmpty').hidden = pool.length > 0;
  if (pool.length) {
    chart('dashChart', {
      type: 'line',
      data: {
        labels: pool.map((s) => fmtShort(s.date)),
        datasets: [
          { label: 'Overall', data: pool.map((s) => overallBand(s)), borderColor: cssVar('--violet'), backgroundColor: 'rgba(124,92,255,.15)', fill: true, tension: .3 },
          { label: 'Target', data: pool.map(() => tgt.overall), borderColor: cssVar('--cyan'), borderDash: [5, 4], pointRadius: 0 }
        ]
      },
      options: { scales: { y: { min: 4, max: 9, ticks: { stepSize: .5 } } } }
    });
  }

  /* ---- teacher brief ---- */
  const tb = teacherBoard();
  $('#dashTeacher').innerHTML = '<p><strong>' + esc(tb.focus.title) + '</strong></p>' +
    '<p class="small">' + esc(tb.task) + '</p>';

  /* ---- german video ---- */
  const lesson = DB.LESSONS[state.german.cursor % DB.LESSONS.length];
  $('#germanVideoLevel').textContent = lesson.level;
  $('#germanVideoSuggest').innerHTML = '<span>' + esc(lesson.listening.title) + '</span>' +
    '<a class="btn btn-sm" href="' + esc(lesson.listening.url) + '" target="_blank" rel="noopener">Watch</a>';
}

function renderToday() {
  const t = today();
  const d = new Date(t + 'T00:00:00');
  const cls = DB.CLASSES[d.getDay()];
  $('#todayMeta').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' + (countdownDays() > 0 ? countdownDays() + ' days to IELTS' : 'exam date reached') + ' · Phase ' + currentPhase().n;

  let className = cls.name;
  if (d.getDay() === 6) className = saturdayKind(t) === 'FLT' ? 'Full length test' : 'FLT review';
  $('#todayClass').textContent = className;
  $('#todayClassNote').textContent = cls.note;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  $('#daySchedule').innerHTML = DB.SCHEDULE.map((s, i) => {
    const [hh, mm] = s.time.split(':').map(Number);
    const start = hh * 60 + mm;
    const next = DB.SCHEDULE[i + 1];
    const end = next ? (() => { const [h2, m2] = next.time.split(':').map(Number); return h2 * 60 + m2; })() : 1440;
    const isNow = nowMin >= start && nowMin < end;
    return '<div class="tl-row' + (isNow ? ' is-now' : '') + '"><span class="tl-time">' + s.time + '</span><span>' + esc(s.label) + '</span></div>';
  }).join('');

  const mode = modeFor(t);
  $$('.seg-btn[data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === mode));
  $('#modeNote').textContent = DB.MODES[mode].note + ' Recommended load: ' + mins(DB.MODES[mode].minutes) + ' of self-study.';

  const pri = modulePriority();
  const wt = weakestReadingType();
  const lesson = DB.LESSONS[state.german.cursor % DB.LESSONS.length];
  const top3 = [
    pri[0].label + ' — ' + (pri[0].mod === 'reading' && wt ? wt.type : 'closest gap to target (' + (pri[0].gap.gap > 0 ? '+' + pri[0].gap.gap : 'on target') + ')'),
    pri[1].label + ' — ' + (pri[1].mod === 'writing' ? 'correction and rewrite' : 'timed practice'),
    'German — ' + lesson.level + ' lesson ' + ((state.german.cursor % DB.LESSONS.length) + 1) + ': ' + lesson.topic
  ];
  $('#top3List').innerHTML = top3.map((x) => '<li>' + esc(x) + '</li>').join('');

  renderTasks();

  const focusMins = {};
  state.studySessions.filter((s) => s.date === t).forEach((s) => { focusMins[s.focus] = (focusMins[s.focus] || 0) + (num(s.minutes) || 0); });
  const total = Object.values(focusMins).reduce((a, b) => a + b, 0);
  $('#todayMins').innerHTML = '<span class="chip chip-soft">Today: ' + mins(total) + ' / ' + mins(num(state.settings.dailyTarget) || 105) + '</span>' +
    Object.keys(focusMins).map((k) => '<span class="chip chip-soft">' + esc(k) + ' ' + mins(focusMins[k]) + '</span>').join('');

  const ci = state.checkins[t];
  if (ci) {
    const form = $('#checkinForm');
    Object.keys(ci).forEach((k) => { if (form.elements[k]) form.elements[k].value = ci[k]; });
    $('#checkinFeedback').hidden = false;
    $('#checkinFeedback').textContent = motivation();
  }
}

function renderTasks() {
  const t = today();
  const tasks = planFor(t);
  const list = $('#taskList');
  $('#taskEmpty').hidden = tasks.length > 0;
  list.innerHTML = tasks.map((x) =>
    '<li class="task' + (x.done ? ' is-done' : '') + '">' +
    '<input type="checkbox" data-task="' + x.id + '"' + (x.done ? ' checked' : '') + ' aria-label="Complete task">' +
    '<span class="task-main"><span class="task-title">' + esc(x.title) + '</span>' +
    '<span class="task-meta">' + esc(x.meta || '') + '</span></span>' +
    '<span class="tag tag-' + x.tag + '">' + x.tag + '</span></li>').join('');
}

function toggleTask(id, done) {
  const t = today();
  const arr = state.dailyTasks[t] || [];
  const task = arr.find((x) => x.id === id);
  if (!task) return;
  task.done = done;
  if (done && task.minutes > 0) {
    const already = state.studySessions.some((s) => s.taskId === id);
    if (!already) {
      state.studySessions.unshift({
        id: uid(), taskId: id, date: t, focus: focusFromTask(task), minutes: task.minutes,
        task: task.title, productivity: 3, completed: 'Yes', notes: 'Auto-logged from the daily plan.'
      });
    }
  } else if (!done) {
    state.studySessions = state.studySessions.filter((s) => s.taskId !== id);
  }
  save(); checkAchievements(); renderAll();
}
function focusFromTask(task) {
  const s = task.title.toLowerCase();
  if (s.startsWith('german')) return 'German';
  if (s.startsWith('reading')) return 'Reading';
  if (s.startsWith('writing')) return 'Writing';
  if (s.startsWith('listening')) return 'Listening';
  if (s.startsWith('speaking')) return 'Speaking';
  if (s.startsWith('vocabulary')) return 'Vocabulary';
  if (s.startsWith('germany')) return 'University Research';
  return 'Reading';
}

function motivation() {
  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => num(s.reading) !== null)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (pool.length >= 2) {
    const first = num(pool[0].reading), last = num(pool[pool.length - 1].reading);
    if (last > first) return 'Your Reading score moved from ' + first.toFixed(1) + ' to ' + last.toFixed(1) + '. That is real movement toward 7.0. Keep the method that produced it.';
    if (last < first) return 'Reading has slipped from ' + first.toFixed(1) + ' to ' + last.toFixed(1) + '. Do not add hours yet. Read your mistake book first and find the repeated question type.';
  }
  const g = gapInfo('reading');
  if (g.gap >= 1) return 'Reading is still your biggest gap at ' + g.cur.toFixed(1) + ' against ' + g.tgt.toFixed(1) + '. One focused hour today beats three unfocused ones.';
  const st = streak();
  if (st >= 7) return st + ' consecutive days. Consistency is doing more for your band than any single study trick.';
  return 'Logged. Tomorrow, start with the hardest thing while your attention is fresh.';
}

/* ---------------- IELTS ---------------- */
function renderIelts() {
  const cur = currentScores(), tgt = targets();
  $('#ieltsStats').innerHTML = [
    statCard('Estimated overall', cur.overall.toFixed(1), 'baseline ' + DB.PROFILE.baselineRange.overall),
    statCard('Tests logged', state.ieltsScores.length, 'score entries'),
    statCard('FLTs completed', state.fltTests.filter((f) => f.status === 'Completed' || f.status === 'Reviewed').length, 'full length'),
    statCard('Lowest module', (() => { const p = modulePriority(); return p[0].label; })(), 'highest priority'),
    statCard('Floor check', MODULES.every((m) => cur[m] >= DB.PROFILE.targets.floor) ? 'Clear' : 'At risk', 'no module below 6.0')
  ].join('');

  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => s.date).sort((a, b) => (a.date > b.date ? 1 : -1));
  const withOverall = pool.filter((s) => overallBand(s) !== null);
  $('#overallEmpty').hidden = withOverall.length > 0;
  if (withOverall.length) {
    chart('overallChart', {
      type: 'line',
      data: {
        labels: withOverall.map((s) => fmtShort(s.date)),
        datasets: [
          { label: 'Overall', data: withOverall.map((s) => overallBand(s)), borderColor: cssVar('--violet'), backgroundColor: 'rgba(124,92,255,.15)', fill: true, tension: .3 },
          { label: 'Target', data: withOverall.map(() => tgt.overall), borderColor: cssVar('--cyan'), borderDash: [5, 4], pointRadius: 0 }
        ]
      },
      options: { scales: { y: { min: 4, max: 9, ticks: { stepSize: .5 } } } }
    });
  }
  $('#moduleEmpty').hidden = pool.length > 0;
  if (pool.length) {
    const colors = { listening: cssVar('--good'), reading: cssVar('--bad'), writing: cssVar('--warn'), speaking: cssVar('--cyan') };
    chart('moduleChart', {
      type: 'line',
      data: {
        labels: pool.map((s) => fmtShort(s.date)),
        datasets: MODULES.map((m) => ({
          label: MOD_LABEL[m], data: pool.map((s) => num(s[m])), borderColor: colors[m], tension: .3, spanGaps: true, pointRadius: 2
        })).concat([{ label: 'Target 7.0', data: pool.map(() => tgt.overall), borderColor: cssVar('--muted'), borderDash: [4, 4], pointRadius: 0 }])
      },
      options: { scales: { y: { min: 4, max: 9, ticks: { stepSize: .5 } } } }
    });
  }

  $('#gapTable').innerHTML = MODULES.map((m) => {
    const g = gapInfo(m);
    return '<div class="target-row"><span class="t-name">' + MOD_LABEL[m] + '</span>' +
      '<span class="t-val">' + g.cur.toFixed(1) + ' &rarr; ' + g.tgt.toFixed(1) + '</span>' +
      '<span class="grow muted small">gap ' + (g.gap > 0 ? '+' + g.gap.toFixed(1) : 'target met') + '</span>' + pillFor(g) + '</div>';
  }).join('') + '<div class="target-row"><span class="t-name">Overall</span><span class="t-val">' +
    cur.overall.toFixed(1) + ' &rarr; ' + tgt.overall.toFixed(1) + '</span><span class="grow muted small">estimated from your logs</span></div>';

  renderList('ieltsScores');
  calcBand();
}

function calcBand() {
  const f = $('#bandCalc');
  if (!f) return;
  const l = num(f.elements.listening ? f.elements.listening.value : null);
  const r = num(f.elements.reading ? f.elements.reading.value : null);
  const w = num(f.elements.writing ? f.elements.writing.value : null);
  const s = num(f.elements.speaking ? f.elements.speaking.value : null);

  const vals = { listening: l, reading: r, writing: w, speaking: s };
  const rawScores = [l, r, w, s].filter((v) => v !== null && !isNaN(v) && v >= 0);

  if (rawScores.length < 4) {
    if ($('#calcOut')) $('#calcOut').textContent = '—';
    if ($('#calcRawAvg')) $('#calcRawAvg').textContent = '—';
    if ($('#calcRuleDesc')) $('#calcRuleDesc').textContent = 'Enter all 4 scores';
    return;
  }

  const rawAvg = (l + r + w + s) / 4;
  const o = overallBand(vals);
  const dec = Math.round((rawAvg - Math.floor(rawAvg)) * 1000) / 1000;

  if ($('#calcOut')) $('#calcOut').textContent = o !== null ? o.toFixed(1) : '—';
  if ($('#calcRawAvg')) $('#calcRawAvg').textContent = rawAvg.toFixed(3);

  // Rounding Rule Applied
  let ruleText = '';
  if (dec === 0.0) ruleText = 'Exact whole band (.000)';
  else if (dec === 0.5) ruleText = 'Exact half band (.500)';
  else if (dec === 0.25) ruleText = 'Ends in .250 → Rounded UP to .5';
  else if (dec === 0.75) ruleText = 'Ends in .750 → Rounded UP to next whole band';
  else if (dec === 0.125) ruleText = 'Ends in .125 → Rounded DOWN to .0';
  else if (dec === 0.375) ruleText = 'Ends in .375 → Rounded UP to .5';
  else if (dec === 0.625) ruleText = 'Ends in .625 → Rounded DOWN to .5';
  else if (dec === 0.875) ruleText = 'Ends in .875 → Rounded UP to next whole band';
  else if (dec < 0.25) ruleText = `Dec (.${Math.round(dec * 1000)}) < .25 → Rounded DOWN to .0`;
  else if (dec < 0.75) ruleText = `Dec (.${Math.round(dec * 1000)}) → Rounded to .5`;
  else ruleText = `Dec (.${Math.round(dec * 1000)}) ≥ .75 → Rounded UP to next whole band`;

  if ($('#calcRuleDesc')) $('#calcRuleDesc').textContent = ruleText;

  // CEFR Equivalent Level
  const cefrElem = $('#calcCefrBadge');
  if (cefrElem && o !== null) {
    if (o >= 8.5) { cefrElem.className = 'pill pill-ok'; cefrElem.textContent = 'C2 (Proficient / Mastery)'; }
    else if (o >= 7.0) { cefrElem.className = 'pill pill-ok'; cefrElem.textContent = 'C1 (Advanced)'; }
    else if (o >= 5.5) { cefrElem.className = 'pill pill-med'; cefrElem.textContent = 'B2 (Upper Intermediate)'; }
    else if (o >= 4.0) { cefrElem.className = 'pill pill-high'; cefrElem.textContent = 'B1 (Intermediate)'; }
    else { cefrElem.className = 'pill pill-crit'; cefrElem.textContent = 'A2 (Elementary)'; }
  }

  // Target Gap
  const tgt = targets();
  const gapElem = $('#calcTargetGap');
  if (gapElem && o !== null) {
    const diff = Math.round((tgt.overall - o) * 10) / 10;
    if (diff <= 0) {
      gapElem.className = 'pill pill-ok';
      gapElem.textContent = 'Target Met! (' + o.toFixed(1) + ' / ' + tgt.overall.toFixed(1) + ')';
    } else {
      gapElem.className = 'pill pill-med';
      gapElem.textContent = '+' + diff.toFixed(1) + ' to target (' + tgt.overall.toFixed(1) + ')';
    }
  }

  // Floor Check (>= 6.0)
  const floorElem = $('#calcFloorStatus');
  const belowFloor = MODULES.filter((m) => vals[m] < DB.PROFILE.targets.floor);
  if (floorElem) {
    if (belowFloor.length === 0) {
      floorElem.className = 'pill pill-ok';
      floorElem.textContent = 'Pass (All ≥ 6.0)';
    } else {
      floorElem.className = 'pill pill-crit';
      floorElem.textContent = belowFloor.map((m) => MOD_LABEL[m] + ' (' + vals[m].toFixed(1) + ')').join(', ') + ' < 6.0';
    }
  }

  // Strategic Feedback Advice
  const adviceElem = $('#calcAdvice');
  if (adviceElem && o !== null) {
    if (belowFloor.length > 0) {
      const worst = belowFloor[0];
      adviceElem.innerHTML = '⚠️ <strong>Priority Floor Warning:</strong> ' + MOD_LABEL[worst] + ' is at <strong>' + vals[worst].toFixed(1) + '</strong>. German universities / visa criteria require a minimum floor of <strong>6.0 in all sub-bands</strong>. Focus your next drills on ' + MOD_LABEL[worst] + '!';
    } else if (o < tgt.overall) {
      // Find single module where +0.5 raises overall band
      let roiMod = null;
      for (const m of MODULES) {
        const testVals = Object.assign({}, vals, { [m]: Math.min(9, vals[m] + 0.5) });
        if (overallBand(testVals) > o) {
          roiMod = m;
          break;
        }
      }
      if (roiMod) {
        adviceElem.innerHTML = '💡 <strong>High-ROI Move:</strong> Increasing <strong>' + MOD_LABEL[roiMod] + '</strong> by just <strong>+0.5</strong> (from ' + vals[roiMod].toFixed(1) + ' to ' + (vals[roiMod] + 0.5).toFixed(1) + ') will raise your mean to ' + (rawAvg + 0.125).toFixed(3) + ' and immediately bump your Overall Band to <strong>' + (o + 0.5).toFixed(1) + '</strong>!';
      } else {
        adviceElem.innerHTML = '💡 <strong>Strategy:</strong> You are currently at <strong>' + o.toFixed(1) + '</strong>. Increasing any two modules by +0.5 will unlock your target band of <strong>' + tgt.overall.toFixed(1) + '</strong>!';
      }
    } else {
      adviceElem.innerHTML = '🎉 <strong>Target Achieved:</strong> An overall band of <strong>' + o.toFixed(1) + '</strong> meets all university requirements for Germany 2027 and confirms C1/C2 English proficiency!';
    }
  }
}

/* ---------------- reading lab ---------------- */
function renderReading() {
  const g = gapInfo('reading');
  const sessions = state.readingSessions;
  const totQ = sessions.reduce((a, s) => a + (num(s.attempted) || 0), 0);
  const totC = sessions.reduce((a, s) => a + (num(s.correct) || 0), 0);
  const acc = totQ ? Math.round((totC / totQ) * 100) : null;
  const times = sessions.filter((s) => num(s.timeTaken) && num(s.attempted));
  const perQ = times.length ? Math.round(times.reduce((a, s) => a + (num(s.timeTaken) * 60 / num(s.attempted)), 0) / times.length) : null;
  const wt = weakestReadingType();

  $('#readingStats').innerHTML = [
    statCard('Current reading', g.cur.toFixed(1), 'target ' + g.tgt.toFixed(1) + ' ' + pillFor(g)),
    statCard('Overall accuracy', acc == null ? ' — ' : acc + '%', totQ + ' questions logged'),
    statCard('Time per question', perQ == null ? ' — ' : perQ + 's', 'exam pace ≈ 90s'),
    statCard('Mistakes logged', state.readingErrors.length, 'in the mistake book'),
    statCard('Weakest type', wt ? wt.type.split(' ')[0] : ' — ', wt ? (wt.accuracy == null ? wt.errors + ' errors' : wt.accuracy + '% accuracy') : 'log more sessions')
  ].join('');

  const stats = readingTypeStats();
  $('#readingHeatEmpty').hidden = stats.length > 0;
  $('#readingHeatmap').innerHTML = stats.map((s) => {
    const a = s.accuracy;
    const cls = a == null ? 'heat-mid' : a >= 75 ? 'heat-good' : a >= 55 ? 'heat-mid' : 'heat-bad';
    return '<div class="heat-row"><span><i class="heat-dot ' + cls + '"></i>' + esc(s.type) + '</span>' +
      '<span class="num">' + (a == null ? ' — ' : a + '%') + '</span>' +
      '<span class="muted small">' + s.correct + '/' + s.attempted + ' · ' + s.errors + ' logged errors</span></div>';
  }).join('');

  const chron = sessions.filter((s) => s.date).sort((a, b) => (a.date > b.date ? 1 : -1));
  if (chron.length) {
    chart('readingChart', {
      type: 'line',
      data: {
        labels: chron.map((s) => fmtShort(s.date)),
        datasets: [{
          label: 'Accuracy %', data: chron.map((s) => num(s.attempted) ? Math.round(num(s.correct) / num(s.attempted) * 100) : null),
          borderColor: cssVar('--cyan'), backgroundColor: 'rgba(34,211,238,.15)', fill: true, tension: .3, spanGaps: true
        }, {
          label: 'Band 7 line (≈75%)', data: chron.map(() => 75), borderColor: cssVar('--violet'), borderDash: [5, 4], pointRadius: 0
        }]
      },
      options: { scales: { y: { min: 0, max: 100 } } }
    });
  }
  renderList('readingSessions');
  renderList('readingErrors');
}

/* ---------------- writing lab ---------------- */
function renderWriting() {
  const g = gapInfo('writing');
  const crit = writingCriteria();
  const t1 = state.writingSessions.filter((w) => w.task === 'Task 1').length;
  const t2 = state.writingSessions.filter((w) => w.task === 'Task 2').length;
  const words = state.writingSessions.map((w) => num(w.wordCount)).filter(Boolean);
  $('#writingStats').innerHTML = [
    statCard('Current writing', g.cur.toFixed(1), 'target ' + g.tgt.toFixed(1) + ' ' + pillFor(g)),
    statCard('Task 1 entries', t1, 'charts and processes'),
    statCard('Task 2 entries', t2, 'essays'),
    statCard('Average words', words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : ' — ', 'Task 2 aim 260–280'),
    statCard('Errors logged', state.writingErrors.length, 'in the error database')
  ].join('');

  $('#writingCriteria').innerHTML = crit.map((c) => {
    const v = c.value;
    return '<div class="crit-row"><span>' + esc(c.label) + '</span>' +
      '<span class="bar"><span class="bar-fill" style="width:' + (v ? clamp((v - 4) / 5, 0, 1) * 100 : 0) + '%"></span></span>' +
      '<span class="num">' + (v == null ? ' — ' : v.toFixed(1)) + '</span></div>';
  }).join('');
  const scored = crit.filter((c) => c.value !== null).sort((a, b) => a.value - b.value);
  const opp = $('#writingOpportunity');
  if (scored.length) {
    opp.hidden = false;
    opp.innerHTML = '<strong>Your biggest opportunity: ' + esc(scored[0].label) + '</strong> at ' + scored[0].value.toFixed(1) +
      '. Lifting the lowest criterion moves the band faster than polishing the highest.';
  } else opp.hidden = true;

  const f = freq(state.writingErrors, 'category');
  $('#writingFreqEmpty').hidden = f.length > 0;
  const max = f.length ? f[0].count : 1;
  $('#writingErrorFreq').innerHTML = f.slice(0, 10).map((x) =>
    '<div class="freq-row"><span>' + esc(x.name) + '</span><span class="num">' + x.count + '</span>' +
    '<span class="freq-bar"><i style="width:' + Math.round(x.count / max * 100) + '%"></i></span></div>').join('') +
    (f.length && f[0].count >= 5 ? '<p class="fineprint">' + esc(f[0].name) +
      ' is a recurring problem. Make it this week\'s only grammar focus.</p>' : '');

  renderList('writingSessions');
  renderList('writingErrors');
}

/* ---------------- listening lab ---------------- */
function renderListening() {
  const g = gapInfo('listening');
  const s = state.listeningSessions;
  const totQ = s.reduce((a, x) => a + (num(x.total) || 0), 0);
  const totC = s.reduce((a, x) => a + (num(x.correct) || 0), 0);
  $('#listeningStats').innerHTML = [
    statCard('Current listening', g.cur.toFixed(1), 'target ' + g.tgt.toFixed(1) + ' ' + pillFor(g)),
    statCard('Accuracy', totQ ? Math.round(totC / totQ * 100) + '%' : ' — ', totQ + ' questions'),
    statCard('Sessions', s.length, 'logged'),
    statCard('Best band', (() => { const b = s.map((x) => listeningBand(num(x.correct), num(x.total))).filter(Boolean); return b.length ? Math.max(...b).toFixed(1) : ' — '; })(), 'estimated')
  ].join('');

  const chron = s.filter((x) => x.date).sort((a, b) => (a.date > b.date ? 1 : -1));
  if (chron.length) {
    chart('listeningChart', {
      type: 'line',
      data: {
        labels: chron.map((x) => fmtShort(x.date)),
        datasets: [
          { label: 'Estimated band', data: chron.map((x) => listeningBand(num(x.correct), num(x.total))), borderColor: cssVar('--good'), backgroundColor: 'rgba(52,211,153,.15)', fill: true, tension: .3, spanGaps: true },
          { label: 'Target', data: chron.map(() => targets().listening), borderColor: cssVar('--cyan'), borderDash: [5, 4], pointRadius: 0 }
        ]
      },
      options: { scales: { y: { min: 4, max: 9, ticks: { stepSize: .5 } } } }
    });
  }
  const f = freq(s, 'errorCategory');
  $('#listeningFreqEmpty').hidden = f.length > 0;
  const max = f.length ? f[0].count : 1;
  $('#listeningErrorFreq').innerHTML = f.map((x) =>
    '<div class="freq-row"><span>' + esc(x.name) + '</span><span class="num">' + x.count + '</span>' +
    '<span class="freq-bar"><i style="width:' + Math.round(x.count / max * 100) + '%"></i></span></div>').join('');
  renderList('listeningSessions');
}

/* ---------------- speaking lab ---------------- */
function renderSpeaking() {
  const g = gapInfo('speaking');
  const s = state.speakingSessions;
  const conf = s.map((x) => num(x.confidence)).filter(Boolean);
  $('#speakingStats').innerHTML = [
    statCard('Current speaking', g.cur.toFixed(1), 'target ' + g.tgt.toFixed(1) + ' ' + pillFor(g)),
    statCard('Sessions', s.length, 'logged'),
    statCard('Recordings', recordings.filter((r) => r.kind === 'speaking').length, 'stored on this device'),
    statCard('Average confidence', conf.length ? (conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(1) : ' — ', 'out of 5')
  ].join('');
  renderRecordings();
  renderList('speakingSessions');
}

/* ---------------- recordings (speaking + pronunciation) ---------------- */
let recordings = [];
let mediaRec = null, recChunks = [], recTimerId = null, recSeconds = 0, recTarget = 'speaking';

async function loadRecordings() { recordings = await Store.all('recordings'); }

function renderRecordings() {
  const build = (kind, el) => {
    if (!el) return;
    const list = recordings.filter((r) => r.kind === kind).sort((a, b) => (a.created < b.created ? 1 : -1));
    if (!list.length) { el.innerHTML = '<p class="empty-inline">No recordings yet.</p>'; return; }
    el.innerHTML = list.map((r) => {
      const url = URL.createObjectURL(r.blob);
      return '<div class="rec-item"><span class="rec-name"><strong>' + esc(r.label || 'Untitled') + '</strong>' +
        '<div class="muted small">' + fmtShort(r.date) + ' · ' + hhmm(r.seconds || 0) + '</div></span>' +
        '<audio controls src="' + url + '"></audio>' +
        '<button class="btn btn-sm" data-recdel="' + r.id + '">Delete</button></div>';
    }).join('');
  };
  build('speaking', $('#recList'));
  build('pron', $('#pronRecList'));
}

async function startRecording(kind, label) {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    return toast('This browser cannot record audio. Log the session manually instead.', 'bad');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = []; recSeconds = 0; recTarget = kind;
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recChunks, { type: mediaRec.mimeType || 'audio/webm' });
      const rec = { id: uid(), kind, label: label || 'Untitled', date: today(), created: Date.now(), seconds: recSeconds, blob };
      const ok = await Store.put('recordings', null, rec);
      if (!ok) return toast('Could not save the recording locally.', 'bad');
      recordings.push(rec);
      renderRecordings();
      toast('Recording saved.', 'good');
    };
    mediaRec.start();
    recTimerId = setInterval(() => {
      recSeconds++;
      const el = kind === 'speaking' ? $('#recTimer') : $('#pronTimer');
      if (el) el.textContent = hhmm(recSeconds);
    }, 1000);
    if (kind === 'speaking') { $('#recStart').disabled = true; $('#recStop').disabled = false; }
    else { $('#pronStart').disabled = true; $('#pronStop').disabled = false; }
  } catch (e) {
    toast('Microphone permission denied. You can still log sessions by hand.', 'bad');
  }
}
function stopRecording() {
  if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
  clearInterval(recTimerId);
  $('#recStart').disabled = false; $('#recStop').disabled = true;
  $('#pronStart').disabled = false; $('#pronStop').disabled = true;
}

/* ---------------- FLT ---------------- */
function renderFlt() {
  const flts = state.fltTests.filter((f) => f.date).sort((a, b) => (a.date > b.date ? 1 : -1));
  const done = flts.filter((f) => overallBand(f) !== null);
  const latest = done[done.length - 1];
  const prev = done[done.length - 2];

  const nextSat = (() => { let d = today(); for (let i = 0; i < 8; i++) { if (new Date(d + 'T00:00:00').getDay() === 6) return d; d = addDays(d, 1); } return null; })();
  $('#fltSaturday').textContent = nextSat
    ? 'Next Saturday (' + fmtShort(nextSat) + ') is ' + saturdayKind(nextSat) + '.'
    : 'Saturday cycle alternates between a full length test and a review week.';

  $('#fltStats').innerHTML = [
    statCard('FLTs logged', flts.length, state.fltTests.filter((f) => f.status === 'Reviewed').length + ' reviewed'),
    statCard('Latest overall', latest ? overallBand(latest).toFixed(1) : ' — ', latest ? fmtShort(latest.date) : 'none yet'),
    statCard('Best overall', done.length ? Math.max(...done.map((f) => overallBand(f))).toFixed(1) : ' — ', 'personal best'),
    statCard('Change', (latest && prev) ? ((overallBand(latest) - overallBand(prev) >= 0 ? '+' : '') + (overallBand(latest) - overallBand(prev)).toFixed(1)) : ' — ', 'vs previous FLT')
  ].join('');

  const rev = $('#fltReview');
  if (!latest) {
    rev.innerHTML = '<p class="empty-inline">No completed FLT yet. Log one and this review generates automatically.</p>';
  } else {
    const mods = MODULES.map((m) => ({ m, v: num(latest[m]) })).filter((x) => x.v !== null);
    const strongest = mods.slice().sort((a, b) => b.v - a.v)[0];
    const weakest = mods.slice().sort((a, b) => a.v - b.v)[0];
    const tgt = targets();
    const loss = mods.map((x) => ({ m: x.m, d: tgt[x.m] - x.v })).sort((a, b) => b.d - a.d)[0];
    const wt = latest.weakType || (weakestReadingType() ? weakestReadingType().type : null);
    const rows = [
      ['Test', 'FLT ' + (latest.number || '') + ' · ' + fmtShort(latest.date) + ' · ' + (latest.source || 'unknown source')],
      ['Overall', overallBand(latest).toFixed(1) + (prev ? ' (previous ' + overallBand(prev).toFixed(1) + ')' : '')],
      ['Strongest module', MOD_LABEL[strongest.m] + ' — ' + strongest.v.toFixed(1)],
      ['Weakest module', MOD_LABEL[weakest.m] + ' — ' + weakest.v.toFixed(1)],
      ['Biggest score loss', MOD_LABEL[loss.m] + ' — ' + loss.d.toFixed(1) + ' below target'],
      ['Question type with most errors', wt || 'not recorded'],
      ['Suggested improvement', wt
        ? 'Complete three ' + wt + ' exercises before the next FLT and log every wrong answer with its evidence.'
        : 'Log the question types you lost marks on so this review can name them next time.'],
      ['Next week priority', MOD_LABEL[loss.m] + ' — ' + (loss.m === 'reading' ? 'timed passages plus mistake analysis'
        : loss.m === 'writing' ? 'one corrected essay rewritten twice'
        : loss.m === 'listening' ? 'sections 3 and 4 under exam conditions' : 'recorded Part 2 answers with self-analysis')]
    ];
    rev.innerHTML = rows.map((r) => '<div class="review-row"><span>' + esc(r[0]) + '</span><div>' + esc(r[1]) + '</div></div>').join('');
  }

  if (done.length) {
    chart('fltChart', {
      type: 'bar',
      data: {
        labels: done.map((f) => 'FLT ' + (f.number || fmtShort(f.date))),
        datasets: MODULES.map((m, i) => ({
          label: MOD_LABEL[m], data: done.map((f) => num(f[m])),
          backgroundColor: [cssVar('--good'), cssVar('--bad'), cssVar('--warn'), cssVar('--cyan')][i]
        }))
      },
      options: { scales: { y: { min: 0, max: 9, ticks: { stepSize: 1 } } } }
    });
  }

  const cyc = $('#saturdayCycle');
  let d = today(); const list = [];
  while (list.length < 6) { if (new Date(d + 'T00:00:00').getDay() === 6) list.push(d); d = addDays(d, 1); }
  cyc.innerHTML = list.map((x, i) =>
    '<div class="cycle-row' + (i === 0 ? ' is-next' : '') + '"><span class="dl-date">' + fmtShort(x) + '</span>' +
    '<span class="grow">' + saturdayKind(x) + '</span>' + (i === 0 ? '<span class="chip chip-soft">next</span>' : '') + '</div>').join('');
  $('#satOffset').value = String(state.settings.satOffset || 0);
  renderList('fltTests');
}

/* ---------------- vocabulary ---------------- */
let deck = 'ieltsVocabulary', flashIndex = 0;

function dueCards(kind) {
  const list = state[kind] || [];
  const due = list.filter((v) => !v.srs || !v.srs.due || v.srs.due <= today());
  return due.length ? due : list;
}
function renderVocab() {
  const v = state.ieltsVocabulary;
  const byMastery = DB.MASTERY.map((m) => v.filter((x) => (x.mastery || 'New') === m).length);
  $('#vocabStats').innerHTML = [
    statCard('Words', v.length, 'in the bank'),
    statCard('Mastered', byMastery[3], 'confident recall'),
    statCard('Due today', dueCards('ieltsVocabulary').filter((x) => x.srs && x.srs.due <= today()).length, 'flashcards'),
    statCard('Added this week', v.filter((x) => x.dateAdded >= addDays(today(), -7)).length, 'last 7 days'),
    statCard('German words', state.germanVocabulary.length, 'separate notebook')
  ].join('');

  chart('masteryChart', {
    type: 'doughnut',
    data: {
      labels: DB.MASTERY,
      datasets: [{
        data: DB.MASTERY.map((m) => v.filter((x) => (x.mastery || 'New') === m).length +
          state.germanVocabulary.filter((x) => (x.mastery || 'New') === m).length),
        backgroundColor: [cssVar('--muted'), cssVar('--warn'), cssVar('--cyan'), cssVar('--good')], borderWidth: 0
      }]
    },
    options: { cutout: '62%' }
  });

  renderFlash();
  renderList('ieltsVocabulary');
}
function renderFlash() {
  const cards = dueCards(deck);
  $('#flashDue').textContent = cards.length ? cards.length + ' card' + (cards.length > 1 ? 's' : '') + ' in this deck' : 'deck empty';
  const card = cards[flashIndex % Math.max(cards.length, 1)];
  const fc = $('#flashcard');
  fc.classList.remove('is-flipped');
  if (!card) {
    $('#flashFront').textContent = deck === 'ieltsVocabulary' ? 'Add words to start' : 'Save German words to start';
    $('#flashBack').innerHTML = '';
    return;
  }
  $('#flashFront').textContent = (card.article ? card.article + ' ' : '') + card.word;
  $('#flashBack').innerHTML = '<p><strong>' + esc(card.meaning || '') + '</strong></p>' +
    (card.synonyms ? '<p class="muted small">Synonyms: ' + esc(card.synonyms) + '</p>' : '') +
    (card.plural ? '<p class="muted small">Plural: ' + esc(card.plural) + '</p>' : '') +
    (card.ipa || card.pronunciation ? '<p class="muted small">' + esc(card.ipa || card.pronunciation) + '</p>' : '') +
    (card.example ? '<p class="small">' + esc(card.example) + '</p>' : '') +
    (DB.CROSSLINK[(card.word || '').toLowerCase()] && deck === 'ieltsVocabulary'
      ? '<p class="small">German: <strong>' + esc(DB.CROSSLINK[card.word.toLowerCase()]) + '</strong></p>' : '');
}
function gradeCard(grade) {
  const cards = dueCards(deck);
  if (!cards.length) return;
  const card = cards[flashIndex % cards.length];
  const row = state[deck].find((x) => x.id === card.id);
  if (!row) return;
  row.srs = row.srs || { due: today(), interval: 0, ease: 2.4 };
  const s = row.srs;
  if (grade === 'again') { s.interval = 0; s.ease = Math.max(1.6, s.ease - 0.25); row.mastery = 'Learning'; }
  else if (grade === 'hard') { s.interval = Math.max(1, Math.round((s.interval || 1) * 1.2)); s.ease = Math.max(1.8, s.ease - 0.1); row.mastery = 'Learning'; }
  else if (grade === 'good') { s.interval = s.interval ? Math.round(s.interval * s.ease) : 2; row.mastery = s.interval >= 10 ? 'Familiar' : 'Learning'; }
  else { s.interval = Math.max(21, Math.round((s.interval || 7) * 2.5)); row.mastery = 'Mastered'; }
  s.due = addDays(today(), Math.max(grade === 'again' ? 0 : 1, s.interval));
  flashIndex++;
  save(); checkAchievements();
  renderFlash();
  renderList(deck);
}

/* ---------------- dictionary lookup ---------------- */
async function lookupWord(word) {
  const box = $('#lookupResult');
  box.innerHTML = '<p class="muted small">Looking up “' + esc(word) + '”…</p>';
  const blocks = [];
  let meaning = '', pos = '', pron = '', example = '';

  try {
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      pron = (entry.phonetic || (entry.phonetics || []).map((p) => p.text).filter(Boolean)[0] || '');
      const m = entry.meanings[0];
      pos = m.partOfSpeech || '';
      meaning = m.definitions[0].definition || '';
      example = m.definitions.map((d) => d.example).filter(Boolean)[0] || '';
      blocks.push('<div class="lk-block"><h3>Definition</h3><p>' + esc(meaning) + '</p>' +
        (pos ? '<p class="muted small">' + esc(pos) + (pron ? ' · ' + esc(pron) : '') + '</p>' : '') +
        (example ? '<p class="small">“' + esc(example) + '”</p>' : '') + '</div>');
    }
  } catch (e) { /* offline is fine */ }

  let syns = [];
  try {
    const res = await fetch('https://api.datamuse.com/words?rel_syn=' + encodeURIComponent(word) + '&max=12');
    if (res.ok) syns = (await res.json()).map((x) => x.word);
  } catch (e) { /* offline is fine */ }
  const fallback = DB.ACADEMIC[word.toLowerCase()] || [];
  if (!syns.length) syns = fallback;
  if (syns.length) {
    blocks.push('<div class="lk-block"><h3>Synonyms</h3><div class="word-chips">' +
      syns.map((s) => '<button class="word-chip" data-lookupword="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div></div>');
  }
  if (fallback.length) {
    blocks.push('<div class="lk-block"><h3>Academic alternatives</h3><div class="word-chips">' +
      fallback.map((s) => '<span class="word-chip">' + esc(s) + '</span>').join('') + '</div>' +
      '<p class="small">Example: “A significant proportion of the population…”</p></div>');
  }
  const de = DB.CROSSLINK[word.toLowerCase()];
  if (de) blocks.push('<div class="lk-block"><h3>Related German word</h3><p><strong>' + esc(de) + '</strong>' +
    ' <button class="btn btn-sm" data-addgerman="' + esc(de) + '" data-en="' + esc(word) + '">Add to German notebook</button></p></div>');

  if (!blocks.length) {
    blocks.push('<div class="lk-block"><h3>No dictionary result</h3><p class="small">The lookup services are unavailable or the word is not listed. Add it manually and nothing is lost.</p></div>');
  }
  blocks.push('<div class="card-actions"><button class="btn btn-primary" data-addvocab="' + esc(word) + '" ' +
    'data-meaning="' + esc(meaning) + '" data-pos="' + esc(pos) + '" data-pron="' + esc(pron) + '" ' +
    'data-syn="' + esc(syns.slice(0, 6).join(', ')) + '" data-example="' + esc(example) + '">' +
    '<i data-lucide="plus"></i> Add to my vocabulary</button></div>');
  box.innerHTML = blocks.join('');
  icons();
}

function quickAddVocab(d) {
  state.ieltsVocabulary.unshift({
    id: uid(), word: d.word, meaning: d.meaning || '', synonyms: d.syn || '', antonyms: '',
    pos: d.pos || '', pronunciation: d.pron || '', example: d.example || '', topic: '',
    mastery: 'New', dateAdded: today(), srs: { due: today(), interval: 0, ease: 2.4 }
  });
  save(); checkAchievements(); renderAll();
  toast('“' + d.word + '” added to your vocabulary.', 'good');
}

/* ---------------- german ---------------- */
function renderGerman() {
  const lessons = DB.LESSONS;
  const doneCount = state.german.completed.length;
  const a1Total = lessons.filter((l) => l.level === 'A1').length;
  const level = state.settings.germanLevel;
  const cefr = DB.CEFR[level] || DB.CEFR.A1;
  const listenMins = Math.round((minutesByFocus()['German'] || 0));
  const speakSessions = state.studySessions.filter((s) => s.focus === 'German').length;

  $('#germanStats').innerHTML = [
    statCard('Current level', level, 'target ' + state.settings.germanTarget + ' for Germany'),
    statCard('Level progress', Math.round(doneCount / lessons.length * 100) + '%', doneCount + ' of ' + lessons.length + ' lessons'),
    statCard('Words learned', state.germanVocabulary.length, 'in the notebook'),
    statCard('Lessons completed', doneCount, 'A1 bank has ' + a1Total),
    statCard('German time', mins(listenMins), speakSessions + ' logged sessions'),
    statCard('Streak', '🔥 ' + streak(), 'all-study streak')
  ].join('');

  const order = ['A1', 'A2', 'B1', 'B2', 'C1'];
  $('#cefrRoadmap').innerHTML = order.map((l, i) => {
    const cls = l === level ? ' is-current' : l === state.settings.germanTarget ? ' is-goal' : '';
    return '<span class="cefr-step' + cls + '">' + l + (l === level ? ' · now' : l === state.settings.germanTarget ? ' · Germany target' : '') + '</span>' +
      (i < order.length - 1 ? '<span class="cefr-arrow"> → </span>' : '');
  }).join('');
  $('#cefrGoals').innerHTML = order.slice(0, 4).map((l) => {
    const c = DB.CEFR[l];
    return '<div class="cefr-card"><h4>' + l + '</h4><ul>' +
      ['vocabulary', 'grammar', 'listening', 'speaking', 'reading', 'writing'].map((k) =>
        '<li><strong>' + k + ':</strong> ' + esc(c[k]) + '</li>').join('') + '</ul></div>';
  }).join('');

  renderLesson();
  renderList('germanVocabulary');
  renderGermanResources();
}

function renderLesson() {
  const lessons = DB.LESSONS;
  const i = ((state.german.cursor % lessons.length) + lessons.length) % lessons.length;
  const l = lessons[i];
  const isDone = state.german.completed.includes(i);
  $('#germanLessonNo').textContent = l.level + ' · lesson ' + (i + 1) + (isDone ? ' ✓' : '');
  $('#germanLesson').innerHTML =
    '<div class="lesson-topic">' + esc(l.topic) + '</div>' +
    '<div class="lesson-block"><h4>10 words</h4><div class="word-table">' +
      l.words.map((w) => '<div class="word-cell"><b>' + esc((w.article ? w.article + ' ' : '') + w.de) + '</b>' +
        '<span>' + esc(w.en) + '</span><small>/' + esc(w.ipa) + '/</small></div>').join('') + '</div></div>' +
    '<div class="lesson-block"><h4>Grammar — ' + esc(l.grammar.title) + '</h4><p>' + esc(l.grammar.body) + '</p>' +
      '<ul class="lesson-list">' + l.grammar.examples.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>' +
    '<div class="lesson-block"><h4>Pronunciation — ' + esc(l.pronunciation.focus) + '</h4><p>' + esc(l.pronunciation.tip) + '</p>' +
      '<div class="word-chips">' + l.pronunciation.words.map((w) =>
        '<button class="word-chip" data-say="' + esc(w.split(' ')[0]) + '">' + esc(w) + '</button>').join('') + '</div></div>' +
    '<div class="lesson-block"><h4>Listening activity</h4><p>' + esc(l.listening.title) + ' · ' + esc(l.listening.source) +
      ' <a href="' + esc(l.listening.url) + '" target="_blank" rel="noopener">Open</a></p></div>' +
    '<div class="lesson-block"><h4>Say these five sentences out loud</h4><ul class="lesson-list">' +
      l.speaking.map((s) => '<li>' + esc(s) + ' <button class="word-chip" data-say="' + esc(s) + '">▶</button></li>').join('') + '</ul></div>' +
    '<div class="lesson-block"><h4>Mini quiz</h4><div class="quiz"><div class="quiz-q">' + esc(l.quiz.q) + '</div>' +
      '<div class="quiz-opts">' + l.quiz.options.map((o, k) =>
        '<button class="quiz-opt" data-quiz="' + k + '" data-answer="' + l.quiz.answer + '">' + esc(o) + '</button>').join('') + '</div></div></div>' +
    '<div class="lesson-block"><h4>Cultural note</h4><p class="culture">' + esc(l.culture) + '</p></div>' +
    '<div class="lesson-block"><h4>5-minute challenge</h4><p>' + esc(fiveMinChallenge(l)) + '</p></div>';
  icons();
}
function fiveMinChallenge(l) {
  return 'Write three sentences about yourself using only words from this lesson, then say them out loud without reading. Topic: ' + l.topic.toLowerCase() + '.';
}
function saveLessonWords() {
  const lessons = DB.LESSONS;
  const i = ((state.german.cursor % lessons.length) + lessons.length) % lessons.length;
  const l = lessons[i];
  let added = 0;
  l.words.forEach((w) => {
    if (state.germanVocabulary.some((x) => (x.word || '').toLowerCase() === w.de.toLowerCase())) return;
    state.germanVocabulary.unshift({
      id: uid(), word: w.de, article: w.article || '', meaning: w.en, localMeaning: '', plural: '',
      pronunciation: '', ipa: '/' + w.ipa + '/', example: '', topic: l.topic, level: l.level,
      mastery: 'New', dateAdded: today(), srs: { due: today(), interval: 0, ease: 2.4 }
    });
    added++;
  });
  save(); checkAchievements(); renderAll();
  toast(added ? added + ' words added to your German notebook.' : 'All ten words were already in your notebook.', added ? 'good' : '');
}
function completeLesson() {
  const lessons = DB.LESSONS;
  const i = ((state.german.cursor % lessons.length) + lessons.length) % lessons.length;
  if (!state.german.completed.includes(i)) state.german.completed.push(i);
  state.german.cursor = i + 1;
  const a1 = lessons.map((l, k) => (l.level === 'A1' ? k : -1)).filter((k) => k > -1);
  if (a1.every((k) => state.german.completed.includes(k)) && state.settings.germanLevel === 'A1') {
    state.settings.germanLevel = 'A2';
    toast('A1 lesson bank complete. Level moved to A2 — change it in Settings if that is premature.', 'good');
  }
  save(); checkAchievements(); renderAll();
  toast('Lesson marked complete.', 'good');
}
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('This browser has no speech synthesis.', 'bad');
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const de = voices.find((v) => /de[-_]/i.test(v.lang));
  if (de) u.voice = de;
  u.lang = 'de-DE'; u.rate = 0.9;
  speechSynthesis.speak(u);
  if (!de) toast('No German voice installed, using the default voice.', '');
}

/* ---------------- resources ---------------- */
let resFilter = { german: 'All', all: 'All' };
function resourceCard(r) {
  return '<article class="res-card' + (r.status === 'Completed' ? ' is-done' : '') + '">' +
    '<h4>' + esc(r.title) + '</h4>' +
    '<div class="res-meta"><span class="tag">' + esc(r.group) + '</span>' +
      (r.category ? '<span class="tag">' + esc(r.category) + '</span>' : '') +
      (r.level ? '<span class="tag">' + esc(r.level) + '</span>' : '') +
      '<span class="tag">' + esc(r.status || 'Not started') + '</span></div>' +
    (r.source ? '<div class="muted small">' + esc(r.source) + '</div>' : '') +
    (r.notes ? '<div class="small" style="margin-top:0.25rem;color:var(--muted)">' + esc(r.notes) + '</div>' : '') +
    '<div class="res-actions">' +
      '<a class="btn btn-sm btn-primary" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">Open</a>' +
      '<button class="btn btn-sm" data-rescomplete="' + r.id + '">' + (r.status === 'Completed' ? 'Reopen' : 'Complete') + '</button>' +
      '<button class="btn btn-sm" data-edit="resources" data-id="' + r.id + '">Edit</button>' +
    '</div></article>';
}
function renderResources() {
  const cnt = $('#resCount');
  if (cnt) cnt.textContent = state.resources.length;
  const allCategories = [...new Set(state.resources.map((r) => r.category).filter(Boolean))];
  const chips = ['All', 'IELTS', 'German', ...allCategories.filter((c) => c !== 'IELTS' && c !== 'German')];
  $('#resFilters').innerHTML = chips.map((c) =>
    '<button class="word-chip' + (resFilter.all === c ? ' is-on' : '') + '" data-resfilter="' + esc(c) + '">' + esc(c) + '</button>').join('');
  let rows = getList('resources');
  if (resFilter.all === 'IELTS') {
    rows = rows.filter((r) => r.group === 'IELTS');
  } else if (resFilter.all === 'German') {
    rows = rows.filter((r) => r.group === 'German');
  } else if (resFilter.all !== 'All') {
    rows = rows.filter((r) => r.category === resFilter.all || r.group === resFilter.all || r.level === resFilter.all);
  }
  $('#resourceGrid').innerHTML = rows.length ? rows.map(resourceCard).join('')
    : '<p class="empty-inline">No resources match this filter.</p>';
  icons();
}
function renderGermanResources() {
  const g = state.resources.filter((r) => r.group === 'German');
  const cats = ['All', ...new Set(g.map((r) => r.level).filter(Boolean)), ...new Set(g.map((r) => r.category).filter(Boolean))];
  $('#germanResFilters').innerHTML = [...new Set(cats)].map((c) =>
    '<button class="word-chip' + (resFilter.german === c ? ' is-on' : '') + '" data-gresfilter="' + esc(c) + '">' + esc(c) + '</button>').join('');
  let rows = g;
  if (resFilter.german !== 'All') rows = rows.filter((r) => r.level === resFilter.german || r.category === resFilter.german);
  $('#germanResources').innerHTML = rows.length ? rows.map(resourceCard).join('')
    : '<p class="empty-inline">No German resources match this filter.</p>';
  icons();
}

/* ---------------- pronunciation ---------------- */
function renderPronunciation() {
  $('#soundGuide').innerHTML = DB.SOUNDS.map((s) =>
    '<div class="sg-row"><b>' + esc(s[0]) + '</b><code>' + esc(s[1]) + '</code><span>' + esc(s[2]) + '</span></div>').join('');
  renderRecordings();
  renderList('pronunciation');
}

/* ---------------- daily teacher ---------------- */
function teacherBoard() {
  const pri = modulePriority();
  const top = pri[0];
  const cur = currentScores(), tgt = targets();
  const wt = weakestReadingType();
  const crit = writingCriteria().filter((c) => c.value !== null).sort((a, b) => a.value - b.value)[0];
  const wf = freq(state.writingErrors, 'category')[0];
  const lf = freq(state.listeningSessions, 'errorCategory')[0];
  const lessons = DB.LESSONS;
  const li = ((state.german.cursor % lessons.length) + lessons.length) % lessons.length;
  const lesson = lessons[li];
  const dow = new Date().getDay();
  const cls = DB.CLASSES[dow];

  /* history-aware focus statement */
  const readingHistory = state.ieltsScores.concat(state.fltTests)
    .filter((s) => num(s.reading) !== null).sort((a, b) => (a.date > b.date ? 1 : -1)).map((s) => num(s.reading));
  let why;
  if (readingHistory.length >= 3) {
    const last = readingHistory.slice(-4);
    const flat = Math.max(...last) - Math.min(...last) <= 0.5;
    if (flat && top.mod === 'reading') {
      why = 'Reading has sat between ' + Math.min(...last).toFixed(1) + ' and ' + Math.max(...last).toFixed(1) +
        ' across ' + last.length + ' attempts. That pattern says the problem is method, not effort.' +
        (wt ? ' Your error log points at ' + wt.type + ', so today works on identifying paragraph main ideas rather than doing more passages.' : '');
    }
  }
  if (!why) {
    why = MOD_LABEL[top.mod] + ' is ' + top.gap.gap.toFixed(1) + ' below target at ' + top.gap.cur.toFixed(1) +
      '. It is the single largest thing standing between you and an overall ' + tgt.overall.toFixed(1) + '.';
    if (top.lastPractice) why += ' Last logged practice: ' + fmtShort(top.lastPractice) + '.';
    else why += ' Nothing logged for it yet, which is why it is at the top of the list.';
  }

  const focusTitle = 'Today\'s focus: ' + MOD_LABEL[top.mod] +
    (top.mod === 'reading' && wt ? ' — ' + wt.type : top.mod === 'writing' && crit ? ' — ' + crit.label : '');

  const task = top.mod === 'reading'
    ? 'One timed passage (20 minutes), then spend 20 minutes writing down why each wrong answer was wrong. No second passage until that is done.'
    : top.mod === 'writing'
      ? 'One task under exam timing, then score it against the four criteria and rewrite only the weakest paragraph.'
      : top.mod === 'listening'
        ? 'One section under exam conditions, then read the transcript and mark exactly where each mark was lost.'
        : 'Two Part 2 answers recorded, then listen back and count hesitations and repeated words.';

  const commonMistakes = [];
  if (wt) commonMistakes.push(wt.type + ' in Reading' + (wt.accuracy != null ? ' — ' + wt.accuracy + '% accuracy' : ' — ' + wt.errors + ' logged errors'));
  if (wf) commonMistakes.push(wf.name + ' in Writing — ' + wf.count + ' occurrences');
  if (lf) commonMistakes.push(lf.name + ' in Listening — ' + lf.count + ' sessions affected');
  if (!commonMistakes.length) commonMistakes.push('Nothing logged yet. Start recording mistakes today, otherwise this section stays generic.');

  const band7 = top.mod === 'reading'
    ? 'Band 7 Reading needs roughly 30 of 40 correct. That is not speed, it is accuracy on paraphrase. Underline the question keyword, then hunt the synonym, never the word itself.'
    : top.mod === 'writing'
      ? 'Band 7 Writing needs a clear position held from the first paragraph to the last, plus consistently accurate complex sentences. Two clean complex sentences per paragraph is the target.'
      : top.mod === 'listening'
        ? 'Band 7 Listening needs about 30 of 40. Sections 3 and 4 decide it, so practise those twice as often as 1 and 2.'
        : 'Band 7 Speaking needs continuous speech with natural self-correction. Extend every answer with a reason and an example.';

  const vocabList = state.ieltsVocabulary.filter((v) => (v.mastery || 'New') !== 'Mastered');
  const vocabPick = vocabList.length ? vocabList[daysBetween('2026-01-01', today()) % vocabList.length] : null;

  return {
    focus: { title: focusTitle },
    why,
    task,
    mistakes: commonMistakes,
    tip: tipFor(MOD_LABEL[top.mod]),
    band7,
    vocab: vocabPick ? (vocabPick.word + ' — ' + (vocabPick.meaning || 'add a meaning to this entry')) : 'No words in the bank yet. Look one up in the Vocabulary section.',
    grammar: DB.TIPS.Writing[(daysBetween('2026-01-01', today()) + 3) % DB.TIPS.Writing.length],
    german: lesson.level + ' lesson ' + (li + 1) + ' — ' + lesson.topic + '. Grammar: ' + lesson.grammar.title + '.',
    germanTip: tipFor('German'),
    challenge: top.mod === 'reading'
      ? 'Five minutes: read one paragraph and write its main idea in seven words or fewer.'
      : top.mod === 'writing' ? 'Five minutes: rewrite one weak sentence from your last essay three different ways.'
      : top.mod === 'listening' ? 'Five minutes: dictate one minute of a DW news clip, then check your spelling.'
      : 'Five minutes: answer “Describe a place you like” out loud for exactly two minutes.',
    reflection: 'End of day: what did you get wrong today, and what will you do differently tomorrow? One sentence each is enough.',
    classToday: dow === 6 ? saturdayKind(today()) : cls.name
  };
}
function renderTeacher() {
  const t = teacherBoard();
  const cards = [
    ['Primary Focus', '<p style="font-size:1.1rem; color:var(--violet); font-weight:600;">' + esc(t.focus.title) + '</p><p>' + esc(t.why) + '</p>'],
    ['Actionable Task', '<p>' + esc(t.task) + '</p><p class="muted small">Class today: ' + esc(t.classToday) + '</p>'],
    ['Quick Tip', '<p>' + esc(t.tip) + '</p>'],
    ['Band 7 Reminder', '<p>' + esc(t.band7) + '</p>'],
    ['Common Mistakes', '<ul>' + t.mistakes.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>'],
    ['Today\'s Vocabulary', '<p>' + esc(t.vocab) + '</p>'],
    ['Grammar Focus', '<p>' + esc(t.grammar) + '</p>'],
    ['German', '<p>' + esc(t.german) + '</p><p class="muted small">' + esc(t.germanTip) + '</p>'],
    ['5-Minute Challenge', '<p>' + esc(t.challenge) + '</p>'],
    ['End-of-Day Reflection', '<p>' + esc(t.reflection) + '</p>']
  ];
  $('#teacherBoard').innerHTML = cards.map((c, i) =>
    '<article class="teach-card' + (i === 0 ? ' span-2' : '') + '"><h3>' + esc(c[0]) + '</h3>' + c[1] + '</article>').join('');
  
  const teacherMode = $('#teacherMode');
  if (teacherMode) teacherMode.value = state.meta.teacherMode || 'local';
  const teacherEndpoint = $('#teacherEndpoint');
  if (teacherEndpoint) teacherEndpoint.value = state.meta.teacherEndpoint || '';
}


/* ---------------- mistake book ---------------- */
let mistakeFilter = 'all';
function allMistakes() {
  const out = [];
  state.readingErrors.forEach((e) => out.push({ src: 'reading', date: e.date, type: e.questionType, detail: e.test || e.passage || '', mine: e.myAnswer, right: e.correctAnswer, lesson: e.lesson || e.whyCorrect || '', id: e.id }));
  state.writingErrors.forEach((e) => out.push({ src: 'writing', date: e.date, type: e.category, detail: e.example || '', mine: e.example, right: e.correction, lesson: e.note || '', id: e.id }));
  state.listeningSessions.forEach((s) => {
    if (s.errorCategory || s.mistakes) out.push({ src: 'listening', date: s.date, type: s.errorCategory || 'Listening error', detail: s.source || '', mine: '', right: '', lesson: s.mistakes || '', id: s.id });
  });
  state.speakingSessions.forEach((s) => {
    if (s.grammarMistakes || s.pronunciationMistakes) out.push({ src: 'speaking', date: s.date, type: 'Speaking', detail: s.topic || '', mine: s.grammarMistakes || '', right: s.pronunciationMistakes || '', lesson: s.notes || '', id: s.id });
  });
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
function renderMistakes() {
  const all = allMistakes();
  const byType = freq(all, 'type');
  $('#mistakeStats').innerHTML = [
    statCard('Total mistakes', all.length, 'across all modules'),
    statCard('Last 7 days', all.filter((m) => m.date >= addDays(today(), -7)).length, 'logged'),
    statCard('Most frequent', byType.length ? byType[0].name.split(' ').slice(0, 2).join(' ') : ' — ', byType.length ? byType[0].count + ' times' : 'nothing yet'),
    statCard('Review done today', state.meta.mistakeReview[today()] ? 'Yes' : 'No', 'daily habit')
  ].join('');

  $('#mistakeFreqEmpty').hidden = byType.length > 0;
  const max = byType.length ? byType[0].count : 1;
  $('#mistakeFreq').innerHTML = byType.slice(0, 12).map((x) =>
    '<div class="freq-row"><span>' + esc(x.name) + '</span><span class="num">' + x.count + '</span>' +
    '<span class="freq-bar"><i style="width:' + Math.round(x.count / max * 100) + '%"></i></span></div>').join('');

  const rows = mistakeFilter === 'all' ? all : all.filter((m) => m.src === mistakeFilter);
  $('#mistakeAll').innerHTML = rows.length
    ? '<table class="table"><thead><tr><th>Date</th><th>Module</th><th>Type</th><th>Mine</th><th>Correct</th><th>Lesson</th></tr></thead><tbody>' +
      rows.map((m) => '<tr><td data-label="Date">' + fmtShort(m.date) + '</td>' +
        '<td data-label="Module">' + esc(m.src) + '</td><td data-label="Type">' + esc(m.type || ' — ') + '</td>' +
        '<td data-label="Mine">' + esc(m.mine || ' — ') + '</td><td data-label="Correct">' + esc(m.right || ' — ') + '</td>' +
        '<td data-label="Lesson">' + esc(m.lesson || ' — ') + '</td></tr>').join('') + '</tbody></table>'
    : '<p class="empty-inline">Nothing logged for this filter yet.</p>';
}

/* ---------------- analytics ---------------- */
function renderAnalytics() {
  const days = activeDays();
  const totalMin = state.studySessions.reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const weekMin = state.studySessions.filter((s) => s.date >= addDays(today(), -7)).reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const tasksAll = Object.values(state.dailyTasks).flat();
  $('#analyticsStats').innerHTML = [
    statCard('Total study time', mins(totalMin), state.studySessions.length + ' sessions'),
    statCard('Last 7 days', mins(weekMin), 'target ' + mins((num(state.settings.dailyTarget) || 105) * 7)),
    statCard('Active days', days.size, 'since ' + fmtShort(state.settings.startDate)),
    statCard('Current streak', '🔥 ' + streak(), 'consecutive'),
    statCard('Tasks completed', tasksAll.filter((t) => t.done).length, 'of ' + tasksAll.length + ' planned'),
    statCard('Readiness', readiness().pct + '%', 'personal metric')
  ].join('');

  /* heatmap: 26 weeks ending this week, Monday-first rows */
  const cells = [];
  const end = weekKey(today());
  const start = addDays(end, -7 * 25);
  for (let w = 0; w < 26; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const m = sessionMinutes(date);
      let lvl = 0;
      if (m > 0) lvl = m < 30 ? 1 : m < 75 ? 2 : m < 150 ? 3 : 4;
      else if (days.has(date)) lvl = 1;
      cells.push({ date, m, lvl });
    }
  }
  /* grid is column-per-week with 7 rows, so order by day within week */
  const ordered = [];
  for (let w = 0; w < 26; w++) for (let d = 0; d < 7; d++) ordered.push(cells[w * 7 + d]);
  $('#studyHeatmap').innerHTML = ordered.map((c) =>
    '<span class="heat-cell l' + c.lvl + '" title="' + c.date + ': ' + mins(c.m) + '"></span>').join('');

  const byFocus = minutesByFocus();
  const keys = Object.keys(byFocus);
  if (keys.length) {
    chart('skillChart', {
      type: 'bar',
      data: { labels: keys, datasets: [{ label: 'Minutes', data: keys.map((k) => byFocus[k]), backgroundColor: cssVar('--violet') }] },
      options: { plugins: { legend: { display: false } } }
    });
  }
  const weeks = {};
  state.studySessions.forEach((s) => { const k = weekKey(s.date); weeks[k] = (weeks[k] || 0) + (num(s.minutes) || 0); });
  const wk = Object.keys(weeks).sort().slice(-10);
  if (wk.length) {
    chart('hoursChart', {
      type: 'bar',
      data: {
        labels: wk.map((k) => 'w/c ' + fmtShort(k)),
        datasets: [
          { label: 'Hours', data: wk.map((k) => Math.round(weeks[k] / 6) / 10), backgroundColor: cssVar('--cyan') }
        ]
      },
      options: { plugins: { legend: { display: false } } }
    });
  }

  $('#weeklyReport').innerHTML = reportRows(weeklyReport());
  $('#monthlyReport').innerHTML = reportRows(monthlyReport());
  renderTargets();
  renderAchievements();
}
function reportRows(rows) {
  return rows.map((r) => '<div class="report-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('');
}
function scoreChange(from) {
  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => s.date >= from && overallBand(s) !== null)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (pool.length < 2) return null;
  return overallBand(pool[pool.length - 1]) - overallBand(pool[0]);
}
function modChange(mod, from) {
  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => s.date >= from && num(s[mod]) !== null)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (pool.length < 2) return null;
  return num(pool[pool.length - 1][mod]) - num(pool[0][mod]);
}
const sign = (v) => (v == null ? 'no data' : (v > 0 ? '+' : '') + v.toFixed(1));

function weeklyReport() {
  const from = addDays(today(), -7);
  const sessions = state.studySessions.filter((s) => s.date >= from);
  const minutes = sessions.reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const tasks = Object.keys(state.dailyTasks).filter((d) => d >= from).map((d) => state.dailyTasks[d]).flat();
  const pri = modulePriority();
  const mods = MODULES.map((m) => [MOD_LABEL[m] + ' change', sign(modChange(m, from))]);
  const best = MODULES.map((m) => ({ m, v: modChange(m, from) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v)[0];
  return [
    ['Week starting', fmtDate(from)],
    ['Overall band change', sign(scoreChange(from))],
    ...mods,
    ['German words added', String(state.germanVocabulary.filter((v) => v.dateAdded >= from).length)],
    ['Vocabulary added', String(state.ieltsVocabulary.filter((v) => v.dateAdded >= from).length)],
    ['Study time', mins(minutes)],
    ['Tasks completed', tasks.filter((t) => t.done).length + ' of ' + tasks.length],
    ['Mistakes logged', String(allMistakes().filter((m) => m.date >= from).length)],
    ['Strongest improvement', best && best.v > 0 ? MOD_LABEL[best.m] + ' ' + sign(best.v) : 'not enough data'],
    ['Biggest weakness', pri[0].label + ' (gap ' + sign(pri[0].gap.gap) + ')'],
    ['Next week priority', pri[0].label + ' then ' + pri[1].label]
  ];
}
function monthlyReport() {
  const from = addDays(today(), -30);
  const sessions = state.studySessions.filter((s) => s.date >= from);
  const minutes = sessions.reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const cur = currentScores(), tgt = targets();
  const pool = state.ieltsScores.concat(state.fltTests).filter((s) => overallBand(s) !== null).sort((a, b) => (a.date > b.date ? 1 : -1));
  const days = activeDays();
  let active = 0; for (let i = 0; i < 30; i++) if (days.has(addDays(today(), -i))) active++;
  const flts = state.fltTests.filter((f) => f.date >= from && overallBand(f) !== null);
  return [
    ['Period', fmtDate(from) + ' → ' + fmtDate(today())],
    ['Starting overall', pool.length ? overallBand(pool[0]).toFixed(1) : DB.PROFILE.baselineRange.overall],
    ['Current overall', cur.overall.toFixed(1)],
    ['Target', tgt.overall.toFixed(1)],
    ['Gap', (tgt.overall - cur.overall).toFixed(1)],
    ['Improvement (30 days)', sign(scoreChange(from))],
    ['Consistency', active + ' of 30 days'],
    ['Study time', mins(minutes)],
    ['FLTs completed', String(flts.length)],
    ['Vocabulary total', String(state.ieltsVocabulary.length)],
    ['German level', state.settings.germanLevel + ' → ' + state.settings.germanTarget],
    ['Recommendation', monthlyAdvice()]
  ];
}
function monthlyAdvice() {
  const pri = modulePriority();
  const st = streak();
  if (st < 4) return 'Consistency first: hit four consecutive days before adding new material.';
  if (pri[0].gap.gap >= 1.5) return 'Spend the next month almost entirely on ' + pri[0].label + '. Breadth is not your problem.';
  if (!state.fltTests.length) return 'Log a full length test. Without one, all estimates here are partial.';
  return 'Hold the current plan and increase timed practice under exam conditions.';
}

function renderTargets() {
  const k = weekKey(today());
  if (!state.weeklyTargets[k]) {
    const t = targets(), cur = currentScores();
    state.weeklyTargets[k] = {
      reading: Math.min(t.reading, Math.round((cur.reading + 0.5) * 2) / 2),
      writing: Math.min(t.writing, Math.round((cur.writing + 0.5) * 2) / 2),
      listening: Math.min(t.listening, Math.round((cur.listening + 0.5) * 2) / 2),
      speaking: Math.min(t.speaking, Math.round((cur.speaking + 0.5) * 2) / 2),
      germanWords: 50,
      hours: Math.round((num(state.settings.dailyTarget) || 105) * 7 / 60)
    };
    save();
  }
  const w = state.weeklyTargets[k];
  const doneWords = state.germanVocabulary.filter((v) => v.dateAdded >= k).length;
  const doneHours = Math.round(state.studySessions.filter((s) => s.date >= k).reduce((a, s) => a + (num(s.minutes) || 0), 0) / 6) / 10;
  const rows = [
    ['Reading', w.reading, currentScores().reading],
    ['Writing', w.writing, currentScores().writing],
    ['Listening', w.listening, currentScores().listening],
    ['Speaking', w.speaking, currentScores().speaking]
  ];
  $('#weeklyTargets').innerHTML =
    '<p class="muted small">Week of ' + fmtDate(k) + '</p>' +
    rows.map((r) => '<div class="target-row"><span class="t-name">' + r[0] + '</span><span class="t-val">target ' + Number(r[1]).toFixed(1) +
      '</span><span class="grow muted small">current ' + Number(r[2]).toFixed(1) + '</span>' +
      (r[2] >= r[1] ? '<span class="pill pill-ok">met</span>' : '<span class="pill pill-med">open</span>') + '</div>').join('') +
    '<div class="target-row"><span class="t-name">German words</span><span class="t-val">' + w.germanWords +
      '</span><span class="grow muted small">' + doneWords + ' added this week</span>' +
      (doneWords >= w.germanWords ? '<span class="pill pill-ok">met</span>' : '<span class="pill pill-med">open</span>') + '</div>' +
    '<div class="target-row"><span class="t-name">Study hours</span><span class="t-val">' + w.hours +
      '</span><span class="grow muted small">' + doneHours + 'h logged</span>' +
      (doneHours >= w.hours ? '<span class="pill pill-ok">met</span>' : '<span class="pill pill-med">open</span>') + '</div>';
}
function editTargets() {
  const k = weekKey(today());
  const w = state.weeklyTargets[k];
  const fields = [
    { name: 'reading', label: 'Reading target', type: 'number', step: 0.5, min: 4, max: 9 },
    { name: 'writing', label: 'Writing target', type: 'number', step: 0.5, min: 4, max: 9 },
    { name: 'listening', label: 'Listening target', type: 'number', step: 0.5, min: 4, max: 9 },
    { name: 'speaking', label: 'Speaking target', type: 'number', step: 0.5, min: 4, max: 9 },
    { name: 'germanWords', label: 'German words', type: 'number', step: 5, min: 0 },
    { name: 'hours', label: 'Study hours', type: 'number', step: 1, min: 0 }
  ];
  openModal('This week\'s targets',
    '<form id="entityForm" class="form-grid">' + fields.map((f) => fieldHtml(f, w[f.name])).join('') + '</form>',
    '<button class="btn" id="formCancel">Cancel</button><button class="btn btn-primary" id="formSave">Save</button>',
    () => {
      const data = {};
      new FormData($('#entityForm')).forEach((v, kk) => { data[kk] = num(v); });
      state.weeklyTargets[k] = Object.assign({}, w, data);
      save(); renderAnalytics(); closeModal();
      toast('Weekly targets updated.', 'good');
      return true;
    });
}

/* ---------------- achievements ---------------- */
function checkAchievements() {
  const cur = currentScores();
  const best = (mod) => {
    const vals = state.ieltsScores.concat(state.fltTests).map((s) => num(s[mod])).filter((v) => v !== null);
    return vals.length ? Math.max(...vals) : cur[mod];
  };
  const totalMin = state.studySessions.reduce((a, s) => a + (num(s.minutes) || 0), 0);
  const a1 = DB.LESSONS.map((l, k) => (l.level === 'A1' ? k : -1)).filter((k) => k > -1);
  const tests = { firstFlt: state.fltTests.some((f) => overallBand(f) !== null),
    readingBreak: best('reading') >= 6.5, reading7: best('reading') >= 7,
    writingBreak: best('writing') >= 7, listening8: best('listening') >= 8,
    overall7: state.ieltsScores.concat(state.fltTests).some((s) => (overallBand(s) || 0) >= 7),
    streak7: streak() >= 7, streak30: streak() >= 30,
    a1done: a1.every((k) => state.german.completed.includes(k)),
    vocab500: state.ieltsVocabulary.length >= 500, german300: state.germanVocabulary.length >= 300,
    mistakes50: allMistakes().length >= 50, hours100: totalMin >= 6000,
    uni5: state.universities.length >= 5,
    docsHalf: state.documents.filter((d) => d.status === 'Completed').length >= Math.ceil(state.documents.length / 2) };
  let gained = null;
  DB.ACHIEVEMENTS.forEach((a) => {
    if (tests[a.id] && !state.achievements.includes(a.id)) { state.achievements.push(a.id); gained = a; }
  });
  if (gained) { save(); toast('Achievement unlocked: ' + gained.title, 'good'); }
}
function renderAchievements() {
  $('#achievements').innerHTML = DB.ACHIEVEMENTS.map((a) =>
    '<div class="ach' + (state.achievements.includes(a.id) ? ' is-on' : '') + '"><b>' + esc(a.title) + '</b>' +
    '<small>' + esc(a.desc) + '</small></div>').join('');
}

/* ---------------- calendar ---------------- */
let calMonth = today().slice(0, 7);
function renderCalendar() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  $('#calTitle').textContent = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const lead = (first.getDay() + 6) % 7;
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let html = dows.map((d) => '<div class="cal-dow">' + d + '</div>').join('');
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell is-blank"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const date = calMonth + '-' + String(d).padStart(2, '0');
    const dow = new Date(date + 'T00:00:00').getDay();
    const dots = [];
    if (dow === 6) dots.push(saturdayKind(date) === 'FLT' ? 'flt' : 'review');
    else if (dow === 0) dots.push('rest');
    else dots.push('ielts');
    if (sessionMinutes(date) > 0) dots.push('study');
    if (state.germanVocabulary.some((v) => v.dateAdded === date) || state.studySessions.some((s) => s.date === date && s.focus === 'German')) dots.push('german');
    if (state.fltTests.some((f) => f.date === date)) dots.push('flt');
    if (state.universities.some((u) => u.deadline === date)) dots.push('germany');
    const notes = [];
    if (state.ieltsScores.some((s) => s.date === date)) notes.push('score');
    if (state.checkins[date]) notes.push('check-in');
    html += '<div class="cal-cell' + (date === today() ? ' is-today' : '') + '" data-cal="' + date + '">' +
      '<span class="cd">' + d + '</span>' +
      '<span class="cal-dots">' + [...new Set(dots)].map((x) => '<i class="lg-' + x + '" style="background:' + dotColor(x) + '"></i>').join('') + '</span>' +
      (notes.length ? '<span class="cal-note">' + notes.join(', ') + '</span>' : '') + '</div>';
  }
  $('#calGrid').innerHTML = html;
}
function dotColor(kind) {
  return { ielts: cssVar('--violet'), study: cssVar('--cyan'), german: '#F472B6', flt: cssVar('--warn'),
    review: cssVar('--good'), germany: '#60A5FA', rest: cssVar('--muted') }[kind] || cssVar('--muted');
}
function showCalDay(date) {
  const dow = new Date(date + 'T00:00:00').getDay();
  const cls = dow === 6 ? saturdayKind(date) : DB.CLASSES[dow].name;
  const tasks = state.dailyTasks[date] || [];
  const sess = state.studySessions.filter((s) => s.date === date);
  const scores = state.ieltsScores.filter((s) => s.date === date);
  const flts = state.fltTests.filter((f) => f.date === date);
  const words = state.ieltsVocabulary.filter((v) => v.dateAdded === date).length +
                state.germanVocabulary.filter((v) => v.dateAdded === date).length;
  const ci = state.checkins[date];
  const el = $('#calDetail');
  el.hidden = false;
  el.innerHTML = '<h3>' + fmtDate(date) + '</h3>' +
    '<div class="report-row"><span>IELTS class</span><b>' + esc(cls) + '</b></div>' +
    '<div class="report-row"><span>Study time</span><b>' + mins(sessionMinutes(date)) + '</b></div>' +
    '<div class="report-row"><span>Sessions</span><b>' + (sess.length ? sess.map((s) => s.focus).join(', ') : ' — ') + '</b></div>' +
    '<div class="report-row"><span>Tasks completed</span><b>' + tasks.filter((t) => t.done).length + ' / ' + tasks.length + '</b></div>' +
    '<div class="report-row"><span>Score entries</span><b>' + (scores.length + flts.length) + '</b></div>' +
    '<div class="report-row"><span>Vocabulary added</span><b>' + words + '</b></div>' +
    '<div class="report-row"><span>Check-in</span><b>' + (ci ? ci.completion + ' · productivity ' + ci.productivity : 'none') + '</b></div>';
}

/* ---------------- germany 2027 ---------------- */
function renderGermany() {
  const u = state.universities;
  const shortlisted = u.filter((x) => ['Shortlisted', 'Documents preparing', 'Applied', 'Interview', 'Accepted'].includes(x.status)).length;
  const applied = u.filter((x) => ['Applied', 'Interview', 'Accepted', 'Waitlisted'].includes(x.status)).length;
  const deadlines = u.filter((x) => x.deadline).sort((a, b) => (a.deadline > b.deadline ? 1 : -1));
  const next = deadlines.find((x) => x.deadline >= today());
  const docsDone = state.documents.filter((d) => d.status === 'Completed').length;

  $('#germanyStats').innerHTML = [
    statCard('Universities', u.length, shortlisted + ' shortlisted'),
    statCard('Applications', applied, 'submitted or beyond'),
    statCard('Next deadline', next ? fmtShort(next.deadline) : ' — ', next ? daysBetween(today(), next.deadline) + ' days · ' + esc(next.name) : 'add one'),
    statCard('Documents', docsDone + '/' + state.documents.length, Math.round(docsDone / Math.max(state.documents.length, 1) * 100) + '% complete'),
    statCard('Phase', 'Phase ' + currentPhase().n, currentPhase().title),
    statCard('IELTS readiness', readiness().pct + '%', 'personal metric')
  ].join('');

  $('#deadlineEmpty').hidden = deadlines.length > 0;
  $('#deadlineList').innerHTML = deadlines.map((x) => {
    const days = daysBetween(today(), x.deadline);
    const cls = days < 0 ? 'dot-red' : days < 15 ? 'dot-red' : days <= 30 ? 'dot-amber' : 'dot-green';
    return '<div class="deadline-row"><i class="dot ' + cls + '"></i><span class="dl-date">' + fmtShort(x.deadline) + '</span>' +
      '<span class="grow"><strong>' + esc(x.name) + '</strong> <span class="muted small">' + esc(x.program || '') + '</span></span>' +
      '<span class="tag">' + esc(x.status || 'Researching') + '</span>' +
      '<span class="muted small">' + (days < 0 ? Math.abs(days) + ' days ago' : days + ' days left') + '</span></div>';
  }).join('');

  const p = currentPhase();
  $('#phaseList').innerHTML = DB.PHASES.map((x) =>
    '<div class="phase-row' + (x.n === p.n ? ' is-now' : '') + '"><span class="tag">Phase ' + x.n + '</span>' +
    '<span class="grow"><strong>' + esc(x.title) + '</strong><div class="muted small">' + esc(x.focus) + '</div></span>' +
    '<span class="muted small">' + esc(x.split) + '</span></div>').join('');

  renderList('universities');
}

/* ---------------- documents + notes ---------------- */
function renderDocuments() {
  const docs = state.documents.slice().sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : String(a.category).localeCompare(String(b.category))));
  const done = docs.filter((d) => d.status === 'Completed').length;
  $('#docProgress').textContent = Math.round(done / Math.max(docs.length, 1) * 100) + '% complete';
  $('#docList').innerHTML = docs.length ? docs.map((d) =>
    '<div class="doc-row"><span class="tag">' + esc(d.category || ' — ') + '</span>' +
    '<span class="doc-name">' + esc(d.name) + (d.dueDate ? '<div class="muted small">by ' + fmtShort(d.dueDate) + '</div>' : '') + '</span>' +
    '<select data-docstatus="' + d.id + '">' + ['Not started', 'In progress', 'Completed'].map((s) =>
      '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
    '<button class="btn btn-sm" data-edit="documents" data-id="' + d.id + '">Edit</button></div>').join('')
    : '<p class="empty-inline">No documents in the checklist.</p>';

  const notes = getList('notes');
  $('#noteGrid').innerHTML = notes.length ? notes.map((n) =>
    '<article class="note-card"><h4>' + esc(n.title) + '</h4>' +
    '<div class="res-meta"><span class="tag">' + esc(n.category || 'General') + '</span>' +
      (n.tags ? n.tags.split(',').filter(Boolean).map((t) => '<span class="tag">' + esc(t.trim()) + '</span>').join('') : '') + '</div>' +
    '<div class="note-body">' + mdLite(n.body) + '</div>' +
    '<div class="res-actions"><button class="btn btn-sm" data-edit="notes" data-id="' + n.id + '">Open</button>' +
    '<button class="btn btn-sm" data-del="notes" data-id="' + n.id + '">Delete</button></div></article>').join('')
    : '<p class="empty-inline">No notes yet. Keep grammar rules, essay templates and application details here.</p>';
  icons();
}

/* ---------------- settings ---------------- */
function renderSettings() {
  const f = $('#settingsForm');
  Object.keys(state.settings).forEach((k) => { if (f.elements[k]) f.elements[k].value = state.settings[k]; });
  const bytes = (() => { try { return new Blob([JSON.stringify(state)]).size; } catch (e) { return 0; } })();
  $('#storageInfo').innerHTML =
    '<div class="kv"><span>Storage engine</span><b>' + (Store.usingIdb() ? 'IndexedDB' : 'localStorage fallback') + '</b></div>' +
    '<div class="kv"><span>Data size</span><b>' + (bytes / 1024).toFixed(1) + ' KB</b></div>' +
    '<div class="kv"><span>Audio recordings</span><b>' + recordings.length + '</b></div>' +
    '<div class="kv"><span>Records</span><b>' + Object.keys(DB.SCHEMAS).reduce((a, k) => a + (state[k] || []).length, 0) + '</b></div>' +
    '<p class="fineprint">Everything is stored in this browser on this device. Clearing site data removes it. Download a JSON backup from Import / Export regularly.</p>';
}

/* =========================================================
   6. REPORTS, PDF, IMPORT / EXPORT
   ========================================================= */
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function ensurePdfLib() {
  if (!window.jspdf) await loadScript(JSPDF_URL);
  if (!window.jspdf) throw new Error('jsPDF unavailable');
  if (!window.jspdf.jsPDF.API.autoTable) await loadScript(AUTOTABLE_URL);
  return window.jspdf.jsPDF;
}

function pdfHeader(doc, title, subtitle) {
  doc.setFillColor(11, 16, 32);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(title, 14, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(190, 200, 230);
  doc.text((state.settings.name || 'Pratham Sukhadia') + ' · ' + (subtitle || '') + ' · generated ' + fmtDate(today()), 14, 19);
  doc.setTextColor(20, 20, 20);
  return 34;
}
function pdfFooter(doc) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(130, 140, 165);
    doc.text('IELTS 7.0+ · German A1 → B1 · Germany 2027', 14, 289);
    doc.text('Page ' + i + ' of ' + pages, 196, 289, { align: 'right' });
  }
}
function pdfTable(doc, y, head, body) {
  doc.autoTable({
    startY: y, head: [head], body,
    styles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak' },
    headStyles: { fillColor: [124, 92, 255], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 246, 252] },
    margin: { left: 14, right: 14 }
  });
  return doc.lastAutoTable.finalY + 8;
}
function pdfKeyValues(doc, y, rows, title) {
  if (title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, 14, y); y += 4; }
  return pdfTable(doc, y, ['Item', 'Value'], rows.map((r) => [r[0], String(r[1])]));
}
function chartImage(id) {
  const c = charts[id];
  try { return c ? c.toBase64Image() : null; } catch (e) { return null; }
}

async function exportPdf(kind) {
  let JsPDF;
  try { JsPDF = await ensurePdfLib(); }
  catch (e) { return toast('Could not load the PDF library. Check your connection and try again.', 'bad'); }
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const cur = currentScores(), tgt = targets();
  let y;

  const scoreRows = () => state.ieltsScores.slice().sort((a, b) => (a.date > b.date ? 1 : -1)).map((s) =>
    [fmtShort(s.date), s.test || ' — ', s.listening ?? ' — ', s.reading ?? ' — ', s.writing ?? ' — ', s.speaking ?? ' — ',
      overallBand(s) == null ? ' — ' : overallBand(s).toFixed(1)]);

  switch (kind) {
    case 'scores':
      y = pdfHeader(doc, 'IELTS score history', 'Score tracker');
      y = pdfKeyValues(doc, y, MODULES.map((m) => [MOD_LABEL[m] + ' (current → target)', cur[m].toFixed(1) + ' → ' + tgt[m].toFixed(1)])
        .concat([['Estimated overall', cur.overall.toFixed(1)], ['Exam date', fmtDate(state.settings.examDate)]]), 'Summary');
      if (state.ieltsScores.length) y = pdfTable(doc, y, ['Date', 'Test', 'L', 'R', 'W', 'S', 'Overall'], scoreRows());
      else doc.text('No score entries recorded yet.', 14, y);
      break;
    case 'vocab':
      y = pdfHeader(doc, 'Academic vocabulary', state.ieltsVocabulary.length + ' words');
      y = pdfTable(doc, y, ['Word', 'Meaning', 'Synonyms', 'Mastery'],
        getList('ieltsVocabulary').map((v) => [v.word, v.meaning || '', v.synonyms || '', v.mastery || 'New']));
      break;
    case 'germanVocab':
      y = pdfHeader(doc, 'German vocabulary', state.germanVocabulary.length + ' words · level ' + state.settings.germanLevel);
      y = pdfTable(doc, y, ['German', 'Meaning', 'Plural', 'IPA', 'Level', 'Mastery'],
        getList('germanVocabulary').map((v) => [(v.article ? v.article + ' ' : '') + v.word, v.meaning || '', v.plural || '', v.ipa || '', v.level || '', v.mastery || 'New']));
      break;
    case 'pronunciation':
      y = pdfHeader(doc, 'German pronunciation notebook', state.pronunciation.length + ' entries');
      y = pdfTable(doc, y, ['Word', 'IPA', 'English approximation', 'Meaning'],
        getList('pronunciation').map((p) => [p.word, p.ipa || '', p.english || '', p.meaning || '']));
      y = pdfTable(doc, y, ['Sound', 'IPA', 'How to say it'], DB.SOUNDS.map((s) => [s[0], s[1], s[2]]));
      break;
    case 'flt':
      y = pdfHeader(doc, 'Full length test history', state.fltTests.length + ' tests');
      y = pdfTable(doc, y, ['#', 'Date', 'Source', 'L', 'R', 'W', 'S', 'Overall', 'Status'],
        getList('fltTests').map((f) => [f.number ?? ' — ', fmtShort(f.date), f.source || ' — ', f.listening ?? ' — ',
          f.reading ?? ' — ', f.writing ?? ' — ', f.speaking ?? ' — ', overallBand(f) == null ? ' — ' : overallBand(f).toFixed(1), f.status || ' — ']));
      break;
    case 'weekly':
      y = pdfHeader(doc, 'Weekly report', 'Week to ' + fmtDate(today()));
      y = pdfKeyValues(doc, y, weeklyReport());
      break;
    case 'monthly':
      y = pdfHeader(doc, 'Monthly progress report', 'Last 30 days');
      y = pdfKeyValues(doc, y, monthlyReport());
      break;
    case 'germany':
      y = pdfHeader(doc, 'Germany 2027 preparation report', 'Applications and documents');
      y = pdfKeyValues(doc, y, [['Phase', 'Phase ' + currentPhase().n + ' — ' + currentPhase().title],
        ['German level', state.settings.germanLevel + ' → ' + state.settings.germanTarget],
        ['IELTS estimate', cur.overall.toFixed(1) + ' (target ' + tgt.overall.toFixed(1) + ')'],
        ['Universities tracked', state.universities.length],
        ['Documents completed', state.documents.filter((d) => d.status === 'Completed').length + ' of ' + state.documents.length]], 'Summary');
      if (state.universities.length) {
        y = pdfTable(doc, y, ['University', 'Program', 'City', 'Language', 'IELTS', 'Deadline', 'Status'],
          getList('universities').map((u) => [u.name, u.program || '', u.city || '', u.language || '', u.ieltsReq ?? '', u.deadline ? fmtShort(u.deadline) : '', u.status || '']));
      }
      y = pdfTable(doc, y, ['Document', 'Category', 'Status'], state.documents.map((d) => [d.name, d.category || '', d.status || '']));
      break;
    case 'complete': {
      y = pdfHeader(doc, 'Complete progress report', 'IELTS + German + Germany 2027');
      y = pdfKeyValues(doc, y, [
        ['Readiness', readiness().pct + '%'],
        ['Estimated overall', cur.overall.toFixed(1) + ' / target ' + tgt.overall.toFixed(1)],
        ...MODULES.map((m) => [MOD_LABEL[m], cur[m].toFixed(1) + ' → ' + tgt[m].toFixed(1) + ' (gap ' + gapInfo(m).gap.toFixed(1) + ')']),
        ['Exam date', fmtDate(state.settings.examDate) + ' · ' + Math.max(countdownDays(), 0) + ' days'],
        ['Study streak', streak() + ' days'],
        ['Total study time', mins(state.studySessions.reduce((a, s) => a + (num(s.minutes) || 0), 0))],
        ['German level', state.settings.germanLevel + ' · ' + state.germanVocabulary.length + ' words'],
        ['Vocabulary', state.ieltsVocabulary.length + ' words'],
        ['Mistakes logged', allMistakes().length]
      ], 'Headline numbers');
      const img = chartImage('dashChart') || chartImage('overallChart');
      if (img) {
        if (y > 200) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Overall band trend', 14, y);
        doc.addImage(img, 'PNG', 14, y + 3, 182, 70); y += 80;
      }
      if (state.ieltsScores.length) { doc.addPage(); y = 20; y = pdfTable(doc, y, ['Date', 'Test', 'L', 'R', 'W', 'S', 'Overall'], scoreRows()); }
      y = pdfKeyValues(doc, y > 240 ? (doc.addPage(), 20) : y, weeklyReport(), 'Weekly report');
      y = pdfKeyValues(doc, y > 220 ? (doc.addPage(), 20) : y, monthlyReport(), 'Monthly report');
      break;
    }
    default: return;
  }
  pdfFooter(doc);
  doc.save('pratham-' + kind + '-' + today() + '.pdf');
  toast('PDF exported.', 'good');
}

/* ---------------- PDF import ---------------- */
let importCandidates = [];
async function importPdf(file) {
  const review = $('#importReview');
  review.hidden = false;
  review.innerHTML = '<p class="muted small">Reading ' + esc(file.name) + '…</p>';
  let text = '';
  try {
    if (!window.pdfjsLib) await loadScript(PDFJS_URL);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((i) => i.str).join(' ') + '\n';
    }
  } catch (e) {
    review.innerHTML = '<p class="empty-inline">This PDF could not be read in the browser. It may be a scanned image, which needs OCR. Nothing was changed.</p>';
    return;
  }
  importCandidates = parseImport(text);
  if (!importCandidates.length) {
    review.innerHTML = '<p class="empty-inline">No scores or vocabulary patterns were detected. You can still store the text as a note.</p>' +
      '<div class="card-actions"><button class="btn" id="importAsNote">Save the text as a note</button></div>';
    review.dataset.raw = text.slice(0, 20000);
    icons();
    return;
  }
  review.dataset.raw = text.slice(0, 20000);
  review.innerHTML = '<p class="import-head"><strong>' + importCandidates.length + ' items detected.</strong> Nothing is saved until you confirm.</p>' +
    '<div class="import-list">' + importCandidates.map((c, i) =>
      '<label class="import-item"><input type="checkbox" data-imp="' + i + '" checked>' +
      '<span><strong>' + esc(c.kindLabel) + '</strong> — ' + esc(c.summary) + '</span></label>').join('') + '</div>' +
    '<div class="card-actions"><button class="btn btn-primary" id="importConfirm">Confirm import</button>' +
    '<button class="btn" id="importCancel">Cancel</button>' +
    '<button class="btn" id="importAsNote">Also save raw text as a note</button></div>';
  icons();
}
function parseImport(text) {
  const out = [];
  const clean = text.replace(/\r/g, '');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  /* module scores stated on one page, e.g. "Listening 7.5 Reading 6.0 Writing 6.5 Speaking 6.5" */
  const grab = (name) => {
    const re = new RegExp(name + '\\s*[:\\-]?\\s*(\\d(?:\\.\\d)?)', 'i');
    const m = clean.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  const l = grab('listening'), r = grab('reading'), w = grab('writing'), s = grab('speaking');
  if ([l, r, w, s].filter((v) => v !== null).length >= 3) {
    const dm = clean.match(/(\d{1,2})[\/.\s-](\d{1,2}|[A-Za-z]{3,9})[\/.\s-](\d{2,4})/);
    let date = today();
    if (dm) { const p = new Date(dm[0].replace(/\s+/g, ' ')); if (!isNaN(p)) date = iso(p); }
    out.push({
      kind: 'ieltsScores', kindLabel: 'IELTS score',
      summary: 'L ' + (l ?? ' — ') + ' · R ' + (r ?? ' — ') + ' · W ' + (w ?? ' — ') + ' · S ' + (s ?? ' — ') + ' on ' + fmtShort(date),
      data: { date, test: 'Imported from PDF', source: 'PDF import', listening: l, reading: r, writing: w, speaking: s, notes: '' }
    });
  }

  /* compact rows: "L 7 R 5.5 W 6 S 6.5" */
  lines.forEach((line) => {
    const m = line.match(/\bL\s*[:\-]?\s*(\d(?:\.\d)?)\D{1,6}R\s*[:\-]?\s*(\d(?:\.\d)?)\D{1,6}W\s*[:\-]?\s*(\d(?:\.\d)?)\D{1,6}S\s*[:\-]?\s*(\d(?:\.\d)?)/i);
    if (m) {
      out.push({
        kind: 'ieltsScores', kindLabel: 'IELTS score row',
        summary: 'L ' + m[1] + ' · R ' + m[2] + ' · W ' + m[3] + ' · S ' + m[4],
        data: { date: today(), test: 'Imported row', source: 'PDF import', listening: +m[1], reading: +m[2], writing: +m[3], speaking: +m[4] }
      });
    }
  });

  /* vocabulary lines: "word - meaning" or "word: meaning" */
  const seen = new Set();
  lines.forEach((line) => {
    const m = line.match(/^([A-Za-zÃ„Ã–ÃœÃ¤Ã¶Ã¼ÃŸ][A-Za-zÃ„Ã–ÃœÃ¤Ã¶Ã¼ÃŸ''\- ]{1,28})\s*[– — \-:=]\s*(.{3,90})$/);
    if (!m) return;
    const word = m[1].trim(), meaning = m[2].trim();
    if (word.split(' ').length > 3) return;
    if (/^(page|date|name|score|test|total|section|part)$/i.test(word)) return;
    const key = word.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const german = /[Ã„Ã–ÃœÃ¤Ã¶Ã¼ÃŸ]/.test(word) || /^(der|die|das)\s/i.test(word);
    out.push({
      kind: german ? 'germanVocabulary' : 'ieltsVocabulary',
      kindLabel: german ? 'German word' : 'Vocabulary',
      summary: word + ' — ' + meaning.slice(0, 60),
      data: german
        ? { word: word.replace(/^(der|die|das)\s+/i, ''), article: (word.match(/^(der|die|das)\s/i) || [''])[0].trim().toLowerCase(),
            meaning, level: state.settings.germanLevel, mastery: 'New', dateAdded: today() }
        : { word, meaning, mastery: 'New', dateAdded: today() }
    });
  });
  return out.slice(0, 300);
}
function confirmImport() {
  const picked = $$('[data-imp]').filter((c) => c.checked).map((c) => importCandidates[+c.dataset.imp]);
  let added = 0;
  picked.forEach((c) => {
    const row = Object.assign({ id: uid() }, c.data);
    if (c.kind === 'ieltsVocabulary' || c.kind === 'germanVocabulary') {
      const dup = state[c.kind].some((x) => (x.word || '').toLowerCase() === (row.word || '').toLowerCase());
      if (dup) return;
      row.srs = { due: today(), interval: 0, ease: 2.4 };
    }
    state[c.kind].unshift(row);
    added++;
  });
  save(); checkAchievements(); renderCurrent();
  $('#importReview').hidden = true;
  toast(added + ' items imported. Nothing existing was overwritten.', 'good');
}

/* ---------------- backup / restore ---------------- */
function backup() {
  const payload = JSON.parse(JSON.stringify(state));
  payload._exported = new Date().toISOString();
  payload._note = 'Audio recordings are stored separately and are not included in this file.';
  download('pratham-study-backup-' + today() + '.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup downloaded.', 'good');
}
async function restore(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !parsed.settings) throw new Error('bad file');
    if (!confirm('Restore this backup? It replaces the data currently in this browser.')) return;
    state = deepMerge(blankState(), parsed);
    await save(true);
    applyTheme();
    renderCurrent();
    toast('Backup restored.', 'good');
  } catch (e) {
    toast('That file is not a valid backup. Nothing was changed.', 'bad');
  }
}

/* ---------------- daily score logger ---------------- */
function renderScoreLogger() {
  const t = today();
  const d = new Date(t + 'T00:00:00');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[d.getDay()];
  const cls = DB.CLASSES[d.getDay()];

  /* auto-detect module from today's class */
  const classModule = (cls.name || '').split(' ')[0];
  const moduleMap = { 'Writing': 'Writing', 'Speaking': 'Speaking', 'Listening': 'Listening', 'Reading': 'Reading', 'FLT': 'Reading', 'Recovery': 'Reading' };
  const suggestedModule = moduleMap[classModule] || 'Reading';

  /* quick log form */
  const slForm = $('#slForm');
  if (slForm) {
    const dateInput = slForm.querySelector('[name="slDate"]');
    const dayInput = slForm.querySelector('[name="slDay"]');
    const moduleInput = slForm.querySelector('[name="slModule"]');
    if (dateInput && !dateInput.value) dateInput.value = t;
    if (dayInput) dayInput.value = dayName;
    if (moduleInput && !moduleInput.dataset.userSet) moduleInput.value = suggestedModule;
  }

  $('#slTodayInfo').innerHTML = '<strong>' + dayName + '</strong>, ' +
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · Class: <strong>' + esc(cls.name) + '</strong>';

  /* today's logs */
  const todayLogs = (state.dailyScores || []).filter((s) => s.date === t);
  const todayEl = $('#slTodayLogs');
  if (todayLogs.length) {
    todayEl.innerHTML = todayLogs.map((s) =>
      '<div class="target-row"><span class="t-name">' + esc(s.module) + '</span>' +
      '<span class="t-val">' + (num(s.band) != null ? num(s.band).toFixed(1) : '—') + '</span>' +
      '<span class="grow muted small">' + esc(s.source || '') + (s.topic ? ' · ' + esc(s.topic) : '') + '</span>' +
      '<div class="row-actions"><button data-del="dailyScores" data-id="' + s.id + '" aria-label="Delete"><i data-lucide="trash-2"></i></button></div></div>').join('');
  } else {
    todayEl.innerHTML = '<p class="empty-inline">No scores logged today. Log your class practice above.</p>';
  }

  /* this week's summary */
  const weekStart = addDays(t, -(d.getDay() === 0 ? 6 : d.getDay() - 1));
  const weekScores = (state.dailyScores || []).filter((s) => s.date >= weekStart && s.date <= t);
  const weekEl = $('#slWeekSummary');
  if (weekScores.length) {
    const byDay = {};
    weekScores.forEach((s) => {
      const key = s.date;
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(s);
    });
    weekEl.innerHTML = Object.keys(byDay).sort().map((date) => {
      const dd = new Date(date + 'T00:00:00');
      return '<div class="tl-row"><span class="tl-time">' + dayNames[dd.getDay()].slice(0, 3) + ' ' + dd.getDate() + '</span>' +
        '<span>' + byDay[date].map((s) => '<span class="chip chip-soft">' + esc(s.module) + ' ' + (num(s.band) != null ? num(s.band).toFixed(1) : '—') + '</span>').join(' ') + '</span></div>';
    }).join('');
  } else {
    weekEl.innerHTML = '<p class="empty-inline">No scores this week yet.</p>';
  }

  /* stats */
  const allScores = state.dailyScores || [];
  const weekBands = weekScores.map((s) => num(s.band)).filter(Boolean);
  const avgWeek = weekBands.length ? (weekBands.reduce((a, b) => a + b, 0) / weekBands.length).toFixed(1) : '—';
  const bestWeek = weekBands.length ? Math.max(...weekBands).toFixed(1) : '—';
  const modCounts = {};
  weekScores.forEach((s) => { modCounts[s.module] = (modCounts[s.module] || 0) + 1; });
  const topMod = Object.keys(modCounts).sort((a, b) => modCounts[b] - modCounts[a])[0] || '—';

  $('#slStats').innerHTML = [
    statCard('Total logs', allScores.length, 'all time'),
    statCard('This week', weekScores.length, 'entries'),
    statCard('Avg band (week)', avgWeek, 'this week average'),
    statCard('Best (week)', bestWeek, 'highest this week'),
    statCard('Most practised', topMod, 'this week')
  ].join('');

  /* vocab quick log — words added today */
  const vocabToday = state.ieltsVocabulary.filter((v) => v.dateAdded === t).length +
                     state.germanVocabulary.filter((v) => v.dateAdded === t).length;
  $('#slVocabCount').textContent = vocabToday + ' word' + (vocabToday !== 1 ? 's' : '') + ' added today';

  /* full history */
  renderList('dailyScores');
  icons();
}

/* ---------------- live clock ---------------- */
function initLiveClock() {
  const el = $('#liveClockBrutalist');
  if (!el) return;
  function tick() {
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hh = now.getHours();
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    el.textContent = String(now.getDate()).padStart(2, '0') + ' ' + months[now.getMonth()] + ' ' + now.getFullYear() + ' | ' + String(h12).padStart(2, '0') + ':' + mm + ' ' + ampm;
  }
  tick();
  setInterval(tick, 30000);
  
  /* weekly tracker active state */
  const day = new Date().getDay();
  const trackerBtns = $$('.tracker-day');
  trackerBtns.forEach(btn => {
    if (parseInt(btn.getAttribute('data-day')) === day) {
      btn.classList.add('is-active');
    }
  });
}

/* =========================================================
   7. NAVIGATION, EVENTS, BOOT
   ========================================================= */
const RENDERERS = {
  dashboard: renderDashboard, today: renderToday, scorelogger: renderScoreLogger,
  ielts: renderIelts, reading: renderReading,
  writing: renderWriting, listening: renderListening, speaking: renderSpeaking, flt: renderFlt,
  vocab: renderVocab, german: renderGerman, pronunciation: renderPronunciation, teacher: renderTeacher,
  mistakes: renderMistakes, analytics: renderAnalytics, calendar: renderCalendar, resources: renderResources,
  germany: renderGermany, documents: renderDocuments, data: () => {}, settings: renderSettings
};
let currentView = 'dashboard';

function go(view) {
  if (!RENDERERS[view]) return;
  currentView = view;
  
  const navMap = {
    'reading': 'ielts', 'writing': 'ielts', 'listening': 'ielts', 'speaking': 'ielts', 'flt': 'ielts',
    'vocab': 'german', 'pronunciation': 'german'
  };
  const activeNav = navMap[view] || view;

  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === activeNav));
  $$('.bn-item').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === activeNav));
  
  $$('.seg-btn[data-ielts-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.ieltsTab === view));
  $$('.seg-btn[data-german-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.germanTab === view));
  
  const sidebar = $('#sidebar');
  if(sidebar) sidebar.classList.remove('is-open');
  const scrim = $('#scrim');
  if(scrim) scrim.hidden = true;
  
  window.scrollTo({ top: 0, behavior: 'auto' });
  history.replaceState(null, '', '#' + view);
  renderCurrent();
}
function renderCurrent() {
  renderChrome();
  try { RENDERERS[currentView](); } catch (e) { console.error(e); toast('Something failed while drawing this section. The data is safe.', 'bad'); }
  icons();
}
const renderAll = renderCurrent;

function renderChrome() {
  const d = countdownDays();
  $('#countdownChip').textContent = d > 0 ? d + ' days to IELTS' : d === 0 ? 'Exam today' : 'Exam passed';
  const p = currentPhase();
  $('#phaseChip').textContent = 'Phase ' + p.n + ' · ' + p.title;
  $('#missionStatus').textContent = d > 0 ? 'In progress' : 'Post-exam';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
  const btn = $('#themeBtn i');
  if (btn) btn.dataset.lucide = state.settings.theme === 'light' ? 'sun' : 'moon-star';
  icons();
  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
}

/* ---------------- library timer ---------------- */
let timerId = null;
function timerTick() {
  if (!state.timer) return;
  const el = $('#timerDisplay');
  const sec = Math.floor((Date.now() - state.timer.start) / 1000);
  if (el) el.textContent = hhmm(sec);
  const limit = num(state.timer.pomodoro);
  if (limit && sec >= limit * 60) {
    stopTimer();
    toast('Pomodoro complete. Take the break, then start the next block.', 'good');
  }
}
function startTimer() {
  let pom = $('#timerPomodoro').value;
  if (pom === 'custom') {
    const v = prompt('Custom pomodoro length in minutes:', '45');
    pom = num(v) || 0;
  }
  state.timer = { start: Date.now(), focus: $('#timerFocus').value, pomodoro: num(pom) || 0 };
  save();
  $('#timerStart').disabled = true; $('#timerStop').disabled = false;
  clearInterval(timerId); timerId = setInterval(timerTick, 1000); timerTick();
  toast('Session started: ' + state.timer.focus + '.', '');
}
function stopTimer() {
  if (!state.timer) return;
  const minutesRun = Math.max(1, Math.round((Date.now() - state.timer.start) / 60000));
  state.studySessions.unshift({
    id: uid(), date: today(), focus: state.timer.focus, minutes: minutesRun,
    task: 'Library session', productivity: 3, completed: 'Yes', notes: state.timer.pomodoro ? 'Pomodoro ' + state.timer.pomodoro + ' min' : ''
  });
  state.timer = null;
  clearInterval(timerId); timerId = null;
  $('#timerStart').disabled = false; $('#timerStop').disabled = true;
  $('#timerDisplay').textContent = '00:00';
  save(); checkAchievements(); renderCurrent();
  toast(mins(minutesRun) + ' logged.', 'good');
}
function resumeTimer() {
  if (state.timer && state.timer.start) {
    $('#timerFocus').value = state.timer.focus || 'Reading';
    $('#timerStart').disabled = true; $('#timerStop').disabled = false;
    clearInterval(timerId); timerId = setInterval(timerTick, 1000); timerTick();
  }
}

/* ---------------- command palette ---------------- */
function openPalette() {
  $('#palette').hidden = false;
  $('#paletteInput').value = '';
  $('#paletteResults').innerHTML = '<div class="pr-group">Type to search across everything</div>';
  setTimeout(() => $('#paletteInput').focus(), 40);
}
function searchAll(q) {
  const query = q.toLowerCase().trim();
  if (!query) return [];
  const hits = [];
  const push = (group, label, sub, view) => hits.push({ group, label, sub, view });
  state.ieltsVocabulary.forEach((v) => {
    if ((v.word + ' ' + (v.meaning || '') + ' ' + (v.synonyms || '')).toLowerCase().includes(query))
      push('Vocabulary', v.word, v.meaning || '', 'vocab');
  });
  state.germanVocabulary.forEach((v) => {
    if ((v.word + ' ' + (v.meaning || '')).toLowerCase().includes(query))
      push('German', (v.article ? v.article + ' ' : '') + v.word, v.meaning || '', 'german');
  });
  state.ieltsScores.forEach((s) => {
    if ((s.test + ' ' + s.date + ' ' + (s.source || '')).toLowerCase().includes(query))
      push('Scores', s.test || fmtShort(s.date), 'Overall ' + (overallBand(s) || ' — '), 'ielts');
  });
  state.fltTests.forEach((f) => {
    if (('flt ' + f.number + ' ' + f.date + ' ' + (f.source || '')).toLowerCase().includes(query))
      push('FLT', 'FLT ' + (f.number || fmtShort(f.date)), 'Overall ' + (overallBand(f) || ' — '), 'flt');
  });
  allMistakes().forEach((m) => {
    if (((m.type || '') + ' ' + (m.lesson || '') + ' ' + (m.detail || '')).toLowerCase().includes(query))
      push('Mistakes', m.type || m.src, fmtShort(m.date) + ' · ' + (m.lesson || '').slice(0, 60), 'mistakes');
  });
  state.notes.forEach((n) => {
    if ((n.title + ' ' + (n.body || '') + ' ' + (n.tags || '')).toLowerCase().includes(query))
      push('Notes', n.title, (n.category || ''), 'documents');
  });
  state.resources.forEach((r) => {
    if ((r.title + ' ' + (r.source || '') + ' ' + (r.category || '')).toLowerCase().includes(query))
      push('Resources', r.title, r.source || '', r.group === 'German' ? 'german' : 'resources');
  });
  state.universities.forEach((u) => {
    if ((u.name + ' ' + (u.program || '') + ' ' + (u.city || '')).toLowerCase().includes(query))
      push('Universities', u.name, u.program || '', 'germany');
  });
  const syn = DB.ACADEMIC[query];
  if (syn) push('Academic alternatives', syn.join(', '), 'suggested upgrades for “' + query + '”', 'vocab');
  const de = DB.CROSSLINK[query];
  if (de) push('German equivalent', de, 'cross-linked from “' + query + '”', 'german');
  return hits.slice(0, 40);
}
function renderPalette(q) {
  const hits = searchAll(q);
  const box = $('#paletteResults');
  if (!q.trim()) { box.innerHTML = '<div class="pr-group">Type to search across everything</div>'; return; }
  if (!hits.length) { box.innerHTML = '<div class="pr-group">No matches</div>'; return; }
  const groups = {};
  hits.forEach((h) => { (groups[h.group] = groups[h.group] || []).push(h); });
  box.innerHTML = Object.keys(groups).map((g) =>
    '<div class="pr-group">' + esc(g) + '</div>' + groups[g].map((h) =>
      '<div class="pr-item" data-goto="' + h.view + '"><strong>' + esc(h.label) + '</strong><small>' + esc(h.sub) + '</small></div>').join('')).join('');
}

/* ---------------- onboarding ---------------- */
function onboarding() {
  const p = DB.PROFILE;
  const body = '<p>Your mission: <strong>IELTS 7.0+ and Germany 2027</strong>. Confirm the starting numbers and the plan builds itself.</p>' +
    '<form id="entityForm" class="form-grid">' +
    fieldHtml({ name: 'examDate', label: 'IELTS exam date', type: 'date', required: true }, state.settings.examDate) +
    fieldHtml({ name: 'listening', label: 'Current listening', type: 'number', step: 0.5, min: 0, max: 9 }, p.baseline.listening) +
    fieldHtml({ name: 'reading', label: 'Current reading', type: 'number', step: 0.5, min: 0, max: 9 }, p.baseline.reading) +
    fieldHtml({ name: 'writing', label: 'Current writing', type: 'number', step: 0.5, min: 0, max: 9 }, p.baseline.writing) +
    fieldHtml({ name: 'speaking', label: 'Current speaking', type: 'number', step: 0.5, min: 0, max: 9 }, p.baseline.speaking) +
    fieldHtml({ name: 'germanLevel', label: 'German level', type: 'select', options: ['A1', 'A2', 'B1', 'B2'] }, state.settings.germanLevel) +
    fieldHtml({ name: 'mode', label: 'Usual study mode', type: 'select', options: ['full', 'normal', 'busy'] }, state.settings.mode) +
    '</form><p class="fineprint">These become your first score entry so the graphs have a starting point. Everything is editable later.</p>';
  openModal('Welcome, Pratham 👋', body,
    '<button class="btn btn-primary" id="formSave">Build my dashboard</button>', () => {
      const data = {};
      new FormData($('#entityForm')).forEach((v, k) => { data[k] = v; });
      state.settings.examDate = data.examDate;
      state.settings.germanLevel = data.germanLevel;
      state.settings.mode = data.mode;
      state.settings.dailyTarget = DB.MODES[data.mode].minutes;
      state.ieltsScores.unshift({
        id: uid(), date: today(), test: 'Baseline (self-assessed)', source: 'Onboarding',
        listening: num(data.listening), reading: num(data.reading), writing: num(data.writing),
        speaking: num(data.speaking), notes: 'Starting point recorded during setup.'
      });
      state.meta.onboarded = true;
      state.dailyTasks = {};
      save(); renderCurrent(); closeModal();
      toast('Dashboard ready. Open Today for your first mission.', 'good');
      return true;
    });
}

/* ---------------- background visual ---------------- */
async function initBackground() {
  const canvas = $('#bg-canvas');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.settings.bgFx === 'off' || reduce || window.innerWidth < 760) { canvas.style.display = 'none'; return; }
  try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'); }
  catch (e) { canvas.style.display = 'none'; return; }
  if (!window.THREE) { canvas.style.display = 'none'; return; }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  camera.position.z = 22;
  const count = 70;
  const pts = [];
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3((Math.random() - .5) * 46, (Math.random() - .5) * 26, (Math.random() - .5) * 18);
    pts.push({ v, sp: new THREE.Vector3((Math.random() - .5) * .012, (Math.random() - .5) * .012, 0) });
    pos.set([v.x, v.y, v.z], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7c5cff, size: .28, transparent: true, opacity: .85 })));
  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .18 });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  resize(); addEventListener('resize', resize);
  let raf;
  const loop = () => {
    const arr = geo.attributes.position.array;
    const seg = [];
    for (let i = 0; i < count; i++) {
      const p = pts[i];
      p.v.add(p.sp);
      if (Math.abs(p.v.x) > 24) p.sp.x *= -1;
      if (Math.abs(p.v.y) > 14) p.sp.y *= -1;
      arr[i * 3] = p.v.x; arr[i * 3 + 1] = p.v.y; arr[i * 3 + 2] = p.v.z;
    }
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      if (pts[i].v.distanceTo(pts[j].v) < 6.2) seg.push(pts[i].v.x, pts[i].v.y, pts[i].v.z, pts[j].v.x, pts[j].v.y, pts[j].v.z);
    }
    geo.attributes.position.needsUpdate = true;
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf); else loop();
  });
}

/* ---------------- reminders ---------------- */
function initReminders() {
  setInterval(() => {
    if (state.settings.reminder !== 'on' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const hhmmNow = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (hhmmNow !== state.settings.reminderTime) return;
    if (state.meta.lastReminder === today()) return;
    state.meta.lastReminder = today();
    save();
    const pri = modulePriority()[0];
    new Notification('IELTS coach', { body: 'Today\'s priority: ' + pri.label + '. ' + Math.max(countdownDays(), 0) + ' days to the exam.' });
  }, 45000);
}

/* ---------------- optional external coach ---------------- */
async function maybeExternalCoach() {
  if (state.meta.teacherMode !== 'api' || !state.meta.teacherEndpoint) return;
  const board = $('#teacherBoard');
  const card = document.createElement('article');
  card.className = 'teach-card span-2';
  card.innerHTML = '<h3>External AI coach</h3><p class="muted small">Contacting your endpoint…</p>';
  board.prepend(card);
  const cur = currentScores(), pri = modulePriority();
  const payload = {
    scores: cur, targets: targets(), priority: pri.map((p) => ({ module: p.mod, gap: p.gap.gap, errors: p.errors })),
    weakestReadingType: weakestReadingType(), writingCriteria: writingCriteria(),
    streak: streak(), daysToExam: countdownDays(), germanLevel: state.settings.germanLevel
  };
  try {
    const res = await fetch(state.meta.teacherEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    const text = data.text || data.message || data.completion || JSON.stringify(data).slice(0, 800);
    card.innerHTML = '<h3>External AI coach</h3>' + mdLite(text);
  } catch (e) {
    card.innerHTML = '<h3>External AI coach</h3><p class="muted small">Your endpoint did not respond, so the local teacher above is what you have today. That is by design: no keys live in this app.</p>';
  }
}
RENDERERS.teacher = function () { renderTeacher(); maybeExternalCoach(); };

/* ---------------- events ---------------- */
function bindEvents() {
  /* navigation */
  document.addEventListener('click', (e) => {
    const toggleNav = e.target.closest('#navToggle') || e.target.closest('#bnMoreBtn');
    if (toggleNav) {
      const sb = $('#sidebar');
      const sc = $('#scrim');
      if (sb) sb.classList.toggle('is-open');
      if (sc) sc.hidden = !sb.classList.contains('is-open');
      return;
    }
    if (e.target.closest('#scrim')) {
      const sb = $('#sidebar');
      if (sb) sb.classList.remove('is-open');
      $('#scrim').hidden = true;
      return;
    }

    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const sb = $('#sidebar');
      if (sb) sb.classList.remove('is-open');
      const sc = $('#scrim');
      if (sc) sc.hidden = true;
      return go(nav.dataset.nav);
    }
    const jump = e.target.closest('[data-nav-jump]');
    if (jump) {
      const sb = $('#sidebar');
      if (sb) sb.classList.remove('is-open');
      const sc = $('#scrim');
      if (sc) sc.hidden = true;
      return go(jump.dataset.navJump);
    }

    const add = e.target.closest('[data-add]');
    if (add) { $('#fabMenu').hidden = true; return openForm(add.dataset.add); }
    const edit = e.target.closest('[data-edit]');
    if (edit) return openForm(edit.dataset.edit, edit.dataset.id);
    const del = e.target.closest('[data-del]');
    if (del) { if (confirm('Delete this entry?')) deleteRow(del.dataset.del, del.dataset.id); return; }
    const csv = e.target.closest('[data-csv]');
    if (csv) return exportCsv(csv.dataset.csv);
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) return exportPdf(pdf.dataset.pdf);

    if (e.target.closest('#formSave')) { if (modalOnSave) modalOnSave(); return; }
    if (e.target.closest('#formCancel') || e.target.closest('#modalClose')) return closeModal();
    if (e.target.id === 'modal') return closeModal();
    if (e.target.id === 'palette') return ($('#palette').hidden = true);

    const help = e.target.closest('[data-help]');
    if (help && help.dataset.help === 'readiness') {
      const r = readiness();
      return openModal('How readiness is calculated',
        '<p>A weighted blend of your own logged data, not an official prediction.</p>' +
        r.parts.map((p) => '<div class="report-row"><span>' + esc(p.label) + ' (' + Math.round(p.weight * 100) + '% weight)</span><b>' +
          Math.round(p.value * 100) + '%</b></div>').join('') +
        '<p class="fineprint">Module scores compare your current estimate against your target. Consistency uses your streak and the last fourteen days. Error reduction compares mistakes logged this week with last week.</p>',
        '<button class="btn" id="formCancel">Close</button>');
    }

    const goto = e.target.closest('[data-goto]');
    if (goto) { $('#palette').hidden = true; return go(goto.dataset.goto); }

    /* speaking + pronunciation recordings */
    if (e.target.closest('#recStart')) return startRecording('speaking', ($('#recPart').value + ' — ' + ($('#recTopic').value || 'untitled')));
    if (e.target.closest('#recStop') || e.target.closest('#pronStop')) return stopRecording();
    if (e.target.closest('#pronStart')) return startRecording('pron', $('#pronWord').value || 'Pronunciation');
    if (e.target.closest('#pronSpeak')) return speak($('#pronWord').value || 'Guten Morgen');
    const recdel = e.target.closest('[data-recdel]');
    if (recdel) {
      const id = recdel.dataset.recdel;
      return Store.del('recordings', id).then(() => { recordings = recordings.filter((r) => r.id !== id); renderRecordings(); toast('Recording deleted.', ''); });
    }

    /* vocabulary */
    const lw = e.target.closest('[data-lookupword]');
    if (lw) { $('#lookupInput').value = lw.dataset.lookupword; return lookupWord(lw.dataset.lookupword); }
    const av = e.target.closest('[data-addvocab]');
    if (av) return quickAddVocab({ word: av.dataset.addvocab, meaning: av.dataset.meaning, pos: av.dataset.pos, pron: av.dataset.pron, syn: av.dataset.syn, example: av.dataset.example });
    const ag = e.target.closest('[data-addgerman]');
    if (ag) {
      const full = ag.dataset.addgerman;
      const parts = full.split(' ');
      state.germanVocabulary.unshift({
        id: uid(), word: parts.slice(1).join(' ') || full, article: /^(der|die|das)$/.test(parts[0]) ? parts[0] : '',
        meaning: ag.dataset.en, level: state.settings.germanLevel, mastery: 'New', dateAdded: today(),
        srs: { due: today(), interval: 0, ease: 2.4 }
      });
      save(); renderCurrent();
      return toast(full + ' added to your German notebook.', 'good');
    }
    const srs = e.target.closest('[data-srs]');
    if (srs) return gradeCard(srs.dataset.srs);
    const dk = e.target.closest('[data-deck]');
    if (dk) {
      deck = dk.dataset.deck; flashIndex = 0;
      $$('[data-deck]').forEach((b) => b.classList.toggle('is-on', b.dataset.deck === deck));
      return renderFlash();
    }
    if (e.target.closest('#flashcard')) return $('#flashcard').classList.toggle('is-flipped');
    if (e.target.closest('#lookupWeb')) {
      const q = $('#lookupInput').value.trim();
      if (q) window.open('https://www.google.com/search?q=' + encodeURIComponent(q + ' meaning synonyms academic'), '_blank', 'noopener');
      return;
    }

    /* german lesson */
    if (e.target.closest('#germanPrev')) { state.german.cursor = (state.german.cursor - 1 + DB.LESSONS.length) % DB.LESSONS.length; save(); return renderLesson(); }
    if (e.target.closest('#germanNext')) { state.german.cursor = (state.german.cursor + 1) % DB.LESSONS.length; save(); return renderLesson(); }
    if (e.target.closest('#germanSaveWords')) return saveLessonWords();
    if (e.target.closest('#germanComplete')) return completeLesson();
    const say = e.target.closest('[data-say]');
    if (say) return speak(say.dataset.say);
    const quiz = e.target.closest('[data-quiz]');
    if (quiz) {
      const right = quiz.dataset.quiz === quiz.dataset.answer;
      quiz.classList.add(right ? 'is-right' : 'is-wrong');
      if (!right) {
        const correct = $$('[data-quiz]').find((b) => b.dataset.quiz === b.dataset.answer);
        if (correct) correct.classList.add('is-right');
      }
      return;
    }

    /* resources */
    const rc = e.target.closest('[data-rescomplete]');
    if (rc) {
      const r = state.resources.find((x) => x.id === rc.dataset.rescomplete);
      if (r) { r.status = r.status === 'Completed' ? 'In progress' : 'Completed'; save(); renderCurrent(); toast('Resource marked ' + r.status.toLowerCase() + '.', 'good'); }
      return;
    }
    const rf = e.target.closest('[data-resfilter]');
    if (rf) { resFilter.all = rf.dataset.resfilter; return renderResources(); }
    const grf = e.target.closest('[data-gresfilter]');
    if (grf) { resFilter.german = grf.dataset.gresfilter; return renderGermanResources(); }

    /* filters */
    const wf = e.target.closest('[data-wfilter]');
    if (wf) {
      listFilter.writingSessions = wf.dataset.wfilter;
      $$('[data-wfilter]').forEach((b) => b.classList.toggle('is-on', b === wf));
      return renderList('writingSessions');
    }
    const mf = e.target.closest('[data-mfilter]');
    if (mf) {
      mistakeFilter = mf.dataset.mfilter;
      $$('[data-mfilter]').forEach((b) => b.classList.toggle('is-on', b === mf));
      return renderMistakes();
    }
    if (e.target.closest('#mistakeReviewed')) {
      state.meta.mistakeReview[today()] = true; save(); renderMistakes();
      return toast('Review logged. That habit is what moves Reading.', 'good');
    }

    /* today */
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      state.dailyMode[today()] = mode.dataset.mode;
      state.dailyTasks[today()] = buildPlan(today(), mode.dataset.mode);
      save(); renderToday();
      return toast('Plan rebuilt for a ' + DB.MODES[mode.dataset.mode].label.toLowerCase() + '.', 'good');
    }
    if (e.target.closest('#regenPlan')) {
      if (!confirm('Rebuild today\'s plan? Completed tasks will be reset.')) return;
      state.dailyTasks[today()] = buildPlan(today(), modeFor(today()));
      save(); renderToday();
      return toast('Plan rebuilt.', 'good');
    }
    if (e.target.closest('#timerStart')) return startTimer();
    if (e.target.closest('#timerStop')) return stopTimer();

    /* analytics */
    if (e.target.closest('#editTargets')) return editTargets();

    /* calendar */
    if (e.target.closest('#calPrev')) {
      const [y, m] = calMonth.split('-').map(Number);
      calMonth = iso(new Date(y, m - 2, 1)).slice(0, 7); return renderCalendar();
    }
    if (e.target.closest('#calNext')) {
      const [y, m] = calMonth.split('-').map(Number);
      calMonth = iso(new Date(y, m, 1)).slice(0, 7); return renderCalendar();
    }
    if (e.target.closest('#calToday')) { calMonth = today().slice(0, 7); return renderCalendar(); }
    const cal = e.target.closest('[data-cal]');
    if (cal) return showCalDay(cal.dataset.cal);

    /* documents tabs */
    const dt = e.target.closest('[data-doctab]');
    if (dt) {
      $$('[data-doctab]').forEach((b) => b.classList.toggle('is-on', b === dt));
      $$('[data-doctabpanel]').forEach((p) => { p.hidden = p.dataset.doctabpanel !== dt.dataset.doctab; });
      return;
    }

    /* data section */
    if (e.target.closest('#backupBtn')) return backup();
    if (e.target.closest('#resetBtn')) {
      if (!confirm('Erase all local data? Download a backup first — this cannot be undone.')) return;
      state = blankState();
      save(true).then(() => { renderCurrent(); toast('All data erased.', ''); });
      return;
    }
    if (e.target.closest('#importConfirm')) return confirmImport();
    if (e.target.closest('#importCancel')) { $('#importReview').hidden = true; return toast('Import cancelled. Nothing changed.', ''); }
    if (e.target.closest('#importAsNote')) {
      const raw = $('#importReview').dataset.raw || '';
      state.notes.unshift({ id: uid(), title: 'Imported PDF text ' + fmtShort(today()), category: 'General', tags: 'import', body: raw.slice(0, 12000), updated: today() });
      save(); $('#importReview').hidden = true;
      return toast('Saved as a note in Documents → My notes.', 'good');
    }

    /* chrome */
    if (e.target.closest('#themeBtn')) {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      save(); applyTheme(); renderCurrent(); return;
    }
    if (e.target.closest('#searchBtn')) return openPalette();
    if (e.target.closest('#navToggle')) {
      const sb = $('#sidebar');
      const open = sb.classList.toggle('is-open');
      $('#scrim').hidden = !open;
      $('#navToggle').setAttribute('aria-expanded', String(open));
      return;
    }
    /* ielts band calculator */
    const stepBtn = e.target.closest('.step-btn');
    if (stepBtn) {
      const mod = stepBtn.dataset.step;
      const dir = num(stepBtn.dataset.dir) || 1;
      const f = $('#bandCalc');
      if (f && f.elements[mod]) {
        let curVal = num(f.elements[mod].value) || 0;
        curVal = Math.min(9, Math.max(0, Math.round((curVal + dir * 0.5) * 2) / 2));
        f.elements[mod].value = curVal.toFixed(1);
        calcBand();
      }
      return;
    }

    if (e.target.closest('#btnResetCalc')) {
      const cur = currentScores();
      const f = $('#bandCalc');
      if (f) {
        MODULES.forEach((m) => {
          if (f.elements[m]) f.elements[m].value = (cur[m] || 6.0).toFixed(1);
        });
        calcBand();
        toast('Calculator reset to your current baseline scores.', 'good');
      }
      return;
    }

    if (e.target.closest('#btnLogCalcScore')) {
      const f = $('#bandCalc');
      if (!f) return;
      const vals = {};
      MODULES.forEach((m) => { vals[m] = num(f.elements[m] ? f.elements[m].value : 0); });
      const o = overallBand(vals);
      if (o === null) return toast('Please enter valid scores for all 4 modules.', 'bad');

      openAddModal('ieltsScores', {
        date: today(),
        source: 'Band Calculator',
        listening: vals.listening,
        reading: vals.reading,
        writing: vals.writing,
        speaking: vals.speaking,
        notes: 'Logged from IELTS Calculator (Overall Band: ' + o.toFixed(1) + ')'
      });
      return;
    }

    if (e.target.id === 'scrim') { $('#sidebar').classList.remove('is-open'); $('#scrim').hidden = true; return; }
    if (e.target.closest('#fab')) { $('#fabMenu').hidden = !$('#fabMenu').hidden; return; }
    if (!e.target.closest('#fabMenu') && !e.target.closest('#fab')) $('#fabMenu').hidden = true;
  });

  /* change / input */
  document.addEventListener('change', (e) => {
    if (e.target.closest('#bandCalc')) return calcBand();
    const task = e.target.closest('[data-task]');
    if (task) return toggleTask(task.dataset.task, task.checked);
    const ds = e.target.closest('[data-docstatus]');
    if (ds) {
      const d = state.documents.find((x) => x.id === ds.dataset.docstatus);
      if (d) { d.status = ds.value; save(); checkAchievements(); renderDocuments(); }
      return;
    }
    if (e.target.id === 'satOffset') { state.settings.satOffset = num(e.target.value) || 0; save(); return renderFlt(); }
    if (e.target.id === 'teacherMode') { state.meta.teacherMode = e.target.value; save(); return renderCurrent(); }
    if (e.target.id === 'teacherEndpoint') { state.meta.teacherEndpoint = e.target.value.trim(); save(); return; }
    if (e.target.id === 'restoreInput' && e.target.files[0]) return restore(e.target.files[0]);
    if (e.target.id === 'pdfInput' && e.target.files[0]) return importPdf(e.target.files[0]);
  });

  document.addEventListener('input', (e) => {
    if (e.target.closest('#bandCalc')) return calcBand();
    const f = e.target.closest('[data-filter]');
    if (f) {
      filters[f.dataset.filter] = f.value;
      if (f.dataset.filter === 'resources') return renderResources();
      return renderList(f.dataset.filter);
    }
    if (e.target.id === 'paletteInput') return renderPalette(e.target.value);
  });

  /* forms */
  $('#checkinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {};
    new FormData(e.target).forEach((v, k) => { data[k] = v; });
    state.checkins[today()] = data;
    ['reading', 'writing', 'listening', 'speaking', 'german'].forEach((k) => {
      const m = num(data[k]);
      if (m > 0 && !state.studySessions.some((s) => s.date === today() && s.notes === 'Check-in entry: ' + k)) {
        state.studySessions.unshift({
          id: uid(), date: today(), focus: k.charAt(0).toUpperCase() + k.slice(1), minutes: m,
          task: 'Check-in', productivity: num(data.productivity) || 3,
          completed: data.completion === 'yes' ? 'Yes' : data.completion === 'partial' ? 'Partial' : 'No',
          notes: 'Check-in entry: ' + k
        });
      }
    });
    save(); checkAchievements(); renderToday();
    $('#checkinFeedback').hidden = false;
    $('#checkinFeedback').textContent = motivation();
    toast('Check-in saved.', 'good');
  });

  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {};
    new FormData(e.target).forEach((v, k) => { data[k] = v; });
    ['targetOverall', 'targetListening', 'targetReading', 'targetWriting', 'targetSpeaking', 'dailyTarget'].forEach((k) => { data[k] = num(data[k]); });
    state.settings = Object.assign({}, state.settings, data);
    if (data.reminder === 'on' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    save(); applyTheme(); renderCurrent();
    toast('Settings saved.', 'good');
  });

  $('#lookupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#lookupInput').value.trim();
    if (q) lookupWord(q);
  });

  /* keyboard */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
    if (e.key === 'Escape') {
      if (!$('#palette').hidden) $('#palette').hidden = true;
      else if (!$('#modal').hidden) closeModal();
      else { $('#sidebar').classList.remove('is-open'); $('#scrim').hidden = true; $('#fabMenu').hidden = true; }
    }
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'flashcard') {
      $('#flashcard').classList.toggle('is-flipped');
    }
    if (!$('#palette').hidden && e.key === 'Enter') {
      const first = $('.pr-item');
      if (first) { $('#palette').hidden = true; go(first.dataset.goto); }
    }
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.replace('#', '');
    if (v && RENDERERS[v] && v !== currentView) go(v);
  });
}

/* ---------------- service worker ---------------- */
function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------------- live clock & topbar ---------------- */
function initLiveClock() {
  const el = $('#liveClockBrutalist');
  if (!el) return;
  const update = () => {
    const now = new Date();
    const isMobile = window.innerWidth <= 600;
    const days = isMobile ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    el.textContent = isMobile ? `${day}, ${date} ${month} · ${timeStr}` : `${day}, ${date} ${month} ${now.getFullYear()} · ${timeStr}`;
  };
  update();
  setInterval(update, 1000);
}

function initReminders() {}
function initBackground() {}

/* ---------------- boot ---------------- */
(async function boot() {
  initLiveClock();
  await load();
  await loadRecordings();
  applyTheme();
  bindEvents();
  const hash = location.hash.replace('#', '');
  currentView = RENDERERS[hash] ? hash : 'dashboard';
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === currentView));
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === currentView));
  $$('.bn-item').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === currentView));
  planFor(today());
  checkAchievements();
  renderCurrent();
  resumeTimer();
  icons();
  initScoreLoggerForm();
  registerSw();
  if (!state.meta.onboarded) setTimeout(onboarding, 350);
  window.addEventListener('beforeunload', () => { save(true); });
})();

/* ---------------- score logger form handler ---------------- */
function initScoreLoggerForm() {
  const form = $('#slForm');
  if (!form) return;
  
  /* auto-set day name when date changes */
  const dateInput = form.querySelector('[name="slDate"]');
  const dayInput = form.querySelector('[name="slDay"]');
  if (dateInput && dayInput) {
    dateInput.addEventListener('change', () => {
      const d = new Date(dateInput.value + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayInput.value = dayNames[d.getDay()];
    });
  }
  
  /* track user module changes */
  const moduleInput = form.querySelector('[name="slModule"]');
  if (moduleInput) {
    moduleInput.addEventListener('change', () => { moduleInput.dataset.userSet = 'true'; });
  }
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const band = parseFloat(fd.get('slBand'));
    const module = fd.get('slModule');
    if (!module) return toast('Select a module.', 'bad');
    if (isNaN(band)) return toast('Enter a band score.', 'bad');
    
    const entry = {
      id: uid(),
      date: fd.get('slDate') || today(),
      day: fd.get('slDay') || '',
      module: module,
      band: band,
      source: fd.get('slSource') || '',
      topic: fd.get('slTopic') || '',
      notes: fd.get('slNotes') || ''
    };
    
    if (!state.dailyScores) state.dailyScores = [];
    state.dailyScores.unshift(entry);
    save(); checkAchievements(); renderCurrent();
    toast(module + ' score ' + band.toFixed(1) + ' logged!', 'good');
    
    /* reset form for next entry */
    form.querySelector('[name="slBand"]').value = '';
    form.querySelector('[name="slTopic"]').value = '';
    form.querySelector('[name="slNotes"]').value = '';
    if (moduleInput) delete moduleInput.dataset.userSet;
  });
}

/* ---------------- vocab quick logger form handler ---------------- */
function initVocabLogger() {
  const form = $('#slVocabForm');
  if (!form) return;
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const word = (fd.get('vlWord') || '').trim();
    const meaning = (fd.get('vlMeaning') || '').trim();
    if (!word) return toast('Enter a word.', 'bad');
    
    const category = fd.get('vlCategory') || 'IELTS';
    const example = (fd.get('vlExample') || '').trim();
    const source = (fd.get('vlSource') || '').trim();
    
    if (category === 'German') {
      const parts = word.split(' ');
      state.germanVocabulary.unshift({
        id: uid(),
        word: parts.length > 1 && /^(der|die|das)$/i.test(parts[0]) ? parts.slice(1).join(' ') : word,
        article: /^(der|die|das)$/i.test(parts[0]) ? parts[0].toLowerCase() : '',
        meaning: meaning, level: state.settings.germanLevel, mastery: 'New', dateAdded: today(),
        srs: { due: today(), interval: 0, ease: 2.4 }
      });
    } else {
      state.ieltsVocabulary.unshift({
        id: uid(), word: word, meaning: meaning, synonyms: '', example: example,
        pos: '', mastery: 'New', dateAdded: today(),
        srs: { due: today(), interval: 0, ease: 2.4 }
      });
    }
    
    save(); checkAchievements(); renderScoreLogger();
    toast(word + ' added to ' + category + ' vocabulary!', 'good');
    form.querySelector('[name="vlWord"]').value = '';
    form.querySelector('[name="vlMeaning"]').value = '';
    form.querySelector('[name="vlExample"]').value = '';
  });
}
document.addEventListener('DOMContentLoaded', initVocabLogger);




/* =========================================================
   QUICK LOG LOGIC
   ========================================================= */
function initQuickLog() {
  const btn = $('#quickLogBtn');
  const modal = $('#quickLogModal');
  const selection = $('#qlSelection');
  const formWrap = $('#qlFormWrap');
  const form = $('#quickLogForm');
  const backBtn = $('#qlBackBtn');
  const title = $('#qlFormTitle');
  
  if (!btn || !modal) return;
  
  let currentQlSchema = null;
  let currentQlTable = null;

  btn.addEventListener('click', () => {
    selection.style.display = 'grid';
    formWrap.style.display = 'none';
    modal.hidden = false;
  });

  $$('.ql-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.qlType;
      const map = {
        'ieltsScore': 'ieltsScores',
        'flt': 'fltTests',
        'reading': 'readingSessions',
        'writing': 'writingSessions',
        'listening': 'listeningSessions',
        'speaking': 'speakingSessions',
        'germanVocab': 'germanVocabulary',
        'germanLesson': 'german'
      };
      
      currentQlTable = map[type];
      if(!currentQlTable) { toast('Coming soon', ''); return; }
      
      if(currentQlTable === 'german') {
         modal.hidden = true;
         go('german');
         return;
      }
      
      currentQlSchema = DB.SCHEMAS[currentQlTable];
      title.textContent = 'Log ' + currentQlSchema.title;
      
      form.innerHTML = '';
      const defaults = { date: today(), dateAdded: today(), mastery: 'New', status: 'Not started', level: state.settings.germanLevel };
      currentQlSchema.fields.forEach(f => {
         const d = document.createElement('div');
         d.innerHTML = fieldHtml(f, defaults[f.name] !== undefined ? defaults[f.name] : '');
         form.appendChild(d.firstElementChild);
      });
      
      const actions = document.createElement('div');
      actions.className = 'form-actions';
      actions.innerHTML = '<button class="btn btn-primary" type="submit">Save ' + currentQlSchema.title + '</button>';
      form.appendChild(actions);
      
      selection.style.display = 'none';
      formWrap.style.display = 'block';
    });
  });

  backBtn.addEventListener('click', () => {
    selection.style.display = 'grid';
    formWrap.style.display = 'none';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if(!currentQlTable || !currentQlSchema) return;
    
    const fd = new FormData(form);
    const obj = { id: uid() };
    currentQlSchema.fields.forEach(f => {
      const v = fd.get(f.name);
      if (v === null) return;
      if (f.type === 'number' && v !== '') {
        const n = parseFloat(v);
        obj[f.name] = isNaN(n) ? null : n;
      } else {
        obj[f.name] = typeof v === 'string' ? v.trim() : v;
      }
    });
    
    // Check required
    for (const f of currentQlSchema.fields) {
      if (f.required && (obj[f.name] === null || obj[f.name] === '' || obj[f.name] === undefined)) {
        toast(f.label + ' is required', 'bad');
        return;
      }
    }
    
    // Sync hooks
    syncHooks(currentQlTable, obj);
    
    // SRS for vocabulary
    if (currentQlTable === 'ieltsVocabulary' || currentQlTable === 'germanVocabulary') {
      obj.srs = { due: today(), interval: 0, ease: 2.4 };
      if (!obj.dateAdded) obj.dateAdded = today();
    }
    
    state[currentQlTable].unshift(obj);
    
    save(); checkAchievements(); renderCurrent();
    toast(currentQlSchema.title + ' saved.', 'good');
    modal.hidden = true;
  });
}

function syncHooks(table, obj) {
  if (table === 'fltTests' && obj.listening && obj.reading) {
    const score = {
      id: uid(),
      date: obj.date || today(),
      test: 'FLT ' + (obj.number || ''),
      listening: obj.listening,
      reading: obj.reading,
      writing: obj.writing || null,
      speaking: obj.speaking || null
    };
    state.ieltsScores.unshift(score);
    toast('Auto-synced to IELTS scores', 'good');
  }
}

document.addEventListener('DOMContentLoaded', initQuickLog);

/* make go() available globally for inline event handlers */
window.go = go;
