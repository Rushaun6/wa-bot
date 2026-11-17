const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
const FILE = path.join(DIR, 'db.json');
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_KEY || '';
const REMOTE = !!(SB_URL && SB_KEY);
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A restart must never be able to destroy the previous run's data: keep what is on disk right now as db.start1.json (the 5 latest starts are kept).
try { if (fs.existsSync(FILE) && fs.statSync(FILE).size > 200) { for (let i = 4; i >= 1; i--) { const a = FILE.replace(/\.json$/, `.start${i}.json`), b = FILE.replace(/\.json$/, `.start${i + 1}.json`); if (fs.existsSync(a)) fs.renameSync(a, b); } fs.copyFileSync(FILE, FILE.replace(/\.json$/, '.start1.json')); } } catch {}

let data = { users: {}, admins: [], owners: [], banned: [], groups: {}, events: {}, migrations: { day: '', used: 0, created: 0, jobs: {} } };
let localAt = 0; // when the local file was last saved (ms)
for (const f of [FILE, FILE + '.bak']) {
  try { if (fs.existsSync(f)) { data = { ...data, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; localAt = Math.max(Number(data.pushedBy?.at) || 0, fs.statSync(f).mtimeMs); break; } } catch (e) { console.error('db read failed', f, e.message); }
}

// ---------- money safety ----------
// A wallet/bank must always be a finite number. Bad values break the leaderboard and every "wallet += x":
//   text like "9000000000"  -> "9000000000" + 500 = "9000000000500" (x1000), and the leaderboard shows 10x
//   NaN / Infinity / undefined -> sort order breaks, "$NaN" / "$∞", and they save as null so the balance is lost on restart
// This converts text back to a number, and for NaN/Infinity/null it restores the last good value (or 0), and logs what happened (see .audit).
const good = new Map(); // last known-good wallet/bank per user (memory only)
const toNum = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?(e[+-]?\d+)?\s*$/i.test(v)) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};
// Supabase (jsonb) refuses text holding half an emoji (a "lone surrogate"). Cutting a name at 32 characters could leave exactly that,
// and one bad name made every save fail with "Empty or invalid json". scrub() drops lone halves; names are cut by whole characters.
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const scrub = s => s.replace(LONE, '').replace(/\u0000/g, '');
const SAFE = (k, v) => (typeof v === 'string' ? scrub(v) : v); // JSON.stringify replacer
const cleanName = s => Array.from(scrub(String(s)).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e*_~`]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 32).join('');
function noteFix(id, u, field, was, now, how) {
  const log = ((data.events ||= {}).fixLog ||= []);
  log.unshift({ id, name: u.name || '', field, was: typeof was + ':' + Array.from(String(was)).slice(0, 40).join(''), now, how, at: Date.now() });
  log.length = Math.min(log.length, 25);
  console.warn(`⚠️ db: fixed ${field} of ${id}: ${typeof was} ${String(was).slice(0, 40)} -> ${now} (${how})`);
}
function fixUser(id, u) {
  let changed = false;
  for (const k of ['wallet', 'bank']) {
    const v = u[k];
    if (typeof v === 'number' && Number.isFinite(v)) continue;
    if (v === undefined && k === 'bank') continue;           // user() fills a missing bank with 0
    const n = toNum(v);
    if (n !== null) { noteFix(id, u, k, v, n, 'converted to a number'); u[k] = n; }
    else { const g = good.get(id)?.[k]; const now = g ?? 0; noteFix(id, u, k, v, now, g !== undefined ? 'restored last good value' : 'reset to 0, original value was unrecoverable'); u[k] = now; }
    changed = true;
  }
  if (u.name && typeof u.name === 'string' && cleanName(u.name) !== u.name) u.name = cleanName(u.name); // newlines / * _ ~ break the list formatting
  return changed;
}
function sanitize() {
  let n = 0;
  for (const [id, u] of Object.entries(data.users || {})) { if (u && typeof u === 'object' && fixUser(id, u)) n++; }
  return n;
}
function remember() { // called after sanitize: record each balance that is healthy
  for (const [id, u] of Object.entries(data.users || {})) if (u && Number.isFinite(u.wallet) && Number.isFinite(u.bank ?? 0)) good.set(id, { wallet: u.wallet, bank: u.bank ?? 0 });
}
sanitize(); remember();

let loaded = !REMOTE; // never write to Supabase until we've read from it
// The main row is stored as { v: 2, pushedBy, gz: <gzip+base64 of the whole database> }. Plain jsonb refuses some text (half an emoji, \u0000)
// and one such character made EVERY save fail for days ("Empty or invalid json"). Compressed text can't be refused, and it is ~5x smaller.
const encodeRow = (key, obj) => ({ key, value: { v: 2, pushedBy: obj.pushedBy || null, gz: zlib.gzipSync(Buffer.from(JSON.stringify(obj, SAFE))).toString('base64') }, updated_at: new Date().toISOString() });
const decodeValue = v => (v && v.v === 2 && typeof v.gz === 'string') ? JSON.parse(zlib.gunzipSync(Buffer.from(v.gz, 'base64')).toString('utf8')) : v;
function apply(remote, only) { // copy a saved database into memory (optionally only some keys)
  for (const k of Object.keys(remote)) {
    if (only && !only.includes(k)) continue;
    if (Array.isArray(data[k])) { data[k].length = 0; data[k].push(...remote[k]); }
    else if (data[k] && typeof data[k] === 'object') { for (const x of Object.keys(data[k])) delete data[k][x]; Object.assign(data[k], remote[k]); }
    else data[k] = remote[k];
  }
}
async function loadRemote() {
  for (let i = 1; !loaded; i++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/wabot_state?key=eq.db&select=value,updated_at`, { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const row = (await r.json())[0];
      const remote = row ? decodeValue(row.value) : null;
      const remoteAt = Number(remote?.pushedBy?.at) || Date.parse(row?.updated_at) || 0;
      if (remote?.pushedBy?.at) console.log(`ℹ️ db: the last save before this start was ${Math.round((Date.now() - remote.pushedBy.at) / 1000)}s ago (copy ${remote.pushedBy.id}); this copy is ${INSTANCE}`);
      let used = 'Supabase';
      if (remote && localAt > remoteAt + 30000) { // the local file is NEWER: Supabase missed saves. Keep the local data (an old Supabase copy once wiped days of progress on every restart).
        used = 'local file';
        console.error(`⚠️ db: the local copy (saved ${new Date(localAt).toISOString()}) is NEWER than Supabase (saved ${remoteAt ? new Date(remoteAt).toISOString() : 'never'}). Keeping the local data and pushing it to Supabase.`);
      } else if (remote) apply(remote);
      sanitize(); remember();
      loaded = true; console.log(`✅ Supabase data loaded (using the ${used}) · ` + JSON.stringify(census()));
      save();
    } catch (e) { console.error('Supabase load failed, retrying:', e.message); await sleep(Math.min(30000, 2000 * i)); }
  }
}
// what could be wrong with the data? (logged when a save fails, so the cause is visible instead of guessed)
function diagnose() {
  const o = { bytes: 0, loneInValues: 0, loneInKeys: 0, nulChars: 0, longestString: 0, where: [] }; const lone = new RegExp(LONE.source);
  const note = p => { if (o.where.length < 5) o.where.push(p); };
  (function walk(v, p, d) {
    if (typeof v === 'string') { o.longestString = Math.max(o.longestString, v.length); if (lone.test(v)) { o.loneInValues++; note(p); } if (v.includes('\u0000')) o.nulChars++; }
    else if (v && typeof v === 'object' && d < 12) for (const [k, x] of Object.entries(v)) { if (lone.test(k)) { o.loneInKeys++; note(p + '.' + k.slice(0, 12)); } walk(x, p + '.' + k, d + 1); }
  })(data, '', 0);
  try { o.bytes = Buffer.byteLength(JSON.stringify(data)); } catch (e) { o.bytes = -1; o.stringifyError = String(e.message || e); }
  return o;
}
let lastDiag = 0;
async function push() {
  if (!REMOTE || !loaded) return;
  try {
    data.pushedBy = { id: INSTANCE, at: Date.now() };
    const r = await fetch(`${SB_URL}/rest/v1/wabot_state?on_conflict=key`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(encodeRow('db', data)) });
    if (!r.ok) {
      health.lastPushError = 'HTTP ' + r.status; console.error('Supabase save failed: HTTP', r.status, (await r.text()).slice(0, 200));
      if (Date.now() - lastDiag > 300000) { lastDiag = Date.now(); console.error('db diagnosis:', JSON.stringify(diagnose())); }
    } else if (health.lastPushError) { console.log('✅ Supabase saving works again'); health.lastPushError = null; }
  } catch (e) { console.error('Supabase save failed:', e.message); }
}
function restore(obj, only) { apply(obj, only); sanitize(); remember(); flush(); } // used by .dbrestore
function writeLocal() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, SAFE));
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
    fs.renameSync(tmp, FILE);
  } catch (e) { /* local disk is optional when Supabase is used */ }
}
// ---------- census, backups and a "two copies of the bot" detector ----------
const INSTANCE = require('crypto').randomBytes(4).toString('hex');      // identifies THIS running copy of the bot
const STARTED = Date.now();
const health = { conflicts: 0, lastConflict: null, lastBackup: 0, lastBackupError: '' };
function census() { // how much stuff the database holds: handy to compare before/after an update
  let users = 0, pets = 0, items = 0, potions = 0, streaks = 0;
  for (const u of Object.values(data.users || {})) {
    if (!u || typeof u !== 'object') continue; users++; pets += Array.isArray(u.pets) ? u.pets.length : 0;
    for (const v of Object.values(u.inv || {})) items += Number(v) || 0; for (const v of Object.values(u.potions || {})) potions += Number(v) || 0; if ((u.streak || 0) >= 2) streaks++;
  }
  return { users, pets, items, potions, streaks };
}
// Rolling backups: one snapshot every 3 hours into 8 slots (= the last 24 hours), in Supabase (key db_backup_0..7) and as local files (data/db.backupN.json).
// A bad save can then be rolled back to a snapshot instead of being gone for good.
const BACKUP_EVERY = 3 * 3600000, BACKUP_SLOTS = 8; let lastBucket = -1;
async function backup() {
  if (!loaded) return; const bucket = Math.floor(Date.now() / BACKUP_EVERY); if (bucket === lastBucket) return;
  const slot = bucket % BACKUP_SLOTS;
  try { fs.writeFileSync(FILE.replace(/\.json$/, `.backup${slot}.json`), JSON.stringify(data, SAFE)); } catch {}
  try {
    if (REMOTE) {
      const r = await fetch(`${SB_URL}/rest/v1/wabot_state?on_conflict=key`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'db_backup_' + slot, value: data, updated_at: new Date().toISOString() }, SAFE) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    }
    lastBucket = bucket; health.lastBackup = Date.now(); health.lastBackupError = '';
  } catch (e) { health.lastBackupError = String(e.message || e); console.error('db backup failed:', health.lastBackupError); }
}
async function backupList() { // [{ slot, at }] newest first
  const out = [];
  if (REMOTE) { try { const r = await fetch(`${SB_URL}/rest/v1/wabot_state?key=like.db_backup_*&select=key,updated_at`, { headers: H }); if (r.ok) for (const x of await r.json()) out.push({ slot: String(x.key).replace('db_backup_', ''), at: Date.parse(x.updated_at) || 0 }); } catch {} }
  else for (let s = 0; s < BACKUP_SLOTS; s++) { try { out.push({ slot: String(s), at: fs.statSync(FILE.replace(/\.json$/, `.backup${s}.json`)).mtimeMs }); } catch {} }
  return out.sort((a, b) => b.at - a.at);
}
// If ANOTHER copy of the bot saved to this database recently, say so loudly: two copies overwrite each other's saves (old copy = old data wins).
async function watch() {
  if (!REMOTE || !loaded) return;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/wabot_state?key=eq.db&select=updated_at,value->pushedBy`, { headers: H }); if (!r.ok) return;
    const row = (await r.json())[0]; const by = row && (row.pushedBy ?? row.value?.pushedBy);
    if (by?.id && by.id !== INSTANCE && by.at > STARTED && by.at !== health.lastOther) { health.lastOther = by.at; health.conflicts++; health.lastConflict = Date.now(); console.error(`🚨 db: ANOTHER COPY OF THE BOT (${by.id}) saved to this database ${Math.round((Date.now() - by.at) / 1000)}s ago, after this copy started. Two copies are running: stop the old one, or they overwrite each other's saves.`); }
  } catch {}
}
setInterval(backup, 5 * 60000).unref(); setTimeout(backup, 90000).unref(); setInterval(watch, 60000).unref();

