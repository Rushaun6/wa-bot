// .trade @user — swap items, pets and money. Both sides must confirm. Nothing moves until then.
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, parseAmt, left } = L;
    const PT = L.pets, IT = L.items;
    const TTL = 5 * 60000;
    const byUser = new Map(); // number -> session (one trade at a time per person)
    const tag = n => '@' + n;

    const side = (n, jid) => ({ n, jid, money: 0, items: {}, pets: [], ok: false });
    const other = (s, n) => (s.a.n === n ? s.b : s.a);
    const mine = (s, n) => (s.a.n === n ? s.a : s.b);
    const live = n => { const s = byUser.get(n); if (s && Date.now() > s.exp) { byUser.delete(s.a.n); byUser.delete(s.b.n); return null; } return s || null; };
    const end = s => { byUser.delete(s.a.n); byUser.delete(s.b.n); };
    const offerText = o => {
      const rows = [];
      if (o.money) rows.push(`💵 ${m(o.money)}`);
      for (const [id, k] of Object.entries(o.items)) rows.push(`${IT.BY_ID[id].emoji} ${IT.BY_ID[id].name}${k > 1 ? ' ×' + k : ''}`);
      for (const id of o.pets) rows.push(`${PT.BY_ID[id].emoji} ${PT.BY_ID[id].name} (pet)`);
      return rows.join('\n   ') || '_nothing yet_';
    };
    const view = s => `🤝 *TRADE*\n\n${tag(s.a.n)} ${s.a.ok ? '✅' : '⏳'} offers:\n   ${offerText(s.a)}\n\n${tag(s.b.n)} ${s.b.ok ? '✅' : '⏳'} offers:\n   ${offerText(s.b)}\n\n${P}trade add <item|pet|money> [amount] • ${P}trade remove <thing>\n${P}trade confirm • ${P}trade cancel`;
    const mentions = s => [s.a.jid, s.b.jid];
    const reset = s => { s.a.ok = false; s.b.ok = false; s.exp = Date.now() + TTL; };

    // resolve "money 5k" | "pet lion" | "gloves 2" | "lion"
    function parseThing(args) {
      let a = args.filter(x => !x.startsWith('@'));
      if (!a.length) return null;
      const first = a[0].toLowerCase();
      if (['money', 'cash', '$'].includes(first)) { const amt = parseAmt(a[1]); return amt ? { kind: 'money', amt } : { error: `⚠️ How much? Example: ${P}trade add money 50k` }; }
      const forcePet = first === 'pet'; if (forcePet) a = a.slice(1);
      let qty = 1; const last = a[a.length - 1] || '';
      if (a.length > 1 && /^x?\d+$/i.test(last)) { qty = Math.max(1, parseInt(last.replace(/\D/g, ''), 10)); a = a.slice(0, -1); }
      const q = a.join(' ');
      const it = forcePet ? null : IT.find(q), pet = PT.find(q);
      if (it && (!pet || IT.norm(it.name) === IT.norm(q) || it.id === IT.norm(q))) return { kind: 'item', it, qty };
      if (pet) return { kind: 'pet', pet };
      return { error: `⚠️ Couldn't find "${q}". Try an item name, a pet name, or money.` };
    }

    function execute(s) {
      const A = db.user(s.a.n), B = db.user(s.b.n), pairs = [[s.a, A, s.b, B], [s.b, B, s.a, A]];
      const fail = why => { s.a.ok = false; s.b.ok = false; return `⚠️ *TRADE FAILED*\n\n${why}\nNothing was moved.`; };
      if (A.loan || B.loan) return fail('Nobody can trade while they owe the mafia.');
      for (const [o, u, , r] of pairs) {
        if (o.money > u.wallet) return fail(`${tag(o.n)} doesn't have ${m(o.money)} anymore.`);
        for (const [id, k] of Object.entries(o.items)) {
          const it = IT.BY_ID[id];
          if (IT.count(u, id) < k) return fail(`${tag(o.n)} no longer has ${it.emoji} ${it.name}.`);
          if (!it.stack && IT.count(r, id)) return fail(`${tag(other(s, o.n).n)} already owns ${it.emoji} ${it.name}.`);
          if (!IT.unlocked(it, r)) return fail(`${tag(other(s, o.n).n)} hasn't unlocked ${it.emoji} ${it.name} (needs ${it.rebirth} rebirths).`);
        }
        for (const id of o.pets) {
          if (!PT.owned(u, id)) return fail(`${tag(o.n)} no longer has ${PT.BY_ID[id].emoji} ${PT.BY_ID[id].name}.`);
          if (PT.owned(r, id)) return fail(`${tag(other(s, o.n).n)} already owns ${PT.BY_ID[id].emoji} ${PT.BY_ID[id].name}.`);
        }
      }
      for (const [o, u, , r] of pairs) {
        u.wallet -= o.money; r.wallet += o.money;
        for (const [id, k] of Object.entries(o.items)) { IT.take(u, id, k); IT.add(r, id, k); }
        for (const id of o.pets) {
          const p = PT.owned(u, id); u.pets = u.pets.filter(x => x.id !== id); u.equipped = u.equipped.filter(x => x !== id);
          r.pets.push({ id, lvl: p.lvl || 0 }); if (r.equipped.length < PT.slots(r)) r.equipped.push(id);
        }
      }
      db.save(); end(s);
      return `🤝 *TRADE COMPLETE* ✅\n\n${tag(s.a.n)} gave:\n   ${offerText(s.a)}\n\n${tag(s.b.n)} gave:\n   ${offerText(s.b)}`;
    }

    def('trade', { g: true, usage: ['trade @user', 'trade add <thing>', 'trade confirm', 'trade cancel'] }, c => {
      const a0 = (c.args[0] || '').toLowerCase(), s = live(c.sender), me = db.user(c.sender);
      if (a0 === 'cancel' || a0 === 'decline') {
        if (!s) return c.reply('🤝 You have no trade open.');
        end(s); return c.reply(`🤝 *TRADE CANCELLED*\n\n${tag(c.sender)} cancelled the trade.`, mentions(s));
      }
      if (a0 === 'accept') {
        if (!s || s.state !== 'invite' || s.b.n !== c.sender) return c.reply('🤝 You have no trade invite.');
        s.state = 'open'; s.exp = Date.now() + TTL;
        return c.reply(`🤝 *TRADE STARTED*\n\n${tag(s.a.n)} ⇄ ${tag(s.b.n)}\n\nAdd things with *${P}trade add <item|pet|money> [amount]*\nExamples:\n➜ ${P}trade add money 50k\n➜ ${P}trade add pet lion\n➜ ${P}trade add padlock 2\n\nWhen you're happy: *${P}trade confirm*`, mentions(s));
      }
      if (['add', 'remove', 'confirm', 'view', ''].includes(a0) && a0 !== '' || (a0 === '' && s)) {
        if (!s) return c.reply(`🤝 You have no trade open. Start one: ${P}trade @user`);
        if (s.state !== 'open') return c.reply(s.b.n === c.sender ? `🤝 ${tag(s.a.n)} invited you. Type *${P}trade accept* or *${P}trade decline*.` : '🤝 Waiting for them to accept the invite.', mentions(s));
        const o = mine(s, c.sender);
        if (a0 === 'add') {
          const th = parseThing(c.args.slice(1)); if (!th) return c.reply(`⚠️ Usage: ${P}trade add <item|pet|money> [amount]`);
          if (th.error) return c.reply(th.error);
          if (th.kind === 'money') { if (th.amt > me.wallet) return c.reply(`⚠️ You only have ${m(me.wallet)}.`); o.money = th.amt; }
          else if (th.kind === 'item') {
            const have = IT.count(me, th.it.id); if (!have) return c.reply(`🎒 You don't have ${th.it.emoji} *${th.it.name}*.`);
            const k = Math.min(th.qty, have); o.items[th.it.id] = k;
            const rcv = db.user(other(s, c.sender).n);
            if (!IT.unlocked(th.it, rcv)) { delete o.items[th.it.id]; return c.reply(`🔒 They haven't unlocked ${th.it.emoji} *${th.it.name}* yet (needs ${th.it.rebirth} rebirths).`); }
          } else {
            if (!PT.owned(me, th.pet.id)) return c.reply(`🐾 You don't own a ${th.pet.emoji} *${th.pet.name}*.`);
            if (!o.pets.includes(th.pet.id)) o.pets.push(th.pet.id);
          }
          reset(s); return c.reply(view(s), mentions(s));
        }
        if (a0 === 'remove') {
          const th = parseThing(c.args.slice(1).length ? c.args.slice(1) : ['money', '1']);
          if (!th || th.error) return c.reply(`⚠️ Usage: ${P}trade remove <item|pet|money>`);
          if (th.kind === 'money') o.money = 0; else if (th.kind === 'item') delete o.items[th.it.id]; else o.pets = o.pets.filter(x => x !== th.pet.id);
          reset(s); return c.reply(view(s), mentions(s));
        }
        if (a0 === 'confirm') {
          const t = other(s, c.sender);
          if (!o.money && !Object.keys(o.items).length && !o.pets.length && !t.money && !Object.keys(t.items).length && !t.pets.length) return c.reply('⚠️ Nobody has added anything yet.');
          o.ok = true;
          if (!t.ok) return c.reply(`✅ ${tag(c.sender)} confirmed. Waiting for ${tag(t.n)}…\n\n${view(s)}`, mentions(s));
          return c.reply(execute(s), mentions(s));
        }
        return c.reply(`${view(s)}\n⏳ Expires in ${left(s.exp - Date.now())}`, mentions(s));
      }
      // start a new trade
      const t = c.target();
      if (!t || t.n === c.sender) return c.reply(`🤝 *TRADE*\n\n⚠️ Usage: ${P}trade @user\nThen: ${P}trade add <item|pet|money>, ${P}trade confirm`);
      if (s) return c.reply(`🤝 You already have a trade open. ${P}trade cancel to stop it.`);
      if (live(t.n)) return c.reply('🤝 They are already in a trade.', [t.jid]);
      if (me.loan) return c.reply('📕 You can\'t trade while you owe the mafia. Pay it first: ' + P + 'repay all');
      const sess = { a: side(c.sender, c.senderJid), b: side(t.n, t.jid), state: 'invite', exp: Date.now() + 60000 };
      byUser.set(c.sender, sess); byUser.set(t.n, sess);
      c.reply(`🤝 *TRADE REQUEST*\n\n${tag(c.sender)} wants to trade with ${tag(t.n)}\n\n${tag(t.n)}, type *${P}trade accept* or *${P}trade decline* (60s)`, [c.senderJid, t.jid]);
    });
  },
};
