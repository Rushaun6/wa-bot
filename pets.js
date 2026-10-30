// All pet data + pet maths in one place. To add a pet later, add one line to PETS.
const TIERS = {
  common:    { label: 'Common',    icon: '⚪', odds: 38,  price: 10000 },
  rare:      { label: 'Rare',      icon: '🔵', odds: 27,  price: 40000 },
  epic:      { label: 'Epic',      icon: '🟣', odds: 17,  price: 150000 },
  legendary: { label: 'Legendary', icon: '🟡', odds: 10,  price: 600000 },
  mythic:    { label: 'Mythic',    icon: '🔴', odds: 5.2, price: 2500000 },
  divine:    { label: 'Divine',    icon: '✨', odds: 2,   price: 15000000 },
  celestial: { label: 'Celestial', icon: '🌌', odds: 0.7, price: 100000000 },
  cosmic:    { label: 'Cosmic',    icon: '🪐', odds: 0.1, price: 777777777 },
};
const ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'divine', 'celestial', 'cosmic'];
const LVL_MULT = [1, 1.2, 1.5, 2];   // level 0..3
const UPGRADE = [0.5, 1, 2];         // cost to reach lvl 1/2/3, as a multiple of the pet's price
const BASE_SLOTS = 2, MAX_REBIRTH = 12, INCOME_MIN = 3; // income is paid every 3 minutes
const rebirthCost = n => 250000 * 2 ** n; // n = rebirths you already have (0..11)

