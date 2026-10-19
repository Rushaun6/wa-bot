// owner / bot-admin tools
module.exports = {
  category: '👑 OWNER',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    def('myid', {}, c => c.reply(`🪪 *YOUR ID*\n\nID: ${c.sender}\n👑 Owner: ${c.isOwner ? 'yes' : 'no'}\n🛠️ Bot admin: ${c.isBotAdmin ? 'yes' : 'no'}`));

    const money = sign => c => {
      const t = c.target(); if (!t) return c.reply(`Usage: ${P}${c.cmd} @user <amount>`);
      const amt = parseAmt(c.args.filter(a => !a.startsWith('@')).pop()); if (!amt) return c.reply('⚠️ Invalid amount.');
      const u = db.user(t.n); u.wallet = Math.max(0, u.wallet + sign * amt); db.save();
      c.reply(`${sign > 0 ? '💵 *MONEY GIVEN*' : '💸 *MONEY TAKEN*'}\n\n@${t.n}  ${sign > 0 ? '+' : '-'}${m(amt)}\n${wal(u)}`, [t.jid]);
    };

    def(['addmoney', 'give'], { ba: true, usage: 'give @user <amt>' }, money(1));

    def(['takemoney', 'take'], { ba: true, usage: 'take @user <amt>' }, money(-1));

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
  },
};
