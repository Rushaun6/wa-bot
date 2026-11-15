// 📈 TRADING: a simulated stock/crypto market with fake coins (the player's wallet). It runs 24/7, even while the bot is offline.
//
//  PRICES   correlated random walk + market mood + RUNS. A run is a pump or a crash over 8-120 minutes. Pump sizes follow a power law
//           (Pareto), so most are +40-200% but any run can be far bigger: x10, x50, x500 ... there is NO price cap, only a very strong
//           pull back once a price is absurdly far from where it started (bubbles burst). Pumps are the rarer outcome (1 run in 7-10);
//           crashes are sized so that a run is worth 0% on average, like a lottery ticket.
//  BRAIN    a small "market brain" writes the news 24/7: explains big moves after they happen (with made-up reasons), runs stories
//           (rumor -> confirmed or denied, earnings countdowns, breaking events and the follow-up, macro news hitting several assets),
//           adds chatter that reacts to what prices are doing, and REVISES or retracts older headlines (retracted ones show crossed out).
//           Whatever happens AFTER a headline is a fair coin toss, so reading the news is entertainment, not a money machine.
//  CHARTS   every asset keeps real OHLC candles (1 min for 6 h, 5 min for 24 h, 1 h for 14 days). .chart draws a candlestick PNG.
//  STATE    lives in market.json next to the bot's data (not in the Supabase row, it is big). Players hold u.stocks = { SYM: { q, cost } }.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');

