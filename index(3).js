const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const baileys = require('@whiskeysockets/baileys');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser } = baileys;
const pino = require('pino');
const db = require('./db');

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const P = process.env.PREFIX || '.';
const BOT = process.env.BOT_NAME || 'EconoBot';
const OWNERS = (process.env.OWNER_NUMBER || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean);
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const AUTH = path.join(DATA, 'auth');
const PORT = process.env.PORT || 3000;

// ---------- helpers ----------
const num = j => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const nj = j => { try { return jidNormalizedUser(j); } catch { return j; } };
const rnd = (a, b) => crypto.randomInt(a, b + 1);
const fmt = n => Math.floor(n).toLocaleString('en-US') + ' 🪙';
const left = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return [h && h + 'h', m && m + 'm', !h && x && x + 's'].filter(Boolean).join(' ') || '0s'; };
const parseAmt = s => { const m = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(s || ''); if (!m) return null; return Math.floor(+m[1] * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1)); };
const aliases = p => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(nj);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// ---------- game constants ----------
const MIN = 100;
const SHOP = { padlock: { price: 500, hours: 12, desc: 'Blocks robberies for 12 hours' } };
const SYM = ['🍒', '🍋', '🍇', '🔔', '💎', '7'];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const JOBS = ['delivered pizzas 🍕', 'fixed a bug 🐛', 'walked dogs 🐕', 'washed cars 🚗', 'mowed lawns 🌱', 'sold lemonade 🍋'];
const pending = new Map(); // duels
const m = n => '$' + Math.floor(n).toLocaleString('en-US');
const wal = u => `💰 Wallet: *${m(u.wallet)}*`;
const result = (amt, net, mult, u) => {
  const head = net > 0 ? '✅ *YOU WON*' : net < 0 ? '❌ *YOU LOST*' : '🤝 *PUSH*';
  const delta = net > 0 ? `*+${m(net)}* (${mult}x)` : net < 0 ? `*-${m(-net)}*` : '*bet returned*';
  return `┏━ ${head}\n│ 🎯 Bet: ${m(amt)}\n│ 💸 ${net > 0 ? 'Profit' : net < 0 ? 'Lost' : 'Result'}: ${delta}\n┗━ 💰 Wallet: *${m(u.wallet)}* _(was ${m(u.wallet - net)})_`;
};

// ---------- commands ----------
const cmds = {};
const def = (names, opts, fn) => { for (const n of [].concat(names)) cmds[n] = { ...opts, fn }; };

function bet(c, a, min = MIN) {
  const u = db.user(c.sender);
  const amt = a && a.toLowerCase() === 'all' ? u.wallet : parseAmt(a);
  if (!amt || amt < min) { c.reply(`⚠️ Enter a valid bet (min ${m(min)}).\nExample: ${P}${c.cmd} 100  or  ${P}${c.cmd} all`); return null; }
  if (amt > u.wallet) { c.reply(`⚠️ You only have *${m(u.wallet)}* in your wallet.`); return null; }
  return amt;
}

// general
const section = (title, list) => `┏━ ${title}\n` + list.map(x => `│ ➜ ${P}${x}`).join('\n') + '\n';
def('menu', {}, c => c.reply(`╭━━『 *${BOT}* 』━━╮

⚡ Prefix: ${P}
🎰 Fake coins only, no real money. Min bet ${m(MIN)}, no max.

${section('💰 ECONOMY', ['wallet', 'bank', 'deposit <amt|all>', 'withdraw <amt|all>', 'daily', 'work', 'beg', 'rob @user', 'pay @user <amt>', 'shop', 'buy padlock', 'lb'])}
${section('🎲 GAMBLING', ['slots <bet|all>', 'slot2 <bet|all>', 'gamble <amt>', 'gamble red <amt>', 'gamble black <amt>', 'dice <amt>', 'duel @user <amt>', 'accept', 'decline'])}
${section('🛡️ GROUP ADMIN', ['kick', 'promote', 'demote', 'mute', 'unmute', 'tagall', 'hidetag <text>', 'antilink on/off', 'link', 'revoke', 'setname <name>', 'setdesc <text>', 'groupinfo'])}
${section('👑 OWNER', ['give @user <amt>', 'take @user <amt>', 'addadmin', 'deladmin', 'admins', 'addowner', 'delowner', 'ban', 'unban', 'backup', 'myid'])}
${section('🧭 GENERAL', ['menu', 'ping', 'uptime', 'owner'])}╰━━━━━━━━━━━━━━━━━`));
def(['ping', 'uptime'], {}, c => c.reply(`🏓 *PONG*\n\n⏱️ Uptime: *${left(process.uptime() * 1000)}*`));
def('owner', {}, c => c.reply(`👑 *OWNER*\n\n${[...new Set([...OWNERS, ...db.data.owners])].map(o => 'wa.me/' + o).join('\n') || 'Not set'}`));
def('myid', {}, c => c.reply(`🪪 *YOUR ID*\n\nID: ${c.sender}\n👑 Owner: ${c.isOwner ? 'yes' : 'no'}\n🛠️ Bot admin: ${c.isBotAdmin ? 'yes' : 'no'}`));

