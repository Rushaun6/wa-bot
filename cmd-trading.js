// 📈 TRADING: a simulated stock/crypto market with fake coins (the player's wallet).
// Prices move every minute (correlated random walk + mean reversion + market mood + news shocks) and keep
// moving while the bot is offline (catches up on start). Buy/sell pay a 0.3% spread. Positions live on the
// player: u.stocks = { SYM: { q: quantity, cost: total $ spent on what is still held } }.
// Market state lives in db.data.events.market (db.js only restores keys that already exist in its defaults).
module.exports = {
  category: '📈 TRADING',
  register(def, L) {
    const { P, db, m, parseAmt } = L;
    L.ECON?.add('📈 TRADING'); // so ".economy off" also turns trading off in a group

    const TICK = 60000, SPREAD = 0.003, MAX_CATCHUP = 720, HIST = 180, DAYPTS = 144, MIN_TRADE = 10;
    // vol = typical move per minute; beta = how much it follows the whole market; base = long-run price it drifts back to
    const A = {
      AUR:  { name: 'Aurum Gold',     emoji: '🥇', base: 2350,  vol: 0.0008, beta: 0.1 },
      TTN:  { name: 'Titan Bank',     emoji: '🏦', base: 64,    vol: 0.0018, beta: 0.7 },
      OILX: { name: 'Crude Oil',      emoji: '🛢️', base: 78,    vol: 0.0025, beta: 0.4 },
      NVA:  { name: 'Nova Tech',      emoji: '💻', base: 182,   vol: 0.0030, beta: 0.8 },
      ZEC:  { name: 'Zeta Coin',      emoji: '🪙', base: 41200, vol: 0.0045, beta: 0.6 },
      MOON: { name: 'MoonRocket',     emoji: '🚀', base: 0.84,  vol: 0.0090, beta: 0.5 },
    };
    const SYMS = Object.keys(A);
    const GOOD = [s => `${s} beats earnings expectations`, s => `Big investor buys a large stake in ${s}`, s => `${s} announces a major new deal`, s => `Analysts upgrade ${s}`];
    const BAD = [s => `${s} misses earnings`, s => `Regulators open an investigation into ${s}`, s => `${s} hit by a supply problem`, s => `Analysts downgrade ${s}`];

    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const fmtP = p => p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);
    const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
    const arrow = x => (x > 0.0005 ? '🟢▲' : x < -0.0005 ? '🔴▼' : '⚪▬');
    const ago = ms => { const s = Math.max(1, Math.round(ms / 1000)); return s < 90 ? s + 's' : s < 5400 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };

    function market() {
      const ev = db.data.events;
      let M = ev.market;
      if (!M || !M.assets) {
        M = ev.market = { t: Date.now(), mood: 0, news: [], nextNews: Date.now() + 20 * 60000, assets: {} };
      }
      for (const s of SYMS) if (!M.assets[s]) M.assets[s] = { p: A[s].base * (0.9 + Math.random() * 0.2), h: [], d: [], n: 0 };
      return M;
    }
    function step(M, now) {
      const mz = gauss();
      M.mood = M.mood * 0.995 + gauss() * 0.00001; // slow-moving market mood: gentle bull / bear stretches
      for (const s of SYMS) {
        const a = A[s], x = M.assets[s];
        const z = a.beta * mz + Math.sqrt(1 - a.beta * a.beta) * gauss();
        const revert = -0.0003 * Math.log(x.p / a.base);
        let r = revert + M.mood * a.beta + a.vol * z - 0.5 * a.vol * a.vol;
        r = Math.max(-0.2, Math.min(0.2, r));
        x.p = Math.max(a.base * 0.02, x.p * Math.exp(r));
        x.h.push(+x.p.toPrecision(8)); if (x.h.length > HIST) x.h.shift();
        x.n = (x.n || 0) + 1;
        if (x.n % 10 === 0) { x.d.push(+x.p.toPrecision(8)); if (x.d.length > DAYPTS) x.d.shift(); }
      }
      if (now >= M.nextNews) { // a news shock on one asset, then wait 25-90 minutes
        const s = SYMS[Math.floor(Math.random() * SYMS.length)], good = Math.random() < 0.5, x = M.assets[s];
        const size = (0.015 + Math.random() * 0.04) * Math.min(2.5, Math.max(0.6, A[s].vol / 0.003));
        x.p *= good ? 1 + size : 1 - size;
        const txt = (good ? GOOD : BAD)[Math.floor(Math.random() * 4)](A[s].name);
        M.news.unshift({ t: now, s, up: good, pct: good ? size : -size, text: txt }); M.news.length = Math.min(M.news.length, 12);
        M.nextNews = now + (25 + Math.random() * 65) * 60000;
      }
    }
    function advance() { // run every minute that has passed (also catches up after the bot was offline)
      const M = market(), now = Date.now();
      let n = Math.floor((now - M.t) / TICK);
      if (n <= 0) return M;
      if (n > MAX_CATCHUP) { M.t = now - MAX_CATCHUP * TICK; n = MAX_CATCHUP; }
      for (let i = 1; i <= n; i++) step(M, M.t + i * TICK);
      M.t += n * TICK;
      db.save();
      return M;
    }
    setTimeout(() => { try { advance(); } catch {} setInterval(() => { try { advance(); } catch (e) { console.error('market tick failed:', e?.message || e); } }, TICK).unref(); }, 15000).unref();

    const ask = p => p * (1 + SPREAD), bid = p => p * (1 - SPREAD);
    const chg = (x, back) => { const h = x.h; if (h.length < 2) return 0; const ref = h[Math.max(0, h.length - 1 - back)]; return x.p / ref - 1; };
    const pick = c => { const s = (c.args[0] || '').toUpperCase(); return A[s] ? s : null; };
    const list = () => SYMS.map(s => `${A[s].emoji} ${s}`).join(' • ');

    def(['market', 'stocks', 'tmarket'], { usage: ['market'] }, c => {
      const M = advance();
      const mood = M.mood > 0.00012 ? '🐂 Bullish' : M.mood < -0.00012 ? '🐻 Bearish' : '😐 Calm';
      const rows = SYMS.map(s => { const x = M.assets[s], c1 = chg(x, 60); return `${A[s].emoji} *${s}* ${A[s].name}\n│   $${fmtP(x.p)}  ${arrow(c1)} ${pct(c1)} (1h)`; });
      c.reply(`📈 *MARKET*  ·  ${mood}\n\n${rows.join('\n')}\n\n_Fake coins. ${(SPREAD * 100).toFixed(1)}% spread on every trade._\n${P}tbuy <symbol> <amount>  ·  ${P}tsell <symbol> <all|amount>\n${P}pf  ·  ${P}chart <symbol>  ·  ${P}tnews`);
    });

    def(['tbuy', 'invest'], { usage: ['tbuy NVA 5000'] }, c => {
      const M = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}tbuy NVA 5000  or  ${P}tbuy NVA all`);
      const u = db.user(c.sender), a = (c.args[1] || '').toLowerCase();
      const amt = a === 'all' ? Math.floor(u.wallet) : parseAmt(a);
      if (!amt || amt < MIN_TRADE) return c.reply(`⚠️ Enter an amount (min ${m(MIN_TRADE)}).\nExample: ${P}tbuy ${s} 5000  or  ${P}tbuy ${s} all`);
      if (amt > u.wallet) return c.reply(`⚠️ You only have *${m(u.wallet)}* in your wallet.`);
      const price = ask(M.assets[s].p), q = amt / price;
      const pos = ((u.stocks ||= {})[s] ||= { q: 0, cost: 0 });
      pos.q += q; pos.cost += amt; u.wallet -= amt; db.save();
      c.reply(`✅ *BOUGHT ${s}*\n\n${A[s].emoji} ${q.toFixed(q < 1 ? 4 : 2)} @ $${fmtP(price)}\n💸 Spent: *${m(amt)}*\n💰 Wallet: *${m(u.wallet)}*`);
    });

    def(['tsell', 'divest'], { usage: ['tsell NVA all'] }, c => {
      const M = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}tsell NVA all  or  ${P}tsell NVA 2k`);
      const u = db.user(c.sender), pos = u.stocks?.[s];
      if (!pos || pos.q <= 0) return c.reply(`You don't own any ${s}.`);
      const price = bid(M.assets[s].p), a = (c.args[1] || 'all').toLowerCase();
      let q;
      if (a === 'all') q = pos.q;
      else if (a === 'half') q = pos.q / 2;
      else if (/^\d+(\.\d+)?%$/.test(a)) q = pos.q * Math.min(100, parseFloat(a)) / 100;
      else { const v = parseAmt(a); if (!v) return c.reply(`⚠️ Use ${P}tsell ${s} all, half, 50% or an amount like 2k.`); q = Math.min(pos.q, v / price); }
      if (q <= 0) return c.reply('⚠️ Nothing to sell.');
      const proceeds = Math.floor(q * price), costOut = pos.cost * (q / pos.q), pnl = proceeds - costOut;
      u.wallet += proceeds; pos.q -= q; pos.cost -= costOut;
      if (pos.q < 1e-9) delete u.stocks[s];
      db.save();
      c.reply(`${pnl >= 0 ? '✅' : '❌'} *SOLD ${s}*\n\n${A[s].emoji} ${q.toFixed(q < 1 ? 4 : 2)} @ $${fmtP(price)}\n💵 Received: *${m(proceeds)}*\n${pnl >= 0 ? '📈 Profit' : '📉 Loss'}: *${pnl >= 0 ? '+' : '-'}${m(Math.abs(pnl)).replace('-', '')}* (${pct(costOut ? pnl / costOut : 0)})\n💰 Wallet: *${m(u.wallet)}*`);
    });

    def(['pf', 'portfolio', 'tpf'], { usage: ['pf'] }, c => {
      const M = advance(), u = db.user(c.sender), st = u.stocks || {};
      const rows = Object.entries(st).filter(([, p]) => p.q > 0).map(([s, p]) => { const val = p.q * bid(M.assets[s].p); return { s, p, val, pnl: val - p.cost }; }).sort((x, y) => y.val - x.val);
      if (!rows.length) return c.reply(`📂 *PORTFOLIO*\n\nYou don't own anything yet.\n${P}market to see prices, then ${P}tbuy NVA 5000`);
      const tv = rows.reduce((t, r) => t + r.val, 0), tc = rows.reduce((t, r) => t + r.p.cost, 0);
      const lines = rows.map(r => `${A[r.s].emoji} *${r.s}*  ${r.p.q.toFixed(r.p.q < 1 ? 4 : 2)} @ avg $${fmtP(r.p.cost / r.p.q)}\n│   ${m(r.val)}  ${r.pnl >= 0 ? '🟢' : '🔴'} ${r.pnl >= 0 ? '+' : '-'}${m(Math.abs(r.pnl)).replace('-', '')} (${pct(r.p.cost ? r.pnl / r.p.cost : 0)})`);
      c.reply(`📂 *PORTFOLIO*\n\n${lines.join('\n')}\n\n📊 Invested: *${m(tc)}*\n💼 Value now: *${m(tv)}* ${tv >= tc ? '🟢' : '🔴'} ${pct(tc ? tv / tc - 1 : 0)}\n💰 Wallet: *${m(u.wallet)}*\n\n_Valued at the sell price._`);
    });

    def(['chart', 'tchart'], { usage: ['chart NVA'] }, c => {
      const M = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}chart NVA`);
      const x = M.assets[s], src = x.d.length >= 12 ? x.d : x.h;
      if (src.length < 3) return c.reply('📊 Not enough price history yet, check again in a few minutes.');
      const step = Math.max(1, Math.ceil(src.length / 28)), pts = src.filter((_, i) => (src.length - 1 - i) % step === 0);
      const lo = Math.min(...pts), hi = Math.max(...pts), bars = '▁▂▃▄▅▆▇█';
      const line = pts.map(v => bars[hi === lo ? 3 : Math.round((v - lo) / (hi - lo) * 7)]).join('');
      const span = x.d.length >= 12 ? `${Math.round(x.d.length * 10 / 60)}h` : `${Math.round(x.h.length)}m`;
      const ch = pts[pts.length - 1] / pts[0] - 1;
      c.reply(`${A[s].emoji} *${s}* · ${A[s].name}\n\n${line}\n\n💲 Now: *$${fmtP(x.p)}*  ${arrow(ch)} ${pct(ch)} (last ${span})\n⬆️ High: $${fmtP(hi)}   ⬇️ Low: $${fmtP(lo)}`);
    });

    def(['tnews', 'marketnews'], { usage: ['tnews'] }, c => {
      const M = advance();
      c.reply(M.news.length ? `📰 *MARKET NEWS*\n\n` + M.news.slice(0, 6).map(n => `${n.up ? '🟢' : '🔴'} ${n.text}\n│   ${n.s} ${pct(n.pct)} · ${ago(Date.now() - n.t)} ago`).join('\n\n') : '📰 *MARKET NEWS*\n\nQuiet so far. Check back soon.');
    });
  },
};
