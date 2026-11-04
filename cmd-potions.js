// POTIONS: shop, buy, drink. (Gifting, including cursed potions, lives in cmd-gift.js.)
const POT = require('./potions');
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m } = L;
    const shopList = () => POT.POTIONS.map(p => `${p.kind === 'bad' ? '☠️' : '🧪'} ${p.emoji} *${p.name}* — ${m(p.price)}\n   ${POT.describe(p)}`).join('\n');

    def(['potions', 'potionshop'], { usage: ['potions', 'buypotion <name> [amount]', 'drink <name>'] }, c => {
      const u = db.user(c.sender);
      const mine = Object.entries(u.potions || {}).filter(([, n]) => n > 0).map(([id, n]) => {
        const p = POT.POTIONS.find(x => x.id === id); return p ? `${p.emoji} ${p.name} ×${n}` : null;
      }).filter(Boolean);
      c.reply(`🧪 *POTION SHOP*\n\n${shopList()}\n\n🧺 *Yours:* ${mine.join(', ') || 'none'}\n\n🛒 ${P}buypotion <name> [amount]\n🥤 ${P}drink <name> (good potions only)\n🎁 ${P}gift @user <potion>  (cursed potions hit them instantly)`);
    });

    def('buypotion', { usage: 'buypotion <name> [amount]' }, c => {
      const { qty, name } = POT.qtyName(c.args);
      const p = POT.find(name);
      if (!p) return c.reply(`⚠️ Unknown potion. See ${P}potions`);
      const u = db.user(c.sender), cost = p.price * qty;
      if (cost > u.wallet) return c.reply(`⚠️ ${qty} × ${p.emoji} ${p.name} costs *${m(cost)}*. You have *${m(u.wallet)}*.`);
      u.wallet -= cost; POT.add(u, p.id, qty); db.save();
      c.reply(`🧪 *BOUGHT*\n\n${qty} × ${p.emoji} ${p.name}\n💸 -${m(cost)}\n💰 Wallet: *${m(u.wallet)}*`);
    });

    def('drink', { usage: 'drink <name>' }, c => {
      const p = POT.find(POT.qtyName(c.args).name);
      if (!p) return c.reply(`⚠️ Unknown potion. See ${P}potions`);
      const u = db.user(c.sender);
      if (p.kind === 'bad') return c.reply(`☠️ ${p.emoji} *${p.name}* is cursed. You can't drink it, but you can gift it to someone.\nUse: ${P}gift @user ${p.id}`);
      if (!POT.take(u, p.id)) return c.reply(`⚠️ You don't have a ${p.emoji} ${p.name}. Buy one with ${P}buypotion ${p.id}`);
      const note = POT.apply(u, p); db.save();
      c.reply(`🥤 *${p.emoji} ${p.name.toUpperCase()}*\n\n✨ ${note}\n💰 Wallet: *${m(u.wallet)}*`);
    });
  },
};
