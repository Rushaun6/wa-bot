// .bm borrow money. 6 hours to pay it back or the Russian mafia takes your inventory (the more you borrowed, the worse it gets)
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, wal, rnd, left, parseAmt, sleep } = L;
    const PT = L.pets, IT = L.items;
    const FEE = 0.10, HOURS = 6, MIN_LOAN = 1000;
    const limitOf = u => Math.min(1e11, Math.floor((100000 + 250000 * (u.rebirths || 0) + Math.max(0, u.wallet + u.bank) * 0.5) * (1 + PT.ab(u, 'loanlimit') / 100)));
    const feeOf = u => FEE * (1 - PT.ab(u, 'loanfee') / 100); // pets can shave the fee

    // what the mafia does, by how much was BORROWED (each tier includes the ones above it)
    const MOB = [
      { max: 250000,   name: '🥊 Street Thugs',     bank: false, pets: 0,      rebirth: 0, extra: 0,    text: 'take everything in your inventory' },
      { max: 2000000,  name: '🔫 The Local Crew',   bank: true,  pets: 0,      rebirth: 0, extra: 0,    text: 'take your inventory AND your bank' },
      { max: 25000000, name: '🕴️ Mob Enforcers',    bank: true,  pets: 0.5,    rebirth: 0, extra: 0,    text: 'take your inventory, bank and HALF your pets' },
      { max: 250000000, name: '🐻 The Bratva',      bank: true,  pets: 0.9,    rebirth: 1, extra: 0,    text: 'take your inventory, bank, almost all your pets and a rebirth' },
      { max: Infinity, name: '🎩 The Godfather',    bank: true,  pets: 1,      rebirth: 2, extra: 0.25, text: 'take EVERYTHING: inventory, bank, all pets, 2 rebirths + 25% extra debt' },
    ];
    const tierOf = principal => MOB.find(t => principal <= t.max);

    def(['bm', 'borrow'], { usage: ['bm <amount>', 'bm'] }, c => {
      const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase();
      if (u.loan) return c.reply(`📕 *LOAN*\n\nYou already owe *${m(u.loan.owed)}*.\n⏳ Due in *${left(Math.max(0, u.loan.due - Date.now()))}*\n\n➜ ${P}repay <amount|all>\n⚠️ ${tierOf(u.loan.principal).name} will ${tierOf(u.loan.principal).text}.`);
      const lim = limitOf(u);
      if (!a) return c.reply(`🏦 *BORROW MONEY*\n\n💰 You can borrow up to *${m(lim)}*\n📈 Fee: *${Math.round(feeOf(u) * 1000) / 10}%* • ⏳ Pay back within *${HOURS} hours*\n\n➜ ${P}bm <amount>   ➜ ${P}repay <amount|all>\n\n☠️ *If you don't pay, the Russian mafia comes:*\n${MOB.map((t, i) => `• ${t.max === Infinity ? 'over ' + m(MOB[i - 1].max) : (i === 0 ? 'under ' : 'up to ') + m(t.max)} → ${t.name}: ${t.text}`).join('\n')}\n\n_Whatever debt is left becomes a negative wallet._`);
      const amt = parseAmt(a); if (!amt || amt < MIN_LOAN) return c.reply(`⚠️ Minimum loan is ${m(MIN_LOAN)}.  Example: ${P}bm 50k`);
      if (amt > lim) return c.reply(`⚠️ You can borrow up to *${m(lim)}* right now.`);
      const owed = Math.round(amt * (1 + feeOf(u)));
      u.wallet += amt; u.loan = { principal: amt, owed, due: Date.now() + HOURS * 3600000 }; db.save();
      const t = tierOf(amt);
      L.animate(c, ['🏦 *LOAN*\n\n🤝 Meeting a shady lender…'], `🏦 *LOAN APPROVED*\n\n💵 You got *+${m(amt)}*\n📕 You owe: *${m(owed)}* (${Math.round(feeOf(u) * 1000) / 10}% fee)\n⏳ Pay within *${HOURS} hours*: ${P}repay all\n\n☠️ ${t.name} will ${t.text} if you don't.\n${wal(u)}`);
    });

    def(['repay', 'payback', 'debt'], { usage: 'repay <amount|all>' }, c => {
      const u = db.user(c.sender);
      if (!u.loan) return c.reply(`📗 *LOAN*\n\nYou don't owe anything. Borrow with ${P}bm <amount>`);
      const a = (c.args[0] || '').toLowerCase();
      if (!a) return c.reply(`📕 *YOUR DEBT*\n\nYou owe *${m(u.loan.owed)}*\n⏳ Due in *${left(Math.max(0, u.loan.due - Date.now()))}*\n${wal(u)}\n\n➜ ${P}repay <amount|all>`);
      const want = a === 'all' ? u.loan.owed : parseAmt(a);
      if (!want || want < 1) return c.reply(`⚠️ Usage: ${P}repay <amount|all>`);
      const pay = Math.min(want, u.loan.owed);
      if (u.wallet < pay) return c.reply(`⚠️ You need *${m(pay)}* in your wallet (you have ${m(u.wallet)}).`);
      u.wallet -= pay; u.loan.owed -= pay;
      if (u.loan.owed <= 0) { u.loan = null; db.save(); return c.reply(`📗 *DEBT CLEARED*\n\n✅ Paid *${m(pay)}* — the mafia is off your back.\n${wal(u)}`); }
      db.save(); c.reply(`📕 *PAYMENT MADE*\n\n💸 Paid *${m(pay)}*\n📕 Still owe: *${m(u.loan.owed)}*\n⏳ Due in *${left(Math.max(0, u.loan.due - Date.now()))}*\n${wal(u)}`);
    });

    // ---------- the mafia ----------
    function strike(n, u) {
      const loan = u.loan; if (!loan) return null;
      const t = tierOf(loan.principal), lines = [];
      let owed = Math.ceil(loan.owed * (1 + t.extra)), offset = 0;
      // 1) everything in the inventory (counts for 50% of its price against the debt)
      const spare = PT.ab(u, 'mafia'), saved = [];
      const items = IT.owned(u);
      for (const { item, n: k } of items) {
        if (spare && rnd(1, 100) <= spare) { saved.push(`${item.emoji} ${item.name}`); continue; } // a pet hid it from the mafia
        offset += Math.floor(item.price * 0.5) * k; lines.push(`${item.emoji} ${item.name}${k > 1 ? ' ×' + k : ''}`); IT.take(u, item.id, k);
      }
      if (!IT.count(u, 'padlock')) u.padlock = 0;
      // 2) the bank
      if (t.bank && u.bank > 0) { offset += u.bank; lines.push(`🏦 Bank: ${m(u.bank)}`); u.bank = 0; }
      // 3) pets (best ones first; they count for 50% of their price)
      if (t.pets && u.pets.length) {
        const sorted = [...u.pets].sort((a, b) => PT.BY_ID[b.id].price - PT.BY_ID[a.id].price);
        const k = t.pets >= 1 ? sorted.length : Math.floor(sorted.length * t.pets), gone = sorted.slice(0, k).filter(o => { if (spare && rnd(1, 100) <= spare) { saved.push(`${PT.BY_ID[o.id].emoji} ${PT.BY_ID[o.id].name} (pet)`); return false; } return true; });
        for (const o of gone) { offset += Math.floor(PT.BY_ID[o.id].price * 0.5); lines.push(`${PT.BY_ID[o.id].emoji} ${PT.BY_ID[o.id].name} (pet)`); }
        const ids = new Set(gone.map(o => o.id));
        u.pets = u.pets.filter(o => !ids.has(o.id)); u.equipped = u.equipped.filter(id => !ids.has(id));
      }
      // 4) rebirths
      if (t.rebirth && u.rebirths > 0) { const lost = Math.min(t.rebirth, u.rebirths); u.rebirths -= lost; lines.push(`🔁 ${lost} rebirth${lost > 1 ? 's' : ''}`); while (u.equipped.length > PT.slots(u)) u.equipped.pop(); }
      // 5) whatever the mafia couldn't cover turns your wallet negative
      const rest = Math.max(0, owed - offset);
      u.wallet -= rest; u.loan = null; u.mafia = (u.mafia || 0) + 1; db.save();
      return { t, lines, saved, rest, owed, wallet: u.wallet };
    }
    const strikeText = (n, r) => `🇷🇺 *THE RUSSIAN MAFIA CAME* 🇷🇺\n\n${r.t.name} collected *${m(r.owed)}* from @${n}\n\n☠️ *Taken:*\n${r.lines.length ? r.lines.map(x => '➜ ' + x).join('\n') : '➜ nothing (there was nothing left to take)'}${r.saved.length ? '\n\n🛡️ *Your pets hid these from the mafia:*\n' + r.saved.map(x => '➜ ' + x).join('\n') : ''}\n\n${r.rest > 0 ? `📕 Still short: *${m(r.rest)}* — ${r.wallet < 0 ? 'your wallet is now in the red: *' + m(r.wallet) + '*' : 'taken from your wallet.'}` : '✅ Debt settled.'}\n💡 Next time: ${P}repay all`;
    const sweep = async () => {
      const sock = L.state.sock, now = Date.now();
      for (const [n, u] of Object.entries(db.data.users)) {
        if (!u.loan || now < u.loan.due) continue;
        const r = strike(n, u); if (!r) continue;
        const jid = n + '@s.whatsapp.net', text = strikeText(n, r);
        if (!sock) continue;
        try { await sock.sendMessage(u.lastGroup || jid, { text, mentions: [jid] }); await sleep(1500); }
        catch (e) { try { await sock.sendMessage(jid, { text }); } catch {} }
      }
    };
    setInterval(() => sweep().catch(e => console.error('mafia sweep failed:', e?.message || e)), 30000).unref();
    L.loan = { strike, sweep, MOB };
  },
};
