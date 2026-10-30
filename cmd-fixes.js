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

  // .setowner <number>  -> makes that number a bot owner (saved in the database, no restart needed)
  def('setowner', { o: true, usage: 'setowner <number>' }, c => {
    const n = (c.args[0] || '').replace(/\D/g, '');
    if (n.length < 7 || n.length > 15) return c.reply(`⚠️ Enter the full number with country code, no + or spaces.\nExample: ${P}setowner 18765945870`);
    if (db.data.owners.includes(n)) return c.reply(`👑 ${n} is already an owner.`);
    db.data.owners.push(n);
    db.save(); db.flush();
    c.reply(`👑 *${n}* is now a bot owner.`);
  });

  // ---------- .disable / .enable: switch ANY command off (everywhere, or only in this group with "here") ----------
  // stored in db.group('__bot').disabled (everywhere) and db.group(chat).disabled (one group). Owners can still use disabled commands.
  const KEEP = new Set(['disable', 'enable', 'disabled']); // these can never be switched off
  const globalList = () => (db.group('__bot').disabled ||= []);
  const localList = chat => (db.group(chat).disabled ||= []);
  const namesOf = name => { const c0 = L.registry.cmds[name]; return c0 ? Object.keys(L.registry.cmds).filter(k => L.registry.cmds[k].fn === c0.fn) : []; }; // the command + all its aliases
  const split = c => { const a = c.args.map(x => x.toLowerCase().replace(/^[.!#/]/, '')), here = a[a.length - 1] === 'here'; return { names: here ? a.slice(0, -1) : a, here }; };

  def('disable', { o: true, usage: ['disable <command> [here]'] }, c => {
    const { names, here } = split(c);
    if (!names.length) return c.reply(`⚠️ *DISABLE*\n\n${P}disable <command>  — off everywhere\n${P}disable <command> here  — off in this group only\n${P}disable slot dice coinflip  — several at once\n\nSee: ${P}disabled • Undo: ${P}enable <command>`);
    if (here && !c.isGroup) return c.reply('⚠️ "here" only works inside a group.');
    const list = here ? localList(c.chat) : globalList(), done = [], bad = [], kept = [];
    for (const n of names) {
      if (!L.registry.cmds[n]) { bad.push(n); continue; }
      if (KEEP.has(n)) { kept.push(n); continue; }
      for (const x of namesOf(n)) if (!list.includes(x)) list.push(x);
      done.push(n);
    }
    db.save(); db.flush();
    c.reply(`🚫 *COMMANDS DISABLED* ${here ? '(this group)' : '(everywhere)'}\n\n${done.length ? done.map(n => '➜ ' + P + n).join('\n') : '_nothing changed_'}${kept.length ? `\n\n🔒 Can't be disabled: ${kept.map(n => P + n).join(', ')}` : ''}${bad.length ? `\n\n❓ Not a command: ${bad.map(n => P + n).join(', ')}` : ''}\n\n👑 Owners can still use them. Undo: ${P}enable <command>`);
  });

  def('enable', { o: true, usage: ['enable <command|all> [here]'] }, c => {
    const { names, here } = split(c);
    if (!names.length) return c.reply(`⚠️ Usage: ${P}enable <command|all> [here]`);
    if (here && !c.isGroup) return c.reply('⚠️ "here" only works inside a group.');
    const list = here ? localList(c.chat) : globalList(); let n0 = 0;
    if (names[0] === 'all') { n0 = list.length; list.length = 0; }
    else for (const n of names) for (const x of namesOf(n).concat(n)) { const i = list.indexOf(x); if (i >= 0) { list.splice(i, 1); n0++; } }
    db.save(); db.flush();
    c.reply(n0 ? `✅ *ENABLED* ${here ? '(this group)' : '(everywhere)'}\n\n${names[0] === 'all' ? 'All commands are back on.' : names.map(n => '➜ ' + P + n).join('\n')}` : `🤷 Nothing to enable — ${names.map(n => P + n).join(', ')} wasn't disabled${here ? ' in this group' : ''}.`);
  });

  def('disabled', { o: true, usage: 'disabled' }, c => {
    const g = globalList(), l = c.isGroup ? localList(c.chat) : [];
    c.reply(`🚫 *DISABLED COMMANDS*\n\n🌍 Everywhere:\n${g.length ? g.map(n => P + n).join('  ') : '_none_'}${c.isGroup ? `\n\n👥 This group:\n${l.length ? l.map(n => P + n).join('  ') : '_none_'}` : ''}\n\n${P}disable <cmd> • ${P}enable <cmd|all>`);
  });
};
