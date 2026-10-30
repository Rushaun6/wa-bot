// wallet, bank, daily, work, beg, rob, pay, leaderboard, picklock  (shop / inventory / profile live in cmd-shop.js, loans in cmd-loan.js)
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, wal, result, rnd, left, parseAmt, bet } = L;
    const PT = L.pets, IT = L.items;
    const pick = a => a[rnd(0, a.length - 1)];
    const PAY_MIN = Number(process.env.PAY_MIN || 45000); // the person you pay must already have this much
    const boosted = (u, type, amt) => Math.floor(amt * PT.boost(u, type) * L.abOf(u, 'cash')); // pet abilities (+%) and the admin-abuse 2x cash event

    const JOBS = ['delivered pizzas 🍕', 'fixed a bug 🐛', 'walked dogs 🐕', 'washed cars 🚗', 'mowed lawns 🌱', 'sold lemonade 🍋', 'painted a fence 🎨', 'cleaned a pool 🏊', 'DJ\'d a birthday party 🎧', 'delivered groceries 🛍️'];

    def(['wallet', 'w'], {}, async c => {
      const t = c.target(); const n = t ? t.n : c.sender; const u = db.user(n);
      c.reply(`👛 *WALLET*${t ? ' of @' + n : ''}\n\n💰 Cash: *${m(u.wallet)}*\n🏦 Bank: *${m(u.bank)}*\n📊 Net worth: *${m(u.wallet + u.bank)}*${u.loan ? `\n📕 Debt: *-${m(u.loan.owed)}* (${left(Math.max(0, u.loan.due - Date.now()))} left)` : ''}\n🔥 Streak: ${u.streak} day(s)\n🔒 Padlock: ${Date.now() < u.padlock ? left(u.padlock - Date.now()) + ' left' : 'none'}`, t ? [t.jid] : []);
    });

    def('daily', {}, c => {
      const u = db.user(c.sender), now = Date.now(), DAY = 86400000;
      if (now - u.lastDaily < DAY) return c.reply(`🎁 *DAILY REWARD*\n\n⏳ Already claimed. Come back in *${left(DAY - (now - u.lastDaily))}*.`);
      u.streak = u.lastDaily && now - u.lastDaily < 2 * DAY ? u.streak + 1 : 1;
      const base = 200 + Math.min(u.streak - 1, 14) * 50, reward = boosted(u, 'daily', base);
      u.wallet += reward; u.lastDaily = now; db.save();
      L.animate(c, ['🎁 *DAILY REWARD*\n\n🎁 Opening your reward…'], `🎁 *DAILY REWARD*\n\n✅ Claimed *+${m(reward)}*${reward > base ? ` _(pet bonus +${m(reward - base)})_` : ''}\n🔥 Streak: *${u.streak}* day(s) (max bonus at day 15)\n${wal(u)}`);
    });

    def('work', {}, c => {
      const u = db.user(c.sender), now = Date.now(), CD = 30 * 60000;
      if (now - u.lastWork < CD) return c.reply(`💼 *WORK*\n\n⏳ You're tired. Work again in *${left(CD - (now - u.lastWork))}*.`);
      const base = rnd(40, 120), pay = boosted(u, 'work', base); u.wallet += pay; u.lastWork = now; db.save();
      L.animate(c, ['💼 *WORK*\n\n⏳ Working hard…'], `💼 *WORK*\n\nYou ${pick(JOBS)}\n✅ Earned *+${m(pay)}*${pay > base ? ` _(pet bonus +${m(pay - base)})_` : ''}\n${wal(u)}`);
    });

    def('bank', {}, c => {
      const u = db.user(c.sender);
      c.reply(`🏦 *BANK*\n\n┏━ 💰 Cash: *${m(u.wallet)}*\n│ 🏦 Bank: *${m(u.bank)}*\n┗━ 📊 Net worth: *${m(u.wallet + u.bank)}*\n\n🔒 Banked money can't be robbed.\n➜ ${P}deposit <amt|all>\n➜ ${P}withdraw <amt|all>`);
    });

    const bankMove = (toBank) => c => {
      const u = db.user(c.sender), a = (c.args[0] || '').toLowerCase(), from = toBank ? u.wallet : u.bank;
      const amt = a === 'all' ? from : parseAmt(a);
      if (!amt || amt < 1) return c.reply(`⚠️ Usage: ${P}${c.cmd} <amount|all>`);
      if (amt > from) return c.reply(`⚠️ You only have *${m(from)}* in your ${toBank ? 'wallet' : 'bank'}.`);
      if (toBank) { u.wallet -= amt; u.bank += amt; } else { u.bank -= amt; u.wallet += amt; }
      db.save();
      c.reply(`🏦 *${toBank ? 'DEPOSIT' : 'WITHDRAW'}*\n\n✅ ${toBank ? 'Deposited' : 'Withdrew'} *${m(amt)}*\n\n┏━ 💰 Wallet: *${m(u.wallet)}*\n┗━ 🏦 Bank: *${m(u.bank)}*${toBank ? '\n\n🔒 Safe from robbers now.' : ''}`);
    };
    def(['deposit', 'dep'], { usage: 'deposit <amt|all>' }, bankMove(true));
    def(['withdraw', 'with'], { usage: 'withdraw <amt|all>' }, bankMove(false));

    // ---------- beg: lots of replies, and some of them react to what you own ----------
    const GIVERS = ['a kind stranger 🧓', 'a tourist 🧳', 'a street musician 🎸', 'your neighbor 🏠', 'a rich cat lady 🐈', 'a taxi driver 🚕', 'a jogger 🏃', 'a food truck owner 🌮', 'a nervous businessman 💼', 'a group of students 🎒', 'a grandma with a big purse 👵', 'a bus driver 🚌', 'a street artist 🎨', 'a barista on break ☕'];
    const NOPE = ['Everyone walked past you 🚶', 'A pigeon stole your cup 🐦', 'Someone told you to get a job 💼', 'It started raining, nobody stopped 🌧️', 'A security guard shooed you away 👮', 'Someone dropped a button in your hat 🔘', 'A dog barked at you and ran off 🐕', 'You fell asleep and missed everyone 😴', 'A kid asked YOU for money 🧒', 'The street was empty today 🏜️', 'Someone gave you a motivational speech instead of cash 🎤', 'A seagull grabbed your sign 🪧'];
    // reasons that depend on your inventory / pets
    const itemFail = it => [`Someone spotted your ${it.emoji} *${it.name}* and yelled "you're not broke!" 😤`, `A passerby saw your ${it.emoji} *${it.name}* and walked right past 🙄`, `People whispered "isn't that the guy with the ${it.emoji} ${it.name}?" 🤨`];
    const bizFail = it => [`A man laughed: "You own a ${it.emoji} *${it.name}* and you're begging?" 😂`, `Someone told you to go run your ${it.emoji} *${it.name}* instead 💼`];
    const petWin = p => [`Everyone loved your ${p.emoji} *${p.name}* and tipped you 🥰`, `Your ${p.emoji} *${p.name}* did a cute trick and the crowd paid up 🎪`, `A kid begged their parents to pay you so they could pet your ${p.emoji} *${p.name}* 👶`];
    const petFail = p => [`Your ${p.emoji} *${p.name}* wandered off and scared the crowd away 😬`, `Your ${p.emoji} *${p.name}* ate the cash someone just gave you 😭`];

    def('beg', {}, c => {
      const u = db.user(c.sender), now = Date.now(), CD = 3 * 60000;
      if (now - u.lastBeg < CD) return c.reply(`🙏 *BEG*\n\n⏳ Try again in *${left(CD - (now - u.lastBeg))}*.`);
      u.lastBeg = now;
      const eq = PT.equipped(u).map(e => e.pet), owned = IT.owned(u).map(o => o.item);
      const showy = owned.filter(i => i.cat === 'luxury'), biz = owned.filter(i => i.cat === 'business');
      const frames = ['🙏 *BEG*\n\n🙏 Holding out your hat…'];
      if (rnd(1, 100) <= Math.min(95, Math.round(65 + (L.abOf(u, 'luck') - 1) * 15))) { // luck event makes begging luckier
        const base = rnd(20, 100), g = boosted(u, 'beg', base); u.wallet += g; db.save();
        const why = eq.length && rnd(1, 100) <= 45 ? pick(petWin(pick(eq))) : `${pick(GIVERS)} gave you`;
        return L.animate(c, frames, `🙏 *BEG*\n\n${why}\n✅ *+${m(g)}*${g > base ? ` _(pet bonus +${m(g - base)})_` : ''}\n${wal(u)}`);
      }
      db.save();
      let why = pick(NOPE);
      const r = rnd(1, 100);
      if (showy.length && r <= 35) why = pick(itemFail(pick(showy)));
      else if (biz.length && r <= 55) why = pick(bizFail(pick(biz)));
      else if (eq.length && r <= 70) why = pick(petFail(pick(eq)));
      L.animate(c, frames, `🙏 *BEG*\n\n${why}\n❌ You got nothing.\n${wal(u)}`);
    });

    // ---------- rob ----------
    const combine = (a, b) => Math.round((1 - (1 - a / 100) * (1 - b / 100)) * 100); // two block chances stacked
    def('rob', { g: true, usage: 'rob @user' }, c => {
      const t = c.target(); if (!t) return c.reply(`Usage: ${P}rob @user (or reply to them)`);
      if (t.n === c.sender) return c.reply("🤦 You can't rob yourself.");
      const me = db.user(c.sender), v = db.user(t.n), now = Date.now(), op = now < me.oprob; // op = admin "OP rob" is active
      const frenzy = L.abOf(me, 'frenzy', 0) > 0; // rob frenzy event: no cooldown, +25% success
      if (!frenzy && now < me.robCd) return c.reply(`🥷 *ROB*\n\n⏳ Lay low for *${left(me.robCd - now)}*.`);
      if (me.wallet < 100) return c.reply(`🥷 *ROB*\n\n⚠️ You need at least ${m(100)} to try.`);
      if (v.wallet < 200) return c.reply('🥷 *ROB*\n\nThey are too broke to be worth it.');
      me.robCd = frenzy ? 0 : now + 10 * 60000;
      if (!op && now < v.padlock) { db.save(); return c.reply(`🥷 *ROB*\n\n🔒 @${t.n} has a padlock. Robbery failed.`, [t.jid]); }
      const frames = ['🥷 *ROB*\n\n🥷 Sneaking up on them…', '🥷 *ROB*\n\n👀 Reaching for the wallet…'];
      const fail = why => { const f = Math.floor(Math.min(Math.max(0, me.wallet), rnd(100, 300)) * (1 - PT.ab(me, 'fine') / 100)); me.wallet -= f; db.save(); L.animate(c, frames, `🥷 *ROB*\n\n${why}\nFine: *-${m(f)}*\n${wal(me)}`, [t.jid]); };
      const guard = op ? 0 : combine(PT.guardChance(v), IT.blockChance(v));
      if (rnd(1, 100) <= guard) return fail(`🛡️ @${t.n}'s defenses stopped you!`);
      const chance = op ? 100 : Math.min(frenzy ? 95 : 85, 40 + PT.robBoost(me) + IT.robBonus(me) + (frenzy ? 25 : 0));
      if (rnd(1, 100) > chance) return fail('🚔 Caught!');
      let s = Math.floor(v.wallet * rnd(10, 25) / 100 * (1 + PT.ab(me, 'robloot') / 100)); s = Math.min(s, v.wallet); if (op) s = Math.min(3500, s);
      s = Math.max(1, s); v.wallet -= s; me.wallet += s; db.save();
      L.animate(c, frames, `🥷 *ROB*\n\n✅ You robbed @${t.n} for *+${m(s)}*\n${wal(me)}`, [t.jid]);
    });

    def(['pay', 'donate'], { g: true, usage: 'pay @user <amt>' }, c => {
      const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}pay @user <amount>`);
      // anti-alt nerf: you can only send money to someone who already has PAY_MIN (wallet + bank)
      const to = db.user(t.n);
      if (to.wallet + to.bank < PAY_MIN) return c.reply(`🚫 *PAY BLOCKED*\n\n@${t.n} needs at least *${m(PAY_MIN)}* (wallet + bank) before they can receive money.`, [t.jid]);
      const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
      const me = db.user(c.sender); me.wallet -= amt; to.wallet += amt; db.save();
      c.reply(`💸 *TRANSFER*\n\nSent *${m(amt)}* to @${t.n}\n${wal(me)}`, [t.jid]);
    });

    def(['lb', 'leaderboard', 'top'], {}, c => {
      const top = Object.entries(db.data.users).sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0))).slice(0, 10);
      c.reply('🏆 *LEADERBOARD*\n\n' + (top.map(([n, u], i) => `${['🥇', '🥈', '🥉'][i] || '*' + (i + 1) + '.*'} ${u.name || '…' + n.slice(-4)} — *${m(u.wallet + (u.bank || 0))}*`).join('\n') || 'Nobody yet.') + '\n\n💸 The top 3 earn passive income every 3 minutes.');
    });

    // picklock: uses up a Picklock from your inventory. 50% chance to break their padlock.
    def(['picklock', 'pl'], { g: true, usage: 'picklock @user' }, c => {
      const t = c.target(); if (!t) return c.reply(`⚠️ Tag someone or reply to their message.\nExample: ${P}pl @user`);
      if (t.n === c.sender) return c.reply("🤨 You can't picklock yourself.");
      const me = db.user(c.sender), v = db.user(t.n);
      if (!IT.count(me, 'picklock')) return c.reply(`🔓 You don't have a *Picklock*.\nBuy one for *${m(IT.BY_ID.picklock.price)}*: ${P}buy picklock`);
      if (!(Date.now() < v.padlock)) return c.reply(`🔓 @${t.n} doesn't have a padlock.`, [t.jid]);
      if (L.cooldown(c, 'picklock', 30000)) return;
      IT.take(me, 'picklock'); // used up whether it works or not
      const left1 = IT.count(me, 'picklock');
      if (rnd(1, 100) <= Math.min(95, 50 + PT.ab(me, 'lockpick'))) {
        v.padlock = 0; db.save();
        return L.animate(c, ['🔓 *PICKLOCK*\n\n🔧 Working the lock…'], `🔓 *PICKLOCK SUCCESS*\n\nYou broke @${t.n}'s padlock! They're open to robbery now.\n🎒 Picklocks left: *${left1}*`, [t.jid]);
      }
      db.save();
      L.animate(c, ['🔓 *PICKLOCK*\n\n🔧 Working the lock…'], `🔒 *PICKLOCK FAILED*\n\nThe lock on @${t.n} held strong and your picklock snapped.\n🎒 Picklocks left: *${left1}*`, [t.jid]);
    });
  },
};
