// Owner-only cleanup commands (work on the live in-memory data, so the bot never overwrites them)
exports.category = '👑 OWNER';

exports.register = (def, L) => {
  const { P, db, m, parseAmt } = L;

  // .resetrich [limit]  -> everyone with wallet+bank ABOVE the limit (default 1m) goes back to $500 wallet, $0 bank
  def('resetrich', { o: true, usage: 'resetrich [limit]  (default 1m)' }, c => {
    const limit = c.args[0] ? parseAmt(c.args[0]) : 1e6;
    if (!limit) return c.reply(`⚠️ Invalid limit.\nExample: ${P}resetrich 1m`);
    const hit = [];
    for (const [n, u] of Object.entries(db.data.users)) {
      if ((u.wallet || 0) + (u.bank || 0) > limit) {
        hit.push(`• ${u.name || '…' + n.slice(-4)} (${m(Math.min((u.wallet || 0) + (u.bank || 0), 9e15))}+)`);
        u.wallet = 500; u.bank = 0;
      }
    }
    db.save(); db.flush();
    c.reply(`🧹 *RESET DONE*\n\nLimit: over *${m(limit)}* → wallet ${m(500)}, bank ${m(0)}\nReset: *${hit.length}* player(s)\n\n${hit.join('\n') || 'Nobody was over the limit.'}`);
  });

  // .removepet <petid>          -> removes that pet from EVERYONE (also un-equips it)
  // .removepet <petid> @user    -> removes it from just that person (or reply to them)
  def('removepet', { o: true, usage: 'removepet <pet> [@user]' }, c => {
    const id = (c.args[0] || '').toLowerCase();
    if (!id) return c.reply(`⚠️ Usage:\n${P}removepet whale  (everyone)\n${P}removepet lion @user  (one person)`);
    const t = c.target();
    const users = t ? [[t.n, db.user(t.n)]] : Object.entries(db.data.users);
    let count = 0;
    for (const [, u] of users) {
      const before = (u.pets || []).length;
      u.pets = (u.pets || []).filter(p => p.id !== id);
      u.equipped = (u.equipped || []).filter(e => e !== id);
      if (u.pets.length < before) count++;
    }
    db.save(); db.flush();
    c.reply(`🐾 Removed *${id}* from *${count}* player(s)${t ? ` (@${t.n})` : ' (everyone)'}.`, t ? [t.jid] : []);
  });

  // .audit [@user]  -> big balance changes ($100k+ by default, set AUDIT_MIN to change). No tag = latest across everyone.
  def('audit', { o: true, usage: 'audit [@user]' }, c => {
    const t = c.target();
    const rows = [];
    for (const [n, u] of Object.entries(db.data.users)) {
      if (t && n !== t.n) continue;
      for (const e of u.audit || []) rows.push({ ...e, who: u.name || '…' + n.slice(-4) });
    }
    rows.sort((a, b) => b.t - a.t);
    const top = rows.slice(0, t ? 15 : 20);
    if (!top.length) return c.reply('📒 *AUDIT*\n\nNo big changes recorded yet (only changes from now on are logged).');
    const when = ts => new Date(ts).toISOString().slice(5, 16).replace('T', ' ');
    c.reply(`📒 *AUDIT* ${t ? '@' + t.n : '(latest, everyone)'}\n_UTC time · ${P}command · change · balance after_\n\n` +
      top.map(e => `${when(e.t)} · ${e.who} · ${P}${e.cmd} · ${e.d > 0 ? '+' : '-'}${m(Math.abs(e.d))} · ${m(e.bal)}`).join('\n'), t ? [t.jid] : []);
  });
};
