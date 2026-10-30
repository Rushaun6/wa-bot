// NEGATRON SHOP: shop, buy, inventory, use, open (crates), sell, profile + passive income (businesses & top-3 leaderboard)
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, wal, rnd, left, num } = L;
    const PT = L.pets, IT = L.items;
    const pick = a => a[rnd(0, a.length - 1)];
    const bizIncome = u => Math.floor(IT.income(u) * (1 + PT.ab(u, 'bizboost') / 100)); // businesses + pet bonus
    const plain = n => '$' + Math.floor(n).toLocaleString('en-US');
    const saleOf = u => L.abOf(u, 'sale', 0); // admin-abuse sale event (% off)
    const lockTag = (it, u) => it.rebirth && !(u && IT.unlocked(it, u)) ? `  🔒 ${it.rebirth} rebirths` : '';

    // ---------------- shop ----------------
    const CAT_ALIAS = { robbery: 'robbery', rob: 'robbery', protection: 'protect', protect: 'protect', business: 'business', biz: 'business', luxury: 'luxury', collectibles: 'luxury', special: 'special', crates: 'crate', crate: 'crate' };
    const shopText = (u, only) => {
      const cats = IT.CATS.filter(c => !only || c.id === only);
      const body = cats.map(c => `${c.title}\n` + IT.ITEMS.filter(i => i.cat === c.id).map(i => `• ${i.emoji} ${i.name} — ${saleOf(u) ? plain(Math.floor(i.price * (1 - saleOf(u) / 100))) + ' 🏷️ -' + saleOf(u) + '%' : plain(i.price)}${lockTag(i, u)}`).join('\n')).join('\n\n');
      return `╭━━━『 🛒 NEGATRON SHOP 』━━━╮\n\n${body}\n\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n🛒 ${P}buy <item> [amount]\n📖 ${P}shop info <item> • ${P}shop <robbery|protection|business|luxury|crates>\n🎒 ${P}inv • 📱 ${P}profile — wallet, bank, net worth, luxury items, collectibles & businesses`;
    };
    const itemInfo = (it, u) => `${it.emoji} *${it.name.toUpperCase()}*\n\n💰 Price: *${m(it.price)}*\n📂 ${IT.CATS.find(c => c.id === it.cat).title}\n${it.desc ? '📝 ' + it.desc + '\n' : ''}${it.rebirth ? `🔒 Needs *${it.rebirth}* rebirths ${IT.unlocked(it, u) ? '(unlocked ✅)' : `(you have ${u.rebirths || 0})`}\n` : ''}${it.stack ? '📦 You can own many' : '👤 You can own one'}\n🛒 ${P}buy ${it.id}`;

    def('shop', { usage: ['shop', 'shop info <item>'] }, c => {
      const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase();
      if (a === 'info') { const it = IT.find(c.args.slice(1).join(' ')); return c.reply(it ? itemInfo(it, u) : `⚠️ Unknown item. See ${P}shop`); }
      c.reply(shopText(u, CAT_ALIAS[a]));
    });

    // buy basic gloves   |   buy padlock 3   |   buy gold crate x2
    const qtyAndName = args => {
      let qty = 1, a = [...args];
      const last = a[a.length - 1] || '';
      if (a.length > 1 && /^x?\d+$/i.test(last)) { qty = parseInt(last.replace(/\D/g, ''), 10); a.pop(); }
      return { qty: Math.max(1, Math.min(qty, 100)), it: IT.find(a.join(' ')) };
    };
    def('buy', { usage: 'buy <item> [amount]' }, c => {
      const { qty, it } = qtyAndName(c.args);
      if (!it) return c.reply(`⚠️ Unknown item. See ${P}shop\nExample: ${P}buy padlock`);
      const u = db.user(c.sender);
      if (!IT.unlocked(it, u)) return c.reply(`🔒 *${it.name}* unlocks at *${it.rebirth}* rebirths (you have ${u.rebirths || 0}).\nSee ${P}rebirth`);
      if (!it.stack && qty > 1) return c.reply(`⚠️ You can only own one ${it.emoji} *${it.name}*.`);
      if (!it.stack && IT.count(u, it.id)) return c.reply(`✅ You already own ${it.emoji} *${it.name}*.`);
      const haggle = PT.ab(u, 'haggle'), sale = saleOf(u), unit = Math.floor(it.price * (1 - haggle / 100) * (1 - sale / 100)), cost = unit * qty;
      if (u.wallet < cost) return c.reply(`⚠️ ${qty > 1 ? qty + '× ' : ''}${it.emoji} *${it.name}* costs *${m(cost)}* (you have ${m(u.wallet)}).`);
      u.wallet -= cost; IT.add(u, it.id, qty); db.save();
      const tail = it.id === 'padlock' ? `\n👉 Put it on with *${P}use padlock*` : it.id === 'picklock' ? `\n👉 Use it with *${P}pl @user*` : it.crate ? `\n👉 Open it with *${P}open ${it.id}*` : it.income ? `\n💸 Earning *${m(it.income)}* every 3 min` : '';
      L.animate(c, [`🛒 *PURCHASE*\n\n🛒 Paying for ${it.emoji}…`], `🛒 *PURCHASE*\n\n✅ Bought ${qty > 1 ? qty + '× ' : ''}${it.emoji} *${it.name}* — *-${m(cost)}*${haggle ? ` _(🏷️ pet haggle -${haggle}%)_` : ''}${sale ? ` _(🏷️ SALE -${sale}%)_` : ''}${tail}\n${wal(u)}`);
    });

    // ---------------- inventory ----------------
    def(['inventory', 'inv', 'bag'], { usage: 'inventory [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, u = db.user(n), list = IT.owned(u);
      const head = `🎒 *${t ? 'INVENTORY OF @' + n : 'YOUR INVENTORY'}*`;
      if (!list.length) return c.reply(`${head}\n\nEmpty. Check the ${P}shop!`, t ? [t.jid] : []);
      const sec = IT.CATS.map(cat => {
        const rows = list.filter(o => o.item.cat === cat.id); if (!rows.length) return '';
        return `*${cat.title}*\n` + rows.map(({ item, n }) => `• ${item.emoji} ${item.name}${item.stack ? ' ×' + n : ''}${item.income ? ` — 💸 ${plain(item.income)}/3min` : ''}${item.rob ? ` — +${item.rob}% rob` : ''}${item.block ? ` — ${item.block}% block` : ''}`).join('\n');
      }).filter(Boolean).join('\n\n');
      c.reply(`${head}\n\n${sec}\n\n🔒 Padlock active: ${Date.now() < u.padlock ? left(u.padlock - Date.now()) + ' left' : 'no'}\n💸 Business income: *${m(bizIncome(u))}* / 3 min${PT.ab(u, 'bizboost') ? ` _(+${PT.ab(u, 'bizboost')}% pet bonus)_` : ''}\n📦 Value: *${m(IT.value(u))}*\n\n${P}use <item> • ${P}open <crate> • ${P}sell <item> • ${P}trade @user`, t ? [t.jid] : []);
    });

    def('use', { usage: 'use <item>' }, c => {
      const it = IT.find(c.args.join(' ')); if (!it) return c.reply(`⚠️ Usage: ${P}use <item>  (see ${P}inv)`);
      const u = db.user(c.sender);
      if (!IT.count(u, it.id)) return c.reply(`🎒 You don't have ${it.emoji} *${it.name}*. Buy it: ${P}buy ${it.id}`);
      if (it.crate) return openCrates(c, it, 1);
      if (it.id === 'padlock') {
        if (Date.now() < u.padlock) return c.reply(`🔒 You already have a padlock on (${left(u.padlock - Date.now())} left).`);
        const lk = PT.ab(u, 'longlock'), hrs = Math.round(12 * (1 + lk / 100) * 10) / 10;
        IT.take(u, 'padlock'); u.padlock = Date.now() + hrs * 3600000; db.save();
        return c.reply(`🔒 *PADLOCK ON*\n\nRobbers are blocked for *${hrs}h*${lk ? ` _(⏳ pet bonus +${lk}%)_` : ''}.\n🎒 Padlocks left: *${IT.count(u, 'padlock')}*`);
      }
      if (it.id === 'picklock') return c.reply(`🔓 Use a picklock on someone: *${P}pl @user*`);
      c.reply(`${it.emoji} *${it.name}* works automatically while it's in your inventory.\n${it.desc || ''}`);
    });

    def('sell', { usage: 'sell <item> [amount]' }, c => {
      const { qty, it } = qtyAndName(c.args); if (!it) return c.reply(`⚠️ Usage: ${P}sell <item> [amount]`);
      const u = db.user(c.sender), have = IT.count(u, it.id);
      if (!have) return c.reply(`🎒 You don't have ${it.emoji} *${it.name}*.`);
      const rate = 0.5 + PT.ab(u, 'sellprice') / 100, k = Math.min(qty, have), gain = Math.floor(it.price * rate) * k;
      IT.take(u, it.id, k); u.wallet += gain; db.save();
      c.reply(`💱 *SOLD*\n\n${k}× ${it.emoji} *${it.name}* for *+${m(gain)}* _(${Math.round(rate * 100)}% of the price)_\n${wal(u)}`);
    });

    // ---------------- crates & mystery box ----------------
    const rollLoot = (u, crate) => {
      const L0 = IT.LOOT[crate.id], price = crate.price, luck = L.abOf(u, 'luck'); // luck event: items & pets drop more often
      const w = [L0.w[0], L0.w[1] * luck, L0.w[2] * luck], tot = w[0] + w[1] + w[2];
      let r = rnd(1, Math.round(tot * 100)) / 100, kind = r <= w[0] ? 'cash' : r <= w[0] + w[1] ? 'item' : 'pet';
      const cash = () => { const x = L0.cash[0] + (L0.cash[1] - L0.cash[0]) * rnd(0, 1000) / 1000; return { kind: 'cash', amt: Math.floor(price * x) }; };
      if (kind === 'item') {
        const pool = IT.ITEMS.filter(i => !i.crate && i.price <= L0.itemMax && i.price >= price * 0.2 && IT.unlocked(i, u) && (i.stack || !IT.count(u, i.id)));
        if (!pool.length) return cash();
        const it = pick(pool); return { kind: 'item', it };
      }
      if (kind === 'pet') {
        const cap = PT.ORDER.indexOf(L0.petTier), tiers = PT.ORDER.slice(0, cap + 1);
        let x = rnd(0, 10000) / 100 * tiers.reduce((s, t) => s + PT.TIERS[t].odds, 0) / 100, tier = tiers[0];
        for (const t of tiers) { if (x < PT.TIERS[t].odds) { tier = t; break; } x -= PT.TIERS[t].odds; }
        const pet = pick(PT.PETS.filter(p => p.tier === tier && !p.noUpgrade));
        if (PT.owned(u, pet.id)) return { kind: 'cash', amt: Math.floor(pet.price * 0.5), dupe: pet };
        return { kind: 'pet', pet };
      }
      return cash();
    };
    const applyLoot = (u, l) => {
      if (l.kind === 'cash') { const bonus = PT.ab(u, 'crate'); if (bonus && !l.dupe) l.amt = Math.floor(l.amt * (1 + bonus / 100)); u.wallet += l.amt; return `💵 *+${m(l.amt)}*${l.dupe ? ` _(you already had ${l.dupe.emoji} ${l.dupe.name}, paid out as cash)_` : ''}`; }
      if (l.kind === 'item') { IT.add(u, l.it.id, 1); return `${l.it.emoji} *${l.it.name}* _(${m(l.it.price)} value)_`; }
      u.pets.push({ id: l.pet.id, lvl: 0 }); const eq = u.equipped.length < PT.slots(u) && !u.equipped.includes(l.pet.id); if (eq) u.equipped.push(l.pet.id);
      return `${l.pet.emoji} *${l.pet.name}* — ${PT.TIERS[l.pet.tier].icon} ${PT.TIERS[l.pet.tier].label} pet!${eq ? ' ✅ equipped' : ' 📦 in storage'}`;
    };
    function openCrates(c, it, qty) {
      const u = db.user(c.sender), have = IT.count(u, it.id), k = Math.min(qty, have, 10);
      IT.take(u, it.id, k);
      const lines = []; const dbl = PT.ab(u, 'dblcrate');
      for (let i = 0; i < k; i++) {
        lines.push(applyLoot(u, rollLoot(u, it)));
        if (dbl && rnd(1, 100) <= dbl) lines.push('🎁 *DOUBLE!* ' + applyLoot(u, rollLoot(u, it)));
      }
      db.save();
      const T = `${it.emoji} *${it.name.toUpperCase()}*`;
      L.animate(c, [`${T}\n\n🔐 Cracking it open…`, `${T}\n\n✨ Something is shining inside…`], `${T}\n\n🎉 *YOU GOT:*\n${lines.map(x => '➜ ' + x).join('\n')}\n\n🎒 ${it.name}s left: *${IT.count(u, it.id)}*\n${wal(u)}`);
    }
    def('open', { usage: 'open <crate|mystery> [amount]' }, c => {
      const { qty, it } = qtyAndName(c.args);
      if (!it || !it.crate) return c.reply(`⚠️ Usage: ${P}open <crate>\nCrates: bronze, silver, gold, diamond, shadow, negatron, mystery`);
      const u = db.user(c.sender);
      if (!IT.count(u, it.id)) return c.reply(`🎒 You don't have a ${it.emoji} *${it.name}*. Buy one: ${P}buy ${it.id}`);
      openCrates(c, it, qty);
    });

    // ---------------- profile ----------------
    def(['profile', 'prof'], { usage: 'profile [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, u = db.user(n), list = IT.owned(u);
      const names = cat => list.filter(o => o.item.cat === cat).map(o => `${o.item.emoji} ${o.item.name}${o.n > 1 ? ' ×' + o.n : ''}`).join(', ') || '_none_';
      const luxury = list.filter(o => o.item.cat === 'luxury');
      const rank = Object.entries(db.data.users).sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0))).findIndex(([k]) => k === n) + 1;
      const eq = PT.equipped(u).map(e => e.pet.emoji).join(' ') || '—';
      c.reply(`📱 *PROFILE${t ? ' of @' + n : ''}*\n${u.name ? '👤 ' + u.name + '\n' : ''}\n┏━ 💰 Wallet: *${m(u.wallet)}*\n│ 🏦 Bank: *${m(u.bank)}*\n│ 📊 Net worth: *${m(u.wallet + u.bank)}*${u.loan ? `\n│ 📕 Debt: *-${m(u.loan.owed)}*` : ''}\n│ 📦 Assets: *${m(IT.value(u))}*\n│ 🏆 Rank: *#${rank}*  🔁 Rebirths: *${u.rebirths || 0}*\n┗━ 🐾 Pets: ${u.pets.length} (equipped: ${eq})\n\n💎 *Luxury items & collectibles*\n${names('luxury')}\n\n💼 *Businesses* (💸 ${m(bizIncome(u))} / 3 min)\n${names('business')}\n\n🥷 *Gear*: ${names('robbery')}\n🛡️ *Protection*: ${names('protect')}`, t ? [t.jid] : []);
    });

    // ---------------- passive income every 3 minutes ----------------
    const PASSIVE = [[0.0005, 1000, 500000], [0.0003, 600, 250000], [0.0002, 300, 100000]]; // [% of net worth, minimum, cap] for #1, #2, #3
    const tick = () => {
      let any = false;
      // interest = +X% of the bank per hour, paid in 20 slices (one per 3 min)
      for (const u of Object.values(db.data.users)) { const cash = L.abOf(u, 'cash'), inc = Math.floor(bizIncome(u) * cash); if (inc > 0) { u.wallet += inc; any = true; }
        const rate = PT.ab(u, 'interest'); if (rate > 0 && u.bank > 0) { u.bank += Math.floor(u.bank * rate / 100 / 20 * cash); any = true; } }
      const top = Object.values(db.data.users).filter(u => u.played && u.wallet + (u.bank || 0) > 0).sort((a, b) => (b.wallet + (b.bank || 0)) - (a.wallet + (a.bank || 0))).slice(0, 3);
      top.forEach((u, i) => { const [pct, min, cap] = PASSIVE[i]; u.wallet += Math.floor(Math.min(cap, Math.max(min, Math.floor((u.wallet + (u.bank || 0)) * pct))) * L.abOf(u, 'cash')); any = true; });
      if (any) db.save();
    };
    setInterval(tick, 3 * 60000).unref();
    L.shopTick = tick;
  },
};
