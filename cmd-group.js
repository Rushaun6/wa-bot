// group admin tools
module.exports = {
  category: '🛡️ GROUP ADMIN',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    def('groupinfo', { g: true }, c => c.reply(`👥 *${c.meta.subject}*\n\n👤 Members: ${c.meta.participants.length}\n🛡️ Admins: ${c.meta.participants.filter(p => p.admin).length}\n🔗 Antilink: ${db.group(c.chat).antilink ? 'on' : 'off'}\n\n${c.meta.desc || ''}`));

    def('tagall', { g: true, a: true }, c => c.reply('📢 ' + (c.args.join(' ') || 'Attention!') + '\n\n' + c.meta.participants.map(p => '➜ @' + num(p.id)).join('\n'), c.meta.participants.map(p => p.id)));

    def('hidetag', { g: true, a: true, usage: 'hidetag <text>' }, c => c.sock.sendMessage(c.chat, { text: c.args.join(' ') || '📢', mentions: c.meta.participants.map(p => p.id) }));

    // WhatsApp answers a group change with a status per person instead of throwing, so we must check it
    const WHY = { 401: 'I am not allowed to do that here.', 403: "WhatsApp refused. I must be a group admin, and I can't remove the group creator.", 404: 'That person is not in this group.', 409: 'They already have that role.', 421: 'WhatsApp could not process that, try again.' };
    async function change(c, jid, action) {
      const p = c.meta?.participants?.find(p => L.aliases(p).includes(L.nj(jid)));
      const ids = [...new Set([p?.id, p?.lid, p?.phoneNumber, p?.jid, jid].filter(Boolean))]; // try every id format the person has
      let status = 'unknown';
      for (const id of ids) {
        try {
          const res = await c.sock.groupParticipantsUpdate(c.chat, [id], action);
          const st = String(res?.[0]?.status ?? '200');
          if (st === '200') { L.metaCache.delete(c.chat); return { ok: true }; }
          status = st;
        } catch (e) { status = String(e?.data || e?.output?.statusCode || e?.message || 'error'); }
      }
      return { ok: false, status };
    }
    const part = (action, label, title) => async c => {
      const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user (or reply)`);
      const r = await change(c, t.jid, action);
      if (!r.ok) return c.reply(`⚠️ *${c.cmd.toUpperCase()} FAILED*\n\n${WHY[r.status] || 'WhatsApp said no (' + r.status + ').'}`);
      c.reply(`${title}\n\n@${t.n} ${label}.`, [t.jid]);
    };

    def('kick', { g: true, a: true, b: true }, part('remove', 'was removed from the group', '👢 *KICKED*'));

    def('promote', { g: true, a: true, b: true }, part('promote', 'is now a group admin', '⬆️ *PROMOTED*'));

    def('demote', { g: true, a: true, b: true }, part('demote', 'is no longer a group admin', '⬇️ *DEMOTED*'));

    def('mute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'announcement'); c.reply('🔇 *GROUP MUTED*\n\nOnly admins can send messages now.'); });

    def('unmute', { g: true, a: true, b: true }, async c => { await c.sock.groupSettingUpdate(c.chat, 'not_announcement'); c.reply('🔊 *GROUP UNMUTED*\n\nEveryone can send messages.'); });

    def(['link', 'grouplink'], { g: true, a: true, b: true }, async c => c.reply('🔗 *GROUP LINK*\n\nhttps://chat.whatsapp.com/' + await c.sock.groupInviteCode(c.chat)));

    def('revoke', { g: true, a: true, b: true }, async c => { await c.sock.groupRevokeInvite(c.chat); c.reply('🔄 *LINK RESET*\n\nThe old invite link no longer works.'); });

    def('setname', { g: true, a: true, b: true, usage: 'setname <name>' }, async c => { if (!c.args.length) return c.reply('⚠️ Usage: ' + P + 'setname <new name>'); await c.sock.groupUpdateSubject(c.chat, c.args.join(' ')); c.reply('✏️ *NAME UPDATED*\n\nNew name: *' + c.args.join(' ') + '*'); });

    def('setdesc', { g: true, a: true, b: true, usage: 'setdesc <text>' }, async c => { await c.sock.groupUpdateDescription(c.chat, c.args.join(' ')); c.reply('📝 *DESCRIPTION UPDATED*'); });

    def('antilink', { g: true, a: true, b: true, usage: 'antilink on/off' }, c => {
      const v = (c.args[0] || '').toLowerCase(); if (!['on', 'off'].includes(v)) return c.reply(`Usage: ${P}antilink on|off`);
      db.group(c.chat).antilink = v === 'on'; db.save(); c.reply(`🔗 *ANTILINK*\n\nStatus: ${v === 'on' ? '*ON* ✅\nLinks from non-admins are sent to the owner, then deleted.' : '*OFF* ❌'}`);
    });

    // .kickall: removes every non-admin; needs a ".kickall confirm" within 30s so it can't be triggered by accident
    const kickPending = new Map();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    def('kickall', { g: true, a: true, b: true, usage: 'kickall' }, async c => {
      const key = c.chat + ':' + c.sender;
      const ids = [L.nj(c.sock.user.id), L.nj(c.sock.user.lid || '')];
      const owners = new Set([...OWNERS, ...db.data.owners]);
      const targetsOf = meta => meta.participants.filter(p => !p.admin && !L.aliases(p).some(a => ids.includes(a)) && !owners.has(L.resolveNum(meta, p.id)));
      if ((c.args[0] || '').toLowerCase() !== 'confirm') {
        const n = targetsOf(c.meta).length;
        if (!n) return c.reply('🧹 *KICK ALL*\n\nThere are no non-admin members to remove.');
        kickPending.set(key, Date.now() + 30000);
        return c.reply(`⚠️ *KICK ALL*\n\nThis will remove *${n}* members (everyone who is not an admin or owner).\nAdmins, owners and the bot are kept.\n\nTo continue, type *${P}kickall confirm* within 30s.`);
      }
      if (!(kickPending.get(key) > Date.now())) return c.reply(`⚠️ Nothing to confirm. Type *${P}kickall* first.`);
      kickPending.delete(key);
      let meta; try { meta = await c.sock.groupMetadata(c.chat); } catch { meta = c.meta; }
      const targets = targetsOf(meta).map(p => p.id);
      if (!targets.length) return c.reply('🧹 *KICK ALL*\n\nThere are no non-admin members to remove.');
      await c.reply(`🧹 *KICK ALL*\n\n⏳ Removing *${targets.length}* members…`);
      let removed = 0;
      for (let i = 0; i < targets.length; i += 5) { // small batches with a pause, so WhatsApp doesn't flag the bot
        const batch = targets.slice(i, i + 5);
        try { const res = await c.sock.groupParticipantsUpdate(c.chat, batch, 'remove'); removed += Array.isArray(res) ? res.filter(r => String(r.status) === '200').length : batch.length; } catch (e) { console.error('kickall batch failed:', e?.message || e); }
        if (i + 5 < targets.length) await sleep(2000);
      }
      L.metaCache.delete(c.chat);
      c.reply(`🧹 *KICK ALL*\n\n✅ Removed *${removed}* of ${targets.length} members.${removed < targets.length ? '\n⚠️ Some could not be removed.' : ''}`);
    });

    def(['economy', 'eco'], { g: true, a: true, usage: 'economy on/off' }, c => {
      const v = (c.args[0] || '').toLowerCase(), g = db.group(c.chat);
      if (!['on', 'off'].includes(v)) return c.reply(`💰 *ECONOMY*\n\nStatus in this group: ${g.economy === false ? '*OFF* ❌' : '*ON* ✅'}\nUsage: ${P}economy on|off`);
      g.economy = v === 'on'; db.save();
      c.reply(`💰 *ECONOMY*\n\nStatus: ${v === 'on' ? '*ON* ✅\nEconomy, gambling, pets and minigames work here.' : '*OFF* ❌\nEconomy, gambling, pets, minigames and the pigeon are disabled in this group.'}`);
    });
  },
};
