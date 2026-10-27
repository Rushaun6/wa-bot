// .anilb = anti leaderboard: who has LOST the most money (gambling, minigames, duels, getting robbed)
exports.category = '🎲 GAMBLING';

exports.register = (def, L) => {
  const { db, m } = L;
  def('anilb', { usage: 'anilb' }, c => {
    const rows = Object.entries(db.data.users)
      .filter(([, u]) => u.lost > 0)
      .sort((a, b) => b[1].lost - a[1].lost);
    if (!rows.length) return c.reply('📉 *ANTI LEADERBOARD*\n\nNobody has lost anything yet.');
    const medal = ['🥇', '🥈', '🥉'];
    const lines = rows.slice(0, 10).map(([n, u], i) => `${medal[i] || '*' + (i + 1) + '.*'} ${u.name || '…' + n.slice(-4)} — *${m(u.lost)}*`);
    const mine = rows.findIndex(([n]) => n === c.sender);
    c.reply(`📉 *ANTI LEADERBOARD*\n_Biggest total losses_\n\n${lines.join('\n')}` + (mine >= 10 ? `\n\nYou: #${mine + 1} — *${m(rows[mine][1].lost)}*` : ''));
  });
};
