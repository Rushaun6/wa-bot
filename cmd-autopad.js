// AUTO PADLOCK: a setting that costs $50,000,000 and lasts 12 hours.
// While it is ON, whenever your padlock is missing (it ran out, or someone picklocked it) the bot puts a new one on, using a padlock from your inventory.
// If you have no padlocks left it can't re-lock you. You get a DM once, and you are open to robbery until you buy more.
// The lock itself behaves like a normal padlock (12 hours, longer with the "longlock" pet bonus).
const COST = 50000000, HOURS = 12;

module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m, left } = L;
    const IT = L.items, PT = L.pets;
    const lockHours = u => Math.round(12 * (1 + PT.ab(u, 'longlock') / 100) * 10) / 10; // same maths as .use padlock
    const dm = (n, text) => { try { L.state.sock?.sendMessage(n + '@s.whatsapp.net', { text }).catch(() => {}); } catch {} };

    // Puts the lock back on if auto padlock is ON and the lock is missing. Returns true if it just locked. (The caller saves.)
    function autoPad(u, n) {
      const now = Date.now();
      if (!(u.autoPadUntil > now) || u.padlock > now) return false;
      if (!IT.count(u, 'padlock')) {
        if (n && u.autoPadWarned !== u.autoPadUntil) { u.autoPadWarned = u.autoPadUntil; dm(n, `🔓 *AUTO PADLOCK*\n\nYou're out of padlocks, so I couldn't lock you again. You're open to robbery!\nBuy one: ${P}buy padlock`); }
        return false;
      }
      IT.take(u, 'padlock');
      u.padlock = now + lockHours(u) * 3600000;
      return true;
    }
    L.autoPad = u => { const r = autoPad(u); if (r) db.save(); return r; }; // used by .rob and .pl (cmd-economy.js)

    // checks everyone every 5 seconds, so a lock that just ran out is replaced almost instantly
    const tick = () => {
      const now = Date.now(); let changed = false;
      for (const [n, u] of Object.entries(db.data.users)) {
        if (!u.autoPadUntil) continue;
        if (u.autoPadUntil <= now) { u.autoPadUntil = 0; delete u.autoPadWarned; changed = true; dm(n, `🔓 *AUTO PADLOCK ENDED*\n\nYour 12 hours are over. Turn it on again with *${P}autopadlock on* (${m(COST)}).`); continue; }
        if (autoPad(u, n)) changed = true;
      }
      if (changed) db.save();
    };
    setInterval(tick, 5000).unref();
    module.exports._test = { tick, autoPad };

    def(['autopadlock', 'autopad'], { usage: ['autopadlock on', 'autopadlock off', 'autopadlock'] }, c => {
      const u = db.user(c.sender), now = Date.now(), arg = (c.args[0] || '').toLowerCase(), on = u.autoPadUntil > now, T = '🔒 *AUTO PADLOCK*';
      const stock = IT.count(u, 'padlock');
      if (arg === 'on') {
        if (on) return c.reply(`${T}\n\nAlready on. *${left(u.autoPadUntil - now)}* left.`);
        if (!stock) return c.reply(`${T}\n\n⚠️ You have no padlocks, so it couldn't protect you.\nBuy one first: ${P}buy padlock`);
        if (u.wallet < COST) return c.reply(`${T}\n\n⚠️ It costs *${m(COST)}* from your wallet. You have *${m(u.wallet)}*.`);
        u.wallet -= COST; u.autoPadUntil = now + HOURS * 3600000; delete u.autoPadWarned;
        const locked = autoPad(u); db.save();
        return c.reply(`${T} 🟢 *ON*\n\n💸 Paid *${m(COST)}*\n⏳ Active for *${HOURS} hours*\n${locked ? '🔒 Locked you right now.' : `🔒 Your padlock is still on (${left(u.padlock - now)} left). I'll replace it when it runs out.`}\n🎒 Padlocks in stock: *${IT.count(u, 'padlock')}*\n\nEvery time your lock is missing I use one padlock from your inventory. If you run out, it stops working.`);
      }
      if (arg === 'off') {
        if (!on) return c.reply(`${T}\n\nIt isn't on.`);
        u.autoPadUntil = 0; delete u.autoPadWarned; db.save();
        return c.reply(`${T} 🔴 *OFF*\n\nTurned off. (No refund.) Your current padlock stays on until it runs out.`);
      }
      c.reply(`${T} ${on ? '🟢 *ON*' : '🔴 *OFF*'}\n\n${on ? `⏳ *${left(u.autoPadUntil - now)}* left\n` : ''}🔒 Padlock: ${u.padlock > now ? left(u.padlock - now) + ' left' : 'none'}\n🎒 Padlocks in stock: *${stock}*${on && !stock ? ' ⚠️ (out of stock: not protecting you!)' : ''}\n\n${on ? '' : `It costs *${m(COST)}* and lasts *${HOURS} hours*. Whenever your padlock is missing it puts a new one on using your inventory.\n`}${P}autopadlock on • ${P}autopadlock off`);
    });
  },
};