// economy
def(['wallet', 'w'], {}, async c => {
  const t = c.target(); const n = t ? t.n : c.sender; const u = db.user(n);
  c.reply(`👛 *WALLET*${t ? ' of @' + n : ''}\n\n💰 Cash: *${m(u.wallet)}*\n🏦 Bank: *${m(u.bank)}*\n📊 Net worth: *${m(u.wallet + u.bank)}*\n🔥 Streak: ${u.streak} day(s)\n🔒 Padlock: ${Date.now() < u.padlock ? left(u.padlock - Date.now()) + ' left' : 'none'}`, t ? [t.jid] : []);
});
def('daily', {}, c => {
  const u = db.user(c.sender), now = Date.now(), DAY = 86400000;
  if (now - u.lastDaily < DAY) return c.reply(`🎁 *DAILY REWARD*\n\n⏳ Already claimed. Come back in *${left(DAY - (now - u.lastDaily))}*.`);
  u.streak = u.lastDaily && now - u.lastDaily < 2 * DAY ? u.streak + 1 : 1;
  const reward = 200 + Math.min(u.streak - 1, 14) * 50;
  u.wallet += reward; u.lastDaily = now; db.save();
  c.reply(`🎁 *DAILY REWARD*\n\n✅ Claimed *+${m(reward)}*\n🔥 Streak: *${u.streak}* day(s) (max bonus at day 15)\n${wal(u)}`);
});
def('work', {}, c => {
  const u = db.user(c.sender), now = Date.now(), CD = 30 * 60000;
  if (now - u.lastWork < CD) return c.reply(`💼 *WORK*\n\n⏳ You're tired. Work again in *${left(CD - (now - u.lastWork))}*.`);
  const pay = rnd(40, 120); u.wallet += pay; u.lastWork = now; db.save();
  c.reply(`💼 *WORK*\n\nYou ${JOBS[rnd(0, JOBS.length - 1)]}\n✅ Earned *+${m(pay)}*\n${wal(u)}`);
});
def('gamble', {}, c => {
  const u = db.user(c.sender); const a0 = (c.args[0] || '').toLowerCase();
  if (a0 === 'red' || a0 === 'black') {
    const amt = bet(c, c.args[1]); if (!amt) return;
    const n = rnd(0, 36), color = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
    const em = { red: '🔴', black: '⚫', green: '🟢' }[color];
    const net = color === a0 ? amt : -amt; u.wallet += net; db.save();
    c.reply(`🎡 *ROULETTE*\n\nThe ball landed on ${em} *${n}* (${color})\nYou bet ${a0}\n\n${result(amt, net, 2, u)}`);
  } else {
    const amt = bet(c, c.args[0]); if (!amt) return;
    const win = rnd(1, 100) <= 48, net = win ? amt : -amt; u.wallet += net; db.save();
    c.reply(`🪙 *COIN FLIP* 🪙\n\n${win ? '✨ It landed on your side! ✨' : '💔 It landed on the other side.'}\n\n${result(amt, net, 2, u)}`);
  }
});
def('dice', {}, c => {
  const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
  const roll = () => [rnd(1, 6), rnd(1, 6)]; const a = roll(), b = roll();
  const sa = a[0] + a[1], sb = b[0] + b[1];
  const net = sa > sb ? amt : sa < sb ? -amt : 0; u.wallet += net; db.save();
  c.reply(`🎲 *DICE*\n\nYou rolled 🎲 ${a[0]} + ${a[1]} = *${sa}*\nBot rolled 🎲 ${b[0]} + ${b[1]} = *${sb}*\n\n${result(amt, net, 2, u)}`);
});
function slot(c, title, big, jack, pair) {
  const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
  const r = [rnd(0, 5), rnd(0, 5), rnd(0, 5)];
  let mult = 0;
  if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === 5 ? jack : big;
  else if (pair && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2])) mult = pair;
  const net = Math.floor(amt * mult) - amt; u.wallet += net; db.save();
  const msg = mult >= big ? '🎉 *JACKPOT!* 🎉' : net > 0 ? '✨ Pair!' : '😬 No match';
  c.reply(`${title}\n\n[ ${r.map(i => SYM[i]).join(' | ')} ]\n\n${msg}\n\n${result(amt, net, mult, u)}`);
}
def(['slot', 'slots'], {}, c => slot(c, '🎰 *SLOTS* 🎰', 10, 20, 1.5));
def('slot2', {}, c => slot(c, '🎰 *SLOTS 2* 🎰', 30, 60, 0)); // high risk, high reward
def('bank', {}, c => {
  const u = db.user(c.sender);
  c.reply(`🏦 *BANK*\n\n┏━ 💰 Cash: *${m(u.wallet)}*\n│ 🏦 Bank: *${m(u.bank)}*\n┗━ 📊 Net worth: *${m(u.wallet + u.bank)}*\n\n🔒 Banked money can't be robbed.\n➜ ${P}deposit <amt|all>\n➜ ${P}withdraw <amt|all>`);
});
const bankMove = (toBank) => c => {
  const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase(), from = toBank ? u.wallet : u.bank;
  const amt = a === 'all' ? from : parseAmt(a);
  if (!amt || amt < 1) return c.reply(`⚠️ Usage: ${P}${c.cmd} <amount|all>`);
  if (amt > from) return c.reply(`⚠️ You only have *${m(from)}* in your ${toBank ? 'wallet' : 'bank'}.`);
  if (toBank) { u.wallet -= amt; u.bank += amt; } else { u.bank -= amt; u.wallet += amt; }
  db.save();
  c.reply(`🏦 *${toBank ? 'DEPOSIT' : 'WITHDRAW'}*\n\n✅ ${toBank ? 'Deposited' : 'Withdrew'} *${m(amt)}*\n\n┏━ 💰 Wallet: *${m(u.wallet)}*\n┗━ 🏦 Bank: *${m(u.bank)}*${toBank ? '\n\n🔒 Safe from robbers now.' : ''}`);
};
def(['deposit', 'dep'], {}, bankMove(true));
def(['withdraw', 'with'], {}, bankMove(false));
const GIVERS = ['a kind stranger 🧓', 'a tourist 🧳', 'a street musician 🎸', 'your neighbor 🏠', 'a rich cat lady 🐈', 'a taxi driver 🚕'];
const NOPE = ['Everyone walked past you 🚶', 'A pigeon stole your cup 🐦', 'Someone told you to get a job 💼', 'It started raining, nobody stopped 🌧️'];
def('beg', {}, c => {
  const u = db.user(c.sender), now = Date.now(), CD = 3 * 60000;
  if (now - u.lastBeg < CD) return c.reply(`🙏 *BEG*\n\n⏳ Try again in *${left(CD - (now - u.lastBeg))}*.`);
  u.lastBeg = now;
  if (rnd(1, 100) <= 65) { const g = rnd(20, 100); u.wallet += g; db.save(); return c.reply(`🙏 *BEG*\n\n${GIVERS[rnd(0, GIVERS.length - 1)]} gave you\n✅ *+${m(g)}*\n${wal(u)}`); }
  db.save(); c.reply(`🙏 *BEG*\n\n${NOPE[rnd(0, NOPE.length - 1)]}\n❌ You got nothing.\n${wal(u)}`);
});
def('shop', {}, c => c.reply('🛒 *SHOP*\n\n' + Object.entries(SHOP).map(([k, v]) => `🔒 ${k} — *${m(v.price)}*\n   ${v.desc}`).join('\n\n') + `\n\nBuy: ${P}buy padlock`));
def('buy', {}, c => {
  const item = (c.args[0] || '').toLowerCase(), s = SHOP[item];
  if (!s) return c.reply(`⚠️ Unknown item. See ${P}shop`);
  const u = db.user(c.sender);
  if (item === 'padlock' && Date.now() < u.padlock) return c.reply(`🔒 You already have a padlock (${left(u.padlock - Date.now())} left).`);
  if (u.wallet < s.price) return c.reply(`⚠️ You need *${m(s.price)}* (you have ${m(u.wallet)}).`);
  u.wallet -= s.price; u.padlock = Date.now() + s.hours * 3600000; db.save();
  c.reply(`🛒 *PURCHASE*\n\n🔒 Padlock bought — *-${m(s.price)}*\nRobbers are blocked for ${s.hours}h.\n${wal(u)}`);
});
def('rob', { g: true }, c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}rob @user (or reply to them)`);
  if (t.n === c.sender) return c.reply("🤦 You can't rob yourself.");
  const me = db.user(c.sender), v = db.user(t.n), now = Date.now();
  if (now < me.robCd) return c.reply(`🥷 *ROB*\n\n⏳ Lay low for *${left(me.robCd - now)}*.`);
  if (me.wallet < 100) return c.reply(`🥷 *ROB*\n\n⚠️ You need at least ${m(100)} to try.`);
  if (v.wallet < 200) return c.reply('🥷 *ROB*\n\nThey are too broke to be worth it.');
  me.robCd = now + 10 * 60000;
  if (now < v.padlock) { db.save(); return c.reply(`🥷 *ROB*\n\n🔒 @${t.n} has a padlock. Robbery failed.`, [t.jid]); }
  if (rnd(1, 100) <= 40) {
    const s = Math.floor(v.wallet * rnd(10, 25) / 100); v.wallet -= s; me.wallet += s; db.save();
    c.reply(`🥷 *ROB*\n\n✅ You robbed @${t.n} for *+${m(s)}*\n${wal(me)}`, [t.jid]);
  } else {
    const f = Math.min(me.wallet, rnd(100, 300)); me.wallet -= f; db.save();
    c.reply(`🥷 *ROB*\n\n🚔 Caught! Fine: *-${m(f)}*\n${wal(me)}`);
  }
});
def(['pay', 'donate'], { g: true }, c => {
  const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}pay @user <amount>`);
  const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
  const me = db.user(c.sender); me.wallet -= amt; db.user(t.n).wallet += amt; db.save();
  c.reply(`💸 *TRANSFER*\n\nSent *${m(amt)}* to @${t.n}\n${wal(me)}`, [t.jid]);
});
def('duel', { g: true }, c => {
  const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}duel @user <amount>`);
  const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
  if (db.user(t.n).wallet < amt) return c.reply('⚠️ They cannot afford that bet.');
  pending.set(c.chat + ':' + t.n, { from: c.sender, fromJid: c.senderJid, amt, exp: Date.now() + 60000 });
  c.reply(`⚔️ *DUEL*\n\n@${c.sender} challenges @${t.n}\nPot: *${m(amt)}* each — 50/50, no cut\n\n@${t.n}, type ${P}accept or ${P}decline within 60s.`, [c.senderJid, t.jid]);
});
def('accept', { g: true }, c => {
  const key = c.chat + ':' + c.sender, d = pending.get(key);
  if (!d || Date.now() > d.exp) { pending.delete(key); return c.reply('⚠️ No active duel for you.'); }
  pending.delete(key);
  const a = db.user(d.from), b = db.user(c.sender);
  if (a.wallet < d.amt || b.wallet < d.amt) return c.reply('⚠️ Duel cancelled — someone can no longer afford it.');
  const winA = rnd(0, 1) === 0, w = winA ? a : b, l = winA ? b : a, wn = winA ? d.from : c.sender, ln = winA ? c.sender : d.from;
  w.wallet += d.amt; l.wallet -= d.amt; db.save();
  c.reply(`⚔️ *DUEL RESULT*\n\n🏆 @${wn} wins *+${m(d.amt)}*\n💀 @${ln} loses *-${m(d.amt)}*`, [d.fromJid, c.senderJid]);
});
def('decline', { g: true }, c => { const k = c.chat + ':' + c.sender; if (pending.delete(k)) c.reply('⚔️ Duel declined.'); });
def(['lb', 'leaderboard', 'top'], {}, c => {
  const top = Object.entries(db.data.users).sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0))).slice(0, 10);
  c.reply('🏆 *LEADERBOARD*\n\n' + (top.map(([n, u], i) => `${['🥇', '🥈', '🥉'][i] || '*' + (i + 1) + '.*'} ${u.name || '…' + n.slice(-4)} — *${m(u.wallet + (u.bank || 0))}*`).join('\n') || 'Nobody yet.'));
});

// owner / bot admin
const money = sign => c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user <amount>`);
  const amt = parseAmt(c.args.filter(a => !a.startsWith('@')).pop()); if (!amt) return c.reply('⚠️ Invalid amount.');
  const u = db.user(t.n); u.wallet = Math.max(0, u.wallet + sign * amt); db.save();
  c.reply(`${sign > 0 ? '💵 *MONEY GIVEN*' : '💸 *MONEY TAKEN*'}\n\n@${t.n}  ${sign > 0 ? '+' : '-'}${m(amt)}\n${wal(u)}`, [t.jid]);
};
def(['addmoney', 'give'], { ba: true }, money(1));
def(['takemoney', 'take'], { ba: true }, money(-1));
const listOp = (key, add, label, title) => c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user (or reply)`);
  const l = db.data[key], has = l.includes(t.n);
  if (add && !has) l.push(t.n); if (!add && has) l.splice(l.indexOf(t.n), 1);
  db.save(); c.reply(`${title}\n\n@${t.n} ${label}.`, [t.jid]);
};
def('addadmin', { o: true }, listOp('admins', true, 'is now a bot admin', '🛠️ *ADMIN ADDED*'));
def('deladmin', { o: true }, listOp('admins', false, 'is no longer a bot admin', '🛠️ *ADMIN REMOVED*'));
def('addowner', { o: true }, listOp('owners', true, 'is now an owner', '👑 *OWNER ADDED*'));
def('delowner', { o: true }, listOp('owners', false, 'is no longer an owner', '👑 *OWNER REMOVED*'));
def('ban', { o: true }, listOp('banned', true, 'is banned from the bot', '🚫 *BANNED*'));
def('unban', { o: true }, listOp('banned', false, 'can use the bot again', '✅ *UNBANNED*'));
def('admins', { o: true }, c => c.reply(`👑 *STAFF*\n\nOwners: ${[...OWNERS, ...db.data.owners].join(', ') || 'none'}\nBot admins: ${db.data.admins.join(', ') || 'none'}`));
def('backup', { o: true }, async c => {
  db.flush();
  await c.sock.sendMessage(c.chat, { document: Buffer.from(JSON.stringify(db.data)), mimetype: 'application/json', fileName: `db-${Date.now()}.json` }, { quoted: c.msg });
});

// group
def('groupinfo', { g: true }, c => c.reply(`👥 *${c.meta.subject}*\n\n👤 Members: ${c.meta.participants.length}\n🛡️ Admins: ${c.meta.participants.filter(p => p.admin).length}\n🔗 Antilink: ${db.group(c.chat).antilink ? 'on' : 'off'}\n\n${c.meta.desc || ''}`));
def('tagall', { g: true, a: true }, c => c.reply('📢 ' + (c.args.join(' ') || 'Attention!') + '\n\n' + c.meta.participants.map(p => '➜ @' + num(p.id)).join('\n'), c.meta.participants.map(p => p.id)));
def('hidetag', { g: true, a: true }, c => c.sock.sendMessage(c.chat, { text: c.args.join(' ') || '📢', mentions: c.meta.participants.map(p => p.id) }));
const part = (action, label, title) => async c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user (or reply)`);
  await c.sock.groupParticipantsUpdate(c.chat, [partId(c.meta, t.jid)], action);
  c.reply(`${title}\n\n@${t.n} ${label}.`, [t.jid]);
};
def('kick', { g: true, a: true, b: true }, part('remove', 'was removed from the group', '👢 *KICKED*'));
def('promote', { g: true, a: true, b: true }, part('promote', 'is now a group admin', '⬆️ *PROMOTED*'));
def('demote', { g: true, a: true, b: true }, part('demote', 'is no longer a group admin', '⬇️ *DEMOTED*'));
def('mute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'announcement'); c.reply('🔇 *GROUP MUTED*\n\nOnly admins can send messages now.'); });
def('unmute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'not_announcement'); c.reply('🔊 *GROUP UNMUTED*\n\nEveryone can send messages.'); });
def(['link', 'grouplink'], { g: true, a: true, b: true }, async c => c.reply('🔗 *GROUP LINK*\n\nhttps://chat.whatsapp.com/' + await c.sock.groupInviteCode(c.chat)));
def('revoke', { g: true, a: true, b: true }, async c => { await c.sock.groupRevokeInvite(c.chat); c.reply('🔄 *LINK RESET*\n\nThe old invite link no longer works.'); });
def('setname', { g: true, a: true, b: true }, async c => { if (!c.args.length) return c.reply('⚠️ Usage: ' + P + 'setname <new name>'); await c.sock.groupUpdateSubject(c.chat, c.args.join(' ')); c.reply('✏️ *NAME UPDATED*\n\nNew name: *' + c.args.join(' ') + '*'); });
def('setdesc', { g: true, a: true, b: true }, async c => { await c.sock.groupUpdateDescription(c.chat, c.args.join(' ')); c.reply('📝 *DESCRIPTION UPDATED*'); });
def('antilink', { g: true, a: true, b: true }, c => {
  const v = (c.args[0] || '').toLowerCase(); if (!['on', 'off'].includes(v)) return c.reply(`Usage: ${P}antilink on|off`);
  db.group(c.chat).antilink = v === 'on'; db.save(); c.reply(`🔗 *ANTILINK*\n\nStatus: ${v === 'on' ? '*ON* ✅\nLinks from non-admins will be deleted.' : '*OFF* ❌'}`);
});

// ---------- message handling ----------
const seen = new Set();
async function onMessage(sock, upsert) {
  if (upsert.type !== 'notify') return;
  for (const msg of upsert.messages) {
    try { await handle(sock, msg); } catch (e) { console.error('handler error:', e?.message || e); }
  }
}
async function handle(sock, msg) {
  if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
  const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) || 0;
  if (ts && Date.now() / 1000 - ts > 45) return;
  if (seen.has(msg.key.id)) return; seen.add(msg.key.id); if (seen.size > 2000) seen.delete(seen.values().next().value);

  let m = msg.message; m = m.ephemeralMessage?.message || m; m = m.viewOnceMessage?.message || m;
  const text = (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
  if (!text) return;
  const chat = msg.key.remoteJid, isGroup = chat.endsWith('@g.us'), fromMe = !!msg.key.fromMe;
  const ownNum = num(sock.user?.id), ownLid = num(sock.user?.lid);
  const senderJid = fromMe ? nj(sock.user.id) : nj(isGroup ? (msg.key.participant || msg.participant) : chat);
  const isCmd = text.startsWith(P);
  const needMeta = isGroup && (isCmd || db.group(chat).antilink);
  const meta = needMeta ? await getMeta(sock, chat) : null;
  const sender = fromMe ? ownNum : resolveNum(meta, senderJid);
  if (!sender) return;
  const isOwner = fromMe || sender === ownNum || (ownLid && sender === ownLid) || OWNERS.includes(sender) || db.data.owners.includes(sender);
  const isBotAdmin = isOwner || db.data.admins.includes(sender);
  const reply = (t, mentions = []) => sock.sendMessage(chat, { text: t, mentions }, { quoted: msg });
  if (!fromMe && msg.pushName) db.user(sender, msg.pushName);

  const me = meta?.participants?.find(p => aliases(p).some(a => [nj(sock.user.id), nj(sock.user.lid || '')].includes(a)));
  const botIsAdmin = !!me?.admin;
  const isGroupAdmin = isOwner || !!meta?.participants?.find(p => aliases(p).includes(senderJid))?.admin;

  // antilink
  if (!isCmd) {
    if (isGroup && db.group(chat).antilink && !isGroupAdmin && botIsAdmin && /(https?:\/\/|chat\.whatsapp\.com\/|www\.)\S+/i.test(text)) {
      await sock.sendMessage(chat, { delete: msg.key }).catch(() => {});
      await reply(`🚫 *ANTILINK*\n\n@${sender} links are not allowed here.`, [senderJid]);
    }
    return;
  }
  if (!isOwner && db.data.banned.includes(sender)) return;

  const parts = text.slice(P.length).trim().split(/\s+/);
  const cmd = parts.shift().toLowerCase(), args = parts;
  const c0 = cmds[cmd]; if (!c0) return;

  const ci = m.extendedTextMessage?.contextInfo;
  const target = () => {
    const jid = ci?.mentionedJid?.[0] || ci?.participant; if (!jid) return null;
    return { jid, n: resolveNum(meta, jid) };
  };
  if (c0.g && !isGroup) return reply('⚠️ This command only works in groups.');
  if (c0.o && !isOwner) return reply('👑 Owner only.');
  if (c0.ba && !isBotAdmin) return reply('🚫 Only the owner or bot admins can use this.');
  if (c0.a && !isGroupAdmin) return reply('🛡️ Group admins only.');
  if (c0.b && !botIsAdmin) return reply('⚠️ Make me a group admin first.');

  const ctx = { sock, msg, chat, isGroup, meta, sender, senderJid, isOwner, isBotAdmin, cmd, args, target, reply };
  try { await c0.fn(ctx); } catch (e) { console.error(`cmd ${cmd} failed:`, e?.message || e); reply('⚠️ Something went wrong, try again.').catch(() => {}); }
}

// ---------- connection ----------
function restoreSession() {
  const f = path.join(AUTH, 'creds.json');
  const sid = (process.env.SESSION_ID || '').trim();
  if (fs.existsSync(f) || !sid) return;
  try {
    fs.mkdirSync(AUTH, { recursive: true });
    fs.writeFileSync(f, Buffer.from(sid.replace(/^WABOT~/, ''), 'base64').toString('utf8'));
    console.log('Session restored from SESSION_ID');
  } catch (e) { console.error('Bad SESSION_ID:', e.message); }
}
let sock = null, retry = 0, status = 'starting';
async function start() {
  try { sock?.ev.removeAllListeners(); sock?.end(undefined); } catch {}
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  if (!state.creds.registered) { status = 'no-session'; console.error('❌ No session. Pair first and set SESSION_ID. Retrying in 60s…'); return setTimeout(() => start().catch(console.error), 60000); }
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}));
  sock = makeWASocket({
    version, logger, printQRInTerminal: false, browser: Browsers.macOS('Safari'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false, syncFullHistory: false,
    cachedGroupMetadata: async j => metaCache.get(j)?.d,
    getMessage: async () => undefined,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', u => onMessage(sock, u));
  sock.ev.on('groups.update', u => u.forEach(g => metaCache.delete(g.id)));
  sock.ev.on('group-participants.update', u => metaCache.delete(u.id));
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') { status = 'online'; retry = 0; console.log('✅ Connected as', num(sock.user.id)); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        status = 'logged-out';
        console.error('❌ Logged out by WhatsApp. Re-pair, update SESSION_ID, delete DATA_DIR/auth, redeploy.');
        return;
      }
      if (code === 403) { // WhatsApp restricted/banned this number: stop hammering it, retry only every 30 min
        status = 'blocked';
        console.error('⚠️ WhatsApp returned 403 (account restricted/banned). Check the phone for a ban notice. Retrying in 30 min.');
        return setTimeout(() => start().catch(() => {}), 30 * 60000);
      }
      status = 'reconnecting';
      const wait = code === DisconnectReason.restartRequired ? 500 : Math.min(60000, 2000 * 2 ** retry++);
      console.log(`Connection closed (${code}). Reconnecting in ${wait}ms`);
      setTimeout(() => start().catch(e => { console.error('start failed', e.message); setTimeout(() => start().catch(() => {}), 15000); }), wait);
    }
  });
}