// ab = abilities: guard (% block robbery) duel (+% win) beg/work/daily (+% earnings) robboost (+% rob success) pigeon (steals) bankmult (multiplies your bank every N hours)
const T = (tier, id, name, emoji, o = {}) => ({ id, name, emoji, tier, price: o.price || TIERS[tier].price, noUpgrade: !!o.noUpgrade, income: o.income || 0, ab: o.ab || [] });
const PETS = [
  T('common', 'chicken', 'Chicken', '🐔', { income: 120 }), T('common', 'pig', 'Pig', '🐖', { income: 140 }), T('common', 'sheep', 'Sheep', '🐑', { income: 130 }),
  T('common', 'cow', 'Cow', '🐄', { income: 160 }), T('common', 'turtle', 'Turtle', '🐢', { income: 150 }),
  T('rare', 'horse', 'Horse', '🐎', { income: 300 }), T('rare', 'deer', 'Deer', '🦌', { income: 280 }), T('rare', 'monkey', 'Monkey', '🐒', { income: 320 }), T('rare', 'penguin', 'Penguin', '🐧', { income: 310 }),
  T('rare', 'pigeon', 'Pigeon', '🐦', { ab: [{ type: 'pigeon' }] }), T('rare', 'guarddog', 'Guard Dog', '🐕', { ab: [{ type: 'guard', base: 12 }] }),
  T('rare', 'fox', 'Fox', '🦊', { ab: [{ type: 'duel', base: 4 }] }), T('rare', 'cat', 'Cat', '🐈', { ab: [{ type: 'beg', base: 30 }] }),
  T('epic', 'panda', 'Panda', '🐼', { income: 800 }), T('epic', 'koala', 'Koala', '🐨', { income: 780 }), T('epic', 'tiger', 'Tiger', '🐅', { income: 850 }), T('epic', 'elephant', 'Elephant', '🐘', { income: 820 }),
  T('epic', 'owl', 'Owl', '🦉', { ab: [{ type: 'work', base: 40 }] }), T('epic', 'rabbit', 'Rabbit', '🐇', { ab: [{ type: 'daily', base: 25 }] }),
  T('epic', 'shark', 'Shark', '🦈', { ab: [{ type: 'robboost', base: 10 }] }), T('epic', 'wolf', 'Wolf', '🐺', { ab: [{ type: 'duel', base: 7 }] }), T('epic', 'bear', 'Bear', '🐻', { ab: [{ type: 'guard', base: 18 }] }),
  T('legendary', 'lion', 'Lion', '🦁', { income: 2500 }), T('legendary', 'eagle', 'Eagle', '🦅', { income: 2600 }), T('legendary', 'gorilla', 'Gorilla', '🦍', { income: 2400 }),
  T('legendary', 'rhino', 'Rhino', '🦏', { ab: [{ type: 'guard', base: 25 }] }), T('legendary', 'crocodile', 'Crocodile', '🐊', { ab: [{ type: 'robboost', base: 15 }] }),
  T('mythic', 'unicorn', 'Unicorn', '🦄', { income: 8000 }), T('mythic', 'dragon', 'Dragon', '🐉', { income: 9000 }), T('mythic', 'whale', 'Whale', '🐋', { income: 8500 }),
  T('mythic', 'kraken', 'Kraken', '🦑', { ab: [{ type: 'guard', base: 30 }, { type: 'duel', base: 10 }] }),
];
// ---- more pets: every animal emoji. (the 31 pets above are untouched)
const A = (type, base) => ({ type, base });
[
  // common
  ['common', 'mouse', 'Mouse', '🐭', 110], ['common', 'rat', 'Rat', '🐀', 115], ['common', 'hamster', 'Hamster', '🐹', 120], ['common', 'frog', 'Frog', '🐸', 125],
  ['common', 'snail', 'Snail', '🐌', 100], ['common', 'ant', 'Ant', '🐜', 0, [A('work', 8)]], ['common', 'bee', 'Bee', '🐝', 0, [A('beg', 8)]], ['common', 'ladybug', 'Ladybug', '🐞', 0, [A('daily', 6)]],
  ['common', 'caterpillar', 'Caterpillar', '🐛', 100], ['common', 'duck', 'Duck', '🦆', 135], ['common', 'turkey', 'Turkey', '🦃', 140], ['common', 'rooster', 'Rooster', '🐓', 135],
  ['common', 'chick', 'Chick', '🐤', 120], ['common', 'dog', 'Dog', '🐶', 150], ['common', 'ram', 'Ram', '🐏', 145], ['common', 'fish', 'Fish', '🐟', 115],
  ['common', 'tropicalfish', 'Tropical Fish', '🐠', 125], ['common', 'cricket', 'Cricket', '🦗', 105], ['common', 'spider', 'Spider', '🕷️', 0, [A('robboost', 3)]], ['common', 'mosquito', 'Mosquito', '🦟', 100],
  ['common', 'lizard', 'Lizard', '🦎', 140], ['common', 'crab', 'Crab', '🦀', 150], ['common', 'beetle', 'Beetle', '🪲', 110], ['common', 'cockroach', 'Cockroach', '🪳', 105],
  ['common', 'fly', 'Fly', '🪰', 100], ['common', 'worm', 'Worm', '🪱', 100],
  // rare
  ['rare', 'butterfly', 'Butterfly', '🦋', 290], ['rare', 'snake', 'Snake', '🐍', 0, [A('robboost', 8)]], ['rare', 'camel', 'Camel', '🐪', 290], ['rare', 'boar', 'Boar', '🐗', 310],
  ['rare', 'ox', 'Ox', '🐂', 300], ['rare', 'buffalo', 'Buffalo', '🐃', 305], ['rare', 'squirrel', 'Squirrel', '🐿️', 280], ['rare', 'hedgehog', 'Hedgehog', '🦔', 285],
  ['rare', 'bat', 'Bat', '🦇', 295], ['rare', 'blowfish', 'Blowfish', '🐡', 285], ['rare', 'octopus', 'Octopus', '🐙', 315], ['rare', 'shrimp', 'Shrimp', '🦐', 270],
  ['rare', 'scorpion', 'Scorpion', '🦂', 0, [A('robboost', 9)]], ['rare', 'poodle', 'Poodle', '🐩', 0, [A('guard', 10)]], ['rare', 'raccoon', 'Raccoon', '🦝', 0, [A('beg', 28)]],
  ['rare', 'llama', 'Llama', '🦙', 300], ['rare', 'zebra', 'Zebra', '🦓', 295], ['rare', 'kangaroo', 'Kangaroo', '🦘', 310], ['rare', 'badger', 'Badger', '🦡', 0, [A('duel', 5)]],
  ['rare', 'otter', 'Otter', '🦦', 0, [A('daily', 22)]], ['rare', 'guidedog', 'Guide Dog', '🦮', 0, [A('guard', 14)]], ['rare', 'servicedog', 'Service Dog', '🐕‍🦺', 0, [A('guard', 16)]],
  ['rare', 'blackcat', 'Black Cat', '🐈‍⬛', 0, [A('beg', 32)]],
  // epic
  ['epic', 'lobster', 'Lobster', '🦞', 0, [A('duel', 8)]], ['epic', 'seal', 'Seal', '🦭', 0, [A('daily', 30)]], ['epic', 'sloth', 'Sloth', '🦥', 770],
  ['epic', 'skunk', 'Skunk', '🦨', 0, [A('guard', 22)]], ['epic', 'parrot', 'Parrot', '🦜', 0, [A('beg', 45)]], ['epic', 'beaver', 'Beaver', '🦫', 0, [A('work', 42)]],
  // legendary
  ['legendary', 'polarbear', 'Polar Bear', '🐻‍❄️', 0, [A('guard', 28)]], ['legendary', 'bison', 'Bison', '🦬', 0, [A('duel', 12)]], ['legendary', 'dodo', 'Dodo', '🦤', 0, [A('beg', 60)]],
  ['legendary', 'orangutan', 'Orangutan', '🦧', 0, [A('work', 50)]], ['legendary', 'leopard', 'Leopard', '🐆', 0, [A('robboost', 18)]], ['legendary', 'hippo', 'Hippo', '🦛', 0, [A('guard', 30)]],
  ['legendary', 'giraffe', 'Giraffe', '🦒', 0, [A('daily', 40)]],
  // mythic
  ['mythic', 'humpback', 'Humpback', '🐳', 8800], ['mythic', 'drake', 'Drake', '🐲', 0, [A('robboost', 22), A('duel', 12)]],
  // divine
  ['divine', 'peacock', 'Peacock', '🦚', 30000], ['divine', 'swan', 'Swan', '🦢', 0, [A('guard', 40), A('beg', 80)]], ['divine', 'flamingo', 'Flamingo', '🦩', 0, [A('duel', 16), A('robboost', 26)]],
  ['divine', 'dolphin', 'Dolphin', '🐬', 33000], ['divine', 'dove', 'Dove', '🕊️', 36000],
  // celestial
  ['celestial', 'trex', 'T-Rex', '🦖', 110000], ['celestial', 'sauropod', 'Sauropod', '🦕', 120000], ['celestial', 'mammoth', 'Mammoth', '🦣', 0, [A('guard', 55), A('duel', 18)]],
].forEach(([tier, id, name, emoji, inc, ab]) => PETS.push(T(tier, id, name, emoji, { income: inc, ab: ab || [] })));
// ---- creative abilities for the new pets (they plug into the shop, crates, loans, businesses, robbing...)
const CAP = { crate: 100, dblcrate: 40, haggle: 25, bizboost: 100, interest: 1.5, loanfee: 100, loanlimit: 300, mafia: 80, lockpick: 45, longlock: 150, sellprice: 30, cashback: 25, fine: 100, robloot: 60 };
const EXTRA = {
  // common
  mouse: [A('haggle', 2)], rat: [A('robloot', 4)], hamster: [A('interest', 0.05)], frog: [A('crate', 5)], snail: [A('longlock', 10)], ant: [A('bizboost', 3)], bee: [A('crate', 3)],
  ladybug: [A('cashback', 2)], caterpillar: [A('sellprice', 2)], duck: [A('lockpick', 3)], turkey: [A('fine', 8)], rooster: [A('longlock', 8)], chick: [A('crate', 4)], dog: [A('loanfee', 5)],
  ram: [A('robloot', 4)], fish: [A('interest', 0.05)], tropicalfish: [A('haggle', 2)], cricket: [A('dblcrate', 3)], spider: [A('fine', 5)], mosquito: [A('bizboost', 3)], lizard: [A('cashback', 2)],
  crab: [A('sellprice', 2)], beetle: [A('loanlimit', 5)], cockroach: [A('mafia', 5)], fly: [A('lockpick', 3)], worm: [A('interest', 0.05)],
  // rare
  butterfly: [A('crate', 10)], snake: [A('lockpick', 5)], camel: [A('longlock', 20)], boar: [A('robloot', 8)], ox: [A('bizboost', 6)], buffalo: [A('bizboost', 6)], squirrel: [A('haggle', 4)],
  hedgehog: [A('fine', 15)], bat: [A('lockpick', 6)], blowfish: [A('cashback', 4)], octopus: [A('dblcrate', 6)], shrimp: [A('interest', 0.1)], scorpion: [A('robloot', 6)], poodle: [A('loanfee', 10)],
  raccoon: [A('sellprice', 4)], llama: [A('loanlimit', 10)], zebra: [A('haggle', 4)], kangaroo: [A('cashback', 4)], badger: [A('mafia', 10)], otter: [A('interest', 0.1)], guidedog: [A('mafia', 12)],
  servicedog: [A('loanfee', 10)], blackcat: [A('crate', 8)],
  // epic
  lobster: [A('dblcrate', 8)], seal: [A('haggle', 6)], sloth: [A('interest', 0.15)], skunk: [A('fine', 25)], parrot: [A('sellprice', 6)], beaver: [A('bizboost', 10)],
  // legendary
  polarbear: [A('mafia', 20)], bison: [A('robloot', 12)], dodo: [A('crate', 15)], orangutan: [A('bizboost', 15)], leopard: [A('lockpick', 10)], hippo: [A('longlock', 40)], giraffe: [A('haggle', 8)],
  // mythic
  humpback: [A('interest', 0.3), A('cashback', 6)], drake: [A('robloot', 15), A('fine', 30)],
  // divine
  peacock: [A('crate', 30), A('dblcrate', 12)], swan: [A('mafia', 30)], flamingo: [A('lockpick', 15), A('robloot', 20)], dolphin: [A('bizboost', 25), A('haggle', 10)], dove: [A('loanfee', 40), A('loanlimit', 40)],
  // celestial
  trex: [A('robloot', 30), A('fine', 50), A('lockpick', 20)], sauropod: [A('bizboost', 50), A('interest', 0.6)], mammoth: [A('mafia', 50), A('cashback', 10)],
};
for (const [id, list] of Object.entries(EXTRA)) { const p = PETS.find(x => x.id === id); if (!p) throw new Error('EXTRA: unknown pet ' + id); p.ab.push(...list); }
// cosmic: the GOAT. Every 70 hours there's a 7% chance your bank gets multiplied by 7.
PETS.push(T('cosmic', 'cr7', 'CR7', '🐐', { price: 777777777, noUpgrade: true, ab: [{ type: 'bankmult', mult: 7, hours: 70, chance: 7 }] }));
const BY_ID = Object.fromEntries(PETS.map(p => [p.id, p]));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const find = q => { const k = norm(q); if (!k) return null; return PETS.find(p => p.id === k || norm(p.name) === k) || PETS.find(p => p.id.startsWith(k)); };
const tierIdx = p => ORDER.indexOf(p.tier);
const mult = lvl => LVL_MULT[Math.max(0, Math.min(3, lvl || 0))];
const money = n => '$' + Math.floor(n).toLocaleString('en-US');

