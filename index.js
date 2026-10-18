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
const SHOP = { padlock: { price: 500, hours: 12, desc: 'Blocks robberies for 12 hours' } };
const SYM = ['🍒', '🍋', '🍉', '⭐', '💎', '7️⃣'];
const JOBS = ['delivered pizzas 🍕', 'fixed a bug 🐛', 'walked dogs 🐕', 'washed cars 🚗', 'mowed lawns 🌱', 'sold lemonade 🍋'];
const pending = new Map(); // duels

// ---------- commands ----------
const cmds = {};
const def = (names, opts, fn) => { for (const n of [].concat(names)) cmds[n] = { ...opts, fn }; };

function bet(c, a, min = 10) {
  const u = db.user(c.sender);
  const amt = a && a.toLowerCase() === 'all' ? u.wallet : parseAmt(a);
  if (!amt || amt < min) { c.reply(`Enter a valid amount (min ${min}). Example: ${P}${c.cmd} 100 or all`); return null; }
  if (amt > u.wallet) { c.reply(`You only have ${fmt(u.wallet)} in your wallet.`); return null; }
  return amt;
}

// general
def('menu', {}, c => c.reply(`*${BOT}*  (prefix: ${P})

*💰 Economy*
${P}wallet • ${P}daily • ${P}work
${P}gamble <amt> • ${P}gamble red|black <amt>
${P}dice <amt> • ${P}slot <amt> • ${P}slot2 <amt>
${P}duel @user <amt> • ${P}accept • ${P}decline
${P}rob @user • ${P}pay @user <amt>
${P}shop • ${P}buy padlock • ${P}lb

*👥 Group (admins)*
${P}tagall • ${P}hidetag <text> • ${P}kick • ${P}promote • ${P}demote
${P}mute • ${P}unmute • ${P}link • ${P}revoke • ${P}antilink on|off
${P}setname • ${P}setdesc • ${P}groupinfo

*👑 Owner / bot admins*
${P}addmoney @user <amt> • ${P}takemoney @user <amt>
${P}addadmin • ${P}deladmin • ${P}admins • ${P}addowner • ${P}delowner
${P}ban • ${P}unban • ${P}backup • ${P}myid • ${P}ping`));
def('ping', {}, c => c.reply('Pong 🏓 uptime ' + left(process.uptime() * 1000)));
def('myid', {}, c => c.reply(`Your ID as I see it: ${c.sender}\nOwner: ${c.isOwner ? 'yes' : 'no'}\nBot admin: ${c.isBotAdmin ? 'yes' : 'no'}`));