// ---------- leaderboard site + health ----------
const top = () => Object.entries(db.data.users).sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0))).slice(0, 50).map(([n, u]) => ({ name: u.name || '…' + n.slice(-4), wallet: u.wallet + (u.bank || 0) }));
http.createServer((req, res) => {
  if (req.url.startsWith('/api/leaderboard')) { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify(top())); }
  if (req.url.startsWith('/health')) { res.writeHead(200); return res.end(status); }
  const rows = top().map((u, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(u.name)}</td><td>${u.wallet.toLocaleString('en-US')} 🪙</td></tr>`).join('');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta http-equiv=refresh content=60><title>${esc(BOT)} Leaderboard</title><style>:root{color-scheme:light dark;--bg:#fff;--fg:#111;--bd:#ddd}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--bd:#333}}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:520px;margin:0 auto;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:10px 6px;border-bottom:1px solid var(--bd);text-align:left}td:last-child{text-align:right}</style><h1>🏆 ${esc(BOT)} Leaderboard</h1><table>${rows || '<tr><td>No players yet</td></tr>'}</table>`);
}).listen(PORT, () => console.log('Web on', PORT));

process.on('unhandledRejection', e => console.error('unhandledRejection:', e?.message || e));
process.on('uncaughtException', e => console.error('uncaughtException:', e?.message || e));
restoreSession();
start().catch(e => { console.error('fatal start error', e); setTimeout(() => start().catch(() => {}), 15000); });