// ---- a user's pets (u.pets = [{id,lvl}], u.equipped = [id], u.rebirths)
const slots = u => BASE_SLOTS + (u.rebirths || 0);
const owned = (u, id) => (u.pets || []).find(p => p.id === id);
const equipped = u => (u.equipped || []).map(id => { const o = owned(u, id), pet = BY_ID[id]; return o && pet ? { pet, lvl: o.lvl || 0 } : null; }).filter(Boolean);
const income = u => Math.floor(equipped(u).reduce((s, e) => s + e.pet.income * mult(e.lvl), 0));
const stat = (u, type) => equipped(u).reduce((s, e) => s + e.pet.ab.filter(a => a.type === type).reduce((x, a) => x + (a.base || 0) * mult(e.lvl), 0), 0);
const guardChance = u => Math.min(70, stat(u, 'guard'));
const duelBonus = u => Math.min(20, stat(u, 'duel'));
const robBoost = u => Math.min(30, stat(u, 'robboost'));
const boost = (u, type) => 1 + Math.min(100, stat(u, type)) / 100; // multiplier for beg/work/daily
const ab = (u, type) => Math.min(CAP[type] ?? 100, stat(u, type)); // capped ability total for a player
const bankPets = u => equipped(u).filter(e => e.pet.ab.some(a => a.type === 'bankmult'));
const pigeons = u => equipped(u).filter(e => e.pet.ab.some(a => a.type === 'pigeon'));
const upgradeCost = (pet, lvl) => lvl >= 3 || pet.noUpgrade ? null : Math.floor(pet.price * UPGRADE[lvl]);

