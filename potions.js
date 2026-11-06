// POTIONS. Good potions help the drinker. Bad (cursed) potions can't be drunk: they hit whoever you gift them to.
// Nothing here scales with how rich the player is (no income multipliers), so a potion can never be worth more than it costs.
// effect  = { key, x, mins }  boost on u.ab (same system the events use). Only 'luck' and 'frenzy' are used.
// instant = { rand:[lo,hi] }  random payout of price*lo..price*hi (average is below the price) | { pct, cap }  take pct% of the wallet, at most cap
// special = 'cleanse' | 'robreset' | 'nrob' (+ hours)
// w = how common it is in a Potion Crate.
const H = 60;
const POTIONS = [
  // ---- good
  { id: 'luckbrew',  emoji: '🍀', name: 'Luck Brew',        kind: 'good', price: 20000,   w: 10, effect: { key: 'luck', x: 1.5,  mins: 60 },  desc: '+50% luck for 1h' },
  { id: 'clover',    emoji: '☘️', name: 'Four-Leaf Tonic',  kind: 'good', price: 40000,   w: 8,  effect: { key: 'luck', x: 1.25, mins: 180 }, desc: '+25% luck for 3h' },
  { id: 'stardust',  emoji: '✨', name: 'Stardust Elixir',  kind: 'good', price: 1000000, w: 2,  effect: { key: 'luck', x: 2.5,  mins: 30 },  desc: '+150% luck for 30 min' },
  { id: 'adrenaline', emoji: '💉', name: 'Adrenaline Shot', kind: 'good', price: 75000,   w: 6,  special: 'robreset', desc: 'Resets your rob cooldown so you can rob right now' },
  { id: 'rage',      emoji: '🔥', name: 'Rage Potion',      kind: 'good', price: 250000,  w: 2,  effect: { key: 'frenzy', x: 1, mins: 3 }, desc: 'Rob frenzy for 3 min: no rob cooldown and +25% rob success' },
  { id: 'rainbow',   emoji: '🌈', name: 'Rainbow Remedy',   kind: 'good', price: 30000,   w: 6,  special: 'cleanse', desc: 'Removes every curse on you (bad luck, rob ban)' },
  { id: 'flask',     emoji: '🍾', name: 'Lucky Flask',      kind: 'good', price: 50000,   w: 5,  instant: { rand: [0, 1.5] }, desc: 'A gamble: pays anywhere from $0 to 1.5x its price (75% back on average)' },
  // ---- bad (cursed, gift them)
  { id: 'skunk',     emoji: '🦨', name: 'Skunk Tonic',      kind: 'bad',  price: 20000,   w: 10, effect: { key: 'luck', x: 0.5, mins: 60 },  desc: '-50% luck for 1h' },
  { id: 'snake',     emoji: '🐍', name: 'Snake Oil',        kind: 'bad',  price: 35000,   w: 7,  effect: { key: 'luck', x: 0.4, mins: 45 },  desc: '-60% luck for 45 min' },
  { id: 'clown',     emoji: '🤡', name: 'Clown Elixir',     kind: 'bad',  price: 60000,   w: 5,  effect: { key: 'luck', x: 0.3, mins: 30 },  desc: '-70% luck for 30 min' },
  { id: 'jinx',      emoji: '🧟', name: 'Jinx Juice',       kind: 'bad',  price: 100000,  w: 3,  instant: { pct: 5, cap: 300000 },  desc: 'Takes 5% of their wallet instantly (max $300,000)' },
  { id: 'leaky',     emoji: '🕳️', name: 'Leaky Pocket',     kind: 'bad',  price: 40000,   w: 5,  instant: { pct: 3, cap: 120000 },  desc: 'Takes 3% of their wallet instantly (max $120,000)' },
  { id: 'jailjuice', emoji: '🔒', name: 'Jail Juice',       kind: 'bad',  price: 40000,   w: 5,  special: 'nrob', hours: 2,  desc: 'They cannot rob anyone for 2h' },
];
const money = n => '$' + Math.floor(n).toLocaleString('en-US');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const find = q => {
  const k = norm(q); if (!k) return null;
  return POTIONS.find(p => p.id === k || norm(p.name) === k) || POTIONS.find(p => p.id.startsWith(k) || norm(p.name).startsWith(k)) || null;
};
// "gold crate x2" -> { qty: 2, name: 'gold crate' }. @mentions are ignored.
function qtyName(args) {
  const a = args.filter(x => !x.startsWith('@'));
  let qty = 1;
  const last = a[a.length - 1] || '';
  if (a.length > 1 && /^x?\d+$/i.test(last)) { qty = Math.min(50, Math.max(1, parseInt(last.replace(/\D/g, ''), 10))); a.pop(); }
  return { qty, name: a.join(' ') };
}
const count = (u, id) => (u.potions || {})[id] || 0;
const add = (u, id, n = 1) => { u.potions ||= {}; u.potions[id] = count(u, id) + n; };
const take = (u, id, n = 1) => { if (count(u, id) < n) return false; u.potions[id] -= n; if (!u.potions[id]) delete u.potions[id]; return true; };
const describe = p => p.desc;
const curses = u => Object.entries(u.ab || {}).filter(([, b]) => b && Date.now() < b.until && b.x < 1);
const mins = ms => Math.max(1, Math.ceil(ms / 60000)) + ' min';

