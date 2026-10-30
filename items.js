// Shop catalog + inventory helpers. To add an item later, add ONE line to ITEMS (and a category in CATS if it's a new kind).
// u.inv = { itemId: count } lives on every user (created lazily, so old saves keep working).
const CATS = [
  { id: 'robbery',  title: '🥷 ROBBERY ITEMS' },
  { id: 'protect',  title: '🛡️ PROTECTION ITEMS' },
  { id: 'business', title: '💼 BUSINESS & MONEY-MAKING' },
  { id: 'luxury',   title: '💎 LUXURY & COLLECTIBLES' },
  { id: 'special',  title: '🎒 SPECIAL ITEMS' },
  { id: 'crate',    title: '🎁 CRATES & RARE ITEMS' },
];

// o: stack (can own many, used up) | rob (+% rob success) | block (% chance to block a robbery) | income (per 3 min) | rebirth (rebirths needed) | desc
const I = (id, cat, emoji, name, price, o = {}) => ({ id, cat, emoji, name, price, ...o });
const ITEMS = [
  // robbery
  I('picklock', 'robbery', '🔓', 'Picklock', 4000, { stack: true, desc: 'One use: .pl @user = 50% chance to break their padlock' }),
  I('gloves', 'robbery', '🧤', 'Basic Gloves', 15000, { rob: 5, desc: '+5% rob success (permanent)' }),
  I('disguise', 'robbery', '🥷', 'Advanced Disguise', 100000, { rob: 10, desc: '+10% rob success (permanent)' }),
  I('toolkit', 'robbery', '🛠️', 'Professional Toolkit', 500000, { rob: 18, desc: '+18% rob success (permanent)' }),
  I('phantom', 'robbery', '👑', 'Phantom Kit', 10000000, { rob: 30, desc: '+30% rob success (permanent)' }),
  // protection
  I('padlock', 'protect', '🔒', 'Padlock', 2000, { stack: true, desc: 'One use: .use padlock = robbers are blocked for 12 hours' }),
  I('shield', 'protect', '🛡️', 'Small Shield', 50000, { block: 20, desc: '20% chance to block every robbery (permanent)' }),
  I('security', 'protect', '🔐', 'Security System', 250000, { block: 40, desc: '40% chance to block every robbery (permanent)' }),
  // business (income is paid every 3 minutes)
  I('smallshop', 'business', '🛒', 'Small Shop', 100000, { income: 300 }),
  I('food', 'business', '🍔', 'Food Business', 500000, { income: 1600 }),
  I('dealership', 'business', '🚗', 'Car Dealership', 2000000, { income: 7000, rebirth: 6 }),
  I('hotel', 'business', '🏨', 'Hotel', 10000000, { income: 38000 }),
  I('skyscraper', 'business', '🏢', 'Skyscraper', 50000000, { income: 200000 }),
  I('privbank', 'business', '🏦', 'Private Bank', 100000000, { income: 420000 }),
  I('island', 'business', '🏝️', 'Private Island', 500000000, { income: 2200000 }),
  // luxury & collectibles (cars + house unlock at 6 rebirths)
  I('watch', 'luxury', '⌚', 'Gold Watch', 100000),
  I('ring', 'luxury', '💍', 'Diamond Ring', 500000),
  I('sportscar', 'luxury', '🚘', 'Sports Car', 2000000, { rebirth: 6 }),
  I('supercar', 'luxury', '🏎️', 'Supercar', 25000000, { rebirth: 6 }),
  I('yacht', 'luxury', '🛥️', 'Luxury Yacht', 100000000),
  I('mansion', 'luxury', '🏰', 'Private Mansion', 500000000, { rebirth: 6 }),
  I('throne', 'luxury', '💎', 'Diamond Throne', 1000000000),
  I('galaxy', 'luxury', '🌌', 'Galaxy Crown', 10000000000),
  I('negcrown', 'luxury', '👑', "Negatron's Crown", 100000000000),
  // special
  I('mystery', 'special', '🧿', 'Mystery Box', 2500000, { stack: true, crate: true, desc: 'Open it with .open mystery — could be anything' }),
  // crates
  I('bronze', 'crate', '🥉', 'Bronze Crate', 50000, { stack: true, crate: true }),
  I('silver', 'crate', '🥈', 'Silver Crate', 250000, { stack: true, crate: true }),
  I('gold', 'crate', '🥇', 'Gold Crate', 1000000, { stack: true, crate: true }),
  I('diamond', 'crate', '💎', 'Diamond Crate', 10000000, { stack: true, crate: true }),
  I('shadow', 'crate', '🌑', 'Shadow Crate', 100000000, { stack: true, crate: true }),
  I('negatron', 'crate', '👑', 'Negatron Crate', 1000000000, { stack: true, crate: true }),
];
for (const it of ITEMS) {
  if (it.crate) it.desc = it.desc || 'Open it with .open ' + it.id + ' — random cash, items or pets';
  if (it.income) it.desc = `💸 Pays ${'$' + it.income.toLocaleString('en-US')} every 3 min (permanent)`;
  if (!it.desc && it.cat === 'luxury') it.desc = 'Collectible — shows off on your .profile';
}