// one line describing what a pet does at a given level
function describe(pet, lvl = 0) {
  const k = mult(lvl), out = [];
  if (pet.income) out.push(`💸 ${money(pet.income * k)} / ${INCOME_MIN} min`);
  for (const a of pet.ab) {
    const v = Math.round((a.base || 0) * k * 10) / 10;
    out.push({ pigeon: `🐦 steals ${Math.round(2 * k * 10) / 10}-${Math.round(5 * k * 10) / 10}% from a player in your groups every 5 min (max ${money(2000 * k)})`,
      guard: `🛡️ ${v}% chance to block robberies`, duel: `⚔️ +${v}% duel win chance`, beg: `🙏 +${v}% on .beg`, work: `💼 +${v}% on .work`,
      daily: `🎁 +${v}% on .daily`, robboost: `🥷 +${v}% rob success`,
      crate: `📦 +${v}% cash from crates`, dblcrate: `🎁 ${v}% chance a crate opens TWICE`, haggle: `🏷️ -${v}% off shop prices`, bizboost: `🏢 +${v}% business income`,
      interest: `📈 +${Math.round((a.base || 0) * k * 100) / 100}% of your bank every hour`, loanfee: `🤝 -${v}% off loan fees`, loanlimit: `💳 +${v}% borrow limit`,
      mafia: `🇷🇺 ${v}% chance the mafia spares each item & pet`, lockpick: `🔓 +${v}% picklock success`, longlock: `⏳ +${v}% padlock duration`,
      sellprice: `💱 +${v}% more when selling items`, cashback: `🍀 ${v}% of gambling losses refunded`, fine: `🚔 -${v}% fine when a rob fails`, robloot: `💰 +${v}% more stolen when you rob`,
      bankmult: `🏦 every ${a.hours}h: ${a.chance || 100}% chance to multiply the money in your bank by ${a.mult}x` }[a.type]);
  }
  return out.join('\n   ');
}

