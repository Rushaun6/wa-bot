// menu, ping, owner
module.exports = {
  category: '🧭 GENERAL',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    def('menu', { usage: 'menu' }, c => c.reply(L.buildMenu()));

    def(['ping', 'uptime'], { usage: ['ping', 'uptime'] }, c => c.reply(`🏓 *PONG*\n\n⏱️ Uptime: *${left(process.uptime() * 1000)}*`));

    def('owner', {}, c => c.reply(`👑 *OWNER*\n\n${[...new Set([...OWNERS, ...db.data.owners])].map(o => 'wa.me/' + o).join('\n') || 'Not set'}`));
  },
};
