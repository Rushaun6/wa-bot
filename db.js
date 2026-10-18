const fs = require('fs'), path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DIR, { recursive: true });
const FILE = path.join(DIR, 'db.json');
let data = { users: {}, admins: [], owners: [], banned: [], groups: {} };
for (const f of [FILE, FILE + '.bak']) {
  try { if (fs.existsSync(f)) { data = { ...data, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; break; } } catch (e) { console.error('db read failed', f, e.message); }
}
let timer = null;
function flush() {
  clearTimeout(timer); timer = null;
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('db save failed', e.message); }
}
const save = () => { if (!timer) timer = setTimeout(flush, 1500); };
function user(n, name) {
  let u = data.users[n];
  if (!u) u = data.users[n] = { wallet: 500, lastDaily: 0, streak: 0, lastWork: 0, padlock: 0, robCd: 0, name: '' };
  if (name) u.name = name;
  save();
  return u;
}
const group = j => (data.groups[j] ||= { antilink: false });
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });
module.exports = { data, user, group, save, flush, FILE };
