const fs = require('fs'), path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
const FILE = path.join(DIR, 'db.json');
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_KEY || '';
const REMOTE = !!(SB_URL && SB_KEY);
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let data = { users: {}, admins: [], owners: [], banned: [], groups: {}, migrations: { day: '', used: 0, created: 0, jobs: {} } };
for (const f of [FILE, FILE + '.bak']) {
  try { if (fs.existsSync(f)) { data = { ...data, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; break; } } catch (e) { console.error('db read failed', f, e.message); }
}

let loaded = !REMOTE; // never write to Supabase until we've read from it
async function loadRemote() {
  for (let i = 1; !loaded; i++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/wabot_state?key=eq.db&select=value`, { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const rows = await r.json();
      const remote = rows[0]?.value;
      if (remote) {
        for (const k of Object.keys(remote)) {
          if (Array.isArray(data[k])) { data[k].length = 0; data[k].push(...remote[k]); }
          else if (data[k] && typeof data[k] === 'object') { for (const x of Object.keys(data[k])) delete data[k][x]; Object.assign(data[k], remote[k]); }
        }
      }
      loaded = true; console.log('✅ Supabase data loaded' + (remote ? '' : ' (first run)'));
      save();
    } catch (e) { console.error('Supabase load failed, retrying:', e.message); await sleep(Math.min(30000, 2000 * i)); }
  }
}
async function push() {
  if (!REMOTE || !loaded) return;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/wabot_state?on_conflict=key`, {
      method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'db', value: data, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) console.error('Supabase save failed: HTTP', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('Supabase save failed:', e.message); }
}
function writeLocal() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
    fs.renameSync(tmp, FILE);
  } catch (e) { /* local disk is optional when Supabase is used */ }
}
let timer = null;
function flush() { clearTimeout(timer); timer = null; writeLocal(); push(); }
const save = () => { if (!timer) timer = setTimeout(flush, 2000); };

function user(n, name) {
  let u = data.users[n];
  if (!u) u = data.users[n] = { wallet: 500, bank: 0, lastBeg: 0, lastDaily: 0, streak: 0, lastWork: 0, padlock: 0, robCd: 0, name: '', pets: [], equipped: [], rebirths: 0, oprob: 0 };
  if (u.bank == null) u.bank = 0;
  if (u.lastBeg == null) u.lastBeg = 0;
  if (!Array.isArray(u.pets)) u.pets = [];
  if (!Array.isArray(u.equipped)) u.equipped = [];
  if (u.rebirths == null) u.rebirths = 0;
  if (u.oprob == null) u.oprob = 0;
  if (name) u.name = name;
  save();
  return u;
}
const group = j => (data.groups[j] ||= { antilink: false });
const shutdown = async () => { clearTimeout(timer); writeLocal(); await Promise.race([push(), sleep(4000)]); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (REMOTE) loadRemote();
module.exports = { data, user, group, save, flush, FILE };