// a reason NOT to drink right now (so the potion isn't wasted), or null
function blockReason(u, p) {
  const now = Date.now(), cur = u.ab && p.effect && u.ab[p.effect.key];
  if (p.effect && cur && now < cur.until && cur.x > p.effect.x) return `You already have a stronger boost running (×${cur.x} for ${mins(cur.until - now)}). Save this potion.`;
  if (p.special === 'robreset' && !(u.robCd > now)) return 'You have no rob cooldown right now. Save this potion.';
  if (p.special === 'cleanse' && !curses(u).length && !(u.curseRob > now)) return 'You are not cursed. Save this potion.';
  return null;
}
// Applies a potion to a player (the caller saves). Returns a short result line.
function apply(u, p) {
  const now = Date.now(), out = [];
  if (p.effect) { (u.ab ||= {})[p.effect.key] = { x: p.effect.x, until: now + p.effect.mins * 60000 }; out.push(p.desc); }
  if (p.instant?.rand) {
    const [lo, hi] = p.instant.rand, win = Math.floor(p.price * (lo + (hi - lo) * Math.random()));
    u.wallet += win; out.push(`It paid out *${money(win)}*`);
  }
  if (p.instant?.pct) {
    const loss = Math.min(Math.floor(u.wallet * p.instant.pct / 100), p.instant.cap || Infinity);
    u.wallet = Math.max(0, u.wallet - loss); out.push(`-${money(loss)} from the wallet`);
  }
  if (p.special === 'robreset') { u.robCd = 0; out.push('Rob cooldown reset'); }
  if (p.special === 'nrob') { const until = now + p.hours * 3600000; u.robCd = Math.max(u.robCd || 0, until); u.curseRob = until; out.push(p.desc); }
  if (p.special === 'cleanse') {
    let n = 0;
    for (const [k] of curses(u)) { delete u.ab[k]; n++; }
    if (u.curseRob > now) { if ((u.robCd || 0) <= u.curseRob) u.robCd = 0; delete u.curseRob; n++; }
    out.push(`${n} curse${n === 1 ? '' : 's'} removed`);
  }
  return out.join(' · ');
}
// a random potion for a Potion Crate, weighted by how common each one is
function randomPotion(rnd) {
  const tot = POTIONS.reduce((s, p) => s + p.w, 0); let r = rnd(1, tot);
  for (const p of POTIONS) { if ((r -= p.w) <= 0) return p; }
  return POTIONS[0];
}
module.exports = { POTIONS, find, qtyName, count, add, take, apply, describe, blockReason, randomPotion, money, norm };
