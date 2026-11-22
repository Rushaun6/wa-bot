// 💤 .inactive <time>: kicks members who haven't sent ANY message in the group for that long, then DMs them the contact number.
//   .inactive 7d    turn it on (units: h, d, w; from 6 hours to 90 days)     .inactive off      turn it off
//   .inactive       status + who is closest to being removed                 .inactive exempt @user   keep someone safe (toggle)
// Each member has their own timer that resets every time they send a message. Group admins, the owner, bot admins and exempt people are never kicked.
// Needs the bot to be a group admin and switched on (.bot on). Safety: new members get a full period, time when the bot was offline doesn't count
// against anyone, and at most 5 people are removed per check and 15 per day per group.
module.exports = {
  category: '💤 INACTIVE',
  register(def, L) {
    const { P, db, aliases, num, nj, getMeta, resolveNum, sleep, OWNERS } = L;
    const CONTACT = (process.env.CONTACT_NUMBER || '18763991485').replace(/\D/g, '');
    const TICK = 5 * 60000, PER_RUN = 5, PER_DAY = 15, MIN_MS = 6 * 3600000, MAX_MS = 90 * 86400000;
    const UNIT = { h: 3600000, d: 86400000, w: 7 * 86400000 };
    const parse = s => { const r = /^(\d+)\s*(h|d|w)$/i.exec(String(s || '').trim()); return r ? +r[1] * UNIT[r[2].toLowerCase()] : 0; };
    const fmt = ms => { const d = ms / 86400000; return d >= 1 ? (Math.round(d * 10) / 10) + ' day' + (d === 1 ? '' : 's') : Math.round(ms / 3600000) + ' hour' + (Math.round(ms / 3600000) === 1 ? '' : 's'); };
    const isStaff = n => OWNERS.includes(n) || (db.data.owners || []).includes(n) || (db.data.admins || []).includes(n);
    const nameOf = n => db.data.users[n]?.name || '+' + n;
    const adminOf = (c) => c.isOwner || !!c.meta?.participants?.find(p => aliases(p).includes(c.senderJid))?.admin;
    const mine = sock => [nj(sock.user?.id), nj(sock.user?.lid || '')];
    const isBotAdmin = (meta, sock) => !!meta.participants.find(p => aliases(p).some(a => mine(sock).includes(a)))?.admin;

    // every participant that is NOT protected, with the time of their last message (a first sighting starts a full period)
    function members(g, meta, sock, now) {
      const act = (g.act ||= {}), out = []; let changed = false;
      for (const p of meta.participants) {
        if (p.admin || aliases(p).some(a => mine(sock).includes(a))) continue;
        const n = resolveNum(meta, p.id); if (!n || isStaff(n) || (g.inact.exempt || []).includes(n)) continue;
        if (!act[n]) { act[n] = now; changed = true; }
        out.push({ n, p, last: act[n] });
      }
      return { list: out, changed };
    }

    let busy = false;
    async function sweep() {
      const sock = L.state.sock; if (!sock || busy) return; busy = true;
      try {
        const now = Date.now(), hb = db.data.events.inactHb || now, gap = now - hb; db.data.events.inactHb = now;
        const downtime = gap > 2 * TICK ? gap : 0; // the bot was off or restarting: nobody could be counted, so nobody is penalised
        for (const [chat, g] of Object.entries(db.data.groups)) {
          if (!chat.endsWith('@g.us') || !g.inact?.on || g.bot !== true) continue;
          if (downtime && g.act) for (const k of Object.keys(g.act)) g.act[k] += downtime;
          const meta = await getMeta(sock, chat).catch(() => null); if (!meta || !isBotAdmin(meta, sock)) continue;
          const { list } = members(g, meta, sock, now), day = new Date(now).toISOString().slice(0, 10);
          if (g.inact.day !== day) { g.inact.day = day; g.inact.kicked = 0; }
          const due = list.filter(x => now - x.last > g.inact.ms).sort((a, b) => a.last - b.last).slice(0, Math.min(PER_RUN, PER_DAY - g.inact.kicked));
          for (const x of due) {
            try { await sock.groupParticipantsUpdate(chat, [x.p.id], 'remove'); } catch (e) { console.error('inactive kick failed:', e?.message || e); continue; }
            g.inact.kicked++; delete g.act[x.n];
            const to = aliases(x.p).find(a => a.endsWith('@s.whatsapp.net')) || x.p.id;
            sock.sendMessage(to, { text: `👋 Hi! You were removed from *${meta.subject}* because you didn't send a message there for *${fmt(g.inact.ms)}*.\n\nIf this was a mistake, please contact me: *+${CONTACT.replace(/^(\d)(\d{3})(\d{3})(\d{4})$/, '$1 ($2) $3-$4')}*\nhttps://wa.me/${CONTACT}` }).catch(() => {});
            await sleep(2500);
          }
          db.save();
        }
      } catch (e) { console.error('inactive sweep failed:', e?.message || e); } finally { busy = false; }
    }
    setInterval(sweep, TICK).unref(); L.petTicks = Object.assign(L.petTicks || {}, { inactiveSweep: sweep });

    def(['inactive', 'inactivekick', 'afk'], { g: true, usage: ['inactive 7d', 'inactive off', 'inactive', 'inactive exempt @user'] }, async c => {
      const g = db.group(c.chat), a = (c.args[0] || '').toLowerCase(), now = Date.now();
      const status = async () => {
        if (!g.inact?.on) return c.reply(`💤 *INACTIVE KICK*\n\nOff in this group.\n\nKicks members who send no message for a set time, then DMs them your contact number.\n➜ *${P}inactive 7d* (hours h, days d, weeks w)\n➜ ${P}inactive off`);
        const meta = c.meta || await getMeta(c.sock, c.chat).catch(() => null); if (!meta) return c.reply('⚠️ Could not read the group.');
        const { list, changed } = members(g, meta, c.sock, now); if (changed) db.save();
        const late = list.filter(x => now - x.last > g.inact.ms).length, top = list.sort((x, y) => x.last - y.last).slice(0, 8);
        c.reply(`💤 *INACTIVE KICK* · *ON*\n\n⏱️ Limit: *${fmt(g.inact.ms)}* without a message\n👥 Watching ${list.length} members${late ? ` (${late} are past the limit and will be removed shortly)` : ''}\n${isBotAdmin(meta, c.sock) ? '' : '⚠️ *I am not a group admin, so I can not remove anyone yet.*\n'}\n*Closest to being removed:*\n${top.map(x => `• ${nameOf(x.n)} — quiet for ${fmt(now - x.last)}`).join('\n') || '_nobody_'}\n\n${P}inactive off · ${P}inactive exempt @user`);
      };
      if (!a) return status();
      if (!adminOf(c)) return c.reply('🚫 Only group admins can change this.');
      if (a === 'off') { if (g.inact) g.inact.on = false; db.save(); return c.reply('💤 Inactive kick is *OFF*.'); }
      if (a === 'status') return status();
      if (a === 'exempt') {
        const t = c.target(); if (!t) return c.reply(`Reply to or @ the person: ${P}inactive exempt @user`);
        g.inact = g.inact || { on: false, ms: 0 }; const ex = (g.inact.exempt ||= []), i = ex.indexOf(t.n); if (i >= 0) ex.splice(i, 1); else ex.push(t.n); db.save();
        return c.reply(i >= 0 ? `⏱️ @${t.n} is no longer exempt.` : `🛡️ @${t.n} will never be removed for inactivity.`, [t.jid]);
      }
      const ms = parse(c.args.join(' '));
      if (!ms) return c.reply(`⚠️ Use hours, days or weeks, like *${P}inactive 7d* or *${P}inactive 36h*.`);
      if (ms < MIN_MS || ms > MAX_MS) return c.reply('⚠️ Pick between 6 hours and 90 days.');
      const first = !g.inact?.on; g.inact = { ...(g.inact || {}), on: true, ms, kicked: 0 };
      if (first) { // a clean start: everybody currently here gets a full period from now
        g.act = {}; const meta = c.meta || await getMeta(c.sock, c.chat).catch(() => null); if (meta) members(g, meta, c.sock, now);
      }
      db.save(); const meta2 = c.meta;
      c.reply(`💤 *INACTIVE KICK ON*\n\nAnyone who sends *no message for ${fmt(ms)}* is removed and gets a DM with your contact number (+${CONTACT}) in case it was a mistake.\n\n• Every message resets that person's timer (photos, voice notes and stickers count)\n• Group admins, you and exempt people are never removed\n• Everyone starts with a fresh ${fmt(ms)} from now\n${meta2 && !isBotAdmin(meta2, c.sock) ? '\n⚠️ *Make me a group admin or I can not remove anyone.*' : ''}`);
    });
  },
};
