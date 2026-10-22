// number draw, tic tac toe, hangman. Prizes are paid by the bot with a daily cap per player.
module.exports = {
  category: '🎮 MINIGAMES',
  register(def, L) {
    const { P, db, m, rnd, left, sleep } = L;
    const DAILY_CAP = Number(process.env.PRIZE_CAP) || 30000; // max minigame prize money per player per day
    const DRAW_MS = Number(process.env.DRAW_MS) || 30000;
    const DRAW_PRIZE = 10000, TTT_PRIZE = 7000, HANG_PRIZE = 7000;
    const draws = new Map(), ttt = new Map(), hang = new Map(), cool = new Map();
    L.mini = { draws, ttt, hang }; // exposed for tests

    function prize(n, amt) { // pays up to the daily cap, returns how much was actually paid
      const u = db.user(n), day = new Date().toISOString().slice(0, 10);
      if (u.prizeDay !== day) { u.prizeDay = day; u.prizeAmt = 0; }
      const paid = Math.max(0, Math.min(amt, DAILY_CAP - (u.prizeAmt || 0)));
      u.wallet += paid; u.prizeAmt = (u.prizeAmt || 0) + paid; db.save();
      return paid;
    }
    const prizeLine = (paid, amt) => paid >= amt ? `💰 Prize: *+${m(paid)}*` : paid > 0 ? `💰 Prize: *+${m(paid)}* (daily prize cap reached)` : `💰 No prize — daily prize cap of ${m(DAILY_CAP)} reached`;
    const cooling = (c, key, ms) => { const k = key + c.chat, t = cool.get(k) || 0; if (Date.now() < t && !process.env.NO_COOLDOWN) { c.reply(`⏳ Take a breather — wait *${left(t - Date.now())}*.`); return true; } cool.set(k, Date.now() + ms); return false; };
    const tag = n => '@' + n;

    // ================= NUMBER DRAW =================
    def(['numberdraw', 'nd'], { g: true, usage: 'numberdraw' }, c => {
      const d = draws.get(c.chat);
      if (d) return c.reply(`🎲 *NUMBER DRAW*\n\nA draw is already running! Pick with *${P}draw <1-20>* — ${left(d.end - Date.now())} left.`);
      if (cooling(c, 'nd', 60000)) return;
      const round = { entries: new Map(), end: Date.now() + DRAW_MS };
      draws.set(c.chat, round);
      c.reply(`🎲 *NUMBER DRAW*\n\n🔢 Pick a number from 1 to 20:\n➜ *${P}draw <number>*\n\n🏆 Exact match wins *${m(DRAW_PRIZE)}*\n⏳ Drawing in *${Math.round(DRAW_MS / 1000)}s*`);
      setTimeout(async () => {
        draws.delete(c.chat);
        try {
          const win = rnd(1, 20), winners = [...round.entries.values()].filter(e => e.pick === win);
          const first = await c.sock.sendMessage(c.chat, { text: '🎲 *NUMBER DRAW*\n\n🎰 Drawing the number…' });
          await sleep(1500);
          let text = `🎲 *NUMBER DRAW*\n\n🎯 The number is *${win}*!\n👥 Players: *${round.entries.size}*\n\n`;
          if (!winners.length) text += '😬 Nobody picked it. Better luck next time!';
          else text += winners.map(w => `🏆 ${tag(w.n)} — ${prizeLine(prize(w.n, DRAW_PRIZE), DRAW_PRIZE)}`).join('\n');
          await c.sock.sendMessage(c.chat, { text, edit: first.key, mentions: winners.map(w => w.jid) });
        } catch (e) { console.error('draw failed:', e?.message || e); }
      }, DRAW_MS);
    });
    def('draw', { g: true, usage: 'draw <1-20>' }, c => {
      const d = draws.get(c.chat);
      if (!d) return c.reply(`🎲 No draw running. Start one with *${P}numberdraw*`);
      const pick = parseInt(c.args[0], 10);
      if (!(pick >= 1 && pick <= 20)) return c.reply(`⚠️ Pick a number from 1 to 20.  Example: ${P}draw 7`);
      if (d.entries.has(c.sender)) return c.reply(`🎲 You already picked *${d.entries.get(c.sender).pick}*. Good luck!`);
      d.entries.set(c.sender, { n: c.sender, jid: c.senderJid, pick });
      c.reply(`✅ ${tag(c.sender)} picked *${pick}*  (${d.entries.size} player${d.entries.size > 1 ? 's' : ''} in)`, [c.senderJid]);
    });

    // ================= TIC TAC TOE =================
    const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'], SIGN = { x: '❌', o: '⭕' };
    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const board = g => [0, 1, 2].map(r => [0, 1, 2].map(i => g.b[r * 3 + i] ? SIGN[g.b[r * 3 + i]] : NUM[r * 3 + i]).join(' ')).join('\n');
    const head = g => `⭕❌ *TIC TAC TOE*\n${tag(g.x.n)} ${SIGN.x}  vs  ${tag(g.o.n)} ${SIGN.o}`;
    const live = g => (ttt.get(g.chat) === g && Date.now() < g.exp);
    def(['ttt', 'tictactoe'], { g: true, usage: ['ttt @user', 'ttt <1-9>'] }, async c => {
      let g = ttt.get(c.chat); if (g && Date.now() >= g.exp) { ttt.delete(c.chat); g = null; }
      const a = (c.args[0] || '').toLowerCase();
      if (a === 'end') {
        if (!g) return c.reply('⭕ No game running.');
        if (![g.x.n, g.o.n].includes(c.sender) && !c.isBotAdmin) return c.reply('⭕ Only the players can end the game.');
        ttt.delete(c.chat); return c.reply('⭕❌ *TIC TAC TOE*\n\nGame ended.');
      }
      if (a === 'accept' || a === 'decline') {
        if (!g || g.state !== 'invite' || g.o.n !== c.sender) return c.reply('⭕ You have no invite to answer.');
        if (a === 'decline') { ttt.delete(c.chat); return c.reply(`⭕❌ *TIC TAC TOE*\n\n${tag(c.sender)} declined.`, [c.senderJid]); }
        g.state = 'play'; g.turn = 'x'; g.exp = Date.now() + 3 * 60000;
        return c.reply(`${head(g)}\n\n${board(g)}\n\n👉 ${tag(g.x.n)} goes first: *${P}ttt <1-9>*\n🏆 Winner gets *${m(TTT_PRIZE)}*`, [g.x.jid, g.o.jid]);
      }
      const move = parseInt(a, 10);
      if (move >= 1 && move <= 9) {
        if (!g || g.state !== 'play') return c.reply(`⭕ No game running. Start one with *${P}ttt @user*`);
        const mine = g[g.turn];
        if (c.sender !== mine.n) return c.reply(`⭕ It's ${tag(mine.n)}'s turn.`, [mine.jid]);
        if (g.b[move - 1]) return c.reply('⚠️ That square is taken.');
        g.b[move - 1] = g.turn; g.exp = Date.now() + 3 * 60000;
        const won = LINES.some(l => l.every(i => g.b[i] === g.turn));
        if (won) {
          ttt.delete(c.chat);
          return c.reply(`${head(g)}\n\n${board(g)}\n\n🏆 ${tag(mine.n)} wins!\n${prizeLine(prize(mine.n, TTT_PRIZE), TTT_PRIZE)}`, [g.x.jid, g.o.jid]);
        }
        if (g.b.every(Boolean)) { ttt.delete(c.chat); return c.reply(`${head(g)}\n\n${board(g)}\n\n🤝 It's a draw!`, [g.x.jid, g.o.jid]); }
        g.turn = g.turn === 'x' ? 'o' : 'x';
        return c.reply(`${head(g)}\n\n${board(g)}\n\n👉 ${tag(g[g.turn].n)}'s turn`, [g.x.jid, g.o.jid]);
      }
      // challenge
      const t = c.target();
      if (!t || t.n === c.sender) return c.reply(`⭕❌ *TIC TAC TOE*\n\n⚠️ Usage: ${P}ttt @user\nMoves: ${P}ttt 1-9`);
      if (g) return c.reply('⭕ A game is already running in this chat.');
      ttt.set(c.chat, { chat: c.chat, state: 'invite', x: { n: c.sender, jid: c.senderJid }, o: { n: t.n, jid: t.jid }, b: Array(9).fill(null), turn: 'x', exp: Date.now() + 60000 });
      c.reply(`⭕❌ *TIC TAC TOE*\n\n${tag(c.sender)} challenges ${tag(t.n)}!\n🏆 Winner gets *${m(TTT_PRIZE)}*\n\n${tag(t.n)}, type *${P}ttt accept* or *${P}ttt decline* (60s)`, [c.senderJid, t.jid]);
    });

    // ================= HANGMAN =================
    const WORDS = { animal: ['elephant', 'giraffe', 'dolphin', 'penguin', 'kangaroo', 'crocodile', 'butterfly', 'octopus', 'flamingo', 'hedgehog'],
      food: ['pineapple', 'chocolate', 'sandwich', 'spaghetti', 'strawberry', 'avocado', 'pancake', 'coconut', 'watermelon', 'broccoli'],
      place: ['jamaica', 'brazil', 'canada', 'australia', 'egypt', 'mexico', 'iceland', 'portugal', 'singapore', 'argentina'],
      tech: ['keyboard', 'internet', 'password', 'software', 'database', 'battery', 'bluetooth', 'whatsapp', 'computer', 'wireless'],
      sport: ['football', 'basketball', 'swimming', 'athletics', 'volleyball', 'cricket', 'baseball', 'gymnastics', 'marathon', 'tennis'],
      thing: ['umbrella', 'telescope', 'treasure', 'lighthouse', 'backpack', 'staircase', 'mountain', 'rainbow', 'fireworks', 'bicycle'] };
    const LIVES = 6;
    const mask = g => [...g.word].map(ch => g.got.has(ch) ? ch.toUpperCase() : '＿').join(' ');
    const hHead = g => `🪢 *HANGMAN*  _(${g.cat})_\n\n${mask(g)}\n\n${'❤️'.repeat(LIVES - g.wrong.size)}${'🖤'.repeat(g.wrong.size)}\n${g.wrong.size ? '❌ ' + [...g.wrong].join(' ').toUpperCase() : '—'}`;
    def('hangman', { g: true, usage: 'hangman' }, c => {
      let g = hang.get(c.chat); if (g && Date.now() >= g.exp) { hang.delete(c.chat); g = null; }
      if (g) return c.reply(`${hHead(g)}\n\nGuess: *${P}hg <letter>*`);
      if (cooling(c, 'hg', 60000)) return;
      const cats = Object.keys(WORDS), cat = cats[rnd(0, cats.length - 1)], word = WORDS[cat][rnd(0, WORDS[cat].length - 1)];
      g = { cat, word, got: new Set(), wrong: new Set(), exp: Date.now() + 5 * 60000 };
      hang.set(c.chat, g);
      c.reply(`${hHead(g)}\n\n🏆 Whoever finishes the word wins *${m(HANG_PRIZE)}*\nGuess a letter: *${P}hg <letter>*  or the whole word: *${P}hg <word>*`);
    });
    def(['hg', 'hguess'], { g: true, usage: 'hg <letter|word>' }, c => {
      let g = hang.get(c.chat); if (g && Date.now() >= g.exp) { hang.delete(c.chat); g = null; }
      if (!g) return c.reply(`🪢 No game running. Start one with *${P}hangman*`);
      const a = (c.args[0] || '').toLowerCase();
      if (!/^[a-z]+$/.test(a)) return c.reply(`⚠️ Send a letter or a word. Example: ${P}hg e`);
      const finish = lost => {
        hang.delete(c.chat);
        if (lost) return c.reply(`${hHead(g)}\n\n💀 *Game over!* The word was *${g.word.toUpperCase()}*`);
        c.reply(`${hHead(g)}\n\n🎉 ${tag(c.sender)} solved it!\n${prizeLine(prize(c.sender, HANG_PRIZE), HANG_PRIZE)}`, [c.senderJid]);
      };
      if (a.length > 1) {
        if (a === g.word) { for (const ch of g.word) g.got.add(ch); return finish(false); }
        g.wrong.add(a.slice(0, 3) + '…'); if (g.wrong.size >= LIVES) return finish(true);
        return c.reply(`${hHead(g)}\n\n❌ Nope, it's not *${a.toUpperCase()}*`);
      }
      if (g.got.has(a) || g.wrong.has(a)) return c.reply(`⚠️ *${a.toUpperCase()}* was already guessed.`);
      if (g.word.includes(a)) {
        g.got.add(a);
        if ([...g.word].every(ch => g.got.has(ch))) return finish(false);
        return c.reply(`${hHead(g)}\n\n✅ Yes! *${a.toUpperCase()}* is in the word`);
      }
      g.wrong.add(a);
      if (g.wrong.size >= LIVES) return finish(true);
      c.reply(`${hHead(g)}\n\n❌ No *${a.toUpperCase()}* in the word`);
    });
  },
};
