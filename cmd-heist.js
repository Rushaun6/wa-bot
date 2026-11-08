// BANK HEIST (.bankheist / .bh): rob someone's BANK instead of their wallet. A very low chance, and you can only try once per day.
// Built so it can't be farmed: you put up a stake (1.5% of their bank) that you lose if it fails (it goes to THEIR bank), so on average you lose money.
// A bank can only be hit once a day (and locks down after 5 tries), so one whale can't be dog-piled.
// "Once per day" = once per Jamaica calendar day (resets at 12:00 AM Jamaica time).
const JT = require('./jtime');
const MIN_BANK = 1000000;     // their bank must have at least this much
const STAKE_PCT = 0.015, MIN_STAKE = 50000;   // your stake: 1.5% of their bank (min $50,000)
const STEAL = [12, 20];       // a win steals 12-20% of their bank
const BASE = 4, MAX_CHANCE = 8; // success chance %: 4% (up to 8% with rob items and pets)
const MAX_TRIES = 5;          // a bank can be targeted this many times per day

module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, left, rnd } = L;
    const PT = L.pets, IT = L.items;
    const combine = (a, b) => Math.round((1 - (1 - a / 100) * (1 - b / 100)) * 100); // two block chances stacked (same as .rob)
    const chanceFor = me => Math.min(MAX_CHANCE, BASE + Math.floor((PT.robBoost(me) + IT.robBonus(me)) / 12));
    const stakeFor = v => Math.max(MIN_STAKE, Math.floor(v.bank * STAKE_PCT));
    const T = '🏦 *BANK HEIST*';

    def(['bankheist', 'bh'], { g: true, usage: 'bankheist @user' }, c => {
      const t = c.target(), me = db.user(c.sender), now = Date.now(), today = JT.dayNum(now);
      const used = me.bhDay === today;
      if (!t) return c.reply(`${T}\n\nRob someone's *bank* (not their wallet). A very low chance.\n\n• Once a day (resets 12:00 AM Jamaica time) ${used ? '⏳ *you already used it today*' : '✅ *ready*'}\n• Their bank needs *${m(MIN_BANK)}+*\n• You put up a *stake*: ${STAKE_PCT * 100}% of their bank (min ${m(MIN_STAKE)}). Fail = it goes to their bank. Win = you keep it and steal *${STEAL[0]}–${STEAL[1]}%* of their bank\n• Your chance: *${chanceFor(me)}%* (${BASE}% base, up to ${MAX_CHANCE}% with rob items and pets)\n• Padlocks don't protect a bank, but guard dogs, alarms, vault doors and guard pets do\n• A bank can only be hit once a day\n\n👉 ${P}bh @user`);
      if (t.n === c.sender) return c.reply("🤦 You can't rob your own bank.");
      const v = db.user(t.n), stake = stakeFor(v);
      if (used) return c.reply(`${T}\n\n⏳ You already tried today. It resets at *12:00 AM Jamaica time* (in *${left(JT.nextMidnight(now) - now)}*).`);
      if (!(v.bank >= MIN_BANK)) return c.reply(`${T}\n\n🏦 @${t.n}'s bank is too small to be worth it (needs *${m(MIN_BANK)}+*).`, [t.jid]);
      if (!v.bhIn || v.bhIn.day !== today) v.bhIn = { day: today, tries: 0, hit: false };
      if (v.bhIn.hit) return c.reply(`${T}\n\n🚨 @${t.n}'s bank was already hit today and is sealed until tomorrow.`, [t.jid]);
      if (v.bhIn.tries >= MAX_TRIES) return c.reply(`${T}\n\n🚨 @${t.n}'s bank is on lockdown today (${MAX_TRIES} attempts already). Try tomorrow.`, [t.jid]);
      if (me.wallet < stake) return c.reply(`${T}\n\n💸 You need a stake of *${m(stake)}* in your wallet (${STAKE_PCT * 100}% of their bank). You have *${m(me.wallet)}*.`);

      // everything is checked: this attempt counts now
      me.bhDay = today; v.bhIn.tries++; me.wallet -= stake;
      const frames = [`${T}\n\n🕶️ Your crew is casing @${t.n}'s bank…`, `${T}\n\n💣 Cracking the vault…`];
      const fail = why => { v.bank += stake; db.save(); L.animate(c, frames, `${T}\n\n${why}\n💸 You lost your stake: *-${m(stake)}* (it went to @${t.n}'s bank)\n🎯 Your chance was *${chance}%*\n${L.wal(me)}`, [t.jid]); };
      const chance = chanceFor(me), guard = combine(PT.guardChance(v), IT.blockChance(v));
      if (rnd(1, 100) <= guard) return fail(`🛡️ @${t.n}'s defenses stopped your crew before they reached the vault.`);
      if (rnd(1, 100) > chance) return fail('🚨 The alarm went off. Your crew barely escaped.');
      const pct = rnd(STEAL[0], STEAL[1]), steal = Math.floor(v.bank * pct / 100);
      v.bank -= steal; me.wallet += steal + stake; v.bhIn.hit = true; db.save();
      L.animate(c, frames, `${T}\n\n🎉 *THE VAULT IS OPEN!* You stole *${pct}%* of @${t.n}'s bank!\n💰 *+${m(steal)}* (and your stake back)\n${L.wal(me)}`, [t.jid]);
    });
  },
};
