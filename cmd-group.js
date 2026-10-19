// group admin tools
module.exports = {
  category: '🛡️ GROUP ADMIN',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    def('groupinfo', { g: true }, c => c.reply(`👥 *${c.meta.subject}*\n\n👤 Members: ${c.meta.participants.length}\n🛡️ Admins: ${c.meta.participants.filter(p => p.admin).length}\n🔗 Antilink: ${db.group(c.chat).antilink ? 'on' : 'off'}\n\n${c.meta.desc || ''}`));

    def('tagall', { g: true, a: true }, c => c.reply('📢 ' + (c.args.join(' ') || 'Attention!') + '\n\n' + c.meta.participants.map(p => '➜ @' + num(p.id)).join('\n'), c.meta.participants.map(p => p.id)));

    def('hidetag', { g: true, a: true, usage: 'hidetag <text>' }, c => c.sock.sendMessage(c.chat, { text: c.args.join(' ') || '📢', mentions: c.meta.participants.map(p => p.id) }));

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

    def('setname', { g: true, a: true, b: true, usage: 'setname <name>' }, async c => { if (!c.args.length) return c.reply('⚠️ Usage: ' + P + 'setname <new name>'); await c.sock.groupUpdateSubject(c.chat, c.args.join(' ')); c.reply('✏️ *NAME UPDATED*\n\nNew name: *' + c.args.join(' ') + '*'); });

    def('setdesc', { g: true, a: true, b: true, usage: 'setdesc <text>' }, async c => { await c.sock.groupUpdateDescription(c.chat, c.args.join(' ')); c.reply('📝 *DESCRIPTION UPDATED*'); });

    def('antilink', { g: true, a: true, b: true, usage: 'antilink on/off' }, c => {
      const v = (c.args[0] || '').toLowerCase(); if (!['on', 'off'].includes(v)) return c.reply(`Usage: ${P}antilink on|off`);
      db.group(c.chat).antilink = v === 'on'; db.save(); c.reply(`🔗 *ANTILINK*\n\nStatus: ${v === 'on' ? '*ON* ✅\nLinks from non-admins will be deleted.' : '*OFF* ❌'}`);
    });
  },
};