// crate loot: w = [cash, item, pet] weights, cash = [min,max] x crate price, itemMax = biggest item it can drop, petTier = best pet tier
const LOOT = {
  bronze:   { w: [75, 25, 0],  cash: [0.3, 1.4], itemMax: 100000,      petTier: null },
  silver:   { w: [65, 30, 5],  cash: [0.3, 1.5], itemMax: 500000,      petTier: 'rare' },
  gold:     { w: [55, 35, 10], cash: [0.3, 1.6], itemMax: 2000000,     petTier: 'epic' },
  diamond:  { w: [50, 35, 15], cash: [0.3, 1.8], itemMax: 25000000,    petTier: 'legendary' },
  shadow:   { w: [45, 35, 20], cash: [0.3, 2.0], itemMax: 500000000,   petTier: 'mythic' },
  negatron: { w: [40, 35, 25], cash: [0.3, 2.2], itemMax: 10000000000, petTier: 'divine' },
  mystery:  { w: [40, 40, 20], cash: [0.2, 2.0], itemMax: 25000000,    petTier: 'legendary' },
};

const BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const find = q => {
  const k = norm(q); if (!k) return null;
  return ITEMS.find(i => i.id === k || norm(i.name) === k) || ITEMS.find(i => norm(i.name).startsWith(k) || i.id.startsWith(k)) || (k.length >= 4 ? ITEMS.find(i => norm(i.name).includes(k)) : null);
};

// ---- inventory
const inv = u => (u.inv && typeof u.inv === 'object' ? u.inv : (u.inv = {}));
const count = (u, id) => inv(u)[id] || 0;
const add = (u, id, n = 1) => { inv(u)[id] = count(u, id) + n; };
const take = (u, id, n = 1) => { const c = count(u, id); if (n < 1 || c < n) return false; if (c === n) delete inv(u)[id]; else inv(u)[id] = c - n; return true; };
const owned = u => Object.entries(inv(u)).filter(([id, n]) => BY_ID[id] && n > 0).map(([id, n]) => ({ item: BY_ID[id], n }));
const unlocked = (it, u) => (u.rebirths || 0) >= (it.rebirth || 0);

// ---- effects (all read what the player owns)
const best = (u, key) => owned(u).reduce((mx, { item }) => Math.max(mx, item[key] || 0), 0);
const robBonus = u => best(u, 'rob');                      // % added to rob success
const blockChance = u => best(u, 'block');                 // % chance to block a robbery
const income = u => owned(u).reduce((s, { item, n }) => s + (item.income || 0) * n, 0); // per 3 min
const value = (u, f = 1) => owned(u).reduce((s, { item, n }) => s + item.price * n * f, 0);

module.exports = { CATS, ITEMS, LOOT, BY_ID, find, inv, count, add, take, owned, unlocked, robBonus, blockChance, income, value, norm };
