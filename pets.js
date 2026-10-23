// All pet data + pet maths in one place. To add a pet later, add one line to PETS.
const TIERS = {
  common:    { label: 'Common',    icon: '⚪', odds: 50, price: 10000 },
  rare:      { label: 'Rare',      icon: '🔵', odds: 28, price: 40000 },
  epic:      { label: 'Epic',      icon: '🟣', odds: 14, price: 150000 },
  legendary: { label: 'Legendary', icon: '🟡', odds: 6,  price: 600000 },
  mythic:    { label: 'Mythic',    icon: '🔴', odds: 2,  price: 2500000 },
};
const ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const LVL_MULT = [1, 1.2, 1.5, 2];   // level 0..3
const UPGRADE = [0.5, 1, 2];         // cost to reach lvl 1/2/3, as a multiple of the pet's price
const BASE_SLOTS = 2, MAX_REBIRTH = 12, INCOME_MIN = 3; // income is paid every 3 minutes
const rebirthCost = n => 250000 * 2 ** n; // n = rebirths you already have (0..11)

// ab = abilities: guard (% block robbery) duel (+% win) beg/work/daily (+% earnings) robboost (+% rob success) pigeon (steals)
const T = (tier, id, name, emoji, o = {}) => ({ id, name, emoji, tier, price: TIERS[tier].price, income: o.income || 0, ab: o.ab || [] });
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
const pigeons = u => equipped(u).filter(e => e.pet.ab.some(a => a.type === 'pigeon'));
const upgradeCost = (pet, lvl) => lvl >= 3 ? null : Math.floor(pet.price * UPGRADE[lvl]);

// one line describing what a pet does at a given level
function describe(pet, lvl = 0) {
  const k = mult(lvl), out = [];
  if (pet.income) out.push(`💸 ${money(pet.income * k)} / ${INCOME_MIN} min`);
  for (const a of pet.ab) {
    const v = Math.round((a.base || 0) * k * 10) / 10;
    out.push({ pigeon: `🐦 steals ${Math.round(2 * k * 10) / 10}-${Math.round(5 * k * 10) / 10}% from a player in your groups every 5 min (max ${money(2000 * k)})`,
      guard: `🛡️ ${v}% chance to block robberies`, duel: `⚔️ +${v}% duel win chance`, beg: `🙏 +${v}% on .beg`, work: `💼 +${v}% on .work`,
      daily: `🎁 +${v}% on .daily`, robboost: `🥷 +${v}% rob success` }[a.type]);
  }
  return out.join('\n   ');
}

// ---- shop: 3 pets, restocks every 3 hours (same for everyone, derived from the clock so it survives restarts)
const SLOT_MS = 3 * 3600000;
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function shop(now = Date.now()) {
  const slot = Math.floor(now / SLOT_MS), r = mulberry32((slot * 2654435761) >>> 0), stock = [];
  for (let guard = 0; stock.length < 3 && guard < 200; guard++) {
    let x = r() * 100, tier = 'common';
    for (const t of ORDER) { if (x < TIERS[t].odds) { tier = t; break; } x -= TIERS[t].odds; }
    const pool = PETS.filter(p => p.tier === tier && !stock.includes(p));
    if (pool.length) stock.push(pool[Math.floor(r() * pool.length)]);
  }
  return { stock, restockIn: (slot + 1) * SLOT_MS - now };
}

module.exports = { TIERS, ORDER, PETS, BY_ID, LVL_MULT, BASE_SLOTS, MAX_REBIRTH, INCOME_MIN, rebirthCost, find, tierIdx, mult, slots, owned, equipped, income, guardChance, duelBonus, robBoost, boost, pigeons, upgradeCost, describe, shop, money };
