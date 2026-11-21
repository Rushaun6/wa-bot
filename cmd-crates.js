// 📦 CRATES: pets with the "cratedrop" ability produce a crate every few minutes (while equipped and not away). Open them with .opencrate.
// u.crates = { "<value>": count } (one stack per crate value), u.crprog = { petId: minutes collected towards the next crate }.
// Expeditions, bosses and fusion can add crates too (L.crates.add). Extras inside crates: lucky potion, mutagen vial, mystery egg (a free low-tier pet).
module.exports = {
  category: '📦 CRATES',
  register(def, L) {
    const { P, db, m, rnd } = L, PT = L.pets;
    L.ECON?.add('📦 CRATES');
    const MAX_STORED = 300, OPEN_AT_ONCE = 25;
    const NAMES = [[1000, '🪵 Wooden'], [5000, '⛓️ Iron'], [20000, '🟨 Golden'], [80000, '💠 Crystal'], [250000, '🔮 Mythic'], [Infinity, '🌌 Cosmic']];
    const nameOf = v => NAMES.find(n => v < n[0])[1];
    const total = u => Object.values(u.crates || {}).reduce((s, n) => s + n, 0);
    L.crates = { // used by other features
      add(u, value, n = 1) { const k = String(Math.max(1, Math.round(value))); u.crates = u.crates || {}; const room = Math.max(0, MAX_STORED - total(u)); const add = Math.min(n, room); if (add > 0) u.crates[k] = (u.crates[k] || 0) + add; return add; },
      total,
    };

    // ---- production: every minute, each equipped cratedrop pet adds a minute of progress
    const tick = () => {
      let changed = false;
      for (const u of Object.values(db.data.users)) {
        if (!u.equipped?.length) continue;
        const drops = PT.crateDroppers(u); if (!drops.length) continue;
        const speed = L.abOf(u, 'crate', 1); // Crate Rain world event
        u.crprog = u.crprog || {};
        for (const e of drops) for (const a of e.pet.ab.filter(x => x.type === 'cratedrop')) {
          const need = a.mins / PT.mult(e.lvl), k = e.pet.id; u.crprog[k] = (u.crprog[k] || 0) + speed;
          while (u.crprog[k] >= need) { u.crprog[k] -= need; if (!L.crates.add(u, a.avg, 1)) { u.crprog[k] = 0; break; } changed = true; }
        }
      }
      if (changed) db.save();
    };
    setInterval(() => { try { tick(); } catch (e) { console.error('crate tick failed:', e?.message || e); } }, 60000).unref();
    L.petTicks = Object.assign(L.petTicks || {}, { crateTick: tick });

    // ---- opening
    const flavor = ['You pry it open and coins spill everywhere', 'The lid pops off with a *clink*', 'A faint glow, then a rain of cash', 'Something rattles inside. Money!', 'It was heavier than it looked'];
    function openOne(u, value, lines) {
      const bonus = 1 + PT.ab(u, 'crate') / 100; // the existing "+% cash from crates" pets
      let coins = Math.floor(value * (0.5 + Math.random()) * bonus);
      if (rnd(1, 100) <= PT.ab(u, 'dblcrate')) { coins *= 2; lines.double++; } // the existing "crate opens twice" pets
      u.wallet += coins; lines.coins += coins;
      const r = Math.random() * 100;
      if (r < 5) { u.lucky = { x: 5, until: Date.now() + 30 * 60000 }; lines.extras.push('🍀 a *Lucky Potion* (+5 luck for 30 min)'); }
      else if (r < 9) { u.vials = (u.vials || 0) + 1; lines.extras.push('🧬 a *Mutagen Vial* (boosts your next .fuse)'); }
      else if (r < 11) { // mystery egg: a free common/rare pet you don't own yet, otherwise some coins
        const pool = PT.PETS.filter(p => (p.tier === 'common' || p.tier === 'rare') && !PT.owned(u, p.id));
        if (pool.length) { const p = pool[rnd(0, pool.length - 1)]; u.pets.push({ id: p.id, lvl: 0 }); lines.extras.push(`🥚 a *Mystery Egg*: it hatched into ${p.emoji} *${p.name}*!`); }
        else { u.wallet += value; lines.coins += value; lines.extras.push(`🥚 a Mystery Egg (you own every egg pet, so it paid ${m(value)})`); }
      }
    }
    def(['crates', 'mycrates'], { usage: ['crates'] }, c => {
      const u = db.user(c.sender), st = Object.entries(u.crates || {}).sort((a, b) => b[0] - a[0]), droppers = PT.crateDroppers(u);
      const prod = droppers.map(e => { const a = e.pet.ab.find(x => x.type === 'cratedrop'); return `${e.pet.emoji} ${e.pet.name}: ${nameOf(a.avg)} crate every ${Math.max(1, Math.round(a.mins / PT.mult(e.lvl) * 10) / 10)} min`; });
      c.reply(`📦 *YOUR CRATES*\n\n${st.length ? st.map(([v, n]) => `${nameOf(+v)} crate ×${n} _(about ${m(+v)})_`).join('\n') : 'No crates yet.'}\n\n${prod.length ? '*Producing:*\n' + prod.join('\n') : `Pets with a 📦 ability make crates for you. See ${P}pet list.`}\n\n➜ ${P}opencrate [amount|all]  (up to ${OPEN_AT_ONCE} at once)`);
    });
    def(['opencrate', 'crateopen'], { usage: ['opencrate', 'opencrate all'] }, c => {
      const u = db.user(c.sender); if (!total(u)) return c.reply(`📦 You have no crates. Pets with a 📦 ability produce them (${P}pet list).`);
      const a = (c.args[0] || '1').toLowerCase(), want = a === 'all' ? OPEN_AT_ONCE : Math.max(1, Math.min(OPEN_AT_ONCE, parseInt(a, 10) || 1));
      const lines = { coins: 0, double: 0, extras: [] }; let opened = 0;
      while (opened < want) { const k = Object.keys(u.crates).filter(x => u.crates[x] > 0).sort((x, y) => y - x)[0]; if (!k) break; u.crates[k]--; if (!u.crates[k]) delete u.crates[k]; openOne(u, +k, lines); opened++; }
      db.save();
      c.reply(`📦 *OPENED ${opened} CRATE${opened === 1 ? '' : 'S'}*\n_${flavor[rnd(0, flavor.length - 1)]}_\n\n💰 Cash: *+${m(lines.coins)}*${lines.double ? `\n🎁 ${lines.double} crate${lines.double === 1 ? '' : 's'} opened TWICE` : ''}${lines.extras.length ? '\n\n✨ *Extras:*\n' + lines.extras.map(x => '• ' + x).join('\n') : ''}\n\n${L.wal(u)}${total(u) ? `\n📦 ${total(u)} left` : ''}`);
    });
  },
};
