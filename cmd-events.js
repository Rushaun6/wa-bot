// RANDOM EVENTS: a random event every 3 hours, plus LUCK HOUR at 12am and 12pm (a random 1.5x–3x luck boost for an hour).
// Times use the server clock. Set TZ (e.g. TZ=Africa/Lagos) so 12am and 12pm are your local time.
const HOUR = 3600000;
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const money = n => '$' + Math.floor(n).toLocaleString('en-US');
const boost = (u, key, x, hours) => { (u.ab ||= {})[key] = { x, until: Date.now() + hours * HOUR }; };
// the next 12am or 12pm after now
const nextLuck = now => {
  const d = new Date(now);
  for (let add = 0; add < 2; add++) for (const h of [0, 12]) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, h, 0, 0).getTime();
    if (t > now) return t;
  }
};

const EVENTS = [
  { emoji: '💸', name: 'CASH RAIN', run: us => { us.forEach(u => { u.wallet += clamp(Math.floor(u.wallet * 0.02), 500, 50000); }); return 'Every active player got 2% of their wallet (min $500, max $50,000).'; } },
  { emoji: '🌪️', name: 'BANDIT RAID', run: us => { let total = 0; shuffle(us).slice(0, 5).forEach(u => { const loss = Math.min(20000, Math.floor(u.wallet * 0.05)); u.wallet -= loss; total += loss; }); return `Bandits raided 5 players and took ${money(total)}. Lock your doors!`; } },
  { emoji: '🍀', name: 'LUCKY CLOVER', run: us => { us.forEach(u => boost(u, 'luck', 1.5, 1)); return 'Everyone has +50% luck for 1 hour!'; } },
  { emoji: '🥇', name: 'GOLDEN HOUR', run: us => { us.forEach(u => boost(u, 'cash', 1.5, 1)); return 'Everyone earns +50% cash for 1 hour!'; } },
  { emoji: '📉', name: 'MARKET CRASH', run: us => { us.forEach(u => boost(u, 'cash', 0.8, 1)); return 'The market crashed. Everyone earns -20% cash for 1 hour.'; } },
  { emoji: '🏦', name: 'BANK DAY', run: us => { us.forEach(u => { u.bank = (u.bank || 0) + Math.floor((u.bank || 0) * 0.01); }); return 'Banks paid 1% interest on every bank account!'; } },
];

let started = false; // register() runs once, but guard anyway

module.exports = {
  category: '🎲 EVENTS',
  register(def, L) {
    const { db, left } = L;
    const ev = () => (db.data.events ||= {});
    const players = () => Object.values(db.data.users).filter(u => u.played);
    const groupsOn = () => Object.keys(db.data.groups).filter(j => j.endsWith('@g.us') && db.data.groups[j].economy !== false);
    async function announce(text) {
      const sock = L.state.sock; if (!sock) return;
      for (const jid of groupsOn()) await sock.sendMessage(jid, { text }).catch(() => {});
    }
    function randomEvent() {
      const e = pick(EVENTS), result = e.run(players());
      db.save();
      return announce(`${e.emoji} *${e.name}*\n\n${result}`);
    }
    function luckHour(label) {
      const x = pick([1.5, 2, 2.5, 3]);
      players().forEach(u => boost(u, 'luck', x, 1));
      db.save();
      return announce(`🍀 *LUCK HOUR* · ${label}\n\nLuck is ×${x} for everyone for the next hour. Good time to gamble!`);
    }
    const tick = () => {
      const now = Date.now(), d = new Date(now), h = d.getHours(), e = ev();
      if (!e.nextRandom) { e.nextRandom = now + 3 * HOUR; db.save(); }
      if (now >= e.nextRandom) { e.nextRandom = now + 3 * HOUR; db.save(); randomEvent().catch(() => {}); }
      if ((h === 0 || h === 12) && d.getMinutes() < 10) {
        const key = d.toDateString() + '-' + h;
        if (e.luckKey !== key) { e.luckKey = key; db.save(); luckHour(h === 0 ? '🌙 12:00 AM' : '☀️ 12:00 PM').catch(() => {}); }
      }
    };
    if (!ev().nextRandom) { ev().nextRandom = Date.now() + 3 * HOUR; db.save(); } // first random event 3h after the bot starts
    if (!started) { started = true; setInterval(tick, 30000); }

    def('eventinfo', { usage: 'eventinfo' }, c => {
      const now = Date.now(), e = ev(), u = db.user(c.sender);
      const lk = u.ab?.luck && now < u.ab.luck.until ? `×${u.ab.luck.x} for ${left(u.ab.luck.until - now)}` : 'none';
      c.reply(`🎲 *RANDOM EVENTS*\n\n⏰ Next random event: in *${left(Math.max(0, (e.nextRandom || now) - now))}*\n🍀 Next LUCK HOUR (12am / 12pm): in *${left(nextLuck(now) - now)}*\n🍀 Your luck boost: ${lk}`);
    });

    def('triggerevent', { o: true, usage: 'triggerevent' }, c => { randomEvent(); c.reply('✅ Random event fired.'); });
    def('triggerluck', { o: true, usage: 'triggerluck' }, c => { luckHour('⚡ Surprise'); c.reply('✅ Luck hour fired.'); });
  },
};
