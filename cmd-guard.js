// Group protection: .statuskick on|off, .linkkick on|off, .bl (blacklist + kick everywhere), .unbl, .bllist, .blsweep
// - statuskick: the kicking itself happens in index.js (see the .statuskick block there).
// - blacklist is global: a blacklisted number is kicked the moment it joins any group where the bot is admin.
module.exports = {
  category: '🛡️ GROUP PROTECTION',
  register(def, L) {
    const { P, db, num, nj, aliases, getMeta, resolveNum, sleep, OWNERS } = L;
    const list = () => (db.data.events.blacklist ||= []);
    const protectedNum = (c, n) => OWNERS.includes(n) || db.data.owners.includes(n) || n === num(c.sock.user?.id) || n === num(c.sock.user?.lid);
    const who = c => { // reply / @mention, or a typed number
      const t = c.target();
      if (t?.n) return { jid: t.jid, n: t.n };
      const n = num(c.args[0]);
      return n.length >= 7 ? { jid: null, n } : null;
    };

    def('statuskick', { g: true, ba: true, b: true, usage: ['statuskick on', 'statuskick off'] }, c => {
      const g = db.group(c.chat), arg = (c.args[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') { g.kickStatus = arg === 'on'; db.save(); }
      c.reply(`🚫 *STATUS KICK*\n\nStatus: ${g.kickStatus ? '🟢 ON' : '🔴 OFF'}\n\nWhen ON, a member who posts a group status is deleted, kicked and blacklisted right away. Group admins and bot admins are exempt.\n\n${P}statuskick on  •  ${P}statuskick off`);
    });

    // kick one number from EVERY group the bot is admin in (the number does not need to be in the current group)
    const sweep = async (sock, numbers) => {
      const mine = [nj(sock.user.id), nj(sock.user.lid || '')];
      const all = await sock.groupFetchAllParticipating().catch(() => ({}));
      let kicked = 0;
      for (const gm of Object.values(all)) {
        const ps = gm.participants || [];
        if (!ps.find(p => aliases(p).some(a => mine.includes(a)))?.admin) continue;
        for (const p of ps) {
          if (!numbers.includes(resolveNum(gm, p.id))) continue;
          if (await sock.groupParticipantsUpdate(gm.id, [p.id], 'remove').then(() => true).catch(() => false)) kicked++;
          await sleep(500);
        }
      }
      return kicked;
    };

    def('bl', { ba: true, usage: ['bl 18761234567', 'bl (reply to or @ someone)'] }, async c => {
      const t = who(c);
      if (!t) return c.reply(`Type the number (it doesn't have to be in the group):\n${P}bl 18761234567`);
      if (protectedNum(c, t.n)) return c.reply("🚫 I won't blacklist the owner or myself.");
      const bl = list(); if (!bl.includes(t.n)) { bl.push(t.n); db.save(); }
      const kicked = await sweep(c.sock, [t.n]);
      c.reply(`⛔ +${t.n} is blacklisted. Kicked from ${kicked} group${kicked === 1 ? '' : 's'} now, and they get kicked whenever they join one of my groups.`);
    });

    def('blsweep', { ba: true, usage: ['blsweep'] }, async c => {
      const kicked = await sweep(c.sock, list());
      c.reply(`🧹 Kicked ${kicked} blacklisted member${kicked === 1 ? '' : 's'} from my groups.`);
    });

    def('linkkick', { g: true, ba: true, b: true, usage: ['linkkick on', 'linkkick off'] }, c => {
      const g = db.group(c.chat), arg = (c.args[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') { g.kickLink = arg === 'on'; db.save(); }
      c.reply(`🔗 *LINK KICK*\n\nStatus: ${g.kickLink ? '🟢 ON' : '🔴 OFF'}\n\nWhen ON, a member who posts a link has it deleted and is kicked right away. Group admins and bot admins are exempt.\n\n${P}linkkick on  •  ${P}linkkick off`);
    });

    def('unbl', { ba: true, usage: ['unbl 18761234567'] }, c => {
      const t = who(c);
      if (!t) return c.reply(`Type the number:\n${P}unbl 18761234567`);
      const bl = list(), i = bl.indexOf(t.n);
      if (i < 0) return c.reply(`+${t.n} isn't blacklisted.`);
      bl.splice(i, 1); db.save();
      c.reply(`✅ +${t.n} removed from the blacklist.`);
    });

    def('bllist', { ba: true, usage: ['bllist'] }, c => {
      const bl = list();
      c.reply(bl.length ? `⛔ *BLACKLIST* (${bl.length})\n\n` + bl.map(n => '+' + n).join('\n') : 'The blacklist is empty.');
    });

    // kick blacklisted numbers the moment they join (needs the bot to be a group admin)
    (L.state.joinHooks ||= []).push(async (sock, u) => {
      const bl = list();
      if (!bl.length || u.action !== 'add') return;
      const meta = await getMeta(sock, u.id).catch(() => null);
      if (!meta) return;
      for (const p of u.participants || []) {
        const jid = typeof p === 'string' ? p : p.id;
        const n = resolveNum(meta, jid);
        if (n && bl.includes(n)) await sock.groupParticipantsUpdate(u.id, [jid], 'remove').catch(() => {});
      }
    });
  },
};
