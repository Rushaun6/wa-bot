// gamble, dice, slots, duel
module.exports = {
  category: '🎲 GAMBLING',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    const SYM = ['🍒', '🍋', '🍇', '🔔', '💎', '7'];

    const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    const pending = new Map(); // duels

    def('gamble', { usage: ['gamble <amt>', 'gamble red <amt>', 'gamble black <amt>'] }, c => {
      const u = db.user(c.sender); const a0 = (c.args[0] || '').toLowerCase();
      if (a0 === 'red' || a0 === 'black') {
        const amt = bet(c, c.args[1]); if (!amt) return;
        const n = rnd(0, 36), color = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
        const em = { red: '🔴', black: '⚫', green: '🟢' }[color];
        const net = color === a0 ? amt : -amt; u.wallet += net; db.save();
        c.reply(`🎡 *ROULETTE*\n\nThe ball landed on ${em} *${n}* (${color})\nYou bet ${a0}\n\n${result(amt, net, 2, u)}`);
      } else {
        const amt = bet(c, c.args[0]); if (!amt) return;
        const win = rnd(1, 100) <= 48, net = win ? amt : -amt; u.wallet += net; db.save();
        c.reply(`🪙 *COIN FLIP* 🪙\n\n${win ? '✨ It landed on your side! ✨' : '💔 It landed on the other side.'}\n\n${result(amt, net, 2, u)}`);
      }
    });

    def('dice', { usage: 'dice <amt>' }, c => {
      const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
      const roll = () => [rnd(1, 6), rnd(1, 6)]; const a = roll(), b = roll();
      const sa = a[0] + a[1], sb = b[0] + b[1];
      const net = sa > sb ? amt : sa < sb ? -amt : 0; u.wallet += net; db.save();
      c.reply(`🎲 *DICE*\n\nYou rolled 🎲 ${a[0]} + ${a[1]} = *${sa}*\nBot rolled 🎲 ${b[0]} + ${b[1]} = *${sb}*\n\n${result(amt, net, 2, u)}`);
    });

    function slot(c, title, big, jack, pair) {
      const amt = bet(c, c.args[0]); if (!amt) return; const u = db.user(c.sender);
      const r = [rnd(0, 5), rnd(0, 5), rnd(0, 5)];
      let mult = 0;
      if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === 5 ? jack : big;
      else if (pair && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2])) mult = pair;
      const net = Math.floor(amt * mult) - amt; u.wallet += net; db.save();
      const msg = mult >= big ? '🎉 *JACKPOT!* 🎉' : net > 0 ? '✨ Pair!' : '😬 No match';
      c.reply(`${title}\n\n[ ${r.map(i => SYM[i]).join(' | ')} ]\n\n${msg}\n\n${result(amt, net, mult, u)}`);
    }

    def(['slot', 'slots'], { usage: 'slots <bet|all>' }, c => slot(c, '🎰 *SLOTS* 🎰', 10, 20, 1.5));

    def('slot2', { usage: 'slot2 <bet|all>' }, c => slot(c, '🎰 *SLOTS 2* 🎰', 30, 60, 0)); // high risk, high reward

    def('duel', { g: true, usage: 'duel @user <amt>' }, c => {
      const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}duel @user <amount>`);
      const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
      if (db.user(t.n).wallet < amt) return c.reply('⚠️ They cannot afford that bet.');
      pending.set(c.chat + ':' + t.n, { from: c.sender, fromJid: c.senderJid, amt, exp: Date.now() + 60000 });
      c.reply(`⚔️ *DUEL*\n\n@${c.sender} challenges @${t.n}\nPot: *${m(amt)}* each — 50/50, no cut\n\n@${t.n}, type ${P}accept or ${P}decline within 60s.`, [c.senderJid, t.jid]);
    });

    def('accept', { g: true }, c => {
      const key = c.chat + ':' + c.sender, d = pending.get(key);
      if (!d || Date.now() > d.exp) { pending.delete(key); return c.reply('⚠️ No active duel for you.'); }
      pending.delete(key);
      const a = db.user(d.from), b = db.user(c.sender);
      if (a.wallet < d.amt || b.wallet < d.amt) return c.reply('⚠️ Duel cancelled — someone can no longer afford it.');
      const winA = rnd(0, 1) === 0, w = winA ? a : b, l = winA ? b : a, wn = winA ? d.from : c.sender, ln = winA ? c.sender : d.from;
      w.wallet += d.amt; l.wallet -= d.amt; db.save();
      c.reply(`⚔️ *DUEL RESULT*\n\n🏆 @${wn} wins *+${m(d.amt)}*\n💀 @${ln} loses *-${m(d.amt)}*`, [d.fromJid, c.senderJid]);
    });

    def('decline', { g: true }, c => { const k = c.chat + ':' + c.sender; if (pending.delete(k)) c.reply('⚔️ Duel declined.'); });
  },
};
