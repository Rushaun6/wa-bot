// pets: shop, buy, level up, equip, rebirth, robpet, pet income + pigeon heists, admin spawn
module.exports = {
  category: '🐾 PETS',
  register(def, L) {
    const { P, db, m, rnd, left, num, wal, sleep } = L;
    const PT = L.pets;
    const ROBPET_FEE = 500000, ROBPET_CHANCE = 5;
    const tierLine = p => `${PT.TIERS[p.tier].icon} ${PT.TIERS[p.tier].label}`;
    const autoEquip = (u, id) => { if (u.equipped.length < PT.slots(u) && !u.equipped.includes(id)) { u.equipped.push(id); return true; } return false; };
    const nameArg = c => c.args.filter(a => !a.startsWith('@'));
    const lookup = (c, from = 0) => PT.find(nameArg(c).slice(from).join(' '));

    // admin-abuse "shop" event: the player sees a special stock for a while
    const stockFor = u => (u && u.abShop && Date.now() < u.abShop.until) ? { stock: u.abShop.ids.map(id => PT.BY_ID[id]).filter(Boolean), restockIn: u.abShop.until - Date.now(), abuse: true } : PT.shop();
    const salePct = u => L.abOf(u, 'sale', 0);
    const priceOf = (u, pet) => Math.floor(pet.price * (1 - salePct(u) / 100));
    const shopText = u => {
      const { stock, restockIn, abuse } = stockFor(u);
      return { stock, text: `🐾 *PET SHOP* (${stock.length} pets)${abuse ? ' ⚡ *ADMIN ABUSE*' : ''}\n⏳ ${abuse ? 'Special stock ends' : 'Restocks'} in *${left(restockIn)}*${abuse ? '' : '  _(every 2 hours)_'}${salePct(u) ? `\n🏷️ *SALE -${salePct(u)}%*` : ''}\n\n` + stock.map((p, i) => `*${i + 1}.* ${p.emoji} *${p.name}*  ${tierLine(p)}\n   💰 *${m(priceOf(u, p))}*${salePct(u) ? ' 🏷️' : ''}\n   ${PT.describe(p)}`).join('\n\n') + `\n\nBuy: ${P}pet buy <name>\n🔔 Get pinged when a good pet shows up: ${P}noti` };
    };
    const showShop = c => c.reply(shopText(db.user(c.sender)).text);
    const info = async (c, pet, u) => {
      const o = u && PT.owned(u, pet.id);
      if (pet.noUpgrade) return c.reply(`${pet.emoji} *${pet.name.toUpperCase()}*\n\n${tierLine(pet)}\n💰 Price: *${m(pet.price)}*\n\n${PT.describe(pet, 0)}\n⭐ No levels — it's already maxed.${o ? '\n\n✅ You own this pet' : ''}`);
      return c.reply(`${pet.emoji} *${pet.name.toUpperCase()}*\n\n${tierLine(pet)}\n💰 Price: *${m(pet.price)}*\n\n*Level 0:*   ${PT.describe(pet, 0)}\n*Level 1 (1.2x):* ${PT.describe(pet, 1).replace(/\n\s+/g, ' • ')}\n*Level 2 (1.5x):* ${PT.describe(pet, 2).replace(/\n\s+/g, ' • ')}\n*Level 3 (2x):* ${PT.describe(pet, 3).replace(/\n\s+/g, ' • ')}${o ? `\n\n✅ You own this pet (Lv ${o.lvl})` : ''}`);
    };

    def('pet', { usage: ['pet list', 'pet shop', 'pet buy <name>', 'pet lvl <name>', 'pet info <name>'] }, async c => {
      const sub = (c.args[0] || '').toLowerCase(); c.args = c.args.slice(1);
      const u = db.user(c.sender);
      if (sub === 'shop') return showShop(c);
      if (sub === 'list' || sub === 'all') {
        const want = (c.args[0] || '').toLowerCase();
        if (!PT.ORDER.includes(want)) {
          const rows = PT.ORDER.map(t => `${PT.TIERS[t].icon} *${PT.TIERS[t].label.toUpperCase()}* — ${m(PT.TIERS[t].price)}\n` + PT.PETS.filter(p => p.tier === t).map(p => p.emoji).join(' ')).join('\n\n');
          return c.reply(`🐾 *ALL PETS* (${PT.PETS.length})\n\n${rows}\n\n⭐ Levels: Lv1 = 1.2x • Lv2 = 1.5x • Lv3 = 2x\n📖 Details: ${P}pet list <${PT.ORDER.join('|')}>\n🔎 One pet: ${P}pet info <name>`);
        }
        const body = `${PT.TIERS[want].icon} *${PT.TIERS[want].label.toUpperCase()}* — ${m(PT.TIERS[want].price)}\n` + PT.PETS.filter(p => p.tier === want).map(p => `${p.emoji} *${p.name}* — ${PT.describe(p).replace(/\n\s+/g, ' • ')}`).join('\n');
        return c.reply(`🐾 *${PT.TIERS[want].label.toUpperCase()} PETS* (${PT.PETS.filter(p => p.tier === want).length})\n\n${body}\n\n📖 ${P}pet list <${PT.ORDER.join('|')}>`);
      }
      if (sub === 'info') { const pet = lookup(c); return pet ? info(c, pet, u) : c.reply(`⚠️ Unknown pet. Usage: ${P}pet info <name>`); }
      if (sub === 'buy') {
        const pet = lookup(c); if (!pet) return c.reply(`⚠️ Usage: ${P}pet buy <name>  (see ${P}pet shop)`);
        if (!stockFor(u).stock.includes(pet)) return c.reply(`🐾 *${pet.name}* isn't in the shop right now. Check ${P}pet shop`);
        if (PT.owned(u, pet.id)) return c.reply(`🐾 You already own a ${pet.emoji} *${pet.name}*.`);
        const price = priceOf(u, pet);
        if (u.wallet < price) return c.reply(`🐾 You need *${m(price)}* (you have ${m(u.wallet)}).`);
        u.wallet -= price; u.pets.push({ id: pet.id, lvl: 0 }); const eq = autoEquip(u, pet.id); db.save();
        await L.animate(c, [`🐾 *PET SHOP*\n\n🛒 Paying for ${pet.emoji}…`], `🐾 *NEW PET!*\n\n${pet.emoji} *${pet.name}* — ${tierLine(pet)}\n${PT.describe(pet)}\n\n${eq ? '✅ Equipped automatically' : `📦 Slots full — use ${P}equip ${pet.name.toLowerCase()}`}\n${wal(u)}`);
      }
      if (sub === 'lvl' || sub === 'level' || sub === 'upgrade') {
        const pet = lookup(c); if (!pet) return c.reply(`⚠️ Usage: ${P}pet lvl <name>`);
        const o = PT.owned(u, pet.id); if (!o) return c.reply(`🐾 You don't own a ${pet.name}.`);
        if (pet.noUpgrade) return c.reply(`🐾 ${pet.emoji} *${pet.name}* is already perfect — it has no levels.`);
        if (o.lvl >= 3) return c.reply(`🐾 ${pet.emoji} *${pet.name}* is already max level (3).`);
        const cost = PT.upgradeCost(pet, o.lvl);
        if (u.wallet < cost) return c.reply(`🐾 Upgrading to Lv ${o.lvl + 1} costs *${m(cost)}* (you have ${m(u.wallet)}).`);
        u.wallet -= cost; o.lvl++; db.save();
        return L.animate(c, [`🆙 *LEVEL UP*\n\n⏫ Upgrading ${pet.emoji}…`], `🆙 *LEVEL UP!*\n\n${pet.emoji} *${pet.name}* is now *Lv ${o.lvl}* (${PT.LVL_MULT[o.lvl]}x)\n${PT.describe(pet, o.lvl)}\n\n💸 Paid *${m(cost)}*${o.lvl < 3 ? `\n⏭️ Next level: ${m(PT.upgradeCost(pet, o.lvl))}` : '\n⭐ Max level reached!'}\n${wal(u)}`);
      }
      return c.reply(`🐾 *PETS*\n\n➜ ${P}pet list\n➜ ${P}pet shop\n➜ ${P}pet buy <name>\n➜ ${P}pet lvl <name>\n➜ ${P}pet info <name>\n➜ ${P}ownedpet • ${P}equip <name> • ${P}equipbest\n➜ ${P}rebirth • ${P}robpet @user\n➜ ${P}noti — shop alerts`);
    });
    def('petshop', { usage: [] }, c => showShop(c));

    def(['ownedpet', 'ownedpets', 'pets', 'mypets'], { usage: 'ownedpet [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, u = db.user(n);
      if (!u.pets.length) return c.reply(`🐾 *${t ? 'THEIR' : 'YOUR'} PETS*\n\nNo pets yet. Check the ${P}pet shop!`, t ? [t.jid] : []);
      const line = o => { const p = PT.BY_ID[o.id]; return `${p.emoji} *${p.name}* — ${PT.TIERS[p.tier].icon} ${PT.TIERS[p.tier].label} • Lv ${o.lvl}/3\n     ${PT.describe(p, o.lvl).replace(/\n\s+/g, ' • ')}`; };
      const bp = PT.bankPets(u)[0], bankLine = bp ? `\n🏦 ${bp.pet.emoji} ${bp.pet.name} payout in *${left(Math.max(0, (u.cr7At || Date.now()) + bp.pet.ab.find(a => a.type === 'bankmult').hours * 3600000 - Date.now()))}*` : '';
      const eq = u.pets.filter(o => u.equipped.includes(o.id)), rest = u.pets.filter(o => !u.equipped.includes(o.id));
      c.reply(`🐾 *${t ? 'PETS OF @' + n : 'YOUR PETS'}*\n\n┏━ 🔁 Rebirths: *${u.rebirths}/${PT.MAX_REBIRTH}*\n│ 🎒 Equipped: *${eq.length}/${PT.slots(u)}* slots\n┗━ 💸 Income: *${m(PT.income(u))}* / ${PT.INCOME_MIN} min (auto-paid)${bankLine}\n\n*✅ Equipped*\n${eq.map(line).join('\n') || '_none_'}${rest.length ? `\n\n*📦 In storage*\n${rest.map(line).join('\n')}` : ''}`, t ? [t.jid] : []);
    });
    def('equip', { usage: 'equip <name>' }, c => {
      const pet = lookup(c); if (!pet) return c.reply(`⚠️ Usage: ${P}equip <pet name>  (see ${P}ownedpet)`);
      const u = db.user(c.sender);
      if (!PT.owned(u, pet.id)) return c.reply(`🐾 You don't own a ${pet.name}.`);
      if (u.equipped.includes(pet.id)) return c.reply(`🐾 ${pet.emoji} *${pet.name}* is already equipped.`);
      if (u.equipped.length >= PT.slots(u)) return c.reply(`🐾 Your *${PT.slots(u)}* slots are full.\nUse ${P}unequip <name> first, or ${P}rebirth for more slots.`);
      u.equipped.push(pet.id); db.save();
      c.reply(`✅ *EQUIPPED*\n\n${pet.emoji} *${pet.name}* is now working for you\n🎒 Slots: *${u.equipped.length}/${PT.slots(u)}*`);
    });
    def('unequip', { usage: 'unequip <name>' }, c => {
      const pet = lookup(c); const u = db.user(c.sender);
      if (!pet || !u.equipped.includes(pet.id)) return c.reply(`⚠️ Usage: ${P}unequip <equipped pet name>`);
      u.equipped = u.equipped.filter(id => id !== pet.id); db.save();
      c.reply(`📦 ${pet.emoji} *${pet.name}* moved to storage.\n🎒 Slots: *${u.equipped.length}/${PT.slots(u)}*`);
    });
    def('equipbest', { usage: 'equipbest' }, c => {
      const u = db.user(c.sender);
      if (!u.pets.length) return c.reply(`🐾 You have no pets yet. Check ${P}pet shop`);
      const best = [...u.pets].sort((a, b) => PT.tierIdx(PT.BY_ID[b.id]) - PT.tierIdx(PT.BY_ID[a.id]) || b.lvl - a.lvl || PT.BY_ID[b.id].income - PT.BY_ID[a.id].income).slice(0, PT.slots(u));
      u.equipped = best.map(o => o.id); db.save();
      c.reply(`⭐ *EQUIP BEST*\n\n` + best.map(o => `✅ ${PT.BY_ID[o.id].emoji} *${PT.BY_ID[o.id].name}* — ${PT.TIERS[PT.BY_ID[o.id].tier].label} Lv ${o.lvl}`).join('\n') + `\n\n💸 Income: *${m(PT.income(u))}* / ${PT.INCOME_MIN} min`);
    });

    def('rebirth', { usage: 'rebirth' }, c => {
      const u = db.user(c.sender), n = u.rebirths;
      if (n >= PT.MAX_REBIRTH) return c.reply(`🔁 *REBIRTH*\n\n⭐ You reached the max of *${PT.MAX_REBIRTH}* rebirths!`);
      const cost = PT.rebirthCost(n), net = u.wallet + u.bank;
      if ((c.args[0] || '').toLowerCase() !== 'confirm')
        return c.reply(`🔁 *REBIRTH ${n + 1}/${PT.MAX_REBIRTH}*\n\n💰 Cost: *${m(cost)}* (you have ${m(net)} in wallet + bank)\n\n✅ You get: *+1 pet slot* (${PT.slots(u)} → ${PT.slots(u) + 1})\n⚠️ Your wallet and bank reset to ${m(500)}\n🐾 You keep all your pets\n\nTo do it: *${P}rebirth confirm*`);
      if (net < cost) return c.reply(`🔁 *REBIRTH*\n\n⚠️ You need *${m(cost)}* in wallet + bank (you have ${m(net)}).`);
      u.wallet = 500; u.bank = 0; u.rebirths++; db.save();
      L.animate(c, ['🔁 *REBIRTH*\n\n🌀 The old you fades away…', '🔁 *REBIRTH*\n\n✨ A new life begins…'], `🔁 *REBIRTH COMPLETE!*\n\n🔁 Rebirths: *${u.rebirths}/${PT.MAX_REBIRTH}*\n🎒 Pet slots: *${PT.slots(u)}*\n${wal(u)}\n\n${u.rebirths < PT.MAX_REBIRTH ? `Next rebirth costs *${m(PT.rebirthCost(u.rebirths))}*` : '⭐ Max rebirth reached!'}`);
    });

    def('robpet', { g: true, usage: 'robpet @user' }, c => {
      const t = c.target(); if (!t) return c.reply(`🐾 *ROB PET*\n\n⚠️ Usage: ${P}robpet @user\n💰 Costs ${m(ROBPET_FEE)} every try • ${ROBPET_CHANCE}% chance`);
      if (t.n === c.sender) return c.reply("🤦 You can't rob yourself.");
      const me = db.user(c.sender), v = db.user(t.n);
      const loot = v.pets.filter(o => !PT.owned(me, o.id));
      if (!loot.length) return c.reply(`🐾 *ROB PET*\n\n@${t.n} has no pets you could steal.`, [t.jid]);
      if (me.wallet < ROBPET_FEE) return c.reply(`🐾 *ROB PET*\n\n⚠️ You need *${m(ROBPET_FEE)}* in your wallet to try.`);
      if (L.cooldown(c, 'robpet', 30 * 60000)) return;
      me.wallet -= ROBPET_FEE;
      let final;
      if (rnd(1, 100) <= ROBPET_CHANCE) {
        const o = loot[rnd(0, loot.length - 1)], pet = PT.BY_ID[o.id];
        v.pets = v.pets.filter(x => x.id !== o.id); v.equipped = v.equipped.filter(id => id !== o.id);
        me.pets.push({ id: o.id, lvl: o.lvl }); autoEquip(me, o.id);
        final = `🐾 *ROB PET*\n\n🎉 *SUCCESS!* You stole ${pet.emoji} *${pet.name}* (Lv ${o.lvl}) from @${t.n}!\n💸 Fee paid: *${m(ROBPET_FEE)}*\n${wal(me)}`;
      } else final = `🐾 *ROB PET*\n\n🚔 You got caught!\n💸 Fee paid: *${m(ROBPET_FEE)}*\n${wal(me)}`;
      db.save();
      L.animate(c, [`🐾 *ROB PET*\n\n🥷 Sneaking into the pet house…`, `🐾 *ROB PET*\n\n👀 Grabbing a pet…`], final, [t.jid]);
    });

    // ---- admins (owner / bot admins)
    def('spawnpet', { ba: true, usage: 'spawnpet @user <pet>' }, async c => {
      const t = c.target(); const pet = lookup(c);
      if (!t || !pet) return c.reply(`🐾 *SPAWN PET*\n\n⚠️ Usage: ${P}spawnpet @user <pet name>`);
      const u = db.user(t.n);
      if (PT.owned(u, pet.id)) return c.reply(`🐾 @${t.n} already owns a ${pet.emoji} *${pet.name}*.`, [t.jid]);
      u.pets.push({ id: pet.id, lvl: 0 }); const eq = autoEquip(u, pet.id); db.save();
      await c.reply(`✨ *PET SPAWNED*\n\n${pet.emoji} *${pet.name}* (${tierLine(pet)}) → @${t.n}${eq ? '\n✅ Auto-equipped' : '\n📦 Placed in storage (slots full)'}`, [t.jid]);
    });
    def('giverebirth', { ba: true, usage: 'giverebirth @user [amount]' }, c => {
      const t = c.target(); if (!t) return c.reply(`🔁 *GIVE REBIRTH*\n\n⚠️ Usage: ${P}giverebirth @user [amount]`);
      const k = Math.max(1, parseInt(nameArg(c).pop(), 10) || 1), u = db.user(t.n), before = u.rebirths;
      u.rebirths = Math.min(PT.MAX_REBIRTH, u.rebirths + k); db.save();
      c.reply(`🔁 *REBIRTH GIVEN*\n\n@${t.n}: *${before} → ${u.rebirths}* rebirths\n🎒 Pet slots: *${PT.slots(u)}*${u.rebirths === PT.MAX_REBIRTH ? '\n⭐ Max reached' : ''}`, [t.jid]);
    });

    // ---- .noti: get a DM when the pet shop restocks with a pet you care about
    const NOTI_OPTS = ['all', ...PT.ORDER.slice(1)];
    def('noti', { usage: ['noti', 'noti all', 'noti <rare|epic|legendary|mythic|divine|celestial|cosmic>', 'noti off'] }, c => {
      const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase();
      if (!a) {
        const now = u.noti && u.noti !== 'off' ? (u.noti === 'all' ? '*every restock*' : `${PT.TIERS[u.noti].icon} *${PT.TIERS[u.noti].label}* or better`) : '*off*';
        return c.reply(`🔔 *SHOP ALERTS*\n\nStatus: ${now}\nThe pet shop restocks every 2 hours.\n\n➜ ${P}noti all — every restock\n${PT.ORDER.slice(1).map(t => `➜ ${P}noti ${t} — ${PT.TIERS[t].label}+ only`).join('\n')}\n➜ ${P}noti off`);
      }
      if (a === 'off' || a === 'stop') { u.noti = 'off'; db.save(); return c.reply('🔕 Shop alerts turned *off*.'); }
      if (!NOTI_OPTS.includes(a)) return c.reply(`⚠️ Pick one of: ${NOTI_OPTS.join(', ')}, off`);
      u.noti = a; db.save();
      c.reply(`🔔 *ALERTS ON*\n\nI'll message you ${a === 'all' ? 'on *every* restock' : `when a ${PT.TIERS[a].icon} *${PT.TIERS[a].label}* (or better) pet is in the shop`}.\n💡 Tip: send me a DM first so I can reach you.`);
    });
    const stockLine = p => `${PT.TIERS[p.tier].icon} ${p.emoji} *${p.name}* — ${m(p.price)}`;
    const notifyRestock = async () => {
      const sock = L.state.sock; if (!sock) return;
      const { stock } = PT.shop();
      for (const [n, u] of Object.entries(db.data.users)) {
        if (!u.noti || u.noti === 'off') continue;
        const min = u.noti === 'all' ? -1 : PT.ORDER.indexOf(u.noti);
        const hits = stock.filter(p => PT.tierIdx(p) >= min); if (!hits.length) continue;
        const text = `🔔 *PET SHOP RESTOCKED*\n\n` + (u.noti === 'all' ? stock.map(stockLine).join('\n') : `Spotted: \n` + hits.map(stockLine).join('\n') + `\n\n_Full shop: ${P}pet shop_`) + `\n\n🛒 ${P}pet buy <name>\n🔕 ${P}noti off`;
        const jid = n + '@s.whatsapp.net';
        try { await sock.sendMessage(jid, { text }); }
        catch (e) { if (u.lastGroup) await sock.sendMessage(u.lastGroup, { text, mentions: [jid] }).catch(() => {}); }
        await sleep(1500);
      }
    };
    let lastSlot = PT.slotId();
    setInterval(() => { const s = PT.slotId(); if (s === lastSlot) return; lastSlot = s; notifyRestock().catch(e => console.error('restock notify failed:', e?.message || e)); }, 20000).unref();

    // ---- CR7: multiplies the bank every 70 hours while equipped
    const cr7Tick = async () => {
      const sock = L.state.sock, now = Date.now();
      for (const [n, u] of Object.entries(db.data.users)) {
        const bp = PT.bankPets(u)[0]; if (!bp) { if (u.cr7At) u.cr7At = 0; continue; } // timer restarts if you unequip it
        const ab = bp.pet.ab.find(a => a.type === 'bankmult'), every = ab.hours * 3600000;
        if (!u.cr7At) { u.cr7At = now; db.save(); continue; }
        if (now - u.cr7At < every) continue;
        const before = u.bank, hit = L.rnd(1, 100) <= (ab.chance || 100); // only a 7% chance each time
        if (hit) u.bank = Math.floor(u.bank * ab.mult); u.cr7At = now; db.save();
        const jid = n + '@s.whatsapp.net';
        const text = !hit ? `🐐 *CR7* tried to multiply @${n}'s bank but missed the shot (${ab.chance}% chance)... 😔\n🏦 Bank stays at ${m(u.bank)}\n⏳ Next try in ${ab.hours}h` : before > 0 ? `🐐 *CR7 SIUUUU!* 🐐\n\n@${n}'s bank just got *${ab.mult}x*!\n🏦 ${m(before)} → *${m(u.bank)}*\n⏳ Next payout in ${ab.hours}h` : `🐐 *CR7* was ready to multiply @${n}'s bank, but it's empty! Deposit some money (${P}deposit all).\n⏳ Next try in ${ab.hours}h`;
        if (sock) await sock.sendMessage(u.lastGroup || jid, { text, mentions: [jid] }).catch(() => sock.sendMessage(jid, { text }).catch(() => {}));
      }
    };
    setInterval(() => cr7Tick().catch(e => console.error('cr7 tick failed:', e?.message || e)), 5 * 60000).unref();

    // ---- background: pets pay income every 3 min, pigeons steal every 5 min
    const incomeTick = () => {
      let paid = 0;
      for (const u of Object.values(db.data.users)) { if (!u.equipped?.length) continue; const inc = Math.floor(PT.income(u) * L.abOf(u, 'cash')); if (inc > 0) { u.wallet += inc; paid++; } }
      if (paid) db.save();
    };
    const pigeonTick = async () => {
      const sock = L.state.sock; if (!sock) return;
      const thieves = Object.entries(db.data.users).filter(([, u]) => PT.pigeons(u).length);
      if (!thieves.length) return;
      let all; try { all = Object.values(await sock.groupFetchAllParticipating()); } catch (e) { console.error('pigeon: could not list groups:', e?.message || e); return; }
      const now = Date.now();
      // only groups where the economy is on; map each member's number -> participant once
      const groups = all.filter(g => db.data.groups[g.id]?.economy !== false)
        .map(meta => ({ meta, byNum: new Map(meta.participants.map(p => [L.resolveNum(meta, p.id), p])) }));
      for (const [n, u] of thieves) {
        const pg = PT.pigeons(u), options = [];
        for (const { meta, byNum } of groups) {
          const me = byNum.get(n); if (!me) continue; // the pigeon's owner must be in this group
          const pool = [];
          for (const [vn, p] of byNum) { const v = db.data.users[vn]; if (vn !== n && v && v.played && v.wallet >= 1000 && !(v.padlock > now)) pool.push({ v, p }); }
          if (pool.length) options.push({ meta, me, pool });
        }
        if (!options.length) continue;
        const { meta, me, pool } = options[rnd(0, options.length - 1)];
        const { v, p } = pool[rnd(0, pool.length - 1)], tag = x => '@' + x.id.split('@')[0];
        const k = pg.reduce((s, e) => s + PT.mult(e.lvl), 0);
        let text;
        if (rnd(1, 100) <= PT.guardChance(v)) text = `🐦 *PIGEON HEIST*\n\n🛡️ ${tag(p)}'s guard pet chased ${tag(me)}'s pigeon away!`;
        else {
          const amt = Math.min(Math.floor(v.wallet * rnd(2, 5) * k / 100), Math.floor(2000 * k));
          if (amt < 1) continue;
          v.wallet -= amt; u.wallet += amt; db.save();
          text = `🐦 *PIGEON HEIST*\n\n${tag(me)}'s pigeon swooped in and stole *${m(amt)}* from ${tag(p)}!`;
        }
        await sock.sendMessage(meta.id, { text, mentions: [me.id, p.id] }).catch(() => {});
        await sleep(1500);
      }
    };
    setInterval(incomeTick, PT.INCOME_MIN * 60000).unref();
    setInterval(() => pigeonTick().catch(e => console.error('pigeon tick failed:', e?.message || e)), 5 * 60000).unref();
    L.petTicks = { incomeTick, pigeonTick, notifyRestock, cr7Tick };
  },
};