// ---- shop: 6 pets, restocks every 2 hours (same for everyone, derived from the clock so it survives restarts)
const SLOT_MS = 2 * 3600000, SHOP_SIZE = 6;
const slotId = (now = Date.now()) => Math.floor(now / SLOT_MS);
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function shop(now = Date.now()) {
  const slot = slotId(now), r = mulberry32((slot * 2654435761) >>> 0), stock = [];
  for (let guard = 0; stock.length < SHOP_SIZE && guard < 400; guard++) {
    let x = r() * 100, tier = 'common';
    for (const t of ORDER) { if (x < TIERS[t].odds) { tier = t; break; } x -= TIERS[t].odds; }
    const pool = PETS.filter(p => p.tier === tier && !stock.includes(p));
    if (pool.length) stock.push(pool[Math.floor(r() * pool.length)]);
  }
  stock.sort((a, b) => tierIdx(a) - tierIdx(b)); // cheapest tier first, rarest last
  return { stock, restockIn: (slot + 1) * SLOT_MS - now, slot };
}

module.exports = { ab, CAP, slotId, SHOP_SIZE, bankPets, TIERS, ORDER, PETS, BY_ID, LVL_MULT, BASE_SLOTS, MAX_REBIRTH, INCOME_MIN, rebirthCost, find, tierIdx, mult, slots, owned, equipped, income, guardChance, duelBonus, robBoost, boost, pigeons, upgradeCost, describe, shop, money };
