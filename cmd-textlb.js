// 💬 TEXT LEADERBOARD: .textlb (who texts the most in this group today / all time)
// Over 1,000 real messages in a day = 1 hour of group admin, with guard rails so it can't be abused:
//  - spam doesn't count: too fast (<4s apart), repeated text, 1-letter / repeated-character messages,
//    and no more than 200 counted messages per hour (so ~5+ real hours of chatting a day, like a human)
//  - the temporary admin can't make anyone else admin, can't demote anyone, and loses admin after 5 kicks
// Turn it on per group with ".textlb on" (group admins). The bot has to be a group admin to hand out admin.
module.exports = {
  category: '💬 TEXT LB',
  register(def, L) {
    const { P, db, aliases, nj, resolveNum, getMeta } = L;
    const THRESH = 1000, ADMIN_MS = 60 * 60000, MAX_KICKS = 5, GAP = 4000, HOUR_CAP = 200;
    const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.BOT_TZ || 'America/Jamaica' }).format(new Date());
    const tlOf = chat => {
      const t = (db.group(chat).tl ||= { d: day(), c: {}, all: {}, adm: {}, given: {} });
      if (t.d !== day()) { t.d = day(); t.c = {}; t.given = {}; }
      return t;
    };
    const nameOf = n => db.data.users[n]?.name || '+' + n;

    // ---- is this a real message? (in memory only; resets on restart, which is fine)
    const st = new Map();
    function counts(key, text, now) {
      const t = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
      if (t.length < 2 || /^(.)\1+$/.test(t.replace(/\s/g, ''))) return false; // "a", "aaaaaa"
      let s = st.get(key); if (!s) { s = { t: 0, last: [], hr: -1, n: 0 }; st.set(key, s); if (st.size > 5000) st.delete(st.keys().next().value); }
      if (now - s.t < GAP) return false; // faster than a person can type
      if (s.last.includes(t)) return false; // same thing again
      const h = Math.floor(now / 3600000); if (s.hr !== h) { s.hr = h; s.n = 0; }
      if (s.n >= HOUR_CAP) return false; // nobody chats 200+ real messages an hour all day
      s.t = now; s.n++; s.last.push(t); if (s.last.length > 5) s.last.shift();
      return true;
    }

    // ---- count messages, hand out the admin hour
    (L.state.msgHooks ||= []).push(async ({ sock, chat, meta, sender, senderJid, text, botIsAdmin }) => {
      if (!db.group(chat).textlb) return;
      const t = tlOf(chat);
      if (!counts(chat + ':' + sender, text, Date.now())) return;
      t.c[sender] = (t.c[sender] || 0) + 1; t.all[sender] = (t.all[sender] || 0) + 1; db.save();
      if (t.c[sender] <= THRESH || t.given[sender] === t.d) return;
      const p = meta?.participants?.find(p => aliases(p).includes(senderJid));
      if (!p) return;
      if (p.admin) { t.given[sender] = t.d; return; } // already an admin, nothing to give
      if (!botIsAdmin) return; // can't promote yet, try again on a later message today
      t.given[sender] = t.d; // only one try per day, so a failure can't loop
      try { await sock.groupParticipantsUpdate(chat, [p.id], 'promote'); } catch (e) { return console.error('text admin promote failed:', e?.message || e); }
      t.adm[sender] = { until: Date.now() + ADMIN_MS, jid: p.id, kicks: 0 }; db.save();
      sock.sendMessage(chat, { text: `👑 *TEXT KING* 👑\n\n@${sender} sent *${t.c[sender].toLocaleString()}* messages today!\n⏳ Admin for *1 hour*.\n\n⚠️ You can't make anyone else admin or demote anyone, and ${MAX_KICKS} kicks ends your admin.`, mentions: [senderJid] }).catch(() => {});
    });

    // ---- take the admin back when the hour is up
    setInterval(async () => {
      const sock = L.state.sock; if (!sock) return;
      for (const [chat, g] of Object.entries(db.data.groups)) {
        const adm = g?.tl?.adm; if (!adm) continue;
        for (const [n, e] of Object.entries(adm)) {
          if (Date.now() < e.until) continue;
          try { await sock.groupParticipantsUpdate(chat, [e.jid], 'demote'); }
          catch (err) { e.fails = (e.fails || 0) + 1; if (e.fails < 5) continue; } // retry a few times, then give up
          delete adm[n]; db.save();
          sock.sendMessage(chat, { text: `⏰ @${n}'s 1 hour of admin is over.`, mentions: [e.jid] }).catch(() => {});
        }
      }
    }, 30000).unref();

    // ---- guard rails: watch what temporary admins do
    (L.state.joinHooks ||= []).push(async (sock, u) => {
      if (!['promote', 'demote', 'remove'].includes(u.action) || !u.author) return;
      const tl = db.data.groups[u.id]?.tl; if (!tl || !Object.keys(tl.adm || {}).length) return;
      const meta = await getMeta(sock, u.id).catch(() => null); if (!meta) return;
      const author = resolveNum(meta, u.author), e = tl.adm[author]; if (!e) return;
      const targets = (u.participants || []).map(p => typeof p === 'string' ? p : p.id);
      const others = targets.filter(t => nj(t) !== nj(u.author) && resolveNum(meta, t) !== author);
      const revoke = async why => {
        delete tl.adm[author]; db.save();
        await sock.groupParticipantsUpdate(u.id, [e.jid], 'demote').catch(() => {});
        sock.sendMessage(u.id, { text: `🚫 @${author} lost their temporary admin: ${why}.`, mentions: [e.jid] }).catch(() => {});
      };
      if (u.action === 'promote' && others.length) { // can't make anybody else admin
        await sock.groupParticipantsUpdate(u.id, others, 'demote').catch(() => {});
        return revoke('they tried to make someone else admin');
      }
      if (u.action === 'demote' && others.length) { // can't demote anyone: put them back
        await sock.groupParticipantsUpdate(u.id, others, 'promote').catch(() => {});
        return revoke('they tried to demote an admin');
      }
      if (u.action === 'remove' && others.length) {
        e.kicks = (e.kicks || 0) + others.length; db.save();
        if (e.kicks >= MAX_KICKS) return revoke(`they kicked ${e.kicks} people`);
      }
    });

    // ---- commands
    def(['textlb', 'tlb', 'msglb'], { g: true, usage: ['textlb', 'textlb all', 'textlb on|off'] }, c => {
      const g = db.group(c.chat), a = (c.args[0] || '').toLowerCase();
      if (a === 'on' || a === 'off') {
        const isAdmin = c.isOwner || !!c.meta?.participants?.find(p => aliases(p).includes(c.senderJid))?.admin;
        if (!isAdmin) return c.reply('🚫 Only group admins can turn this on or off.');
        g.textlb = a === 'on'; db.save();
        return c.reply(g.textlb ? `💬 *TEXT LEADERBOARD ON*\n\nI'm counting real messages in this group now.\n👑 Over ${THRESH.toLocaleString()} in a day = 1 hour of admin (I need to be a group admin for that).\n\n${P}textlb to see the board.` : '💬 *TEXT LEADERBOARD OFF*\n\nNo longer counting messages here.');
      }
      if (!g.textlb) return c.reply(`💬 *TEXT LEADERBOARD*\n\nIt's off in this group. A group admin can turn it on with *${P}textlb on*`);
      const t = tlOf(c.chat), all = a === 'all', src = all ? t.all : t.c;
      const rows = Object.entries(src).sort((x, y) => y[1] - x[1]);
      if (!rows.length) return c.reply(`💬 *TEXT LEADERBOARD*\n\nNobody has been counted yet. Start chatting!`);
      const medal = ['🥇', '🥈', '🥉'];
      const top = rows.slice(0, 10).map(([n, k], i) => `${medal[i] || `*${i + 1}.*`} ${nameOf(n)} — *${k.toLocaleString()}*`).join('\n');
      const mine = rows.findIndex(([n]) => n === c.sender);
      c.reply(`💬 *TEXT LEADERBOARD* — ${all ? 'all time' : 'today'}\n\n${top}\n\n📊 You: ${mine < 0 ? 'not on it yet' : `#${mine + 1} · ${rows[mine][1].toLocaleString()}`}\n👑 ${THRESH.toLocaleString()}+ real messages in a day = 1 hour of admin\n_Spam doesn't count._\n\n${P}textlb all · ${P}textlb on|off`);
    });
  },
};
