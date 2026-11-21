// 🗣️ MARKET RUMORS (.rumor, private chat only so you stay anonymous): pay coins to plant a rumor that nudges an asset's price.
// A "market inspector" may catch you 20-90 minutes later: the price snaps back, you're fined 3x what you paid, and the news says someone was caught.
// Bump size is capped (max ~10%), costs at least $50,000, and the catch odds rise the more rumors you plant, so it is a gamble, not a money machine.
// Pets with the 🗣️ silver perk make rumors stronger and harder to catch.
module.exports = {
  category: '🗣️ RUMORS',
  register(def, L) {
    const { P, db, m, rnd } = L, PT = L.pets, T = new Proxy({}, { get: (_, k) => L.trading[k] }); // cmd-trading.js loads after this file, so look it up when used
    L.ECON?.add('🗣️ RUMORS');
    const MIN = 50000, DAILY = 5, MAX_PENDING = 2;
    const rumors = () => (db.data.events.rumors ||= []);
    const TEXT = { up: [n => `Whispers: big buyers are quietly piling into ${n}`, n => `Trader chatter says ${n} is about to break out`, n => `Anonymous post claims a major announcement for ${n} is coming`], down: [n => `Whispers: big holders are quietly dumping ${n}`, n => `Trader chatter says ${n} is about to tank`, n => `Anonymous post claims trouble is brewing inside ${n}`] };
    const dm = (n, text) => { const s = L.state.sock; if (s) s.sendMessage(n + '@s.whatsapp.net', { text }).catch(() => {}); };

    def(['rumor', 'rumour'], { usage: ['rumor MOON up 100k'] }, c => {
      const S = T.load(), a = c.args.map(x => x.toLowerCase());
      if (c.isGroup) return c.reply(`🗣️ Rumors are spread in *private chat* with me, so nobody sees who did it. Message me: ${P}rumor MOON up 100k`);
      const sym = (c.args[0] || '').toUpperCase(), dir = a[1] === 'up' ? 'up' : a[1] === 'down' ? 'down' : null, u = db.user(c.sender), amt = a[2] === 'all' ? Math.floor(u.wallet) : L.parseAmt(a[2]);
      if (!T.A[sym] || !dir || !amt) return c.reply(`🗣️ *MARKET RUMORS*\n\nPay to nudge a price (up to about 10%). You can get *caught*: the price snaps back and you pay a fine of 3x.\n\n➜ ${P}rumor <asset> <up|down> <coins>\nExample: ${P}rumor MOON up 100k\nAssets: ${T.SYMS.join(' ')}\nMinimum ${m(MIN)}. Max ${DAILY} a day.`);
      if (amt < MIN) return c.reply(`⚠️ Minimum is ${m(MIN)}.`); if (amt > u.wallet) return c.reply(`⚠️ You only have ${m(u.wallet)}.`);
      const now = Date.now(), mine = rumors().filter(r => r.by === c.sender && now - r.t < 86400000), pending = rumors().filter(r => r.sym === sym && !r.done);
      if (mine.length >= DAILY) return c.reply(`⚠️ ${DAILY} rumors per day is the limit.`); if (mine.some(r => r.sym === sym && now - r.t < 30 * 60000)) return c.reply('⏳ Wait 30 minutes between rumors about the same asset.');
      if (pending.length >= MAX_PENDING) return c.reply(`⚠️ The market is already full of rumors about ${sym}. Try later.`);
      const a0 = T.A[sym], silver = PT.ab(u, 'silver'), greed = S.fg > 55 ? 1.2 : S.fg < 45 ? 0.8 : 1, align = (dir === 'up') === (S.fg >= 50) ? greed : 1 / greed;
      const bump = Math.min(0.1, (0.01 + 0.06 * (1 - Math.exp(-amt / 400000))) * Math.min(1.5, 0.5 + a0.sv * 0.5) * (1 + silver / 100) * align);
      u.wallet -= amt; const x = S.assets[sym]; x.p *= dir === 'up' ? 1 + bump : 1 - bump;
      const item = T.news(S, now, { s: sym, tag: 'rumor', up: dir === 'up', text: TEXT[dir][rnd(0, 2)](a0.name) });
      rumors().push({ id: item.id, sym, dir, bump, by: c.sender, spent: amt, t: now, at: now + rnd(20, 90) * 60000, silver, done: false }); T.save(); db.save();
      c.reply(`🗣️ *RUMOR PLANTED*\n\n${a0.emoji} ${sym} ${dir === 'up' ? '📈' : '📉'} moved *${dir === 'up' ? '+' : '-'}${(bump * 100).toFixed(1)}%* right away.\n💸 You paid ${m(amt)}.\n\n🕵️ In the next 20-90 min an inspector may investigate. If you are caught the price snaps back and you pay a *${m(amt * 3)}* fine. I'll message you either way.\n\n${L.wal(u)}`);
    });

    const tick = () => {
      const S = T.load(), now = Date.now(); let changed = false;
      for (const r of rumors()) {
        if (r.done || now < r.at) continue; r.done = true; changed = true;
        const today = rumors().filter(q => q.by === r.by && now - q.t < 86400000).length, p = Math.max(0.1, Math.min(0.8, 0.25 + 0.12 * (today - 1) - r.silver / 400));
        const u = db.data.users[r.by], x = S.assets[r.sym], name = T.A[r.sym].name;
        if (Math.random() < p) { // caught
          x.p *= r.dir === 'up' ? 1 / (1 + r.bump) * 0.98 : 1 / (1 - r.bump) * 1.02;
          const old = S.news.find(i => i.id === r.id); if (old) old.dead = true;
          T.news(S, now, { s: r.sym, tag: 'update', up: r.dir !== 'up', text: `🚨 PROBE: someone was caught spreading rumors about ${name}. Anonymous trader fined` });
          const fine = Math.min(u ? u.wallet : 0, r.spent * 3); if (u) u.wallet -= fine; dm(r.by, `🚨 *CAUGHT!* The inspector traced your ${r.sym} rumor. The price snapped back and you were fined *${m(fine)}*.`);
        } else dm(r.by, `😎 *Your ${r.sym} rumor stuck!* The inspector never found you. The price stays where it is.`);
      }
      if (changed) { T.save(); db.save(); }
      db.data.events.rumors = rumors().filter(r => !r.done || now - r.t < 86400000); // keep a day of history for the daily limit
    };
    setInterval(() => { try { tick(); } catch (e) { console.error('rumor tick failed:', e?.message || e); } }, 60000).unref();
    L.petTicks = Object.assign(L.petTicks || {}, { rumorTick: tick });
  },
};
