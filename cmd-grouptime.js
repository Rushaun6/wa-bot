// GROUP OPEN / CLOSE WITH A TIMER (group admins; the bot must be an admin)
//   .close 30m   close the group now (only admins can send); it opens again by itself in 30 minutes
//   .close       close the group until someone opens it
//   .open 10m    open the group now; it closes again by itself in 10 minutes
//   .open now    open the group (no timer)        (.opengc / .closegc work too)
// Times: 30s, 10m, 2h, 1d, or 1h30m (10 seconds up to 7 days). Timers are saved in the database, so a bot restart doesn't lose them.
// ".open" is also the crate command (cmd-shop.js): it hands over to this file only when the first word is a time or "now".
const JT = require('./jtime');
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const TIME_RE = /^(\d+[smhd])+$/;
// -> milliseconds, null (not a time) or -1 (out of range)
function parseTime(s) {
  s = String(s || '').toLowerCase().replace(/\s+/g, '');
  if (!TIME_RE.test(s)) return null;
  let ms = 0; for (const [, n, u] of s.matchAll(/(\d+)([smhd])/g)) ms += Number(n) * UNIT[u];
  return ms >= 10000 && ms <= 7 * 86400000 ? ms : -1;
}

module.exports = {
  category: '🛡️ GROUP TOOLS',
  parseTime,
  register(def, L) {
    const { P, db, left, aliases, nj } = L;
    const isAdmin = c => c.isOwner || !!c.meta?.participants?.find(p => aliases(p).includes(c.senderJid))?.admin;       // same checks as index.js
    const botAdmin = c => { const ids = [nj(c.sock.user.id), nj(c.sock.user.lid || '')]; return !!c.meta?.participants?.find(p => aliases(p).some(a => ids.includes(a)))?.admin; };
    const apply = (sock, jid, open) => sock.groupSettingUpdate(jid, open ? 'not_announcement' : 'announcement').then(() => L.metaCache?.delete(jid));
    const BAD_TIME = `⚠️ Use a time like *30m*, *2h*, *1d* or *1h30m* (10 seconds to 7 days).`;

    async function run(c, open, arg) {
      try {
        if (!c.isGroup) return c.reply('⚠️ This command only works in groups.');
        if (!isAdmin(c)) return c.reply('🛡️ Group admins only.');
        if (!botAdmin(c)) return c.reply('⚠️ Make me a group admin first.');
        const ms = arg ? parseTime(arg) : 0;
        if (ms === null || ms === -1) return c.reply(BAD_TIME);
        const g = db.group(c.chat);
        await apply(c.sock, c.chat, open);
        if (ms) { g.timed = { action: open ? 'close' : 'open', at: Date.now() + ms, tries: 0 }; } else delete g.timed; // a manual open/close cancels any older timer
        db.save();
        c.reply(open
          ? `🔓 *GROUP OPEN*\n\nEveryone can send messages.${ms ? `\n⏳ It closes again in *${left(ms)}* (at ${JT.clock(g.timed.at)} Jamaica time).` : ''}`
          : `🔒 *GROUP CLOSED*\n\nOnly admins can send messages.${ms ? `\n⏳ It opens again in *${left(ms)}* (at ${JT.clock(g.timed.at)} Jamaica time).` : `\nOpen it again with *${P}open now*.`}`);
      } catch (e) { console.error('group open/close failed:', e?.message || e); c.reply('⚠️ Could not change the group setting. Make sure I am still an admin.').catch(() => {}); }
    }
    def(['close', 'closegc'], { g: true, usage: ['close <time>', 'close'] }, c => run(c, false, c.args[0]));
    def('opengc', { g: true, usage: ['open <time>', 'open now'] }, c => run(c, true, c.args[0] === 'now' ? '' : c.args[0]));
    // used by the crate command: returns true if this ".open ..." was meant for the group
    L.groupOpen = c => {
      const a0 = String(c.args[0] || '').toLowerCase();
      if (!(a0 === 'now' || TIME_RE.test(a0))) return false;
      run(c, true, a0 === 'now' ? '' : a0); return true;
    };

    // the timers: checked every 10 seconds; a failed change is retried twice, then dropped
    let busy = false;
    const tick = async () => {
      const sock = L.state.sock; if (!sock || busy) return; busy = true;
      try {
        const now = Date.now();
        for (const [jid, g] of Object.entries(db.data.groups)) {
          const tm = g.timed; if (!tm || now < tm.at) continue;
          try {
            await apply(sock, jid, tm.action === 'open'); delete g.timed; db.save();
            await sock.sendMessage(jid, { text: tm.action === 'open' ? '🔓 *GROUP OPEN AGAIN*\n\nThe timer is over. Everyone can send messages.' : '🔒 *GROUP CLOSED AGAIN*\n\nThe timer is over. Only admins can send messages.' }).catch(() => {});
          } catch (e) {
            tm.tries = (tm.tries || 0) + 1; console.error(`timed ${tm.action} failed for ${jid} (try ${tm.tries}):`, e?.message || e);
            if (tm.tries >= 3) delete g.timed; else tm.at = now + 60000;
            db.save();
          }
        }
      } finally { busy = false; }
    };
    setInterval(tick, 10000).unref();
    module.exports._test = { tick };
  },
};
