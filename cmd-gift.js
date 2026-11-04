// GIFTING: send a pet, item or potion to another player. The sender pays the price PLUS a 10% fee.
// Cursed (bad) potions take effect on the receiver straight away.
const POT = require('./potions');
const FEE = 0.10;
module.exports = {
  category: '💰 ECONOMY',
  register(def, L) {
    const { P, db, m } = L;
    const PT = L.pets, IT = L.items;
    const fee = v => Math.ceil(v * FEE);

    def('gift', { g: true, usage: 'gift @user <pet|item|potion> [amount]' }, c => {
      const t = c.target();
      if (!t) return c.reply(`🎁 Tag or reply to the player you want to gift.\nExample: ${P}gift @user Lion\n   ${P}gift @user gold crate x2`);
      if (t.n === c.sender) return c.reply('🙃 You cannot gift yourself.');
      const { qty, name } = POT.qtyName(c.args);
      if (!name) return c.reply(`⚠️ Say what to gift. Example: ${P}gift @user Lion`);

      const from = db.user(c.sender), to = db.user(t.n);
      const who = `@${c.sender}`, toWho = `@${t.n}`, mentions = [c.senderJid, t.jid];
      const receipt = (head, gift, value, extra = '') =>
        `🎁 *${head}*\n\n${who} ➜ ${toWho}\n🎁 Gift: ${gift}\n💵 Value: *${m(value)}*\n🧾 Gift fee (10%): *${m(fee(value))}*\n💸 You paid: *${m(value + fee(value))}*\n💰 Your wallet: *${m(from.wallet)}*${extra}`;
      const broke = cost => `⚠️ That gift costs *${m(cost)}* (price + 10% fee). You have *${m(from.wallet)}*.`;

      // 1) pets
      const pet = PT.find(name), ownedPet = pet && PT.owned(from, pet.id);
      if (ownedPet) {
        if (qty > 1) return c.reply('⚠️ You can only gift one pet at a time.');
        if (PT.owned(to, pet.id)) return c.reply(`⚠️ ${toWho} already has ${pet.emoji} ${pet.name}.`, [t.jid]);
        const cost = pet.price + fee(pet.price);
        if (from.wallet < cost) return c.reply(broke(cost));
        from.wallet -= cost;
        from.pets = from.pets.filter(p => p.id !== pet.id);
        from.equipped = from.equipped.filter(id => id !== pet.id);
        to.pets.push({ id: pet.id, lvl: ownedPet.lvl || 0 });
        db.save();
        return c.reply(receipt('PET GIFT SENT', `${pet.emoji} ${pet.name}`, pet.price), mentions);
      }

      // 2) items
      const item = IT.find(name);
      if (item && IT.count(from, item.id) > 0) {
        const have = IT.count(from, item.id);
        if (!item.stack && qty > 1) return c.reply(`⚠️ You can only gift one ${item.emoji} ${item.name} at a time.`);
        if (have < qty) return c.reply(`⚠️ You only have ${have} ${item.emoji} ${item.name}.`);
        if (!item.stack && IT.count(to, item.id) > 0) return c.reply(`⚠️ ${toWho} already owns ${item.emoji} ${item.name}.`, [t.jid]);
        if (!IT.unlocked(item, to)) return c.reply(`🔒 ${toWho} needs *${item.rebirth}* rebirths to receive ${item.name}.`, [t.jid]);
        const value = item.price * qty, cost = value + fee(value);
        if (from.wallet < cost) return c.reply(broke(cost));
        from.wallet -= cost;
        IT.take(from, item.id, qty); IT.add(to, item.id, qty); db.save();
        return c.reply(receipt('GIFT SENT', `${qty > 1 ? qty + ' × ' : ''}${item.emoji} ${item.name}`, value), mentions);
      }

      // 3) potions
      const potion = POT.find(name);
      if (potion && POT.count(from, potion.id) > 0) {
        const have = POT.count(from, potion.id);
        if (have < qty) return c.reply(`⚠️ You only have ${have} ${potion.emoji} ${potion.name}.`);
        const value = potion.price * qty, cost = value + fee(value);
        if (from.wallet < cost) return c.reply(broke(cost));
        from.wallet -= cost;
        POT.take(from, potion.id, qty);
        if (potion.kind === 'bad') {
          for (let i = 0; i < qty; i++) POT.apply(to, potion);
          db.save();
          return c.reply(receipt('CURSED GIFT SENT', `${qty > 1 ? qty + ' × ' : ''}${potion.emoji} ${potion.name}`, value,
            `\n\n☠️ *${toWho} was hit!* ${POT.describe(potion)}`), mentions);
        }
        POT.add(to, potion.id, qty); db.save();
        return c.reply(receipt('POTION GIFT SENT', `${qty > 1 ? qty + ' × ' : ''}${potion.emoji} ${potion.name}`, value), mentions);
      }

      c.reply(`🤷 You don't own *${name}*.\nCheck ${P}inv (items), ${P}mypets (pets) and ${P}potions.`);
    });
  },
};