let timer = null;
function flush() { clearTimeout(timer); timer = null; sanitize(); remember(); data.pushedBy = { id: INSTANCE, at: Date.now() }; writeLocal(); push(); }
let lastSan = 0;
const save = () => { if (Date.now() - lastSan > 250) { lastSan = Date.now(); sanitize(); } if (!timer) timer = setTimeout(flush, 2000); };

function user(n, name) {
  let u = data.users[n];
  if (!u) u = data.users[n] = { wallet: 500, bank: 0, lastBeg: 0, lastDaily: 0, streak: 0, lastWork: 0, padlock: 0, robCd: 0, name: '', pets: [], equipped: [], rebirths: 0, oprob: 0 };
  if (u.bank == null) u.bank = 0;
  if (u.lastBeg == null) u.lastBeg = 0;
  if (!Array.isArray(u.pets)) u.pets = [];
  if (!Array.isArray(u.equipped)) u.equipped = [];
  if (u.rebirths == null) u.rebirths = 0;
  if (u.oprob == null) u.oprob = 0;
  if (name) u.name = cleanName(name);
  fixUser(n, u);
  save();
  return u;
}
const group = j => (data.groups[j] ||= { antilink: false });
const shutdown = async () => { clearTimeout(timer); data.pushedBy = { id: INSTANCE, at: Date.now() }; writeLocal(); await Promise.race([push(), sleep(4000)]); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (REMOTE) loadRemote(); else console.log('📊 db (local file): ' + JSON.stringify(census()));
module.exports = { data, user, group, save, flush, sanitize, census, backup, backupList, watch, health, FILE, restore, diagnose };