module.exports = {
  category: '📈 TRADING',
  register(def, L) {
    const { P, db, m, parseAmt } = L;
    L.ECON?.add('📈 TRADING'); // so ".economy off" also turns trading off in a group

    const TICK = 60000, MAX_CATCHUP = 720, MIN_TRADE = 10, BACKFILL_DAYS = 14;
    const STATE = path.join(db.FILE ? path.dirname(db.FILE) : os.tmpdir(), 'market.json');
    // vol = typical move per minute, beta = how much it follows the whole market, base = the price it started at and slowly drifts back to,
    // mu = a small upward push that cancels the slow downward drag of crashes being more common than pumps (so the typical price holds its level),
    // sv = how big its news reacts, run = { p: chance per minute, q: share of runs that are pumps, a/xm: power-law shape of pump size }
    const A = {
      AUR:  { name: 'Aurum Gold', emoji: '🥇', kind: 'metal',  base: 2350,  vol: 0.0007, beta: 0.1, spread: 0.002, sv: 0.3, mu: 2e-7, run: { p: 1 / 60000, q: 0.15, a: 6,   xm: 1.04 } },
      TTN:  { name: 'Titan Bank', emoji: '🏦', kind: 'stock',  base: 64,    vol: 0.0017, beta: 0.7, spread: 0.003, sv: 0.6, mu: 4e-6, run: { p: 1 / 20000, q: 0.15, a: 4,   xm: 1.10 } },
      OILX: { name: 'Crude Oil',  emoji: '🛢️', kind: 'stock',  base: 78,    vol: 0.0022, beta: 0.4, spread: 0.004, sv: 0.8, mu: 8e-6, run: { p: 1 / 14000, q: 0.15, a: 3.2, xm: 1.15 } },
      NVA:  { name: 'Nova Tech',  emoji: '💻', kind: 'stock',  base: 182,   vol: 0.0026, beta: 0.8, spread: 0.005, sv: 1.0, mu: 1.2e-5, run: { p: 1 / 12000, q: 0.15, a: 3,   xm: 1.20 } },
      ZEC:  { name: 'Zeta Coin',  emoji: '🪙', kind: 'crypto', base: 41200, vol: 0.0032, beta: 0.6, spread: 0.008, sv: 1.5, mu: 3.4e-5, run: { p: 1 / 7000,  q: 0.12, a: 2.2, xm: 1.40 } },
      MOON: { name: 'MoonRocket', emoji: '🚀', kind: 'crypto', base: 0.84,  vol: 0.0040, beta: 0.5, spread: 0.015, sv: 2.2, mu: 1.3e-4, run: { p: 1 / 2500,  q: 0.10, a: 1.8, xm: 1.80 } },
    };
    const SYMS = Object.keys(A);
    for (const s of SYMS) { const R = A[s].run, Fm = R.a * R.xm / (R.a - 1); R.depth = R.q * (Fm - 1) / (1 - R.q); } // average crash depth that makes a run worth 0% on average

    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    const pickOne = a => a[Math.floor(Math.random() * a.length)];
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const q6 = v => +v.toPrecision(6);
    const fmtP = p => p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(4) : p.toPrecision(3);
    const pct = x => (x >= 0 ? '+' : '') + (Math.abs(x) >= 10 ? (x * 100).toFixed(0) : (x * 100).toFixed(2)) + '%';
    const arrow = x => (x > 0.0005 ? '🟢▲' : x < -0.0005 ? '🔴▼' : '⚪▬');
    const ago = ms => { const s = Math.max(1, Math.round(ms / 1000)); return s < 90 ? s + 's' : s < 5400 ? Math.round(s / 60) + 'm' : s < 172800 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };

    // ================= the market =================
    const newAsset = p => ({ p, last: p, run: null, c1: [], c5: [], c60: [], k5: null, k60: null, n: 0 });
    let M = null;
    function fresh(now) {
      const t0 = now - BACKFILL_DAYS * 86400000;
      const S = { t: t0, mood: 0, fg: 50, nid: 0, news: [], assets: {}, brain: { stories: [], cool: {}, nextStory: t0 + 20 * 60000, nextFlavor: t0 + 5 * 60000, nextMacro: t0 + 3 * 3600000 } };
      for (const s of SYMS) S.assets[s] = newAsset(A[s].base * rand(0.9, 1.1));
      return S;
    }
    function load() {
      if (M) return M;
      try { M = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
      if (M?.assets && M.brain) { for (const s of SYMS) if (!M.assets[s]) M.assets[s] = newAsset(A[s].base); return M; }
      const old = db.data?.events?.market; // an older version kept the market inside the database: carry its prices over so nobody's portfolio jumps
      const now = Date.now(); M = fresh(now);
      for (let i = 0; i < BACKFILL_DAYS * 1440; i++) { M.t += TICK; step(M, M.t); } // fake 14 days of history so the charts have something to show
      M.t = Math.floor(M.t / TICK) * TICK;
      for (const s of SYMS) { const op = old?.assets?.[s]?.p; if (op > 0) rescale(M.assets[s], op / M.assets[s].p); }
      if (old) { delete db.data.events.market; db.save(); }
      save(); return M;
    }
    function rescale(x, f) { // multiply every stored price by f (same chart shape, different level)
      x.p *= f; x.last *= f;
      for (const k of ['c1', 'c5', 'c60']) x[k] = x[k].map(c => c.map(v => q6(v * f)));
      for (const k of ['k5', 'k60']) if (x[k]) x[k] = x[k].map(v => q6(v * f));
      if (x.run) x.run.start *= f;
    }
    function save() { try { const tmp = STATE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(M)); fs.renameSync(tmp, STATE); } catch (e) { console.error('market save failed:', e?.message || e); } }
    function advance() { // run every minute that has passed (also catches up after the bot was offline)
      load(); const now = Date.now(); let n = Math.floor((now - M.t) / TICK);
      if (n <= 0) return M;
      if (n > MAX_CATCHUP) { M.t = now - MAX_CATCHUP * TICK; n = MAX_CATCHUP; }
      for (let i = 1; i <= n; i++) step(M, M.t + i * TICK);
      M.t += n * TICK; save(); return M;
    }

    // ================= news + the brain =================
    const POOL = {
      rumorUp: [n => `Rumor: ${n} is in talks over a major partnership`, n => `Report: ${n} could be a takeover target`, n => `Insiders hint ${n} is about to announce big news`, n => `Whispers of a big new backer for ${n}`],
      rumorDn: [n => `Report: ${n} under regulatory investigation`, n => `Sources: ${n} faces a major lawsuit`, n => `Whistleblower alleges problems at ${n}`, n => `Rumor: a key executive is leaving ${n}`],
      confUp: [n => `CONFIRMED: ${n} announces the deal`, n => `CONFIRMED: ${n} makes it official`], denyUp: [n => `DENIED: ${n} says the rumors are false`, n => `${n} shuts down the deal talk`],
      confDn: [n => `CONFIRMED: ${n} is under investigation`, n => `CONFIRMED: ${n} is being sued`], denyDn: [n => `CLEARED: ${n} says the report was wrong`, n => `Report on ${n} walked back after pushback`],
      earnPre: [n => `${n} reports earnings in about an hour`, n => `Earnings watch: ${n} reports within the hour`],
      beat: [n => `BEAT: ${n} tops expectations`, n => `${n} crushes the estimates`], miss: [n => `MISS: ${n} falls short of estimates`, n => `${n} disappoints on earnings`],
      breaking: [n => `BREAKING: ${n} hit by a security scare`, n => `BREAKING: regulators move against ${n}`, n => `BREAKING: major outage at ${n}`], breakingUp: [n => `BREAKING: ${n} lands a surprise partnership`, n => `BREAKING: big-name endorsement for ${n}`, n => `BREAKING: ${n} unveils a major upgrade`],
      okay: [n => `UPDATE: the damage to ${n} is smaller than feared`, n => `UPDATE: ${n} says the problem is contained`], worse: [n => `UPDATE: the ${n} problem is worse than first reported`, n => `UPDATE: more bad news piles up for ${n}`],
      moreGood: [n => `UPDATE: the ${n} news looks even bigger than first reported`], lessGood: [n => `UPDATE: the ${n} news is smaller than first reported`],
      whyUp: ['a viral social media post', 'whales piling in', 'short sellers getting squeezed', 'rumors of a big exchange listing', 'a leaked partnership', 'influencers pushing it hard', 'a wave of bots chasing momentum'],
      whyDn: ['a large holder dumping', 'panic selling after a rumor', 'liquidations cascading', 'a security scare', 'profit taking after the rally', 'regulatory fears', 'a fat-finger sell order'],
      up: [n => `${n} climbs as traders chase momentum`, n => `Buyers keep pushing ${n} higher`, n => `${n} extends its rally on heavy volume`], dn: [n => `${n} slides as dip buyers hesitate`, n => `Sellers press ${n} lower`, n => `${n} bleeds as sentiment sours`],
      flat: [n => `${n} drifts sideways on thin volume`, n => `Quiet session for ${n}`, n => `Traders wait for a catalyst on ${n}`],
      noise: [(n, s) => `🐋 Large ${s} transfer spotted on-chain`, (n, s) => `🤖 Trading bots flip their view on ${n}`, (n, s) => `🗣️ ${n} is trending on social media`, (n, s) => `📊 ${n} options activity jumps`, (n, s) => `🧐 Analyst note: ${n} looks "fairly priced"`, (n, s) => `📰 Interview with ${n} management raises eyebrows`],
      revise: [n => `REVISED: earlier talk about ${n} was overblown, analysts say`, n => `CORRECTION: an earlier report on ${n} contained errors`, n => `Analysts walk back their ${n} call`],
    };
    const MACRO = [
      { t: 'Central bank signals rate cuts', fx: { TTN: -0.7, NVA: 1.2, AUR: 0.6, ZEC: 1, MOON: 1 } }, { t: 'Central bank signals more rate hikes', fx: { TTN: 0.7, NVA: -1.2, AUR: -0.6, ZEC: -1, MOON: -1 } },
      { t: 'Oil supply disruption rattles markets', fx: { OILX: 1.5, AUR: 0.3, NVA: -0.3 } }, { t: 'Oil glut as producers pump more', fx: { OILX: -1.5, AUR: -0.2, NVA: 0.3 } },
      { t: 'Risk-on rally: investors pile into growth', fx: { NVA: 1, ZEC: 1.3, MOON: 1.6, TTN: 0.6, AUR: -0.5 } }, { t: 'Risk-off: investors run to safety', fx: { NVA: -1, ZEC: -1.3, MOON: -1.6, TTN: -0.6, AUR: 0.5 } },
    ];
    const say = (a, ...args) => pickOne(a)(...args);

    function news(S, now, o) { const n = { id: ++S.nid, t: now, ...o }; S.news.unshift(n); if (S.news.length > 60) S.news.length = 60; return n; }
    const change = (x, back) => { const c = x.c1; if (c.length < 2) return 0; return x.p / c[Math.max(0, c.length - 1 - back)][0] - 1; }; // vs the OPEN of that candle

    function startStory(S, now) {
      const B = S.brain;
      const w = SYMS.map(s => ((B.cool[s] || 0) > now ? 0 : A[s].sv + 0.2));
      let tot = w.reduce((a, b) => a + b, 0); if (!tot) return;
      let r = Math.random() * tot, s = SYMS[0]; for (let i = 0; i < SYMS.length; i++) { r -= w[i]; if (r <= 0) { s = SYMS[i]; break; } }
      const a = A[s], x = S.assets[s], n = a.name, sv = a.sv, heavy = Math.random() < 0.1 ? 2.5 : 1, kinds = a.kind === 'stock' ? ['earn', 'earn', 'rumor', 'rumor', 'break'] : a.kind === 'crypto' ? ['rumor', 'rumor', 'break', 'break'] : ['rumor'];
      const kind = pickOne(kinds); B.cool[s] = now + rand(25, 70) * 60000;
      if (kind === 'rumor') {
        const sign = Math.random() < 0.5 ? 1 : -1, e0 = sv * rand(0.008, 0.03) * heavy;
        x.p *= 1 + sign * e0; // the rumor itself moves the price right away; what happens next is a fair coin toss
        const item = news(S, now, { s, tag: 'rumor', up: sign > 0, text: say(sign > 0 ? POOL.rumorUp : POOL.rumorDn, n) });
        B.stories.push({ k: 'rumor', s, sign, a: sv * rand(0.015, 0.06) * heavy, nid: item.id, at: now + rand(40, 180) * 60000 });
      } else if (kind === 'earn') {
        const item = news(S, now, { s, tag: 'sched', up: null, text: say(POOL.earnPre, n) });
        B.stories.push({ k: 'earn', s, a: sv * rand(0.015, 0.07) * heavy, nid: item.id, at: now + rand(50, 70) * 60000 });
      } else { // break: sudden news (good or bad, equal odds), then a follow-up that is a fair coin toss
        const sign = Math.random() < 0.5 ? 1 : -1, e0 = sv * rand(0.02, 0.06) * heavy; x.p *= 1 + sign * e0;
        const item = news(S, now, { s, tag: 'breaking', up: sign > 0, text: say(sign > 0 ? POOL.breakingUp : POOL.breaking, n) });
        B.stories.push({ k: 'break', s, sign, a: sv * rand(0.02, 0.06) * heavy, nid: item.id, at: now + rand(30, 120) * 60000 });
      }
    }
    function resolve(S, now, st) {
      const a = A[st.s], x = S.assets[st.s], n = a.name, yes = Math.random() < 0.5, old = S.news.find(i => i.id === st.nid);
      if (st.k === 'rumor') { // confirmed: the rumor's direction continues; denied: it reverses. Equal odds, equal size.
        if (old) old.dead = true;
        x.p *= 1 + (yes ? st.sign : -st.sign) * st.a;
        news(S, now, { s: st.s, tag: yes ? 'confirmed' : 'denied', up: yes ? st.sign > 0 : st.sign < 0, text: say(yes ? (st.sign > 0 ? POOL.confUp : POOL.confDn) : (st.sign > 0 ? POOL.denyUp : POOL.denyDn), n) });
      } else if (st.k === 'earn') {
        x.p *= 1 + (yes ? st.a : -st.a);
        news(S, now, { s: st.s, tag: 'earnings', up: yes, text: say(yes ? POOL.beat : POOL.miss, n) });
      } else {
        if (old) old.dead = true;
        x.p *= 1 + (yes ? st.a : -st.a);
        news(S, now, { s: st.s, tag: 'update', up: yes, text: say(st.sign > 0 ? (yes ? POOL.moreGood : POOL.lessGood) : (yes ? POOL.okay : POOL.worse), n) });
      }
    }
    function macro(S, now) {
      const ev = pickOne(MACRO), u = rand(0.01, 0.035), parts = [];
      for (const [s, k] of Object.entries(ev.fx)) { const f = k * A[s].sv * u * (Math.random() < 0.1 ? 2.5 : 1); S.assets[s].p *= 1 + f; parts.push(s); }
      news(S, now, { s: null, tag: 'macro', up: null, text: `🌍 ${ev.t}` });
    }
    function chatter(S, now) { // fake background life: commentary that reacts to what prices are doing, plus pure noise, plus the odd retraction
      const s = pickOne(SYMS), a = A[s], x = S.assets[s], c = change(x, 60), r = Math.random();
      if (r < 0.15) { // retract / revise an older headline
        const old = S.news.find(i => !i.dead && i.s && now - i.t > 20 * 60000 && ['chatter', 'run'].includes(i.tag));
        if (old) { old.dead = true; return news(S, now, { s: old.s, tag: 'revise', up: null, text: say(POOL.revise, A[old.s].name) }); }
      }
      if (r < 0.55) return news(S, now, { s, tag: 'chatter', up: c > 0.01 ? true : c < -0.01 ? false : null, text: say(c > 0.03 ? POOL.up : c < -0.03 ? POOL.dn : POOL.flat, a.name) });
      news(S, now, { s, tag: 'chatter', up: null, text: say(POOL.noise, a.name, s) });
    }
    function brain(S, now) {
      const B = S.brain;
      for (let i = B.stories.length - 1; i >= 0; i--) if (now >= B.stories[i].at) { const st = B.stories.splice(i, 1)[0]; resolve(S, now, st); }
      if (now >= B.nextStory) { startStory(S, now); B.nextStory = now + rand(40, 110) * 60000; }
      if (now >= B.nextFlavor) { chatter(S, now); B.nextFlavor = now + rand(12, 35) * 60000; }
      if (now >= B.nextMacro) { macro(S, now); B.nextMacro = now + rand(6, 18) * 3600000; }
    }

    // ================= one minute of market =================
    function record(x, a, p) { // candles: 1 min (6 h), 5 min (24 h), 1 h (14 days); wicks come from a little intra-minute noise
      const o = x.last, wig = Math.abs(gauss()) * a.vol * 0.6, hi = Math.max(o, p) * (1 + wig * Math.random()), lo = Math.min(o, p) / (1 + wig * Math.random());
      x.c1.push([o, hi, lo, p].map(q6)); if (x.c1.length > 360) x.c1.shift();
      for (const [k, every, arr, keep] of [['k5', 5, 'c5', 288], ['k60', 60, 'c60', 336]]) {
        if (!x[k]) x[k] = [o, hi, lo, p]; else { x[k][1] = Math.max(x[k][1], hi); x[k][2] = Math.min(x[k][2], lo); x[k][3] = p; }
        if ((x.n + 1) % every === 0) { x[arr].push(x[k].map(q6)); if (x[arr].length > keep) x[arr].shift(); x[k] = null; }
      }
      x.n++; x.last = p;
    }
    function step(S, now) {
      const mz = gauss(); S.mood = S.mood * 0.995 + gauss() * 0.00001; // slow-moving market mood
      for (const s of SYMS) {
        const a = A[s], x = S.assets[s], R = a.run;
        const z = a.beta * mz + Math.sqrt(1 - a.beta * a.beta) * gauss(), dev = Math.log(x.p / a.base);
        let r = -(0.00004 * dev + 0.00002 * dev * dev * dev) + S.mood * a.beta + a.vol * z - 0.5 * a.vol * a.vol + (a.mu || 0); // weak pull to base; very strong once it is absurdly far (bubbles burst)
        const run = x.run;
        if (!run && Math.random() < R.p) { // a new run: a power-law pump (the tail is unlimited) or a crash that balances it
          const pump = Math.random() < R.q; let F = 1, size;
          if (pump) { F = Math.min(1e5, R.xm / Math.pow(1 - Math.random(), 1 / R.a)); size = Math.log(F); } else size = Math.log(1 - Math.min(0.85, R.depth * (0.4 + 1.2 * Math.random())));
          const ramp = 8 + Math.floor(Math.random() * 33) + (pump ? Math.floor(8 * Math.log(F)) : 0);
          x.run = { dir: pump ? 1 : -1, start: x.p, ramp, left: ramp, per: size / ramp, phase: 'ramp', gain: 0 };
        } else if (run) { r += run.per; if (run.phase === 'ramp') run.gain += run.per; run.left--; }
        r = Math.max(-0.3, Math.min(0.3, r));
        x.p = Math.max(a.base * 1e-6, x.p * Math.exp(r));
        if (x.run && x.run.left <= 0) {
          const ru = x.run;
          if (ru.phase === 'ramp') { // the run is over: the brain explains it (with a made-up reason), then a fair coin toss for what follows
            const mv = x.p / ru.start - 1, mega = ru.dir > 0 && mv > 4;
            news(S, now, { s, tag: 'run', up: ru.dir > 0, pct: mv, text: `${mega ? '🚨 MEGA PUMP: ' : ''}${a.name} ${ru.dir > 0 ? (mv > 1 ? 'explodes' : 'surges') : (mv < -0.4 ? 'collapses' : 'drops')} ${pct(mv)} on ${pickOne(ru.dir > 0 ? POOL.whyUp : POOL.whyDn)}` });
            const roll = Math.random(), amt = (0.3 + 0.5 * Math.random()) * (1 - Math.exp(-Math.abs(ru.gain)));
            ru.phase = 'after'; ru.left = 60 + Math.floor(Math.random() * 120);
            ru.per = roll < 0.3 ? Math.log(ru.dir > 0 ? 1 - amt : 1 + amt) / ru.left : roll < 0.6 ? Math.log(ru.dir > 0 ? 1 + amt : 1 - amt) / ru.left : 0; // gives back / keeps going / drifts: equal odds, equal size
          } else x.run = null;
        }
      }
      brain(S, now);
      let g = 0; for (const s of SYMS) { const x = S.assets[s], d = x.c5.length >= 12 ? Math.log(x.p / x.c5[Math.max(0, x.c5.length - 288)][0]) : 0; g += d; }
      S.fg += (Math.max(0, Math.min(100, 50 + 300 * g / SYMS.length)) - S.fg) * 0.02; // fear & greed follows the last 24h
      for (const s of SYMS) record(S.assets[s], A[s], S.assets[s].p);
    }

    // ================= candlestick chart as a PNG (no dependencies: tiny 5x7 font + zlib) =================
    const FONT = {};
    (function (src) { for (const [ch, rows] of Object.entries(src)) FONT[ch] = rows.split(' '); })({
      '0': '.XXX. X...X X..XX X.X.X XX..X X...X .XXX.', '1': '..X.. .XX.. ..X.. ..X.. ..X.. ..X.. .XXX.', '2': '.XXX. X...X ....X ...X. ..X.. .X... XXXXX', '3': 'XXXX. ....X ....X .XXX. ....X ....X XXXX.',
      '4': '...X. ..XX. .X.X. X..X. XXXXX ...X. ...X.', '5': 'XXXXX X.... XXXX. ....X ....X X...X .XXX.', '6': '..XX. .X... X.... XXXX. X...X X...X .XXX.', '7': 'XXXXX ....X ...X. ..X.. .X... .X... .X...',
      '8': '.XXX. X...X X...X .XXX. X...X X...X .XXX.', '9': '.XXX. X...X X...X .XXXX ....X ...X. .XX..', '.': '..... ..... ..... ..... ..... .XX.. .XX..', ',': '..... ..... ..... ..... ..XX. ..X.. .X...',
      '$': '..X.. .XXXX X.X.. .XXX. ..X.X XXXX. ..X..', '%': 'XX..X XX..X ...X. ..X.. .X... X..XX X..XX', '+': '..... ..X.. ..X.. XXXXX ..X.. ..X.. .....', '-': '..... ..... ..... XXXXX ..... ..... .....',
      ':': '..... .XX.. .XX.. ..... .XX.. .XX.. .....', '/': '....X ....X ...X. ..X.. .X... X.... X....', ' ': '..... ..... ..... ..... ..... ..... .....',
      A: '.XXX. X...X X...X XXXXX X...X X...X X...X', B: 'XXXX. X...X X...X XXXX. X...X X...X XXXX.', C: '.XXX. X...X X.... X.... X.... X...X .XXX.', D: 'XXXX. X...X X...X X...X X...X X...X XXXX.',
      E: 'XXXXX X.... X.... XXXX. X.... X.... XXXXX', F: 'XXXXX X.... X.... XXXX. X.... X.... X....', G: '.XXX. X...X X.... X.XXX X...X X...X .XXX.', H: 'X...X X...X X...X XXXXX X...X X...X X...X',
      I: '.XXX. ..X.. ..X.. ..X.. ..X.. ..X.. .XXX.', J: '..XXX ...X. ...X. ...X. ...X. X..X. .XX..', K: 'X...X X..X. X.X.. XX... X.X.. X..X. X...X', L: 'X.... X.... X.... X.... X.... X.... XXXXX',
      M: 'X...X XX.XX X.X.X X.X.X X...X X...X X...X', N: 'X...X XX..X X.X.X X..XX X...X X...X X...X', O: '.XXX. X...X X...X X...X X...X X...X .XXX.', P: 'XXXX. X...X X...X XXXX. X.... X.... X....',
      Q: '.XXX. X...X X...X X...X X.X.X X..X. .XX.X', R: 'XXXX. X...X X...X XXXX. X.X.. X..X. X...X', S: '.XXXX X.... X.... .XXX. ....X ....X XXXX.', T: 'XXXXX ..X.. ..X.. ..X.. ..X.. ..X.. ..X..',
      U: 'X...X X...X X...X X...X X...X X...X .XXX.', V: 'X...X X...X X...X X...X X...X .X.X. ..X..', W: 'X...X X...X X...X X.X.X X.X.X XX.XX X...X', X: 'X...X X...X .X.X. ..X.. .X.X. X...X X...X',
      Y: 'X...X X...X .X.X. ..X.. ..X.. ..X.. ..X..', Z: 'XXXXX ....X ...X. ..X.. .X... X.... XXXXX',
    });
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    function png(w, h, rgba) {
      const raw = Buffer.alloc(h * (w * 4 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
      const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
      return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
    }
    const TF = { '30m': ['c1', 30, '30 MIN · 1M'], '1h': ['c1', 60, '1 HOUR · 1M'], '3h': ['c5', 36, '3 HOURS · 5M'], '6h': ['c5', 72, '6 HOURS · 5M'], '12h': ['c5', 144, '12 HOURS · 5M'], '24h': ['c5', 288, '24 HOURS · 5M'], '3d': ['c60', 72, '3 DAYS · 1H'], '7d': ['c60', 168, '7 DAYS · 1H'], '14d': ['c60', 336, '14 DAYS · 1H'] };
    function render(S, sym, tf) {
      const x = S.assets[sym], [src, want, label] = TF[tf] || TF['24h'];
      const candles = x[src].slice(-want); if (candles.length < 3) return null;
      const W = 960, H = 540, L0 = 120, R0 = 30, T0 = 92, B0 = 46, pw = W - L0 - R0, ph = H - T0 - B0;
      const buf = Buffer.alloc(W * H * 4);
      const px = (X, Y, c) => { if (X < 0 || Y < 0 || X >= W || Y >= H) return; const i = (Y * W + X) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; };
      const rect = (X, Y, w, h, c) => { for (let j = Math.max(0, Y); j < Math.min(H, Y + h); j++) for (let i = Math.max(0, X); i < Math.min(W, X + w); i++) px(i, j, c); };
      const text = (X, Y, str, sc, c) => { let cx = X; for (const ch of String(str).toUpperCase()) { const g = FONT[ch] || FONT[' ']; for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r][k] === 'X') rect(cx + k * sc, Y + r * sc, sc, sc, c); cx += 6 * sc; } return cx; };
      const tw = (str, sc) => String(str).length * 6 * sc;
      const BG = [13, 17, 23], GRID = [33, 40, 51], UP = [38, 194, 129], DN = [240, 82, 82], TXT = [201, 209, 217], DIM = [125, 133, 144];
      rect(0, 0, W, H, BG);
      const hi = Math.max(...candles.map(c => c[1])), lo = Math.min(...candles.map(c => c[2]));
      const useLog = hi / lo > 3; // huge range: log scale so a x50 pump is still readable
      const f = v => useLog ? Math.log(v) : v, top = f(hi), bot = f(lo), padv = (top - bot) * 0.06 || top * 0.01, vmax = top + padv, vmin = bot - padv;
      const Y = v => Math.round(T0 + ph - (f(v) - vmin) / (vmax - vmin) * ph);
      for (let i = 0; i <= 5; i++) { // grid + price labels
        const gy = T0 + Math.round(ph * i / 5), v = useLog ? Math.exp(vmax - (vmax - vmin) * i / 5) : vmax - (vmax - vmin) * i / 5;
        rect(L0, gy, pw, 1, GRID); text(8, gy - 7, '$' + fmtP(v), 2, DIM);
      }
      const slot = pw / candles.length, bw = Math.max(1, Math.floor(slot * 0.68));
      candles.forEach((c, i) => {
        const cx = Math.round(L0 + slot * (i + 0.5)), col = c[3] >= c[0] ? UP : DN;
        rect(cx, Y(c[1]), 1, Math.max(1, Y(c[2]) - Y(c[1]) + 1), col);
        const yo = Y(c[0]), yc = Y(c[3]); rect(cx - Math.floor(bw / 2), Math.min(yo, yc), bw, Math.max(1, Math.abs(yo - yc) + 1), col);
      });
      const last = candles[candles.length - 1][3], first = candles[0][0], ch = last / first - 1, ly = Y(last), lc = ch >= 0 ? UP : DN;
      for (let X = L0; X < W - R0; X += 8) rect(X, ly, 4, 1, lc); // dashed line at the current price
      rect(W - R0 - tw('$' + fmtP(last), 2) - 10, ly - 10, tw('$' + fmtP(last), 2) + 10, 20, lc); text(W - R0 - tw('$' + fmtP(last), 2) - 5, ly - 7, '$' + fmtP(last), 2, [10, 10, 10]);
      // header
      const name = A[sym].name.toUpperCase(); let cx = text(L0, 18, sym, 4, TXT); text(cx + 14, 26, name, 2, DIM);
      text(L0, 58, '$' + fmtP(last), 3, TXT); text(L0 + tw('$' + fmtP(last), 3) + 18, 58, pct(ch), 3, lc);
      text(W - R0 - tw(label, 2), 26, label, 2, DIM);
      text(W - R0 - tw('HIGH $' + fmtP(hi), 2), 54, 'HIGH $' + fmtP(hi), 2, UP); text(W - R0 - tw('LOW $' + fmtP(lo), 2), 72, 'LOW $' + fmtP(lo), 2, DN);
      text(L0, H - 30, useLog ? 'LOG SCALE' : 'OLDEST', 2, DIM); text(W - R0 - tw('NOW', 2), H - 30, 'NOW', 2, DIM);
      return { png: png(W, H, buf), last, ch, hi, lo, n: candles.length, label };
    }

    // ================= commands =================
    L.trading = { step, load, advance, render, A, SYMS, news, fresh, newAsset }; // for tests
    const ask = (p, s) => p * (1 + A[s].spread), bid = (p, s) => p * (1 - A[s].spread);
    const pick = c => { const s = (c.args[0] || '').toUpperCase(); return A[s] ? s : null; };
    const list = () => SYMS.map(s => `${A[s].emoji} ${s}`).join(' • ');
    const ICON = { rumor: '🗞️', sched: '⏰', breaking: '🚨', confirmed: '✅', denied: '❌', earnings: '📊', update: '🔄', revise: '✏️', chatter: '💬' };
    const fmtNews = n => { const emo = /^\p{Extended_Pictographic}/u.test(n.text) ? '' : (n.tag === 'run' ? (n.up ? '🚀 ' : '📉 ') : (ICON[n.tag] || '📰') + ' '); const body = n.dead ? `~${n.text}~` : n.text; return `${emo}${body}${n.pct !== undefined ? ` (${pct(n.pct)})` : ''}\n│   ${ago(Date.now() - n.t)} ago`; };
    const fgLabel = v => v < 20 ? '😱 Extreme Fear' : v < 40 ? '😟 Fear' : v < 60 ? '😐 Neutral' : v < 80 ? '😀 Greed' : '🤑 Extreme Greed';

    def(['market', 'stocks', 'tmarket'], { usage: ['market'] }, c => {
      const S = advance();
      const rows = SYMS.map(s => { const x = S.assets[s], c1 = change(x, 60), c24 = x.c5.length >= 12 ? x.p / x.c5[Math.max(0, x.c5.length - 288)][0] - 1 : null; return `${A[s].emoji} *${s}* ${A[s].name}\n│   $${fmtP(x.p)}  ${arrow(c1)} ${pct(c1)} (1h)${c24 === null ? '' : ' · ' + pct(c24) + ' (24h)'}`; });
      const head = S.news.find(n => !n.dead && n.tag !== 'chatter');
      c.reply(`📈 *MARKET*  ·  ${fgLabel(S.fg)} (${Math.round(S.fg)})\n\n${rows.join('\n')}${head ? `\n\n📰 ${head.text}` : ''}\n\n_Fake coins. Every trade pays a spread: 0.2% on gold up to 1.5% on MoonRocket._\n${P}tbuy <symbol> <amount>  ·  ${P}tsell <symbol> <all|amount>\n${P}pf  ·  ${P}chart <symbol> [1h|6h|24h|7d|14d]  ·  ${P}tnews`);
    });

    def(['tbuy', 'invest'], { usage: ['tbuy NVA 5000'] }, c => {
      const S = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}tbuy NVA 5000  or  ${P}tbuy NVA all`);
      const u = db.user(c.sender), a = (c.args[1] || '').toLowerCase();
      const amt = a === 'all' ? Math.floor(u.wallet) : parseAmt(a);
      if (!amt || amt < MIN_TRADE) return c.reply(`⚠️ Enter an amount (min ${m(MIN_TRADE)}).\nExample: ${P}tbuy ${s} 5000  or  ${P}tbuy ${s} all`);
      if (amt > u.wallet) return c.reply(`⚠️ You only have *${m(u.wallet)}* in your wallet.`);
      const price = ask(S.assets[s].p, s), q = amt / price;
      const pos = ((u.stocks ||= {})[s] ||= { q: 0, cost: 0 });
      pos.q += q; pos.cost += amt; u.wallet -= amt; db.save();
      c.reply(`✅ *BOUGHT ${s}*\n\n${A[s].emoji} ${q.toFixed(q < 1 ? 4 : 2)} @ $${fmtP(price)}\n💸 Spent: *${m(amt)}*\n💰 Wallet: *${m(u.wallet)}*`);
    });

    def(['tsell', 'divest'], { usage: ['tsell NVA all'] }, c => {
      const S = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}tsell NVA all  or  ${P}tsell NVA 2k`);
      const u = db.user(c.sender), pos = u.stocks?.[s];
      if (!pos || pos.q <= 0) return c.reply(`You don't own any ${s}.`);
      const price = bid(S.assets[s].p, s), a = (c.args[1] || 'all').toLowerCase();
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
      const S = advance(), u = db.user(c.sender), st = u.stocks || {};
      const rows = Object.entries(st).filter(([s, p]) => p.q > 0 && A[s]).map(([s, p]) => { const val = p.q * bid(S.assets[s].p, s); return { s, p, val, pnl: val - p.cost }; }).sort((x, y) => y.val - x.val);
      if (!rows.length) return c.reply(`📂 *PORTFOLIO*\n\nYou don't own anything yet.\n${P}market to see prices, then ${P}tbuy NVA 5000`);
      const tv = rows.reduce((t, r) => t + r.val, 0), tc = rows.reduce((t, r) => t + r.p.cost, 0);
      const lines = rows.map(r => `${A[r.s].emoji} *${r.s}*  ${r.p.q.toFixed(r.p.q < 1 ? 4 : 2)} @ avg $${fmtP(r.p.cost / r.p.q)}\n│   ${m(r.val)}  ${r.pnl >= 0 ? '🟢' : '🔴'} ${r.pnl >= 0 ? '+' : '-'}${m(Math.abs(r.pnl)).replace('-', '')} (${pct(r.p.cost ? r.pnl / r.p.cost : 0)})`);
      c.reply(`📂 *PORTFOLIO*\n\n${lines.join('\n')}\n\n📊 Invested: *${m(tc)}*\n💼 Value now: *${m(tv)}* ${tv >= tc ? '🟢' : '🔴'} ${pct(tc ? tv / tc - 1 : 0)}\n💰 Wallet: *${m(u.wallet)}*\n\n_Valued at the sell price._`);
    });

    def(['chart', 'tchart'], { usage: ['chart NVA 24h'] }, async c => {
      const S = advance(), s = pick(c);
      if (!s) return c.reply(`Which asset?\n${list()}\n\nExample: ${P}chart NVA 6h\nTimeframes: ${Object.keys(TF).join(' · ')}`);
      const tf = (c.args[1] || '24h').toLowerCase();
      if (!TF[tf]) return c.reply(`⚠️ Timeframes: ${Object.keys(TF).join(' · ')}`);
      const r = render(S, s, tf);
      if (!r) return c.reply('📊 Not enough price history yet, check again in a few minutes.');
      const caption = `${A[s].emoji} *${s}* · ${A[s].name}\n💲 *$${fmtP(r.last)}*  ${arrow(r.ch)} ${pct(r.ch)} (${r.label.split(' · ')[0].toLowerCase()})\n⬆️ $${fmtP(r.hi)}   ⬇️ $${fmtP(r.lo)}`;
      try { await c.sock.sendMessage(c.chat, { image: r.png, caption }, c.msg ? { quoted: c.msg } : undefined); }
      catch (e) { console.error('chart send failed:', e?.message || e); c.reply(`${caption}\n\n_(couldn't send the picture)_`); }
    });

    def(['tnews', 'marketnews'], { usage: ['tnews', 'tnews MOON'] }, c => {
      const S = advance(), s = pick(c), all = S.news.filter(n => !s || n.s === s || n.s === null); let chat = 0; const items = all.filter(n => n.tag !== 'chatter' || chat++ < 3).slice(0, 8);
      c.reply(items.length ? `📰 *MARKET NEWS*${s ? ' · ' + s : ''}\n\n` + items.map(fmtNews).join('\n\n') + `\n\n_~Crossed out~ means the story was retracted. Don't trust headlines too much._` : '📰 *MARKET NEWS*\n\nQuiet so far. Check back soon.');
    });

    // keep the market moving even if nobody is typing, and keep the file fresh
    setTimeout(() => { try { advance(); } catch (e) { console.error('market start failed:', e?.message || e); } setInterval(() => { try { advance(); } catch (e) { console.error('market tick failed:', e?.message || e); } }, TICK).unref(); }, 15000).unref();
  },
};