// economy
def(['wallet', 'w'], {}, async c => {
  const t = c.target(); const n = t ? t.n : c.sender; const u = db.user(n);
  c.reply(`👛 *Wallet*${t ? ' of @' + n : ''}\n${fmt(u.wallet)}\nStreak: ${u.streak} day(s)\nPadlock: ${Date.now() < u.padlock ? '🔒 ' + left(u.padlock - Date.now()) : 'none'}`, t ? [t.jid] : []);
});
def('daily', {}, c => {
  const u = db.user(c.sender), now = Date.now(), DAY = 86400000;
  if (now - u.lastDaily < DAY) return c.reply(`⏳ Already claimed. Come back in ${left(DAY - (now - u.lastDaily))}.`);
  u.streak = u.lastDaily && now - u.lastDaily < 2 * DAY ? u.streak + 1 : 1;
  const reward = 200 + Math.min(u.streak - 1, 14) * 50;
  u.wallet += reward; u.lastDaily = now; db.save();
  c.reply(`🎁 Daily claimed: +${fmt(reward)}\n🔥 Streak: ${u.streak} day(s) (max bonus at day 15)\nWallet: ${fmt(u.wallet)}`);
});
def('work', {}, c => {
  const u = db.user(c.sender), now = Date.now(), CD = 30 * 60000;
  if (now - u.lastWork < CD) return c.reply(`⏳ You're tired. Work again in ${left(CD - (now - u.lastWork))}.`);
  const pay = rnd(40, 120); u.wallet += pay; u.lastWork = now; db.save();
  c.reply(`💼 You ${JOBS[rnd(0, JOBS.length - 1)]} and earned ${fmt(pay)}.\nWallet: ${fmt(u.wallet)}`);
});
def('gamble', {}, c => {
  const u = db.user(c.sender); const a0 = (c.args[0] || '').toLowerCase();
  if (a0 === 'red' || a0 === 'black') {
    const amt = bet(c, c.args[1]); if (!amt) return;
    const r = rnd(1, 100), res = r <= 47 ? 'red' : r <= 94 ? 'black' : 'green';
    const em = { red: '🔴', black: '⚫', green: '🟢' }[res];
    if (res === a0) { u.wallet += amt; c.reply(`${em} ${res.toUpperCase()}! You win ${fmt(amt)} 🎉\nWallet: ${fmt(u.wallet)}`); }
    else { u.wallet -= amt; c.reply(`${em} ${res.toUpperCase()}. You lost ${fmt(amt)} 💀\nWallet: ${fmt(u.wallet)}`); }
  } else {
    const amt = bet(c, c.args[0]); if (!amt) return;
    if (rnd(1, 100) <= 47) { u.wallet += amt; c.reply(`🎉 You won ${fmt(amt)}!\nWallet: ${fmt(u.wallet)}`); }
    else { u.wallet -= amt; c.reply(`💀 You lost ${fmt(amt)}.\nWallet: ${fmt(u.wallet)}`); }
  }
  db.save();
});
def('dice', {}, c => {
  const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
  const roll = () => [rnd(1, 6), rnd(1, 6)]; const a = roll(), b = roll();
  const sa = a[0] + a[1], sb = b[0] + b[1];
  let out;
  if (sa > sb) { u.wallet += amt; out = `You win ${fmt(amt)} 🎉`; } else if (sa < sb) { u.wallet -= amt; out = `You lost ${fmt(amt)} 💀`; } else out = 'Tie – bet returned.';
  db.save();
  c.reply(`🎲 You: ${a.join(' + ')} = *${sa}*\n🎲 Bot: ${b.join(' + ')} = *${sb}*\n${out}\nWallet: ${fmt(u.wallet)}`);
});
function slot(c, big, jack, pair) {
  const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
  const r = [rnd(0, 5), rnd(0, 5), rnd(0, 5)];
  let m = 0;
  if (r[0] === r[1] && r[1] === r[2]) m = r[0] === 5 ? jack : big;
  else if (pair && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2])) m = pair;
  const win = Math.floor(amt * m); u.wallet += win - amt; db.save();
  const out = m >= big ? `JACKPOT! +${fmt(win - amt)} 🎰` : win > amt ? `Pair! +${fmt(win - amt)}` : win === amt ? 'Push.' : `You lost ${fmt(amt)} 💀`;
  c.reply(`🎰 | ${r.map(i => SYM[i]).join(' | ')} |\n${out}\nWallet: ${fmt(u.wallet)}`);
}
def('slot', {}, c => slot(c, 10, 20, 1.5));
def('slot2', {}, c => slot(c, 30, 60, 0)); // high risk, high reward
def('shop', {}, c => c.reply('🛒 *Shop*\n' + Object.entries(SHOP).map(([k, v]) => `• ${k} – ${fmt(v.price)}\n  ${v.desc}`).join('\n') + `\n\nBuy with ${P}buy padlock`));
def('buy', {}, c => {
  const item = (c.args[0] || '').toLowerCase(), s = SHOP[item];
  if (!s) return c.reply(`Unknown item. See ${P}shop`);
  const u = db.user(c.sender);
  if (item === 'padlock' && Date.now() < u.padlock) return c.reply(`🔒 You already have a padlock (${left(u.padlock - Date.now())} left).`);
  if (u.wallet < s.price) return c.reply(`You need ${fmt(s.price)} (you have ${fmt(u.wallet)}).`);
  u.wallet -= s.price; u.padlock = Date.now() + s.hours * 3600000; db.save();
  c.reply(`🔒 Padlock bought! Robbers are blocked for ${s.hours}h.\nWallet: ${fmt(u.wallet)}`);
});
def('rob', { g: true }, c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}rob @user (or reply to them)`);
  if (t.n === c.sender) return c.reply("You can't rob yourself 🤦");
  const me = db.user(c.sender), v = db.user(t.n), now = Date.now();
  if (now < me.robCd) return c.reply(`⏳ Lay low for ${left(me.robCd - now)}.`);
  if (me.wallet < 100) return c.reply('You need at least 100 🪙 to attempt a robbery.');
  if (v.wallet < 200) return c.reply('They are too broke to be worth it.');
  me.robCd = now + 10 * 60000;
  if (now < v.padlock) { db.save(); return c.reply(`🔒 @${t.n} has a padlock. Robbery failed.`, [t.jid]); }
  if (rnd(1, 100) <= 40) {
    const s = Math.floor(v.wallet * rnd(10, 25) / 100); v.wallet -= s; me.wallet += s; db.save();
    c.reply(`🥷 You robbed @${t.n} for ${fmt(s)}!`, [t.jid]);
  } else {
    const f = Math.min(me.wallet, rnd(100, 300)); me.wallet -= f; db.save();
    c.reply(`🚔 Caught! You paid a ${fmt(f)} fine.`);
  }
});
def('pay', { g: true }, c => {
  const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}pay @user <amount>`);
  const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
  db.user(c.sender).wallet -= amt; db.user(t.n).wallet += amt; db.save();
  c.reply(`💸 Sent ${fmt(amt)} to @${t.n}.`, [t.jid]);
});
def('duel', { g: true }, c => {
  const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}duel @user <amount>`);
  const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
  if (db.user(t.n).wallet < amt) return c.reply('They cannot afford that bet.');
  pending.set(c.chat + ':' + t.n, { from: c.sender, fromJid: c.senderJid, amt, exp: Date.now() + 60000 });
  c.reply(`⚔️ @${c.sender} challenges @${t.n} to a duel for ${fmt(amt)}!\n50/50, no cut.\n@${t.n}, type ${P}accept or ${P}decline within 60s.`, [c.senderJid, t.jid]);
});
def('accept', { g: true }, c => {
  const key = c.chat + ':' + c.sender, d = pending.get(key);
  if (!d || Date.now() > d.exp) { pending.delete(key); return c.reply('No active duel for you.'); }
  pending.delete(key);
  const a = db.user(d.from), b = db.user(c.sender);
  if (a.wallet < d.amt || b.wallet < d.amt) return c.reply('Duel cancelled – someone can no longer afford it.');
  const winA = rnd(0, 1) === 0, w = winA ? a : b, l = winA ? b : a, wn = winA ? d.from : c.sender, ln = winA ? c.sender : d.from;
  w.wallet += d.amt; l.wallet -= d.amt; db.save();
  c.reply(`⚔️ *Duel result*\n🏆 @${wn} wins ${fmt(d.amt)}\n💀 @${ln} loses ${fmt(d.amt)}`, [d.fromJid, c.senderJid]);
});
def('decline', { g: true }, c => { const k = c.chat + ':' + c.sender; if (pending.delete(k)) c.reply('Duel declined.'); });
def(['lb', 'leaderboard', 'top'], {}, c => {
  const top = Object.entries(db.data.users).sort((a, b) => b[1].wallet - a[1].wallet).slice(0, 10);
  c.reply('🏆 *Leaderboard*\n' + (top.map(([n, u], i) => `${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${u.name || '…' + n.slice(-4)} – ${fmt(u.wallet)}`).join('\n') || 'Nobody yet.'));
});

// owner / bot admin
const money = sign => c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user <amount>`);
  const amt = parseAmt(c.args.filter(a => !a.startsWith('@')).pop()); if (!amt) return c.reply('Invalid amount.');
  const u = db.user(t.n); u.wallet = Math.max(0, u.wallet + sign * amt); db.save();
  c.reply(`✅ ${sign > 0 ? 'Gave' : 'Took'} ${fmt(amt)} ${sign > 0 ? 'to' : 'from'} @${t.n}. Their wallet: ${fmt(u.wallet)}`, [t.jid]);
};
def(['addmoney', 'give'], { ba: true }, money(1));
def('takemoney', { ba: true }, money(-1));
const listOp = (key, add, label) => c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user (or reply)`);
  const l = db.data[key], has = l.includes(t.n);
  if (add && !has) l.push(t.n); if (!add && has) l.splice(l.indexOf(t.n), 1);
  db.save(); c.reply(`✅ @${t.n} ${label}.`, [t.jid]);
};
def('addadmin', { o: true }, listOp('admins', true, 'is now a bot admin'));
def('deladmin', { o: true }, listOp('admins', false, 'is no longer a bot admin'));
def('addowner', { o: true }, listOp('owners', true, 'is now an owner'));
def('delowner', { o: true }, listOp('owners', false, 'is no longer an owner'));
def('ban', { o: true }, listOp('banned', true, 'is banned from the bot'));
def('unban', { o: true }, listOp('banned', false, 'is unbanned'));
def('admins', { o: true }, c => c.reply(`Owners: ${[...OWNERS, ...db.data.owners].join(', ') || 'none'}\nBot admins: ${db.data.admins.join(', ') || 'none'}`));
def('backup', { o: true }, async c => {
  db.flush();
  await c.sock.sendMessage(c.chat, { document: fs.readFileSync(db.FILE), mimetype: 'application/json', fileName: `db-${Date.now()}.json` }, { quoted: c.msg });
});

// group
def('groupinfo', { g: true }, c => c.reply(`*${c.meta.subject}*\nMembers: ${c.meta.participants.length}\nAdmins: ${c.meta.participants.filter(p => p.admin).length}\nAntilink: ${db.group(c.chat).antilink ? 'on' : 'off'}\n\n${c.meta.desc || ''}`));
def('tagall', { g: true, a: true }, c => c.reply((c.args.join(' ') || '📢 Attention!') + '\n\n' + c.meta.participants.map(p => '@' + num(p.id)).join('\n'), c.meta.participants.map(p => p.id)));
def('hidetag', { g: true, a: true }, c => c.sock.sendMessage(c.chat, { text: c.args.join(' ') || '📢', mentions: c.meta.participants.map(p => p.id) }));
const part = (action, label) => async c => {
  const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user (or reply)`);
  await c.sock.groupParticipantsUpdate(c.chat, [partId(c.meta, t.jid)], action);
  c.reply(`✅ @${t.n} ${label}.`, [t.jid]);
};
def('kick', { g: true, a: true, b: true }, part('remove', 'was removed'));
def('promote', { g: true, a: true, b: true }, part('promote', 'is now an admin'));
def('demote', { g: true, a: true, b: true }, part('demote', 'is no longer an admin'));
def('mute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'announcement'); c.reply('🔇 Group muted (admins only).'); });
def('unmute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'not_announcement'); c.reply('🔊 Group unmuted.'); });
def('link', { g: true, a: true, b: true }, async c => c.reply('https://chat.whatsapp.com/' + await c.sock.groupInviteCode(c.chat)));
def('revoke', { g: true, a: true, b: true }, async c => { await c.sock.groupRevokeInvite(c.chat); c.reply('🔄 Invite link reset.'); });
def('setname', { g: true, a: true, b: true }, async c => { if (!c.args.length) return c.reply('Give a name.'); await c.sock.groupUpdateSubject(c.chat, c.args.join(' ')); });
def('setdesc', { g: true, a: true, b: true }, async c => { await c.sock.groupUpdateDescription(c.chat, c.args.join(' ')); c.reply('✅ Description updated.'); });
def('antilink', { g: true, a: true, b: true }, c => {
  const v = (c.args[0] || '').toLowerCase(); if (!['on', 'off'].includes(v)) return c.reply(`Usage: ${P}antilink on|off`);
  db.group(c.chat).antilink = v === 'on'; db.save(); c.reply(`Antilink ${v}.`);
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
      await reply(`🚫 @${sender} links are not allowed here.`, [senderJid]);
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
  if (c0.g && !isGroup) return reply('This command only works in groups.');
  if (c0.o && !isOwner) return reply('👑 Owner only.');
  if (c0.ba && !isBotAdmin) return reply('Only the owner or bot admins can use this.');
  if (c0.a && !isGroupAdmin) return reply('Group admins only.');
  if (c0.b && !botIsAdmin) return reply('Make me a group admin first.');

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
      status = 'reconnecting';
      const wait = code === DisconnectReason.restartRequired ? 500 : Math.min(60000, 2000 * 2 ** retry++);
      console.log(`Connection closed (${code}). Reconnecting in ${wait}ms`);
      setTimeout(() => start().catch(e => { console.error('start failed', e.message); setTimeout(() => start().catch(() => {}), 15000); }), wait);
    }
  });
}

// ---------- leaderboard site + health ----------
const top = () => Object.entries(db.data.users).sort((a, b) => b[1].wallet - a[1].wallet).slice(0, 50).map(([n, u]) => ({ name: u.name || '…' + n.slice(-4), wallet: u.wallet }));
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
