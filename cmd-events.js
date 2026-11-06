// RANDOM EVENTS (v2, built for rich players): one random event every 3 hours, plus LUCK HOUR at 12am and 12pm.
// Everything scales with the player's OWN numbers (% of wallet / bank / net worth, or minutes of passive income), so a billionaire feels it
// as much as a beginner. Some events warn you first (so you can .deposit), some are races, one is opt-in.
// Only players seen in the last 7 days take part. Times use the server clock: set TZ (e.g. TZ=Africa/Lagos) so 12am/12pm are yours.
const HOUR = 3600000, MIN = 60000, WEEK = 7 * 24 * HOUR;
const pick = a => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wpick = list => { let r = Math.random() * list.reduce((s, x) => s + x.w, 0); for (const x of list) if ((r -= x.w) <= 0) return x; return list[0]; };
const nextLuck = now => { const d = new Date(now); for (let add = 0; add < 2; add++) for (const h of [0, 12]) { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, h, 0, 0).getTime(); if (t > now) return t; } };

module.exports = {
  category: '🎲 EVENTS',
  register(def, L) {
    const { P, db, m, left } = L;
    const PT = L.pets, IT = L.items, POT = require('./potions');
    const S = () => { const e = (db.data.events ||= {}); e.log ||= []; e.pending ||= []; e.since ||= Date.now(); return e; };
    S();
    const worth = u => (u.wallet || 0) + (u.bank || 0);
    const nm = (n, u) => u.name || '…' + n.slice(-4);
    // active = seen in the last 7 days. Players with no stamp yet count for the first week; if index.js has no stamp code at all, everyone who has played counts.
    const people = () => { const all = Object.entries(db.data.users), stamped = all.some(([, u]) => u.seen), fresh = Date.now() - S().since < WEEK;
      return all.filter(([, u]) => u.played && (u.seen ? Date.now() - u.seen < WEEK : (!stamped || fresh))); };
    const pay = (u, a) => { a = Math.floor(a); if (a > 0) u.wallet += a; return Math.max(0, a); };
    const take = (u, a) => { a = Math.min(Math.floor(a), Math.max(0, u.wallet)); if (a > 0) u.wallet -= a; return Math.max(0, a); };
    const perHour = u => Math.floor(IT.income(u) * (1 + PT.ab(u, 'bizboost') / 100)) * 20 + Math.floor(PT.income(u) * 60 / PT.INCOME_MIN); // businesses + pets
    // a boost never replaces a stronger one of the same kind (a Stardust potion isn't wiped by a weaker event); a curse always wins over a boost
    function boost(u, key, x, mins) {
      const now = Date.now(), cur = u.ab?.[key];
      if (cur && now < cur.until && (cur.x >= 1) === (x >= 1) && (x >= 1 ? cur.x > x : cur.x < x)) return;
      (u.ab ||= {})[key] = { x, until: now + mins * MIN };
    }
    const groupsOn = () => Object.keys(db.data.groups).filter(j => j.endsWith('@g.us') && db.data.groups[j].economy !== false);
    async function announce(text) { const sock = L.state.sock; if (!sock) return; for (const jid of groupsOn()) await sock.sendMessage(jid, { text }).catch(() => {}); }
    const CRATES = () => IT.ITEMS.filter(i => i.crate && i.id !== 'mystery').sort((a, b) => a.price - b.price);

    // ------------------------------------------------------------ the events
    // run(players) changes the players and returns the text to announce. warn: announced first, runs after `mins`. start(): opens a live event (grab/solve/join).
    const EVENTS = [
      // ---- money for everyone (scales with wallet / bank / income)
      { id: 'cashrain', emoji: '💸', name: 'CASH RAIN', w: 10, about: '+2% of your wallet (min $25k)',
        run: ps => { ps.forEach(([, u]) => pay(u, Math.max(25000, u.wallet * 0.02))); return 'It rained money! Everyone got *+2% of their wallet* (min $25,000).'; } },
      { id: 'interest', emoji: '🏦', name: 'BANK BONUS', w: 9, about: '+1.5% on your bank balance',
        run: ps => { ps.forEach(([, u]) => { if (u.bank > 0) u.bank += Math.floor(u.bank * 0.015); }); return 'The bank paid a surprise *+1.5% bonus* on every bank balance. Money in the bank pays off.'; } },
      { id: 'burst', emoji: '💼', name: 'INCOME BURST', w: 9, about: '60 minutes of your passive income, instantly',
        run: ps => { ps.forEach(([, u]) => pay(u, Math.max(25000, perHour(u)))); return 'Everyone collected *1 hour of passive income* at once (min $25,000). Businesses and pets pay off.'; } },
      { id: 'dip', emoji: '🎰', name: 'LUCKY DIP', w: 8, about: 'Everyone rolls +1% to +10% of their wallet',
        run: ps => { ps.forEach(([, u]) => { const r = rint(1, 100), pct = r <= 50 ? 0.01 : r <= 80 ? 0.025 : r <= 95 ? 0.05 : 0.10; pay(u, Math.max(10000, u.wallet * pct)); }); return 'Everyone rolled the dip: *50% +1%, 30% +2.5%, 15% +5%, 5% +10%* of their wallet.'; } },
      { id: 'wheel', emoji: '🎡', name: 'WHEEL OF FORTUNE', w: 6, about: 'Everyone spins: -5% to +20% of their wallet',
        run: ps => { const T = [[-0.05, 15], [-0.02, 25], [0.01, 25], [0.04, 20], [0.10, 10], [0.20, 5]]; ps.forEach(([, u]) => { const pct = wpick(T.map(([p, w]) => ({ p, w }))).p; if (pct >= 0) pay(u, u.wallet * pct); else take(u, -u.wallet * pct); }); return 'The wheel spun for everyone: from *-5% to +20%* of the wallet. Mostly good, sometimes ouch.'; } },
      { id: 'swing', emoji: '📈', name: 'MARKET SWING', w: 6, about: 'Every bank balance moves -2% to +3%',
        run: ps => { const pct = (rint(-20, 30)) / 1000; ps.forEach(([, u]) => { if (u.bank > 0) u.bank = Math.max(0, u.bank + Math.floor(u.bank * pct)); }); return `${pct >= 0 ? '📈 The market rallied' : '📉 The market dipped'}: every bank balance moved *${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%*.`; } },
      { id: 'lottery', emoji: '🎟️', name: 'LOTTERY', w: 5, about: 'One random player wins a big prize',
        run: ps => { if (!ps.length) return 'Nobody entered the lottery.'; const top = ps.map(([, u]) => worth(u)).sort((a, b) => b - a).slice(0, 10), avg = top.reduce((s, x) => s + x, 0) / top.length;
          const [n, u] = pick(ps), prize = Math.min(Math.max(1000000, Math.floor(avg * 0.02)), Math.max(1000000, worth(u) * 3)); pay(u, prize); return `Every active player had a ticket. 🎉 *${nm(n, u)}* won *${m(prize)}*! (2% of what the top 10 hold on average, capped at 3× the winner's own net worth)`; } },
      // ---- boosts (these multiply passive income: businesses, pets, bank interest, top-3)
      { id: 'golden', emoji: '🥇', name: 'GOLDEN HOUR', w: 8, about: '+50% passive income for 1h',
        run: ps => { ps.forEach(([, u]) => boost(u, 'cash', 1.5, 60)); return '*+50% passive income* for 1 hour (businesses, pets, bank interest).'; } },
      { id: 'boom', emoji: '🏢', name: 'BUSINESS BOOM', w: 6, about: 'x2 passive income for 30 min',
        run: ps => { ps.forEach(([, u]) => boost(u, 'cash', 2, 30)); return '*Passive income ×2* for 30 minutes. Own big businesses? This is your moment.'; } },
      { id: 'rush', emoji: '⚡', name: 'GOLD RUSH', w: 3, about: 'x3 passive income for 10 min',
        run: ps => { ps.forEach(([, u]) => boost(u, 'cash', 3, 10)); return '*Passive income ×3* for 10 minutes. Make it count!'; } },
      { id: 'clover', emoji: '🍀', name: 'LUCKY CLOVER', w: 6, about: '+50% luck for 1h',
        run: ps => { ps.forEach(([, u]) => boost(u, 'luck', 1.5, 60)); return '*+50% luck* for 1 hour. Open crates!'; } },
      { id: 'superluck', emoji: '🌟', name: 'SUPER LUCK', w: 3, about: 'x3 luck for 20 min',
        run: ps => { ps.forEach(([, u]) => boost(u, 'luck', 3, 20)); return '*Luck ×3* for 20 minutes. Crates drop far more pets and items.'; } },
      { id: 'safe', emoji: '🛡️', name: 'SAFE HOUR', w: 5, about: 'Nobody can be robbed for 1h',
        run: ps => { ps.forEach(([, u]) => { u.padlock = Math.max(u.padlock || 0, Date.now() + HOUR); }); return 'Everyone got a *free padlock for 1 hour*. No robberies.'; } },
      // ---- gifts that scale with wealth
      { id: 'crates', emoji: '📦', name: 'WEALTH CRATES', w: 7, about: 'A crate matched to your wealth, for free',
        run: ps => { const list = CRATES(), got = {}; ps.forEach(([, u]) => { let c = list[0]; for (const x of list) if (x.price <= worth(u) * 0.004) c = x; IT.add(u, c.id, 1); got[c.name] = (got[c.name] || 0) + 1; });
          return 'Everyone got a *free crate that matches their wealth*:\n' + Object.entries(got).map(([k, v]) => `${k} ×${v}`).join(', ') + `\nOpen it with ${P}open <crate>`; } },
      { id: 'potions', emoji: '🧪', name: 'POTION SHOWER', w: 6, about: '1-2 free good potions each',
        run: ps => { const good = POT.POTIONS.filter(p => p.kind === 'good'); ps.forEach(([, u]) => { for (let i = rint(1, 2); i > 0; i--) POT.add(u, wpick(good).id, 1); }); return `Everyone got *1–2 free good potions*. Check ${P}potions`; } },
      // ---- losses (the economy needs sinks)
      { id: 'bandits', emoji: '🥷', name: 'BANDIT RAID', w: 5, about: 'Top 5 wallets lose 4%; loot goes to 8 random players',
        warn: { mins: 2, text: `Bandits are heading for the biggest wallets! You have *2 minutes*.\n🏦 Money in the bank is safe: *${P}dep all*` },
        run: ps => { const top = ps.slice().sort((a, b) => b[1].wallet - a[1].wallet).slice(0, 5), vic = new Set(top.map(x => x[0]));
          const lucky = shuffle(ps.filter(([n]) => !vic.has(n))).slice(0, 8); if (!lucky.length) return 'The bandits found nobody to share the loot with and rode off empty-handed.';
          let pot = 0; top.forEach(([, u]) => { pot += take(u, u.wallet * 0.04); }); const each = Math.floor(pot / lucky.length); let given = 0; lucky.forEach(([, u]) => { given += pay(u, Math.min(each, Math.max(100000, worth(u) * 5))); });
          return `Bandits hit the 5 biggest wallets for *4% each* (${top.map(([n, u]) => nm(n, u)).join(', ')}) and scattered loot to ${lucky.length} random player${lucky.length === 1 ? '' : 's'}: ${m(given)} landed (nobody can keep more than 5× their own net worth, the rest was lost).`; } },
      { id: 'tax', emoji: '🧾', name: 'TAX AUDIT', w: 5, about: 'Wallets over $1M pay 1.5%',
        warn: { mins: 2, text: `Tax collectors arrive in *2 minutes*!\n🏦 Money in the bank is not taxed: *${P}dep all*` },
        run: ps => { let t = 0; ps.forEach(([, u]) => { if (u.wallet > 1000000) t += take(u, u.wallet * 0.015); }); return `Every wallet over $1,000,000 paid *1.5%* (${m(t)} collected in total). Bank deposits were safe.`; } },
      { id: 'repair', emoji: '🔧', name: 'REPAIR BILL', w: 5, about: 'Pay 30 minutes of your passive income',
        run: ps => { let n = 0; ps.forEach(([, u]) => { const bill = perHour(u) * 0.5; if (bill > 0) { take(u, bill); n++; } }); return `Maintenance day! *${n}* business owners paid *30 minutes of their passive income*.`; } },
      { id: 'crash', emoji: '📉', name: 'MARKET CRASH', w: 4, about: '-20% passive income for 1h',
        run: ps => { ps.forEach(([, u]) => boost(u, 'cash', 0.8, 60)); return 'The market crashed. *-20% passive income* for 1 hour.'; } },
      { id: 'frenzy', emoji: '🔥', name: 'ROB FRENZY', w: 4, about: 'No rob cooldown, +25% rob success for 10 min',
        warn: { mins: 1, text: `A rob frenzy starts in *1 minute*: no cooldowns and +25% success for 10 minutes!\n🏦 Bank your cash now: *${P}dep all*` },
        run: ps => { ps.forEach(([, u]) => boost(u, 'frenzy', 1, 10)); return '*ROB FRENZY!* No rob cooldown and +25% success for 10 minutes. Go get it (or hope your cash is in the bank).'; } },
      // ---- live events (everyone races or opts in)
      { id: 'grab', emoji: '📦', name: 'SUPPLY DROP', w: 7, live: true, about: 'First 3 to type .grab win 3% / 2% / 1% of their net worth',
        start: () => { S().active = { type: 'grab', until: Date.now() + 3 * MIN, won: [] };
          return `A supply plane is dropping loot!\nFirst 3 to type *${P}grab* win a share of their own net worth:\n🥇 3% (min $250k)  🥈 2% (min $150k)  🥉 1% (min $100k)\n⏳ 3 minutes`; } },
      { id: 'solve', emoji: '🧮', name: 'MATH RACE', w: 6, live: true, about: 'First correct .solve answer wins 4% of their net worth',
        start: () => { const a = rint(12, 99), b = rint(12, 99), c = rint(100, 999), t = rint(1, 3), q = t === 1 ? `${a} × ${b}` : t === 2 ? `${c} + ${a * b}` : `(${a} × ${rint(3, 9)}) + ${c}`;
          const ans = t === 1 ? a * b : t === 2 ? c + a * b : Number(q.match(/\((\d+) × (\d+)\)/).slice(1).reduce((x, y) => x * y)) + c;
          S().active = { type: 'solve', until: Date.now() + 3 * MIN, q, ans, tries: {} };
          return `Solve this first:\n\n🧮 *${q} = ?*\n\nType *${P}solve <answer>*\n🏆 Winner gets *4% of their net worth* (min $500k)\n⏳ 3 minutes`; } },
      { id: 'don', emoji: '🎲', name: 'DOUBLE OR NOTHING', w: 5, live: true, about: 'Opt in with .evjoin: coin flip, win +6% or lose -5% of your wallet',
        start: () => { S().active = { type: 'don', until: Date.now() + 2 * MIN, joined: [] };
          return `Feeling brave? Type *${P}evjoin* to enter (need $100k+).\nCoin flip for everyone who joins: *win +6%* or *lose -5%* of your wallet.\n⏳ 2 minutes`; } },
    ];

    // ------------------------------------------------------------ running events
    const record = (e, extra) => { const L2 = S().log; L2.unshift({ id: e.id, emoji: e.emoji, name: e.name, at: Date.now(), ...extra }); L2.length = Math.min(L2.length, 10); };
    const fmtDelta = (list, sign) => list.map(([n, u, d]) => `${nm(n, u)} ${sign}${m(Math.abs(d))}`).join(' · ');
    async function runNow(e) { // the event itself happens now
      const before = new Map(people().map(([n, u]) => [n, worth(u)]));
      let text; if (e.live) text = e.start(); else text = e.run(people());
      db.save();
      const deltas = people().map(([n, u]) => [n, u, worth(u) - (before.get(n) ?? worth(u))]).filter(d => Math.abs(d[2]) >= 1);
      const up = deltas.filter(d => d[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3), down = deltas.filter(d => d[2] < 0).sort((a, b) => a[2] - b[2]).slice(0, 3);
      const extra = (up.length ? `\n\n📈 *Biggest gains:* ${fmtDelta(up, '+')}` : '') + (down.length ? `\n📉 *Hit hardest:* ${fmtDelta(down, '-')}` : '');
      record(e); await announce(`${e.emoji} *${e.name}*\n\n${text}${e.live ? '' : extra}`);
    }
    async function fire(e) { // warns first when the event has a warning
      if (e.warn) { S().pending.push({ at: Date.now() + e.warn.mins * MIN, id: e.id }); db.save(); return announce(`⚠️ ${e.emoji} *${e.name} INCOMING*\n\n${e.warn.text}`); }
      return runNow(e);
    }
    async function endActive() {
      const s = S(), a = s.active; if (!a) return; s.active = null;
      let text;
      if (a.type === 'grab') text = a.won.length ? `📦 *Supply drop over.*\n` + a.won.map((w, i) => `${['🥇', '🥈', '🥉'][i]} ${w.name} +${m(w.prize)}`).join('\n') : '📦 *Supply drop over.* Nobody grabbed it. The loot blew away.';
      else if (a.type === 'solve') text = `🧮 *Math race over.* Nobody solved *${a.q}*. The answer was *${a.ans}*.`;
      else if (a.type === 'don') {
        const rs = []; for (const n of a.joined) { const u = db.data.users[n]; if (!u) continue; const win = Math.random() < 0.5, d = win ? pay(u, u.wallet * 0.06) : -take(u, u.wallet * 0.05); rs.push([n, u, d]); }
        const w = rs.filter(r => r[2] > 0), l = rs.filter(r => r[2] < 0);
        text = rs.length ? `🎲 *Double or nothing result*\n✅ Won: *${w.length}*  ❌ Lost: *${l.length}*` + (w.length ? `\n🏆 Biggest win: ${fmtDelta(w.sort((x, y) => y[2] - x[2]).slice(0, 3), '+')}` : '') + (l.length ? `\n💀 Biggest loss: ${fmtDelta(l.sort((x, y) => x[2] - y[2]).slice(0, 3), '-')}` : '') : '🎲 *Double or nothing:* nobody had the nerve.';
      }
      db.save(); if (text) await announce(text);
    }
    // live-event commands
    const needWorth = c => db.user(c.sender);
    def('grab', { usage: 'grab' }, async c => {
      const a = S().active; if (!a || a.type !== 'grab') return c.reply('📦 There is no supply drop right now. Watch for the next event.');
      if (a.won.some(w => w.n === c.sender)) return c.reply('📦 You already grabbed yours.');
      const u = needWorth(c), pos = a.won.length, [pct, min] = [[0.03, 250000], [0.02, 150000], [0.01, 100000]][pos], prize = pay(u, Math.max(min, worth(u) * pct));
      a.won.push({ n: c.sender, name: nm(c.sender, u), prize }); db.save();
      c.reply(`📦 *${['🥇 FIRST', '🥈 SECOND', '🥉 THIRD'][pos]}!* You grabbed *+${m(prize)}*`);
      if (a.won.length >= 3) endActive();
    });
    def('solve', { usage: 'solve <answer>' }, async c => {
      const a = S().active; if (!a || a.type !== 'solve') return c.reply('🧮 There is no math race right now.');
      const v = Number(String(c.args.join('')).replace(/[,\s]/g, '')); if (!Number.isFinite(v)) return c.reply(`🧮 Type a number: ${P}solve <answer>`);
      a.tries[c.sender] = (a.tries[c.sender] || 0) + 1; if (a.tries[c.sender] > 5) return c.reply('🧮 You used your 5 tries.');
      if (v !== a.ans) { db.save(); return c.reply(`❌ Wrong. (${5 - a.tries[c.sender]} tries left)`); }
      const u = needWorth(c), prize = pay(u, Math.max(500000, worth(u) * 0.04)); S().active = null; db.save();
      c.reply(`🧮 *CORRECT!* You win *+${m(prize)}*`); announce(`🧮 *Math race over.* *${nm(c.sender, u)}* solved *${a.q} = ${a.ans}* and won *${m(prize)}*!`);
    });
    def('evjoin', { usage: 'evjoin' }, c => {
      const a = S().active; if (!a || a.type !== 'don') return c.reply('🎲 There is no double-or-nothing right now.');
      const u = db.user(c.sender); if (a.joined.includes(c.sender)) return c.reply('🎲 You are already in.');
      if (u.wallet < 100000) return c.reply(`🎲 You need at least *${m(100000)}* in your wallet to join.`);
      a.joined.push(c.sender); db.save(); c.reply(`🎲 You're in! *${a.joined.length}* player${a.joined.length === 1 ? '' : 's'} joined. Result when the timer ends.`);
    });

    // ------------------------------------------------------------ scheduler
    const chooseRandom = () => { const s = S(), last = s.log[0]?.id;
      return wpick(EVENTS.filter(e => e.id !== last && !(e.live && s.active) && !(e.warn && s.pending.length))); };
    function luckHour(label) { const x = pick([1.5, 2, 2.5, 3]); people().forEach(([, u]) => boost(u, 'luck', x, 60)); db.save(); record({ id: 'luckhour', emoji: '🍀', name: 'LUCK HOUR' }); return announce(`🍀 *LUCK HOUR* · ${label}\n\nLuck is ×${x} for everyone for the next hour. Crate time!`); }
    if (!S().nextRandom) { S().nextRandom = Date.now() + 3 * HOUR; db.save(); }
    let busy = false;
    const tick = async () => {
      if (busy || !L.state.sock) return; busy = true;
      try {
        const now = Date.now(), s = S(), d = new Date(now), h = d.getHours();
        if (s.active && now >= s.active.until) await endActive();
        for (const p of s.pending.filter(p => now >= p.at)) { s.pending = s.pending.filter(x => x !== p); const e = EVENTS.find(x => x.id === p.id); if (e) await runNow(e); }
        if (now >= s.nextRandom) { s.nextRandom = now + 3 * HOUR; db.save(); await fire(chooseRandom()); }
        if ((h === 0 || h === 12) && d.getMinutes() < 10) { const key = d.toDateString() + '-' + h; if (s.luckKey !== key) { s.luckKey = key; db.save(); await luckHour(h === 0 ? '🌙 12:00 AM' : '☀️ 12:00 PM'); } }
      } catch (e) { console.error('events tick failed:', e.message); } finally { busy = false; }
    };
    if (!module.exports._started) { module.exports._started = true; setInterval(tick, 20000).unref(); }

    // ------------------------------------------------------------ info + owner commands
    def('eventinfo', { usage: 'eventinfo' }, c => {
      const now = Date.now(), s = S(), u = db.user(c.sender), a = s.active;
      const bst = k => u.ab?.[k] && now < u.ab[k].until ? `×${u.ab[k].x} for ${left(u.ab[k].until - now)}` : 'none';
      const live = a ? `\n\n🔴 *LIVE NOW:* ${a.type === 'grab' ? `Supply drop, type ${P}grab` : a.type === 'solve' ? `Math race: ${a.q} (${P}solve <answer>)` : `Double or nothing, type ${P}evjoin`} · ${left(Math.max(0, a.until - now))} left` : '';
      const recent = s.log.slice(0, 3).map(l => `${l.emoji} ${l.name} · ${left(now - l.at)} ago`).join('\n') || 'none yet';
      c.reply(`🎲 *RANDOM EVENTS*\n\n⏰ Next event: in *${left(Math.max(0, s.nextRandom - now))}*\n🍀 Next LUCK HOUR (12am / 12pm): in *${left(nextLuck(now) - now)}*${live}\n\n🍀 Your luck boost: ${bst('luck')}\n💸 Your income boost: ${bst('cash')}\n\n*Recent*\n${recent}\n\nSee all: ${P}eventlist`);
    });
    def('eventlist', { usage: 'eventlist' }, c => c.reply(`🎲 *ALL EVENTS* (one every 3 hours)\n\n` + EVENTS.map(e => `${e.emoji} *${e.name}*${e.warn ? ' ⚠️' : ''}${e.live ? ' 🔴' : ''}\n   ${e.about}`).join('\n') + `\n\n⚠️ = you get a warning first (use ${P}dep all)\n🔴 = live: be quick`));
    def('triggerevent', { o: true, usage: 'triggerevent [id]' }, async c => {
      const id = (c.args[0] || '').toLowerCase();
      if (!id) { await fire(chooseRandom()); return c.reply('✅ Random event fired.'); }
      const e = EVENTS.find(x => x.id === id); if (!e) return c.reply('⚠️ Unknown event. IDs: ' + EVENTS.map(x => x.id).join(', '));
      if (e.live && S().active) return c.reply('⚠️ A live event is already running.');
      await fire(e); c.reply(`✅ Fired ${e.name}.`);
    });
    def('triggerluck', { o: true, usage: 'triggerluck' }, c => { luckHour('⚡ Surprise'); c.reply('✅ Luck hour fired.'); });
    module.exports._test = { EVENTS, runNow, fire, endActive, tick, S, people, worth, perHour, chooseRandom, luckHour };
  },
};
