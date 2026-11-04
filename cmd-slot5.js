// slot5 = "MEGA 5-REEL": 5 reels, one payline read left to right. 3, 4 or 5 matching symbols in a row from the LEFT pay.
// 🃏 WILD substitutes for any symbol. ⭐ SCATTER pays anywhere on the reels (3+), on top of any line win.
// Payout rate (RTP) is 90.7% (about 29% of spins pay something). Computed exactly by checking every possible spin.
const SYMS = [ // [emoji, weight, pays for a run of 2, 3, 4, 5]
  ['🍒', 28, [0.75, 4, 8, 24]],
  ['🍋', 24, [0.75, 4, 10, 30]],
  ['🍇', 16, [0.75, 6, 13, 36]],
  ['🔔', 10, [1.5, 10, 24, 72]],
  ['💎', 6,  [2, 17, 48, 180]],
  ['👑', 3,  [3, 30, 130, 480]],
  ['7️⃣', 1,  [5, 60, 320, 1200]],
];
const WILD = ['🃏', 6], SCATTER = ['⭐', 6], SCATTER_PAY = { 3: 5, 4: 25, 5: 100 };
const POOL = [...SYMS.map(s => ({ e: s[0], w: s[1], pays: s[2] })), { e: WILD[0], w: WILD[1], wild: true }, { e: SCATTER[0], w: SCATTER[1], scatter: true }];
const TOTAL = POOL.reduce((s, x) => s + x.w, 0);

// pure payout function (the exact-RTP checker uses it too). reels = array of 5 pool entries
function payout(reels) {
  const norm = reels.map(r => r);
  // line: the first non-wild symbol on the left decides which symbol we are matching
  let target = null;
  for (const r of norm) { if (r.scatter) break; if (!r.wild) { target = r; break; } }
  let run = 0, line = 0;
  if (!norm[0].scatter) {
    const t = target || POOL.find(p => p.e === '7️⃣'); // five wilds count as the top symbol
    for (const r of norm) { if (r.wild || r.e === t.e) run++; else break; }
    if (run >= 2) line = t.pays[run - 2];
  }
  const sc = norm.filter(r => r.scatter).length, scat = SCATTER_PAY[sc] || 0;
  return { mult: line + scat, line, run, sc };
}
const draw = rnd => { let r = rnd(1, TOTAL); for (const p of POOL) if ((r -= p.w) <= 0) return p; return POOL[0]; };

module.exports = {
  category: '🎲 GAMBLING',
  _payout: payout, _pool: POOL, _total: TOTAL, // exported for testing only
  register(def, L) {
    const { P, db, m, result, rnd } = L;
    const T = '🎰 *SLOT5 — MEGA 5 REEL* 🎰';
    const any = () => POOL[rnd(0, POOL.length - 1)].e;

    def('slot5', { usage: 'slot5 <bet|all>' }, c => {
      if (!c.args[0]) return c.reply(`${T}\n\n5 reels, one line. Match 2, 3, 4 or 5 in a row *from the left* (2 / 3 / 4 / 5):\n\n🍒 x0.75 / x4 / x8 / x24\n🍋 x0.75 / x4 / x10 / x30\n🍇 x0.75 / x6 / x13 / x36\n🔔 x1.5 / x10 / x24 / x72\n💎 x2 / x17 / x48 / x180\n👑 x3 / x30 / x130 / x480\n7️⃣ x5 / x60 / x320 / x1200\n\n🃏 *WILD* matches anything\n⭐ *SCATTER* pays anywhere: 3 = x5, 4 = x25, 5 = x100\n\n➜ ${P}slot5 <bet|all>`);
      const amt = L.bet(c, c.args[0]); if (!amt || L.cooldown(c, 'game', 3000)) return;
      const u = db.user(c.sender), reels = Array.from({ length: 5 }, () => draw(rnd)), r = payout(reels);
      const net = Math.floor(amt * r.mult) - amt; u.wallet += net; db.save();
      const row = n => reels.map((x, i) => i < n ? x.e : '🌀').join(' ');
      const spin = n => `${T}\n\n[ ${row(n)} ]\n\n🎰 Spinning…`;
      const wilds = reels.filter(x => x.wild).length;
      const note = r.mult >= 100 ? '👑🔥 *MEGA WIN!!!* 🔥👑' : r.mult >= 20 ? '🎉 *BIG WIN!* 🎉' : r.sc >= 3 ? `⭐ *SCATTER x${r.sc}!*` : r.mult > 0 && r.mult < 1 ? `↩️ ${r.run} in a row: part of your bet back` : r.mult > 0 ? `✨ ${r.run} in a row${wilds ? ' (wild helped!)' : ''}` : r.run === 1 ? '😩 So close…' : '💨 No win';
      L.animate(c, [spin(0), spin(1), spin(2), spin(3), spin(4)], `${T}\n\n[ ${reels.map(x => x.e).join(' ')} ]\n\n${note}\n\n${result(amt, net, r.mult, u)}`);
    });
  },
};
