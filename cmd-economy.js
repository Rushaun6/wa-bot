// wallet, bank, daily, work, beg, rob, pay, shop, leaderboard
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, BOT, OWNERS, MIN, db, m, wal, result, rnd, left, parseAmt, bet, num, partId } = L;

    const SHOP = { padlock: { price: 500, hours: 12, desc: 'Blocks robberies for 12 hours' } };

    const JOBS = ['delivered pizzas 🍕', 'fixed a bug 🐛', 'walked dogs 🐕', 'washed cars 🚗', 'mowed lawns 🌱', 'sold lemonade 🍋'];

    def(['wallet', 'w'], {}, async c => {
      const t = c.target(); const n = t ? t.n : c.sender; const u = db.user(n);
      c.reply(`👛 *WALLET*${t ? ' of @' + n : ''}\n\n💰 Cash: *${m(u.wallet)}*\n🏦 Bank: *${m(u.bank)}*\n📊 Net worth: *${m(u.wallet + u.bank)}*\n🔥 Streak: ${u.streak} day(s)\n🔒 Padlock: ${Date.now() < u.padlock ? left(u.padlock - Date.now()) + ' left' : 'none'}`, t ? [t.jid] : []);
    });

    def('daily', {}, c => {
      const u = db.user(c.sender), now = Date.now(), DAY = 86400000;
      if (now - u.lastDaily < DAY) return c.reply(`🎁 *DAILY REWARD*\n\n⏳ Already claimed. Come back in *${left(DAY - (now - u.lastDaily))}*.`);
      u.streak = u.lastDaily && now - u.lastDaily < 2 * DAY ? u.streak + 1 : 1;
      const reward = 200 + Math.min(u.streak - 1, 14) * 50;
      u.wallet += reward; u.lastDaily = now; db.save();
      c.reply(`🎁 *DAILY REWARD*\n\n✅ Claimed *+${m(reward)}*\n🔥 Streak: *${u.streak}* day(s) (max bonus at day 15)\n${wal(u)}`);
    });

    def('work', {}, c => {
      const u = db.user(c.sender), now = Date.now(), CD = 30 * 60000;
      if (now - u.lastWork < CD) return c.reply(`💼 *WORK*\n\n⏳ You're tired. Work again in *${left(CD - (now - u.lastWork))}*.`);
      const pay = rnd(40, 120); u.wallet += pay; u.lastWork = now; db.save();
      c.reply(`💼 *WORK*\n\nYou ${JOBS[rnd(0, JOBS.length - 1)]}\n✅ Earned *+${m(pay)}*\n${wal(u)}`);
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

    const GIVERS = ['a kind stranger 🧓', 'a tourist 🧳', 'a street musician 🎸', 'your neighbor 🏠', 'a rich cat lady 🐈', 'a taxi driver 🚕'];

    const NOPE = ['Everyone walked past you 🚶', 'A pigeon stole your cup 🐦', 'Someone told you to get a job 💼', 'It started raining, nobody stopped 🌧️'];

    def('beg', {}, c => {
      const u = db.user(c.sender), now = Date.now(), CD = 3 * 60000;
      if (now - u.lastBeg < CD) return c.reply(`🙏 *BEG*\n\n⏳ Try again in *${left(CD - (now - u.lastBeg))}*.`);
      u.lastBeg = now;
      if (rnd(1, 100) <= 65) { const g = rnd(20, 100); u.wallet += g; db.save(); return c.reply(`🙏 *BEG*\n\n${GIVERS[rnd(0, GIVERS.length - 1)]} gave you\n✅ *+${m(g)}*\n${wal(u)}`); }
      db.save(); c.reply(`🙏 *BEG*\n\n${NOPE[rnd(0, NOPE.length - 1)]}\n❌ You got nothing.\n${wal(u)}`);
    });

    def('shop', {}, c => c.reply('🛒 *SHOP*\n\n' + Object.entries(SHOP).map(([k, v]) => `🔒 ${k} — *${m(v.price)}*\n   ${v.desc}`).join('\n\n') + `\n\nBuy: ${P}buy padlock`));

    def('buy', { usage: 'buy padlock' }, c => {
      const item = (c.args[0] || '').toLowerCase(), s = SHOP[item];
      if (!s) return c.reply(`⚠️ Unknown item. See ${P}shop`);
      const u = db.user(c.sender);
      if (item === 'padlock' && Date.now() < u.padlock) return c.reply(`🔒 You already have a padlock (${left(u.padlock - Date.now())} left).`);
      if (u.wallet < s.price) return c.reply(`⚠️ You need *${m(s.price)}* (you have ${m(u.wallet)}).`);
      u.wallet -= s.price; u.padlock = Date.now() + s.hours * 3600000; db.save();
      c.reply(`🛒 *PURCHASE*\n\n🔒 Padlock bought — *-${m(s.price)}*\nRobbers are blocked for ${s.hours}h.\n${wal(u)}`);
    });

    def('rob', { g: true, usage: 'rob @user' }, c => {
      const t = c.target(); if (!t) return c.reply(`Usage: ${P}rob @user (or reply to them)`);
      if (t.n === c.sender) return c.reply("🤦 You can't rob yourself.");
      const me = db.user(c.sender), v = db.user(t.n), now = Date.now();
      if (now < me.robCd) return c.reply(`🥷 *ROB*\n\n⏳ Lay low for *${left(me.robCd - now)}*.`);
      if (me.wallet < 100) return c.reply(`🥷 *ROB*\n\n⚠️ You need at least ${m(100)} to try.`);
      if (v.wallet < 200) return c.reply('🥷 *ROB*\n\nThey are too broke to be worth it.');
      me.robCd = now + 10 * 60000;
      if (now < v.padlock) { db.save(); return c.reply(`🥷 *ROB*\n\n🔒 @${t.n} has a padlock. Robbery failed.`, [t.jid]); }
      if (rnd(1, 100) <= 40) {
        const s = Math.floor(v.wallet * rnd(10, 25) / 100); v.wallet -= s; me.wallet += s; db.save();
        c.reply(`🥷 *ROB*\n\n✅ You robbed @${t.n} for *+${m(s)}*\n${wal(me)}`, [t.jid]);
      } else {
        const f = Math.min(me.wallet, rnd(100, 300)); me.wallet -= f; db.save();
        c.reply(`🥷 *ROB*\n\n🚔 Caught! Fine: *-${m(f)}*\n${wal(me)}`);
      }
    });

    def(['pay', 'donate'], { g: true, usage: 'pay @user <amt>' }, c => {
      const t = c.target(); if (!t || t.n === c.sender) return c.reply(`Usage: ${P}pay @user <amount>`);
      const amt = bet(c, c.args.filter(a => !a.startsWith('@')).pop(), 1); if (!amt) return;
      const me = db.user(c.sender); me.wallet -= amt; db.user(t.n).wallet += amt; db.save();
      c.reply(`💸 *TRANSFER*\n\nSent *${m(amt)}* to @${t.n}\n${wal(me)}`, [t.jid]);
    });

    def(['lb', 'leaderboard', 'top'], {}, c => {
      const top = Object.entries(db.data.users).sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0))).slice(0, 10);
      c.reply('🏆 *LEADERBOARD*\n\n' + (top.map(([n, u], i) => `${['🥇', '🥈', '🥉'][i] || '*' + (i + 1) + '.*'} ${u.name || '…' + n.slice(-4)} — *${m(u.wallet + (u.bank || 0))}*`).join('\n') || 'Nobody yet.'));
    });
  },
};
