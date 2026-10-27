const fs = require('fs'), path = require('path'), http = require('http');
const baileys = require('@whiskeysockets/baileys');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileys;
const pino = require('pino');
const db = require('./db');
const { P, BOT, OWNERS, num, nj, aliases, esc, getMeta, resolveNum, registry, loadCommands, metaCache, state: botState, ECON } = require('./lib');

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const AUTH = path.join(DATA, 'auth');
const PORT = process.env.PORT || 3000;
const ecoNotice = new Map(); // so the "economy is off" notice isn't spammed
const ALERT = (process.env.ALERT_NUMBER || OWNERS[0] || '').replace(/\D/g, ''); // who receives caught links
const LINK_RE = /(https?:\/\/|chat\.whatsapp\.com\/|www\.)\S+/gi;

// ---------- audit: records every balance change a command causes ----------
const AUDIT_MIN = Number(process.env.AUDIT_MIN || 100000); // changes this big (up or down) go in the audit log
const LOSS_CATS = new Set(['🎲 GAMBLING', '🎮 MINIGAMES']); // losses here (and from .rob) count toward .anilb
const snapBal = () => { const s = {}; for (const n in db.data.users) { const u = db.data.users[n]; s[n] = (u.wallet || 0) + (u.bank || 0); } return s; };
function trackChanges(before, cat, cmd) {
  let any = false;
  for (const n in before) {
    const u = db.data.users[n]; if (!u) continue;
    const tot = (u.wallet || 0) + (u.bank || 0), d = tot - before[n];
    if (!d) continue;
    any = true;
    if (d < 0 && (LOSS_CATS.has(cat) || cmd === 'rob')) u.lost = (u.lost || 0) - d;
    if (Math.abs(d) >= AUDIT_MIN) { (u.audit ||= []).push({ t: Date.now(), cmd, d, bal: tot }); if (u.audit.length > 25) u.audit.shift(); }
  }
  if (any) db.save();
}

loadCommands(__dirname);

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

  // antilink: send the link to the owner, then delete the message
  if (!isCmd) {
    const found = isGroup && db.group(chat).antilink && !isGroupAdmin && botIsAdmin ? text.match(LINK_RE) : null;
    if (found) {
      if (ALERT) { // DM the owner just the deleted link(s), nothing else
        await sock.sendMessage(ALERT + '@s.whatsapp.net', { text: [...new Set(found)].join('\n') }).catch(e => console.error('link forward failed:', e?.message || e));
      }
      await sock.sendMessage(chat, { delete: msg.key }).catch(() => {});
      await reply(`🚫 *ANTILINK*\n\n@${sender} links are not allowed here.`, [senderJid]);
    }
    return;
  }
  if (!isOwner && db.data.banned.includes(sender)) return;

  const parts = text.slice(P.length).trim().split(/\s+/);
  const cmd = parts.shift().toLowerCase(), args = parts;
  // ".promote <group-link>" runs the group-promo command; ".promote @user" stays the normal admin promote
  const isLink = cmd === 'promote' && /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(args.join(' '));
  const c0 = (isLink && registry.cmds.promolink) || registry.cmds[cmd]; if (!c0) return;
  if (isGroup && ECON.has(c0.cat) && db.data.groups[chat]?.economy === false) { // economy switched off here (.economy off)
    if (Date.now() > (ecoNotice.get(chat) || 0)) { ecoNotice.set(chat, Date.now() + 30000); await reply('💤 *ECONOMY OFF*\n\nThe economy is turned off in this group.\nGroup admins can turn it on with *' + P + 'economy on*'); }
    return;
  }
  { const pu = db.user(sender); pu.played = true; if (isGroup) pu.lastGroup = chat; } // real players + where pigeons should hunt

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
  const before = snapBal();
  try { await c0.fn(ctx); } catch (e) { console.error(`cmd ${cmd} failed:`, e?.message || e); reply('⚠️ Something went wrong, try again.').catch(() => {}); }
  try { trackChanges(before, c0.cat, cmd); } catch (e) { console.error('audit failed:', e?.message || e); }
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
  botState.sock = sock;
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
