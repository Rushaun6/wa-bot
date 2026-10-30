// .ab <item> — admin abuse: owner / bot admins drop free stuff on every player in the group, animated.
// To add a new item later, add one entry to ITEMS below (it returns the animation frames + the final message).
module.exports = {
  category: '💥 ADMIN ABUSE',
  register(def, L) {
    const { P, m, db, parseAmt, left } = L;
    const MAX_MONEY = Number(process.env.AB_MAX) || 50000; // per person, protects against typos like 5000000
    const PADLOCK_HOURS = 12, MAX_HOURS = 72;
    const COOLDOWN = 20000; // per group
    const last = new Map();

    // a "player" = someone who has actually used the bot (not just chatted in the group)
    const isPlayer = u => u.played || u.lastDaily || u.lastWork || u.lastBeg || u.streak > 0 || u.bank > 0 || u.wallet !== 500;
    const who = c => c.msg.pushName || 'Admin';
    const T = '💥 *ADMIN ABUSE* 💥';

    // ---- helpers for the timed (Roblox-style) abuses
    const minutes = (s, def, max) => { const n = s === undefined ? def : parseInt(s, 10); return n >= 1 && n <= max ? n : null; };
    const timed = (c, players, type, x, mins, icon, title, lines) => {
      const until = Date.now() + mins * 60000;
      for (const p of players) { const u = db.user(p.n); (u.ab ||= {})[type] = { x, until }; }
      db.save();
      return {
        frames: [`${T}\n\n${icon} ${icon} ${icon} ${icon} ${icon}\n\n👑 *${who(c)}* activated *${title}*…`, `${T}\n\n⚡ ${icon} ⚡ ${icon} ⚡\n\n🔥 Powering up…`],
        final: `${T}\n\n${icon} *${title}!* ${icon}\n\n┏━ 👥 Players: *${players.length}*\n│ ${lines}\n┗━ ⏳ Lasts: *${mins} min*\n\n📊 Check yours: ${P}boosts\n\n👑 Courtesy of *${who(c)}*`,
      };
    };
    const boost = (c, players, args, type, icon, title, linesFn) => {
      const maxX = c.isOwner ? 10 : 5, x = Math.round((Number(String(args[0] || '').replace(/x$/i, '')) || 2) * 100) / 100, mins = minutes(args[1], 30, c.isOwner ? 360 : 120);
      if (!(x > 1 && x <= maxX)) return { error: `⚠️ Multiplier must be above 1 and up to ${maxX}x. Example: ${P}ab ${type} 2 30` };
      if (!mins) return { error: `⚠️ Minutes must be 1-${c.isOwner ? 360 : 120}.` };
      return timed(c, players, type, x, mins, icon, `${x}x ${title}`, linesFn(x));
    };

    const ITEMS = {
      money: {
        usage: '<amt>', desc: 'free money for every player',
        run(c, players, args) {
          const amt = parseAmt(args[0]);
          if (!amt || amt < 1) return { error: `⚠️ Usage: ${P}ab money <amount>  (example: ${P}ab money 1k)` };
          if (amt > MAX_MONEY) return { error: `⚠️ Max is *${m(MAX_MONEY)}* per person.` };
          for (const p of players) db.user(p.n).wallet += amt;
          db.save();
          return {
            frames: [
              `${T}\n\n⚡ ⚡ ⚡ ⚡ ⚡\n\n👑 *${who(c)}* activated *MONEY RAIN*…`,
              `${T}\n\n💵 💰 💵 💰 💵\n💸 💵 💰 💵 💸\n\n🌧️ Making it rain…`,
              `${T}\n\n💸💸💸💸💸💸\n💰💰💰💰💰💰\n\n🧮 Counting the cash…`,
            ],
            final: `${T}\n\n🎉 *MONEY RAIN!* 🎉\n\n┏━ 👥 Players paid: *${players.length}*\n│ 💵 Each got: *${m(amt)}*\n┗━ 💰 Total: *${m(amt * players.length)}*\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      padlock: {
        usage: '[hours]', desc: 'padlock for every player',
        run(c, players, args) {
          const hours = args[0] ? parseInt(args[0], 10) : PADLOCK_HOURS;
          if (!(hours >= 1 && hours <= MAX_HOURS)) return { error: `⚠️ Hours must be 1-${MAX_HOURS}. Example: ${P}ab padlock 24` };
          const until = Date.now() + hours * 3600000;
          for (const p of players) { const u = db.user(p.n); u.padlock = Math.max(u.padlock || 0, until); }
          db.save();
          return {
            frames: [
              `${T}\n\n🔓 🔓 🔓 🔓 🔓\n\n👑 *${who(c)}* activated *PADLOCK PARTY*…`,
              `${T}\n\n🔓 🔓 🔒 🔒 🔒\n\n🔐 Locking up wallets…`,
              `${T}\n\n🔒 🔒 🔒 🔒 🔒\n\n🛡️ Securing everything…`,
            ],
            final: `${T}\n\n🔒 *PADLOCK PARTY!* 🔒\n\n┏━ 👥 Protected: *${players.length}*\n│ ⏳ Duration: *${hours}h*\n┗━ 🛡️ Nobody can rob them until it runs out\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      pet: {
        usage: '<pet name>', desc: 'give every player a specific pet',
        run(c, players, args) {
          const pet = L.pets.find(args.join(' '));
          if (!pet) return { error: `⚠️ Usage: ${P}ab pet <pet name>  (example: ${P}ab pet pigeon)\nSee all pets: ${P}pet list` };
          const targets = players.filter(p => !L.pets.owned(db.user(p.n), pet.id));
          if (!targets.length) return { error: `🐾 Every player here already owns a ${pet.emoji} *${pet.name}*.` };
          let equipped = 0;
          for (const p of targets) {
            const u = db.user(p.n); u.pets.push({ id: pet.id, lvl: 0 });
            if (u.equipped.length < L.pets.slots(u)) { u.equipped.push(pet.id); equipped++; }
          }
          db.save();
          const e = pet.emoji, tier = L.pets.TIERS[pet.tier];
          return {
            frames: [
              `${T}\n\n🎁 🎁 🎁 🎁 🎁\n\n👑 *${who(c)}* activated *PET DROP*…`,
              `${T}\n\n${e} ❓ ${e} ❓ ${e}\n❓ ${e} ❓ ${e} ❓\n\n📦 Opening the crates…`,
              `${T}\n\n${e} ${e} ${e} ${e} ${e}\n${e} ${e} ${e} ${e} ${e}\n\n✨ Pets are arriving…`,
            ],
            final: `${T}\n\n${e} *PET DROP!* ${e}\n\n${e} *${pet.name}* — ${tier.icon} ${tier.label}\n${L.pets.describe(pet)}\n\n┏━ 👥 Got one: *${targets.length}*\n│ ✅ Auto-equipped: *${equipped}*\n┗━ 🐾 Already had it: *${players.length - targets.length}*\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      oprob: {
        usage: '', desc: 'OP rob for 30 min (ignores padlocks, up to $3,500 per rob)',
        run(c, players) {
          const until = Date.now() + 30 * 60000;
          for (const p of players) db.user(p.n).oprob = until;
          db.save();
          return {
            frames: [
              `${T}\n\n🥷 🥷 🥷 🥷 🥷\n\n👑 *${who(c)}* activated *OP ROB*…`,
              `${T}\n\n⚡ 🥷 ⚡ 🥷 ⚡\n\n🔓 Cracking every padlock…`,
              `${T}\n\n💥 💥 💥 💥 💥\n\n🥷 Powering up the robbers…`,
            ],
            final: `${T}\n\n⚡ *OP ROB ACTIVE!* ⚡\n\n┏━ 👥 Players powered up: *${players.length}*\n│ ⏳ Lasts: *30 min*\n│ 🔓 Ignores padlocks & guard pets\n┗━ 💸 Up to *${m(3500)}* per rob (always works)\n\nGo use ${P}rob @user!\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      // ===================== Roblox-style abuses (timed events live on each player in the group) =====================
      shop: {
        usage: '<rare|epic|legendary|mythic|divine|celestial|cosmic> [minutes]', desc: 'fill the PET SHOP with that tier (default 30 min)',
        run(c, players, args) {
          const PT = L.pets, tier = (args[0] || '').toLowerCase(), idx = PT.ORDER.indexOf(tier);
          if (idx < 1) return { error: `⚠️ Usage: ${P}ab shop <${PT.ORDER.slice(1).join('|')}> [minutes]` };
          if (idx > 4 && !c.isOwner) return { error: '👑 Divine, Celestial and Cosmic shops are owner only.' };
          const mins = minutes(args[1], 30, c.isOwner ? 360 : 120); if (!mins) return { error: `⚠️ Minutes must be 1-${c.isOwner ? 360 : 120}.` };
          // 6 pets: the chosen tier first, then fill with the closest tiers above, then below
          const order = [idx, ...PT.ORDER.map((_, i) => i).filter(i => i > idx), ...PT.ORDER.map((_, i) => i).filter(i => i < idx).reverse()];
          const ids = [];
          for (const i of order) { const pool = PT.PETS.filter(p => PT.ORDER.indexOf(p.tier) === i && !ids.includes(p.id)).sort(() => L.rnd(0, 1) - 0.5); for (const p of pool) { if (ids.length < PT.SHOP_SIZE) ids.push(p.id); } }
          const until = Date.now() + mins * 60000;
          for (const p of players) db.user(p.n).abShop = { ids, until };
          db.save();
          const stock = ids.map(id => PT.BY_ID[id]), t = PT.TIERS[tier];
          return {
            frames: [
              `${T}\n\n🐾 🐾 🐾 🐾 🐾\n\n👑 *${who(c)}* activated *${t.label.toUpperCase()} SHOP*…`,
              `${T}\n\n${t.icon} ❓ ${t.icon} ❓ ${t.icon}\n\n🏪 Restocking the pet shop…`,
              `${T}\n\n${stock.map(p => p.emoji).join(' ')}\n\n✨ Shelves are filling up…`,
            ],
            final: `${T}\n\n${t.icon} *${t.label.toUpperCase()} PET SHOP!* ${t.icon}\n\n${stock.map(p => `${PT.TIERS[p.tier].icon} ${p.emoji} *${p.name}* — ${m(p.price)}`).join('\n')}\n\n┏━ 👥 Players: *${players.length}*\n┗━ ⏳ Lasts: *${mins} min*\n\nBuy with ${P}pet buy <name> • see ${P}pet shop\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      luck: {
        usage: '[x] [minutes]', desc: '2x luck: better crate drops & luckier begging (default 2x, 30 min)',
        run(c, players, args) { return boost(c, players, args, 'luck', '🍀', 'LUCK', x => `🍀 Crates drop items & pets *${x}x* more often\n│ 🙏 ${P}beg is luckier`); },
      },
      cash: {
        usage: '[x] [minutes]', desc: '2x cash on work/daily/beg, pet & business income (default 2x, 30 min)',
        run(c, players, args) { return boost(c, players, args, 'cash', '💰', 'CASH', x => `💵 *${x}x* on ${P}work ${P}daily ${P}beg\n│ 🐾 *${x}x* pet income • 🏢 *${x}x* business & passive income`); },
      },
      sale: {
        usage: '[percent] [minutes]', desc: 'shop sale: items & pets are cheaper (default 50%, 30 min)',
        run(c, players, args) {
          const pct = Math.round(Number(args[0]) || 50), mins = minutes(args[1], 30, c.isOwner ? 360 : 120);
          if (!(pct >= 5 && pct <= 90)) return { error: `⚠️ Percent must be 5-90. Example: ${P}ab sale 50 30` };
          if (!mins) return { error: `⚠️ Minutes must be 1-${c.isOwner ? 360 : 120}.` };
          return timed(c, players, 'sale', pct, mins, '🏷️', 'MEGA SALE', `🏷️ Everything in ${P}shop and ${P}pet shop is *-${pct}%*`);
        },
      },
      frenzy: {
        usage: '[minutes]', desc: 'ROB FRENZY: no rob cooldown and +25% success (default 15 min)',
        run(c, players, args) {
          const mins = minutes(args[0], 15, c.isOwner ? 180 : 60); if (!mins) return { error: `⚠️ Minutes must be 1-${c.isOwner ? 180 : 60}.` };
          return timed(c, players, 'frenzy', 1, mins, '🥷', 'ROB FRENZY', `🥷 No ${P}rob cooldown\n│ 🎯 +25% rob success`);
        },
      },
      jackpot: {
        usage: '[x] [minutes]', desc: 'JACKPOT HOUR: gambling & minigame wins pay extra (default 1.5x, 30 min)',
        run(c, players, args) {
          const x = Math.round((Number(String(args[0] || '').replace(/x$/i, '')) || 1.5) * 100) / 100, mins = minutes(args[1], 30, c.isOwner ? 360 : 120), max = c.isOwner ? 5 : 3;
          if (!(x > 1 && x <= max)) return { error: `⚠️ Multiplier must be above 1 and up to ${max}x. Example: ${P}ab jackpot 1.5 30` };
          if (!mins) return { error: `⚠️ Minutes must be 1-${c.isOwner ? 360 : 120}.` };
          return timed(c, players, 'jackpot', x, mins, '🎰', 'JACKPOT HOUR', `🎰 Winnings from gambling & minigames pay *${x}x*`);
        },
      },
      crate: {
        usage: '<bronze|silver|gold|diamond> [amount]', desc: 'free crates for every player',
        run(c, players, args) {
          const IT = L.items, it = IT.find((args[0] || '') + ' crate');
          const ok = ['bronze', 'silver', 'gold', 'diamond', 'shadow', 'negatron'];
          if (!it || !ok.includes(it.id)) return { error: `⚠️ Usage: ${P}ab crate <${ok.slice(0, 4).join('|')}> [amount]` };
          if (['shadow', 'negatron'].includes(it.id) && !c.isOwner) return { error: '👑 Shadow & Negatron crates are owner only.' };
          const n = Math.max(1, Math.min(parseInt(args[1], 10) || 1, 5));
          for (const p of players) IT.add(db.user(p.n), it.id, n);
          db.save();
          return {
            frames: [`${T}\n\n🎁 🎁 🎁 🎁 🎁\n\n👑 *${who(c)}* activated *CRATE DROP*…`, `${T}\n\n${it.emoji} ${it.emoji} ${it.emoji}\n\n📦 Crates falling from the sky…`],
            final: `${T}\n\n${it.emoji} *CRATE DROP!* ${it.emoji}\n\n┏━ 👥 Players: *${players.length}*\n│ 🎁 Each got: *${n}x ${it.name}*\n┗━ 📦 Open with ${P}open ${it.id}\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      petrain: {
        usage: '<common|rare|epic|legendary|mythic|divine> ', desc: 'every player gets a random pet of that tier',
        run(c, players, args) {
          const PT = L.pets, tier = (args[0] || '').toLowerCase(), idx = PT.ORDER.indexOf(tier);
          if (idx < 0 || idx > 5) return { error: `⚠️ Usage: ${P}ab petrain <${PT.ORDER.slice(0, 6).join('|')}>` };
          if (idx > 4 && !c.isOwner) return { error: '👑 Divine pet rain is owner only.' };
          let got = 0, eq = 0;
          for (const p of players) {
            const u = db.user(p.n), pool = PT.PETS.filter(x => x.tier === tier && !PT.owned(u, x.id)); if (!pool.length) continue;
            const pet = pool[L.rnd(0, pool.length - 1)]; u.pets.push({ id: pet.id, lvl: 0 }); got++;
            if (u.equipped.length < PT.slots(u)) { u.equipped.push(pet.id); eq++; }
          }
          if (!got) return { error: `🐾 Everyone here already owns every ${PT.TIERS[tier].label} pet.` };
          db.save(); const t = PT.TIERS[tier];
          return {
            frames: [`${T}\n\n🌧️ 🐾 🌧️ 🐾 🌧️\n\n👑 *${who(c)}* activated *PET RAIN*…`, `${T}\n\n${t.icon} 🐶 ${t.icon} 🐱 ${t.icon}\n\n🐾 Pets are falling…`],
            final: `${T}\n\n${t.icon} *${t.label.toUpperCase()} PET RAIN!* ${t.icon}\n\n┏━ 👥 Got a random pet: *${got}*\n│ ✅ Auto-equipped: *${eq}*\n┗━ 🐾 See yours: ${P}ownedpet\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
      forgive: {
        usage: '', desc: 'DEBT JUBILEE: wipes every loan in the group (no mafia!)',
        run(c, players) {
          let n = 0, total = 0;
          for (const p of players) { const u = db.user(p.n); if (u.loan) { total += u.loan.owed; u.loan = null; n++; } }
          if (!n) return { error: '📗 Nobody in this group owes the mafia anything.' };
          db.save();
          return {
            frames: [`${T}\n\n📕 📕 📕 📕 📕\n\n👑 *${who(c)}* activated *DEBT JUBILEE*…`, `${T}\n\n📕 📕 📗 📗 📗\n\n🇷🇺 Calling off the mafia…`],
            final: `${T}\n\n📗 *DEBT JUBILEE!* 📗\n\n┏━ 👥 Loans wiped: *${n}*\n┗━ 💸 Total forgiven: *${m(total)}*\n\n🇷🇺 The Russian mafia has gone home.\n\n👑 Courtesy of *${who(c)}*`,
          };
        },
      },
    };

    const list = () => `${T}\n\n` + Object.entries(ITEMS).map(([k, v]) => `➜ ${P}ab ${k}${v.usage ? ' ' + v.usage : ''} — ${v.desc}`).join('\n') + '\n\n_Owner & bot admins only. Hits every player in this group._';

    def('ab', { g: true, ba: true, usage: Object.entries(ITEMS).map(([k, v]) => `ab ${k}${v.usage ? ' ' + v.usage : ''}`) }, async c => {
      const item = ITEMS[(c.args[0] || '').toLowerCase()];
      if (!item) return c.reply(list());

      const wait = (last.get(c.chat) || 0) + COOLDOWN - Date.now();
      if (wait > 0 && !process.env.NO_COOLDOWN) return c.reply(`${T}\n\n⏳ Let the last drop finish. Try again in *${left(wait)}*.`);

      const myIds = [L.nj(c.sock.user.id), L.nj(c.sock.user.lid || '')];
      const players = [];
      for (const p of c.meta.participants) {
        if (L.aliases(p).some(a => myIds.includes(a))) continue;
        const n = L.resolveNum(c.meta, p.id), u = db.data.users[n];
        if (u && isPlayer(u)) players.push({ n, id: p.id });
      }
      if (!players.length) return c.reply(`${T}\n\n😕 Nobody in this group has played yet.\nMembers need to use the bot first (like ${P}daily).`);

      const out = item.run(c, players, c.args.slice(1));
      if (out.error) return c.reply(out.error);
      last.set(c.chat, Date.now());
      console.log(`[ab] ${c.sender} used "${c.args[0]}" in ${c.chat} for ${players.length} players`);
      // hidden tag: the first frame carries a mention of everyone so all members get notified
      await L.animate(c, out.frames, out.final, [], c.meta.participants.map(p => p.id));
    });

    // .boosts — what admin-abuse events are active on you right now
    def(['boosts', 'events'], { usage: 'boosts' }, c => {
      const u = db.user(c.sender), now = Date.now(), rows = [];
      const nameOf = { cash: t => `💰 ${t.x}x CASH`, luck: t => `🍀 ${t.x}x LUCK`, sale: t => `🏷️ ${t.x}% SALE`, frenzy: () => '🥷 ROB FRENZY', jackpot: t => `🎰 ${t.x}x JACKPOT` };
      for (const [k, t] of Object.entries(u.ab || {})) if (t && now < t.until && nameOf[k]) rows.push(`${nameOf[k](t)} — ${left(t.until - now)} left`);
      if (u.abShop && now < u.abShop.until) rows.push(`🐾 SPECIAL PET SHOP — ${left(u.abShop.until - now)} left`);
      if (now < (u.oprob || 0)) rows.push(`⚡ OP ROB — ${left(u.oprob - now)} left`);
      c.reply(`📊 *YOUR BOOSTS*\n\n${rows.join('\n') || 'Nothing active right now. Admins can start events with ' + P + 'ab'}`);
    });
  },
};
