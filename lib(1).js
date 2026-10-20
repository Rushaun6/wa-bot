const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const db = require('./db');

const P = process.env.PREFIX || '.';
const BOT = process.env.BOT_NAME || 'EconoBot';
const OWNERS = (process.env.OWNER_NUMBER || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean);
const MIN = 100; // minimum bet

// ---------- helpers ----------
const num = j => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const nj = j => { try { return jidNormalizedUser(j); } catch { return j; } };
const rnd = (a, b) => crypto.randomInt(a, b + 1);
const left = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60), x = s % 60; return [h && h + 'h', mi && mi + 'm', !h && x && x + 's'].filter(Boolean).join(' ') || '0s'; };
const parseAmt = s => { const r = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(s || ''); if (!r) return null; return Math.floor(+r[1] * ({ k: 1e3, m: 1e6 }[r[2].toLowerCase()] || 1)); };
const aliases = p => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(nj);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- group metadata / identity ----------
const metaCache = new Map();
async function getMeta(sock, jid) {
  const c = metaCache.get(jid);
  if (c && Date.now() - c.t < 60000) return c.d;
  try { const d = await sock.groupMetadata(jid); metaCache.set(jid, { d, t: Date.now() }); return d; } catch { return c?.d || null; }
}
function resolveNum(meta, jid) {
  if (!jid) return '';
  jid = nj(jid);
  const p = meta?.participants?.find(p => aliases(p).includes(jid));
  if (p) return num(aliases(p).find(a => a.endsWith('@s.whatsapp.net')) || jid);
  return num(jid);
}
const partId = (meta, jid) => meta?.participants?.find(p => aliases(p).includes(nj(jid)))?.id || jid;

// ---------- message formatting ----------
const m = n => '$' + Math.floor(n).toLocaleString('en-US');
const wal = u => `💰 Wallet: *${m(u.wallet)}*`;
const result = (amt, net, mult, u) => {
  const head = net > 0 ? '✅ *YOU WON*' : net < 0 ? '❌ *YOU LOST*' : '🤝 *PUSH*';
  const delta = net > 0 ? `*+${m(net)}* (${mult}x)` : net < 0 ? `*-${m(-net)}*` : '*bet returned*';
  return `┏━ ${head}\n│ 🎯 Bet: ${m(amt)}\n│ 💸 ${net > 0 ? 'Profit' : net < 0 ? 'Lost' : 'Result'}: ${delta}\n┗━ 💰 Wallet: *${m(u.wallet)}* _(was ${m(u.wallet - net)})_`;
};
function bet(c, a, min = MIN) {
  const u = db.user(c.sender);
  const amt = a && a.toLowerCase() === 'all' ? u.wallet : parseAmt(a);
  if (!amt || amt < min) { c.reply(`⚠️ Enter a valid bet (min ${m(min)}).\nExample: ${P}${c.cmd} 100  or  ${P}${c.cmd} all`); return null; }
  if (amt > u.wallet) { c.reply(`⚠️ You only have *${m(u.wallet)}* in your wallet.`); return null; }
  return amt;
}

// ---------- tiny animations (edit one message a few times) + spam cooldown ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ANIM_MS = Number(process.env.ANIM_DELAY ?? 700);
async function animate(c, frames, final, mentions = []) {
  try {
    const sent = await c.sock.sendMessage(c.chat, { text: frames[0] }, { quoted: c.msg });
    for (const f of [...frames.slice(1), final]) {
      await sleep(ANIM_MS);
      await c.sock.sendMessage(c.chat, { text: f, edit: sent.key, mentions: f === final ? mentions : [] });
    }
  } catch (e) { // edits not supported / failed: just send the final result so nobody loses their result
    console.error('animate failed:', e?.message || e);
    await c.reply(final, mentions).catch(() => {});
  }
}
const cds = new Map();
function cooldown(c, key, ms) {
  if (process.env.NO_COOLDOWN) return false;
  const k = key + ':' + c.sender, now = Date.now(), until = cds.get(k) || 0;
  if (now < until) { c.reply(`⏳ Slow down — wait *${left(until - now)}*.`); return true; }
  cds.set(k, now + ms);
  if (cds.size > 5000) for (const [kk, v] of cds) if (v < now) cds.delete(kk);
  return false;
}

// ---------- command registry + menu ----------
const registry = { cmds: {}, menu: {} };
const makeDef = category => (names, opts, fn) => {
  const { usage, ...rest } = opts || {};
  names = [].concat(names);
  for (const n of names) registry.cmds[n] = { ...rest, fn };
  const list = (registry.menu[category] ||= []);
  for (const u of [].concat(usage || names[0])) list.push(u);
};
function buildMenu() {
  const sections = Object.entries(registry.menu).map(([t, l]) => `┏━ ${t}\n` + l.map(x => `│ ➜ ${P}${x}`).join('\n') + '\n').join('\n');
  return `╭━━『 *${BOT}* 』━━╮\n\n⚡ Prefix: ${P}\n🎰 Fake coins only, no real money. Min bet ${m(MIN)}, no max.\n\n${sections}╰━━━━━━━━━━━━━━━━━`;
}

// Loads command files: any *.js in ./commands/ and any cmd-*.js next to index.js.
// A file that fails to load is skipped (logged) so it can never take the bot down.
function loadCommands(root) {
  const found = {};
  const add = (dir, test) => { try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.js') && test(f)) found[f.replace(/^cmd-/, '').slice(0, -3)] = path.join(dir, f); } catch {} };
  add(path.join(root, 'commands'), () => true);
  add(root, f => f.startsWith('cmd-'));
  const FIRST = ['economy', 'gambling', 'group', 'owner'], LAST = ['general'];
  const names = Object.keys(found);
  const order = [...FIRST.filter(n => names.includes(n)), ...names.filter(n => ![...FIRST, ...LAST].includes(n)).sort(), ...LAST.filter(n => names.includes(n))];
  let ok = 0;
  for (const n of order) {
    try { const mod = require(found[n]); mod.register(makeDef(mod.category || '📦 ' + n.toUpperCase()), L); ok++; }
    catch (e) { console.error(`⚠️ Command file "${n}" failed to load and was skipped:`, e.message); }
  }
  console.log(`Loaded ${Object.keys(registry.cmds).length} commands from ${ok}/${order.length} files`);
}

const L = { P, BOT, OWNERS, MIN, db, num, nj, aliases, esc, rnd, left, parseAmt, m, wal, result, bet, getMeta, resolveNum, partId, registry, buildMenu, loadCommands, metaCache, animate, cooldown, sleep };
module.exports = L;
