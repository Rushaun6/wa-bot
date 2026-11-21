// 🐉 WORLD BOSS RAIDS (.raid): every few hours a boss shows up in each active group (only groups where the bot AND the economy are on).
// Everyone in the group fights the same HP bar for 90 minutes: free hits (.raid hit, pets with duel/slayer perks hit harder) or the coin cannon
// (.raid cannon <amount>: coins turn into damage, bosses that are weak to coins take double). Kill it in time and the loot pool is split by damage.
module.exports = {
  category: '🐉 RAIDS',
  register(def, L) {
    const { P, db, m, rnd, left } = L, PT = L.pets;
    L.ECON?.add('🐉 RAIDS');
    const BOSS_MS = 90 * 60000, TIERMULT = [1, 1.5, 2.2, 3, 4];
    const BOSSES = [
      { id: 'titan', emoji: '🗿', name: 'Stone Titan', tier: 1, weak: 'cannon', hint: 'It cracks under pressure. 🪙 Coins from the cannon hurt it TWICE as much.' },
      { id: 'dragon', emoji: '🐲', name: 'Elder Dragon', tier: 2, weak: 'hit', hint: 'Its scales are thin. ⚔️ Free hits land 60% harder.' },
      { id: 'glitch', emoji: '👾', name: 'Glitch King', tier: 2, weak: 'glitch', hint: 'Its code is unstable. 🎲 Every hit does 0.3x to 3x damage.' },
      { id: 'kraken', emoji: '🦑', name: 'Abyss Kraken', tier: 3, weak: 'hit', regen: true, hint: 'It heals 2% every 10 minutes. Keep hitting! ⚔️ Free hits land 60% harder.' },
      { id: 'banker', emoji: '🧟', name: 'Zombie Banker', tier: 3, weak: 'cannon', hint: 'Greedy to the bone. 🪙 Coins hurt it TWICE as much.' },
      { id: 'ghost', emoji: '👻', name: 'Poltergeist', tier: 4, weak: 'hit', hint: 'Tricky. ⚔️ Free hits land 60% harder.' },
      { id: 'mecha', emoji: '🤖', name: 'Mecha Landlord', tier: 5, weak: 'cannon', hint: 'It only understands money. 🪙 Coins hurt it TWICE as much.' },
    ];
    const econOn = id => db.data.groups[id]?.bot === true && db.data.groups[id]?.economy === true;
    const num = n => Math.round(n).toLocaleString('en-US');
    const name = n => db.data.users[n]?.name || '+' + n;
    const bar = (f, n = 14) => { const k = Math.max(0, Math.min(n, Math.round(f * n))); return '█'.repeat(k) + '░'.repeat(n - k); };
    const players = chat => Object.values(db.data.users).filter(u => u.lastGroup === chat && Date.now() - (u.seen || 0) < 3 * 86400000).length;
    const say = (chat, text) => { const s = L.state.sock; if (s) s.sendMessage(chat, { text }).catch(() => {}); };
    const dealt = b => Object.values(b.dmg).reduce((s, x) => s + x, 0);

    function spawn(chat, tier) {
      const g = db.group(chat), pool = tier ? BOSSES.filter(b => b.tier === tier) : BOSSES, def0 = pool[rnd(0, pool.length - 1)];
      const n = Math.max(5, players(chat)), max = Math.round(n * 18000 * TIERMULT[def0.tier - 1]);
      g.boss = { id: def0.id, emoji: def0.emoji, name: def0.name, tier: def0.tier, weak: def0.weak, regen: !!def0.regen, hint: def0.hint, hp: max, max, at: Date.now(), ends: Date.now() + BOSS_MS, regenAt: Date.now(), dmg: {}, last: 0, said: {} };
      g.nextBoss = 0; db.save();
      say(chat, `🚨 *WORLD BOSS!* 🚨\n\n${def0.emoji} *${def0.name}* has appeared!\n❤️ ${bar(1)} ${num(max)} HP\n⏳ ${left(BOSS_MS)} to defeat it\n💰 Loot pool: *${m(Math.round(max * 0.8))}*\n\n💡 ${def0.hint}\n\n⚔️ *${P}raid hit* (free, every 30s)\n🪙 *${P}raid cannon <amount>* (coins = damage)\n📊 *${P}raid* to see the fight`);
      return g.boss;
    }
    function lootText(b, shares, pool, extra) { return shares.slice(0, 5).map(([n, d], i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${name(n)} — ${num(d)} dmg · *+${m(extra[n] || 0)}*`).join('\n'); }
    function finish(chat, b, killer) { // boss defeated
      const g = db.group(chat), total = dealt(b), pool = Math.round(b.max * 0.8), shares = Object.entries(b.dmg).sort((x, y) => y[1] - x[1]), paid = {};
      for (const [n, d] of shares) paid[n] = Math.floor(pool * d / total);
      if (shares[0]) paid[shares[0][0]] = (paid[shares[0][0]] || 0) + Math.floor(pool * 0.1); // MVP
      if (killer) paid[killer] = (paid[killer] || 0) + Math.floor(pool * 0.05); // last hit
      for (const [n, v] of Object.entries(paid)) { const u = db.user(n); u.wallet += v; }
      shares.slice(0, 3).forEach(([n]) => L.crates?.add(db.user(n), Math.round(pool * 0.03), 1));
      g.boss = null; g.nextBoss = Date.now() + rnd(6, 12) * 3600000; db.save();
      say(chat, `🏆 *${b.name.toUpperCase()} DEFEATED!* 🏆\n\n${lootText(b, shares, pool, paid)}\n\n🎯 Last hit: ${name(killer)} (+5%)\n👑 MVP: ${shares[0] ? name(shares[0][0]) : '?'} (+10%)\n📦 The top 3 also get a crate!`);
    }
    function expire(chat, b) { // it got away
      const g = db.group(chat), total = dealt(b) || 1, frac = 1 - b.hp / b.max, pool = Math.round(b.max * 0.8 * 0.25 * frac);
      for (const [n, d] of Object.entries(b.dmg)) db.user(n).wallet += Math.floor(pool * d / total);
      g.boss = null; g.nextBoss = Date.now() + rnd(6, 12) * 3600000; db.save();
      say(chat, `💨 *${b.emoji} ${b.name} ESCAPED!*\n\nIt had ${Math.round(100 * b.hp / b.max)}% HP left. Everyone who fought shares a consolation prize of ${m(pool)}.`);
    }
    function regen(b) { if (!b.regen) return; const steps = Math.floor((Date.now() - b.regenAt) / 600000); if (steps > 0) { b.hp = Math.min(b.max, b.hp + Math.round(b.max * 0.02 * steps)); b.regenAt += steps * 600000; } }
    function milestone(chat, b) {
      const f = b.hp / b.max; for (const k of [50, 10]) if (f <= k / 100 && !b.said[k]) { b.said[k] = true; say(chat, `${k === 50 ? '⚔️' : '🔥'} ${b.emoji} *${b.name}* is down to *${k}%* HP! ${bar(f)}\n${k === 10 ? 'Finish it!' : 'Keep going!'}`); }
    }
    L.raid = { spawn, spawnAll: tier => { let n = 0; for (const id of Object.keys(db.data.groups)) if (id.endsWith('@g.us') && econOn(id) && !db.data.groups[id].boss) { spawn(id, tier); n++; } return n; } };

    // ---- scheduler
    const tick = () => {
      const now = Date.now();
      for (const [id, g] of Object.entries(db.data.groups)) {
        if (!id.endsWith('@g.us') || !econOn(id)) continue;
        const b = g.boss;
        if (b) { regen(b); if (now >= b.ends) expire(id, b); else milestone(id, b); continue; }
        if (!g.nextBoss) { g.nextBoss = now + rnd(1, 4) * 3600000; db.save(); continue; }
        if (now >= g.nextBoss) { if (players(id) >= 3) spawn(id); else { g.nextBoss = now + 3600000; db.save(); } }
      }
    };
    setInterval(() => { try { tick(); } catch (e) { console.error('raid tick failed:', e?.message || e); } }, 60000).unref();
    L.petTicks = Object.assign(L.petTicks || {}, { raidTick: tick });

    // ---- commands
    def(['raid', 'worldboss'], { g: true, usage: ['raid', 'raid hit', 'raid cannon <amount>'] }, c => {
      const g = db.group(c.chat), b = g.boss, a = (c.args[0] || '').toLowerCase(), u = db.user(c.sender);
      if (a === 'spawn') { if (!c.isOwner) return; const t = parseInt(c.args[1], 10); if (g.boss) return c.reply('A boss is already here.'); return void spawn(c.chat, t >= 1 && t <= 5 ? t : 0); }
      if (!b) return c.reply(`🐉 *WORLD BOSS*\n\nNo boss right now. One shows up every few hours in active groups.${g.nextBoss ? `\n⏳ Next one in about *${left(Math.max(0, g.nextBoss - Date.now()))}*` : ''}`);
      regen(b);
      if (a === 'hit' || a === 'attack' || a === 'cannon' || a === 'fire') {
        if (Date.now() >= b.ends) { expire(c.chat, b); return; }
        const cannon = a === 'cannon' || a === 'fire'; if (L.cooldown(c, cannon ? 'raidcannon' : 'raidhit', cannon ? 15000 : 30000)) return;
        const slay = PT.duelBonus(u) + PT.ab(u, 'slayer'); let dmg, note = '';
        if (cannon) {
          const amt = (c.args[1] || '').toLowerCase() === 'all' ? Math.floor(u.wallet) : L.parseAmt(c.args[1]); if (!amt || amt < 1000) return c.reply(`🪙 Fire the cannon with at least ${m(1000)}: ${P}raid cannon 5000`); if (amt > u.wallet) return c.reply(`⚠️ You only have ${m(u.wallet)}.`);
          u.wallet -= amt; dmg = amt * (rnd(70, 130) / 100) * (b.weak === 'cannon' ? 2 : 1) * (1 + slay / 200); note = `🪙 ${m(amt)} → `;
        } else { dmg = rnd(900, 1600) * (1 + slay / 100) * (b.weak === 'hit' ? 1.6 : 1); if (rnd(1, 100) <= 10) { dmg *= 2; note = '💥 CRIT! '; } }
        if (b.weak === 'glitch') dmg *= 0.3 + Math.random() * 2.7;
        dmg = Math.max(1, Math.round(dmg)); dmg = Math.min(dmg, b.hp); b.hp -= dmg; b.dmg[c.sender] = (b.dmg[c.sender] || 0) + dmg; db.save();
        if (b.hp <= 0) { c.reply(`${note}⚔️ You deal *${num(dmg)}* damage and land the FINAL BLOW!`); return finish(c.chat, b, c.sender); }
        milestone(c.chat, b);
        return c.reply(`${note}⚔️ *${num(dmg)}* damage to ${b.emoji} ${b.name}!\n❤️ ${bar(b.hp / b.max)} ${Math.ceil(100 * b.hp / b.max)}%\n🎯 Your total: ${num(b.dmg[c.sender])}`);
      }
      const top = Object.entries(b.dmg).sort((x, y) => y[1] - x[1]).slice(0, 5);
      c.reply(`🐉 *${b.emoji} ${b.name.toUpperCase()}*\n\n❤️ ${bar(b.hp / b.max)} *${Math.ceil(100 * b.hp / b.max)}%*  (${num(b.hp)} / ${num(b.max)})\n⏳ ${left(Math.max(0, b.ends - Date.now()))} left\n💰 Loot pool: *${m(Math.round(b.max * 0.8))}*\n\n💡 ${b.hint}\n\n${top.length ? '*Top damage:*\n' + top.map(([n, d], i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${name(n)} — ${num(d)}`).join('\n') : '_Nobody has hit it yet. Be first!_'}\n\n${b.dmg[c.sender] ? `🎯 You: ${num(b.dmg[c.sender])}\n\n` : ''}⚔️ ${P}raid hit  ·  🪙 ${P}raid cannon <amount>`);
    });
  },
};
