// 🧭 PET EXPEDITIONS (.exp) and 🧬 PET FUSION (.fuse)
// Expeditions: send an owned pet away for 1/3/6/12 hours. While it is away its income and abilities pause. When it is back, .exp collect:
//   most trips pay well, some find a lot (crates, potions), a few go wrong (the pet is only tired or hurt for a while, it is NEVER lost).
// Fusion: combine two pets into a hybrid with both pets' perks (and sometimes a mutation). The hybrid is stored in db.data.events.fusions.
module.exports = {
  category: '🧭 ADVENTURE',
  register(def, L) {
    const { P, db, m, rnd, left } = L, PT = L.pets;
    L.ECON?.add('🧭 ADVENTURE');
    PT.setFusedSource(() => db.data.events.fusions || {});
    const dm = (n, text) => { const sock = L.state.sock; if (sock) sock.sendMessage(n + '@s.whatsapp.net', { text }).catch(() => {}); };
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ownedPet = (u, q) => PT.findOwned(u, q) || (PT.find(q) && PT.owned(u, PT.find(q).id) ? PT.find(q) : null);
    const pick = a => a[rnd(0, a.length - 1)];

    // ================= expeditions =================
    const TRIPS = { 1: 1, 3: 3.3, 6: 7, 12: 15 }; // hours -> loot multiplier (longer trips pay a bit better per hour)
    const BASE = { common: 4700, rare: 11000, epic: 29000, legendary: 90000, mythic: 300000, divine: 1100000, celestial: 4000000, cosmic: 5400000 }; // about 1.8x what the pet would earn in an hour
    const MAX_AWAY = 3;
    const PLACES = [['🌋', 'the Magma Caverns'], ['🏝️', 'Treasure Isle'], ['🕳️', 'the Echo Pit'], ['🌌', 'the Asteroid Market'], ['🏙️', 'Neon District 9'], ['🧊', 'the Frozen Vault'], ['🌴', 'the Jungle of Whispers'], ['🏜️', 'the Mirage Dunes'], ['🛸', 'a crashed mothership'], ['🏰', 'the Haunted Keep'], ['🌊', 'the Sunken Arcade'], ['🍄', 'the Mushroom Kingdom'], ['⛰️', 'Skyfall Peak'], ['🌙', 'the Moon Bazaar'], ['🎡', 'an abandoned carnival'], ['🚂', 'the Midnight Express']];
    const STORY = {
      normal: [(p, w) => `${p} wandered ${w}, haggled with a goblin and came home with a full sack.`, (p, w) => `${p} followed a treasure map to ${w}. The map was upside down, but it worked out.`, (p, w) => `${p} explored ${w} and sold "souvenirs" to anyone who would listen.`, (p, w) => `${p} did a few odd jobs around ${w} and got paid in actual money for once.`],
      great: [(p, w) => `${p} found a hidden room in ${w} full of shiny things!`, (p, w) => `${p} outsmarted a dragon in ${w} (by being very polite) and was handsomely rewarded.`, (p, w) => `${p} stumbled into a secret auction at ${w} and sold something that was definitely not theirs for a fortune.`],
      legend: [(p, w) => `🌟 ${p} discovered the legendary vault beneath ${w}. The guardian just waved them through.`, (p, w) => `🌟 ${p} won a card game against the ghost king of ${w}. Everything on the table is yours.`, (p, w) => `🌟 ${p} caught a meteor in ${w}, cracked it open, and it was full of coins!`],
      mishap: [(p, w) => `${p} got lost in ${w} and had to pay a troll toll to come home. Tired but fine.`, (p, w) => `${p} fell into a puddle that turned out to be a portal in ${w}. Came back damp and grumpy.`, (p, w) => `${p} chased a shiny thing in ${w} that turned out to be a trap. Escaped with a few coins.`],
      disaster: [(p, w) => `💥 ${p} woke up a very grumpy monster in ${w}. It escaped with nothing but a limp, and needs a long rest.`, (p, w) => `💥 ${p} lost everything in a card game with a ghost in ${w}, then got chased out. Rest up!`],
    };
    const jobText = { normal: '✅ *SUCCESS*', great: '🎉 *GREAT HAUL*', legend: '🌟 *LEGENDARY FIND*', mishap: '😵 *ROUGH TRIP*', disaster: '💥 *DISASTER*' };
    function roll(e) { const r = Math.random() * 100, dis = 4, mis = 10, great = 14 + e / 10, leg = 4 + e / 25; return r < dis ? 'disaster' : r < dis + mis ? 'mishap' : r < dis + mis + great ? 'great' : r < dis + mis + great + leg ? 'legend' : 'normal'; }
    const OUT = { disaster: [0, 0], mishap: [0.3, 0.5], normal: [0.85, 1.25], great: [1.7, 2.4], legend: [3, 5] };

    function collect(n, u) {
      const now = Date.now(), done = (u.exp || []).filter(x => x.end <= now); if (!done.length) return null;
      const lines = []; let coins = 0;
      for (const x of done) {
        const pet = PT.BY_ID[x.pet]; if (!pet) continue; const out = roll(x.ex || 0), [lo, hi] = OUT[out];
        const reward = Math.floor((BASE[pet.tier] || 5000) * TRIPS[x.h] * PT.mult(x.lvl) * (1 + (x.ex || 0) / 100) * (lo + Math.random() * (hi - lo)) * (x.boom || 1));
        u.wallet += reward; coins += reward;
        let extra = '';
        if (out === 'great' || out === 'legend') { L.crates?.add(u, Math.round(reward * (out === 'legend' ? 0.4 : 0.3)), 1); extra += `\n   📦 +1 crate`; }
        if (out === 'legend') { if (Math.random() < 0.5) { u.lucky = { x: 5, until: now + 30 * 60000 }; extra += '\n   🍀 a Lucky Potion'; } if (Math.random() < 0.3) { u.vials = (u.vials || 0) + 1; extra += '\n   🧬 a Mutagen Vial'; } }
        const rest = out === 'disaster' ? 2 : out === 'mishap' ? 1 : 0;
        if (rest) { u.away = u.away || {}; u.away[x.pet] = now + rest * 3600000; } else if (u.away) delete u.away[x.pet];
        lines.push(`${x.place[0]} ${pet.emoji} *${pet.name}* · ${jobText[out]}\n   ${pick(STORY[out])(pet.name, x.place[1])}\n   ${reward ? '💰 +' + m(reward) : 'No loot.'}${extra}${rest ? `\n   🩹 Resting for ${rest}h (it is back in your team after that)` : ''}`);
      }
      u.exp = u.exp.filter(x => x.end > now); db.save();
      return { lines, coins };
    }

    def(['expedition', 'exp', 'adventure'], { usage: ['exp', 'exp send <pet> <1h|3h|6h|12h>', 'exp collect'] }, c => {
      const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase(), now = Date.now(); u.exp = u.exp || [];
      if (a === 'collect' || a === 'claim') {
        const r = collect(c.sender, u); if (!r) return c.reply(u.exp.length ? `⏳ Nobody is back yet. Next return in *${left(Math.min(...u.exp.map(x => x.end)) - now)}*.` : `🧭 Nobody is out. Send a pet: ${P}exp send <pet> 3h`);
        return c.reply(`🧭 *EXPEDITION RESULTS*\n\n${r.lines.join('\n\n')}\n\n💰 Total: *+${m(r.coins)}*\n${L.wal(u)}`);
      }
      if (a === 'send' || a === 'go') {
        const args = c.args.slice(1), tm = /^(1|3|6|12)h?$/i.exec(args[args.length - 1] || ''); if (!tm) return c.reply(`⚠️ How long? 1h, 3h, 6h or 12h.\nExample: ${P}exp send wolf 6h`);
        const h = +tm[1], pet = ownedPet(u, args.slice(0, -1).join(' ')); if (!pet) return c.reply(`⚠️ You don't own a pet called that. See ${P}ownedpet`);
        if (PT.isAway(u, pet.id)) return c.reply(`⏳ ${pet.emoji} *${pet.name}* is away or resting right now.`);
        if (u.exp.length >= MAX_AWAY) return c.reply(`🧭 You already have ${MAX_AWAY} pets out. Collect first: ${P}exp collect`);
        const o = PT.owned(u, pet.id), swift = Math.min(60, PT.ab(u, 'swift') + (PT.equipped(u).some(e => e.pet.id === pet.id) ? 0 : pet.ab.filter(x => x.type === 'swift').reduce((s, x) => s + (x.base || 0) * PT.mult(o.lvl), 0))), boom = L.abOf(u, 'expo', 1);
        const ex = Math.min(150, PT.ab(u, 'explorer') + (PT.equipped(u).some(e => e.pet.id === pet.id) ? 0 : pet.ab.filter(x => x.type === 'explorer').reduce((s, x) => s + (x.base || 0) * PT.mult(o.lvl), 0)));
        const ms = Math.round(h * 3600000 * (1 - swift / 100) / boom), place = pick(PLACES);
        u.exp.push({ pet: pet.id, start: now, end: now + ms, h, place, ex, lvl: o.lvl || 0, boom, noti: false }); u.away = u.away || {}; u.away[pet.id] = now + ms; db.save();
        return c.reply(`🧭 *EXPEDITION STARTED*\n\n${pet.emoji} *${pet.name}* is heading to ${place[0]} *${place[1]}*\n⏱️ Back in *${left(ms)}*${swift ? ` (${Math.round(swift)}% faster)` : ''}${boom > 1 ? ' 🎉 Expedition Boom!' : ''}\n🧭 Explorer bonus: +${Math.round(ex)}%\n\n_While it is away its income and perks pause. ${P}exp collect when it is back._`);
      }
      const out = u.exp.map(x => { const pet = PT.BY_ID[x.pet]; return `${x.place[0]} ${pet?.emoji} *${pet?.name}* → ${x.place[1]}\n   ${x.end <= now ? '✅ *back!*' : '⏳ ' + left(x.end - now)}`; });
      c.reply(`🧭 *PET EXPEDITIONS*\n\n${out.length ? out.join('\n\n') : '_Nobody is out right now._'}\n\n➜ ${P}exp send <pet> <1h|3h|6h|12h>\n➜ ${P}exp collect\n\nLonger trips pay better. Things can go wrong, but your pet is never lost. 🧭 explorer pets find more, ⏩ swift pets are faster.`);
    });
    // tell people when their pet is back
    setInterval(() => { try { const now = Date.now(); for (const [n, u] of Object.entries(db.data.users)) for (const x of u.exp || []) if (!x.noti && x.end <= now) { x.noti = true; const pet = PT.BY_ID[x.pet]; if (pet) dm(n, `🧭 ${pet.emoji} *${pet.name}* is back from ${x.place[1]}!\nSend *${P}exp collect* to see what it found.`); db.save(); } } catch (e) { console.error('expedition tick failed:', e?.message || e); } }, 60000).unref();

    // ================= fusion =================
    const clean = s => String(s).replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const blend = (a, b) => { const A = clean(a).split(' ')[0], B = clean(b).split(' ').pop(); return (A.slice(0, Math.ceil(A.length / 2)) + B.slice(Math.floor(B.length / 2))).replace(/^./, ch => ch.toUpperCase()); };
    function mergeAbs(a, b) {
      const out = {};
      for (const ab of [...a, ...b]) {
        const k = ab.type; if (k === 'bankmult') continue;
        if (!out[k]) { out[k] = { ...ab }; continue; }
        const o = out[k];
        if (k === 'cratedrop') { o.mins = Math.min(o.mins, ab.mins); o.avg = Math.round(o.avg + ab.avg * 0.6); }
        else if (k === 'heistall') { o.min = Math.max(o.min, ab.min); o.max = Math.max(o.max, ab.max); }
        else if (k !== 'pigeon') { const hi = Math.max(o.base || 0, ab.base || 0), lo = Math.min(o.base || 0, ab.base || 0); o.base = Math.round((hi + 0.6 * lo) * 10) / 10; if (ab.cap || o.cap) o.cap = Math.max(o.cap || 0, ab.cap || 0); }
      }
      return Object.values(out);
    }
    const MUT = ['tier', 'gene', 'surge'];
    function mutate(def) {
      const kind = pick(MUT);
      if (kind === 'tier' && PT.tierIdx(def) < PT.ORDER.length - 1) { def.tier = PT.ORDER[PT.tierIdx(def) + 1]; def.income = Math.round(def.income * 1.5); def.price = Math.round(def.price * 2); return '⬆️ *TIER UP!* It evolved into a higher tier'; }
      if (kind === 'surge' || kind === 'tier') { def.income = Math.round(def.income * 1.2); for (const a of def.ab) if (a.base) a.base = Math.round(a.base * 1.3 * 10) / 10; return '💪 *POWER SURGE!* Every perk got 30% stronger'; }
      const gi = PT.tierIdx(def), scale = 1 + gi * 0.5, G = [{ type: 'luck', base: Math.round(rnd(3, 6) * scale) }, { type: 'incmult', base: Math.round(rnd(10, 25) * scale) }, { type: 'payday', base: Math.round(rnd(6, 12) * scale) }, { type: 'explorer', base: Math.round(rnd(15, 30) * scale) }, { type: 'slayer', base: Math.round(rnd(15, 35) * scale) }, { type: 'broker', base: Math.round(rnd(8, 14) * scale) }];
      const g = pick(G); const ex = def.ab.find(a => a.type === g.type); if (ex) ex.base = (ex.base || 0) + g.base; else def.ab.push(g);
      return '🎲 *WILD GENE!* It grew a brand-new perk';
    }
    const MAX_FUSED = 5, COST_PCT = 0.4;
    def(['fuse', 'fusion'], { usage: ['fuse <pet> + <pet>', 'fuse <pet> + <pet> confirm', 'fuse <pet> + <pet> confirm vial'] }, c => {
      const u = db.user(c.sender), text = c.args.join(' '), confirm = /\bconfirm\b/i.test(text), vial = /\bvial\b/i.test(text);
      const body = text.replace(/\bconfirm\b|\bvial\b/gi, '').trim();
      const parts = body.includes('+') ? body.split('+').map(s => s.trim()) : body.split(/\s+/).slice(0, 2);
      const help = `🧬 *PET FUSION*\n\nCombine two of your pets into ONE hybrid with both pets' perks. Sometimes it mutates!\n\n➜ ${P}fuse wolf + elephant\n➜ ${P}fuse guard dog + owl confirm\n\nThe two pets are used up. Cost: ${Math.round(COST_PCT * 100)}% of their combined price. Max ${MAX_FUSED} hybrids. Hybrids can't be fused again. 🧬 mutagen pets and Mutagen Vials raise the mutation chance.`;
      if (parts.length < 2 || !parts[0] || !parts[1]) return c.reply(help);
      const A = ownedPet(u, parts[0]), B = ownedPet(u, parts[1]);
      if (!A || !B) return c.reply(`⚠️ You need to own both pets (${!A ? `"${parts[0]}"` : `"${parts[1]}"`} not found). See ${P}ownedpet`);
      if (A.id === B.id) return c.reply('⚠️ Pick two different pets.');
      for (const p of [A, B]) { if (p.noUpgrade || p.ab.some(a => a.type === 'bankmult')) return c.reply(`⚠️ ${p.emoji} *${p.name}* is too special to fuse.`); if (p.id.startsWith('fx_')) return c.reply(`⚠️ ${p.emoji} *${p.name}* is already a hybrid.`); if (PT.isAway(u, p.id)) return c.reply(`⏳ ${p.emoji} *${p.name}* is away or resting.`); }
      if (Object.keys(db.data.events.fusions || {}).filter(id => PT.owned(u, id)).length >= MAX_FUSED) return c.reply(`⚠️ You already own ${MAX_FUSED} hybrids.`);
      const cost = Math.round((A.price + B.price) * COST_PCT), chance = Math.min(90, 12 + PT.ab(u, 'mutagen') + (vial && u.vials > 0 ? 25 : 0));
      const tier = PT.tierIdx(A) >= PT.tierIdx(B) ? A.tier : B.tier;
      if (!confirm) return c.reply(`🧬 *FUSION PREVIEW*\n\n${A.emoji} *${A.name}*  +  ${B.emoji} *${B.name}*\n→ ${PT.TIERS[tier].icon} *${blend(A.name, B.name)}* ${A.emoji}${B.emoji}\n\n💸 Cost: *${m(cost)}*\n🎲 Mutation chance: *${chance}%*${vial && u.vials > 0 ? ' (Vial used)' : ''}\n⚠️ Both pets are used up.\n\nTo do it: *${P}fuse ${parts[0]} + ${parts[1]} confirm${vial ? ' vial' : ''}*`);
      if (u.wallet < cost) return c.reply(`⚠️ You need *${m(cost)}* in your wallet (you have ${m(u.wallet)}).`);
      u.wallet -= cost; if (vial && u.vials > 0) u.vials--;
      const hybrid = { id: 'fx_' + Date.now().toString(36) + rnd(100, 999), name: blend(A.name, B.name), emoji: A.emoji + B.emoji, tier, price: Math.round((A.price + B.price) * 0.7), noUpgrade: false, fused: true,
        income: Math.round(Math.max(A.income, B.income) * 1.1 + Math.min(A.income, B.income) * 0.35), ab: mergeAbs(A.ab, B.ab), parents: [A.id, B.id] };
      const mutated = Math.random() * 100 < chance, note = mutated ? mutate(hybrid) : '';
      (db.data.events.fusions ||= {})[hybrid.id] = hybrid;
      const wasEq = u.equipped.some(id => id === A.id || id === B.id);
      u.pets = u.pets.filter(o => o.id !== A.id && o.id !== B.id); u.equipped = u.equipped.filter(id => id !== A.id && id !== B.id);
      u.pets.push({ id: hybrid.id, lvl: 0 }); if (wasEq && u.equipped.length < PT.slots(u)) u.equipped.push(hybrid.id);
      db.save();
      c.reply(`🧬 *FUSION COMPLETE!*\n\n${A.emoji} + ${B.emoji}  →  ${PT.TIERS[hybrid.tier].icon} ${hybrid.emoji} *${hybrid.name}*\n${mutated ? `\n${note}\n` : ''}\n   ${PT.describe(hybrid, 0)}\n\n${wasEq ? '✅ It joined your team.' : `➜ ${P}equip ${hybrid.name}`}\n${L.wal(u)}`);
    });
  },
};
