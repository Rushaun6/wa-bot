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
  },
};
