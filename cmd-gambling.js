// gamble (coin flip, roulette), flip, dice, slots, duel
module.exports = {
  category: '🎲 GAMBLING',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    const SYM = ['🍒', '🍋', '🍇', '🔔', '💎', '7'];

    const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    const pending = new Map(); // duels

    // ---- roulette: red / black / even / odd pay 2x, green (the 0) pays 36x. Same wheel as before (0-36).
    const ROUL = { red: 2, black: 2, even: 2, odd: 2, green: 36 };
    function roulette(c, pick, a) {
      const amt = bet(c, a); if (!amt || L.cooldown(c, 'game', 3000)) return; const u = db.user(c.sender);
      const n = rnd(0, 36), color = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
      const win = pick === 'green' ? n === 0 : pick === 'even' ? n !== 0 && n % 2 === 0 : pick === 'odd' ? n % 2 === 1 : color === pick;
      const mult = ROUL[pick], net = win ? amt * (mult - 1) : -amt; u.wallet += net; db.save();
      const em = { red: '🔴', black: '⚫', green: '🟢' }[color], par = n === 0 ? '' : n % 2 ? ', odd' : ', even';
      L.animate(c, [`🎡 *ROULETTE*\n\n🎡 Spinning the wheel…\n🎯 You bet ${pick} • ${m(amt)}`, `🎡 *ROULETTE*\n\n⚪ The ball is bouncing…`], `🎡 *ROULETTE*\n\nThe ball landed on ${em} *${n}* (${color}${par})\nYou bet ${pick}\n\n${result(amt, net, mult, u)}`);
    }

    // ---- coin flip: the more you flip today, the luckier you get (resets every day).
    // Kept human: a play only counts if it is 5s+ after the last counted one, at most 200 count per day,
    // and the chance is capped. At LUCK_MAX above 50% a player wins money on average, set it to 0.5 to keep the house even.
    const LUCK_BASE = 0.48, LUCK_STEP = 0.0005, LUCK_MAX = 0.54, LUCK_PLAYS = 200, LUCK_GAP = 5000;
    const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.BOT_TZ || 'America/Jamaica' }).format(new Date());
    function flip(c, a) {
      const amt = bet(c, a); if (!amt || L.cooldown(c, 'game', 3000)) return; const u = db.user(c.sender), day = dayKey();
      let fl = u.flipLuck; if (!fl || fl.d !== day) fl = u.flipLuck = { d: day, n: 0, t: 0 };
      const chance = Math.min(LUCK_MAX, LUCK_BASE + LUCK_STEP * fl.n);
      const win = rnd(1, 10000) <= Math.round(chance * 10000);
      if (fl.n < LUCK_PLAYS && Date.now() - fl.t >= LUCK_GAP) { fl.n++; fl.t = Date.now(); }
      const net = win ? amt : -amt; u.wallet += net; db.save();
      L.animate(c, [`🪙 *COIN FLIP* 🪙\n\n🪙 Flipping…`, `🪙 *COIN FLIP* 🪙\n\n💫 In the air…`], `🪙 *COIN FLIP* 🪙\n\n${win ? '✨ It landed on your side! ✨' : '💔 It landed on the other side.'}\n\n${result(amt, net, 2, u)}\n🍀 Luck today: *${(chance * 100).toFixed(1)}%* · ${fl.n} play${fl.n === 1 ? '' : 's'}`);
    }

    def('gamble', { usage: ['gamble <amt|all>', 'gamble red|black <amt|all>', 'gamble even|odd <amt|all>', 'gamble green <amt|all>'] }, c => {
      const a0 = (c.args[0] || '').toLowerCase();
      if (ROUL[a0]) return roulette(c, a0, c.args[1]);
      flip(c, c.args[0]);
    });
    def(['flip', 'coinflip', 'cf'], { usage: 'flip <amt|all>' }, c => flip(c, c.args.find(x => /^(all|\d)/i.test(x))));

    def('dice', { usage: 'dice <amt>' }, c => {
      const amt = bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return; const u = db.user(c.sender);
      const roll = () => [rnd(1, 6), rnd(1, 6)]; const a = roll(), b = roll();
      const sa = a[0] + a[1], sb = b[0] + b[1];
      const net = sa > sb ? amt : sa < sb ? -amt : 0; u.wallet += net; db.save();
      L.animate(c, [`🎲 *DICE*\n\n🎲 Rolling the dice…`, `🎲 *DICE*\n\nYou rolled 🎲 ${a[0]} + ${a[1]} = *${sa}*\n\n🎲 Bot is rolling…`], `🎲 *DICE*\n\nYou rolled 🎲 ${a[0]} + ${a[1]} = *${sa}*\nBot rolled 🎲 ${b[0]} + ${b[1]} = *${sb}*\n\n${result(amt, net, 2, u)}`);
    });

    function slot(c, title, big, jack, pair) {
      const amt = bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return; const u = db.user(c.sender);
      const r = [rnd(0, 5), rnd(0, 5), rnd(0, 5)];
      let mult = 0;
      if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === 5 ? jack : big;
      else if (pair && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2])) mult = pair;
      const net = Math.floor(amt * mult) - amt; u.wallet += net; db.save();
      const msg = mult >= big ? '🎉 *JACKPOT!* 🎉' : net > 0 ? '✨ Pair!' : '😬 No match';
      const reel = n => r.map((v, i) => i < n ? SYM[v] : '🌀').join(' | ');
      const spin = n => `${title}\n\n[ ${reel(n)} ]\n\n🎰 Spinning…`;
      L.animate(c, [spin(0), spin(1), spin(2)], `${title}\n\n[ ${r.map(i => SYM[i]).join(' | ')} ]\n\n${msg}\n\n${result(amt, net, mult, u)}`);
    }

    def(['slot', 'slots'], { usage: 'slots <bet|all>' }, c => slot(c, '🎰 *SLOTS* 🎰', 10, 20, 1.5));

    // slot2 = "lucky slots": 4 symbols, 3x3 window, only the middle row pays. Pairs pay a bit, so you win often.
    const SYM2 = ['🍒', '🍋', '🍇', '💎'];
    def('slot2', { usage: 'slot2 <bet|all>' }, c => {
      const amt = bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return;
      const u = db.user(c.sender);
      const g = [0, 1, 2].map(() => [rnd(0, 3), rnd(0, 3), rnd(0, 3)]); // 3 rows x 3 reels
      for (const i of [0, 2]) while (g[i][0] === g[i][1] && g[i][1] === g[i][2]) g[i][2] = rnd(0, 3); // top/bottom rows are decoration: never show a fake 3-in-a-row
      const [a, b, d] = g[1];
      const triple = a === b && b === d, pair = !triple && (a === b || b === d || a === d);
      const mult = triple ? (a === 3 ? 7 : 4) : pair ? 1.2 : 0;
      const net = Math.floor(amt * mult) - amt; u.wallet += net; db.save();
      const T = '🍀 *LUCKY SLOTS* 🍀';
      const win = n => g.map((row, i) => ' ' + row.map((v, j) => j < n ? SYM2[v] : '🌀').join('  |  ') + (i === 1 ? '  ◄' : '')).join('\n');
      const box = n => `${T}\n\n╔═════════════╗\n${win(n)}\n╚═════════════╝`;
      const msg = triple ? (a === 3 ? '💎 *DIAMOND JACKPOT!* 💎' : '🎉 *Three of a kind!* 🎉') : pair ? '✨ Two match — small win!' : '😬 No match on the line';
      L.animate(c, [box(0), box(1), box(2)], `${box(3)}\n\n${msg}\n\n${result(amt, net, mult, u)}`);
    });

    def('duel', { g: true, usage: 'duel @user <amt>' }, c => {
      const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}duel @user <amount>`);
      const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
      if (db.user(t.n).wallet < amt) return c.reply('⚠️ They cannot afford that bet.');
      pending.set(c.chat + ':' + t.n, { from: c.sender, fromJid: c.senderJid, amt, exp: Date.now() + 60000 });
      c.reply(`⚔️ *DUEL*\n\n@${c.sender} challenges @${t.n}\nPot: *${m(amt)}* each — no cut (duel pets can tilt the odds)\n\n@${t.n}, type ${P}accept or ${P}decline within 60s.`, [c.senderJid, t.jid]);
    });

    def('accept', { g: true }, c => {
      const key = c.chat + ':' + c.sender, d = pending.get(key);
      if (!d || Date.now() > d.exp) { pending.delete(key); return c.reply('⚠️ No active duel for you.'); }
      pending.delete(key);
      const a = db.user(d.from), b = db.user(c.sender);
      if (a.wallet < d.amt || b.wallet < d.amt) return c.reply('⚠️ Duel cancelled — someone can no longer afford it.');
      const pa = Math.max(5, Math.min(95, 50 + L.pets.duelBonus(a) - L.pets.duelBonus(b))), winA = rnd(1, 100) <= pa, // pet abilities tilt the odds
         w = winA ? a : b, l = winA ? b : a, wn = winA ? d.from : c.sender, ln = winA ? c.sender : d.from;
      w.wallet += d.amt; l.wallet -= d.amt; db.save();
      c.reply(`⚔️ *DUEL RESULT*\n\n🏆 @${wn} wins *+${m(d.amt)}*\n💀 @${ln} loses *-${m(d.amt)}*`, [d.fromJid, c.senderJid]);
    });

    def('decline', { g: true }, c => { const k = c.chat + ':' + c.sender; if (pending.delete(k)) c.reply('⚔️ Duel declined.'); });

    // slot3 = "high roller": needs $50k+, weighted symbols, pair = bet back, 30% cashback on a loss
    const SYM3 = [['🍒', 30, 3], ['🍋', 25, 4], ['🔔', 20, 6], ['💎', 15, 10], ['7️⃣', 10, 25]]; // [emoji, weight, triple multiplier]
    const SPIN3 = () => { let r = rnd(1, 100); for (const s of SYM3) if ((r -= s[1]) <= 0) return s; return SYM3[0]; };
    const ANY3 = () => SYM3[rnd(0, SYM3.length - 1)][0];
    def('slot3', { usage: 'slot3 <bet|all>' }, c => {
      const u = db.user(c.sender);
      if (u.wallet < 50000) return c.reply(`🔒 *SLOT3 – HIGH ROLLERS*\n\nYou need at least *${m(50000)}* in your wallet to play.\n${wal(u)}`);
      const amt = bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return;
      const r = [SPIN3(), SPIN3(), SPIN3()], kinds = new Set(r.map(s => s[0])).size; // 1 = triple, 2 = pair, 3 = none
      let net, mult = 0, note;
      if (kinds === 1) { mult = r[0][2]; net = amt * mult - amt; note = `🎉 *JACKPOT!* Three ${r[0][0]}`; }
      else if (kinds === 2) { net = 0; note = '😅 Two of a kind, bet returned.'; }
      else { const back = Math.floor(amt * 0.3); net = -(amt - back); note = `💔 No match. *${m(back)}* cashback (30%) returned.`; }
      u.wallet += net; db.save();
      const T = '🎰 *SLOT3* 🎰';
      L.animate(c, [`${T}\n\n[ ${ANY3()} | ${ANY3()} | ${ANY3()} ]`, `${T}\n\n[ ${r[0][0]} | ${ANY3()} | ${ANY3()} ]`, `${T}\n\n[ ${r[0][0]} | ${r[1][0]} | ${ANY3()} ]`],
        `${T}\n\n[ ${r.map(s => s[0]).join(' | ')} ]\n\n${note}\n\n${result(amt, net, mult, u)}`);
    });

    // slot4 = "hard mode": ONLY three of a kind wins (about 4% of spins), but it pays big: x10 / x50 / x100 / x500 / x1000
    const SYM4 = [['🍀', 33, 10], ['🔔', 17, 50], ['💎', 10, 100], ['👑', 6, 500], ['7️⃣', 4, 1000], ['🍋', 10, 0], ['🍉', 10, 0], ['🍇', 10, 0]]; // [emoji, weight, triple multiplier] (0 = blank, never pays)
    const SPIN4 = () => { let r = rnd(1, 100); for (const s of SYM4) if ((r -= s[1]) <= 0) return s; return SYM4[0]; };
    const ANY4 = () => SYM4[rnd(0, SYM4.length - 1)][0];
    def('slot4', { usage: 'slot4 <bet|all>' }, c => {
      const T = '🎰 *SLOT4 — HARD MODE* 🎰';
      if (!c.args[0]) return c.reply(`${T}\n\nOnly *three of a kind* wins, but it pays BIG:\n\n🍀🍀🍀 ➜ *x10*\n🔔🔔🔔 ➜ *x50*\n💎💎💎 ➜ *x100*\n👑👑👑 ➜ *x500*\n7️⃣7️⃣7️⃣ ➜ *x1000*\n\n🍋🍉🍇 are blanks and never pay.\n➜ ${P}slot4 <bet|all>`);
      const amt = bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return;
      const u = db.user(c.sender), r = [SPIN4(), SPIN4(), SPIN4()], win = r[0][0] === r[1][0] && r[1][0] === r[2][0] && r[0][2] > 0;
      const mult = win ? r[0][2] : 0, net = win ? amt * mult - amt : -amt;
      const near = !win && (r[0][0] === r[1][0] || r[1][0] === r[2][0]) && r[1][2] >= 50; // a good pair that just missed
      u.wallet += net; db.save();
      const note = win ? (mult >= 500 ? `👑🔥 *MEGA JACKPOT!!!* Three ${r[0][0]} 🔥👑` : `🎉 *JACKPOT!* Three ${r[0][0]}`) : near ? '😩 So close! Two shiny ones...' : '💨 No match.';
      L.animate(c, [`${T}\n\n[ ${ANY4()} | ${ANY4()} | ${ANY4()} ]`, `${T}\n\n[ ${r[0][0]} | ${ANY4()} | ${ANY4()} ]`, `${T}\n\n[ ${r[0][0]} | ${r[1][0]} | ${ANY4()} ]`],
        `${T}\n\n[ ${r.map(s => s[0]).join(' | ')} ]\n\n${note}\n\n${result(amt, net, mult, u)}`);
    });
  },
};
