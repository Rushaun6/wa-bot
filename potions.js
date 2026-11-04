// POTIONS. Good potions help the drinker. Bad potions are cursed: they can't be drunk, they hit whoever you gift them to.
// effect = { key, x, mins } uses the same multiplier system as the admin-abuse boosts (u.ab), so existing commands already read it.
// instant = { cash } adds money, or { pct } takes that % of the wallet.
const POTIONS = [
  { id: 'luckbrew',   emoji: '🍀', name: 'Luck Brew',       kind: 'good', price: 20000,   effect: { key: 'luck', x: 1.5, mins: 60 } },
  { id: 'goldtonic',  emoji: '🥇', name: 'Gold Tonic',      kind: 'good', price: 75000,   effect: { key: 'cash', x: 1.5, mins: 60 } },
  { id: 'rocket',     emoji: '🚀', name: 'Rocket Serum',    kind: 'good', price: 250000,  effect: { key: 'cash', x: 2, mins: 30 } },
  { id: 'stardust',   emoji: '✨', name: 'Stardust Elixir', kind: 'good', price: 1000000, effect: { key: 'luck', x: 2.5, mins: 30 } },
  { id: 'moneyflask', emoji: '💵', name: 'Money Flask',     kind: 'good', price: 50000,   instant: { cash: 100000 } },
  { id: 'slime',      emoji: '🫧', name: 'Slime Serum',     kind: 'bad',  price: 30000,   effect: { key: 'cash', x: 0.6, mins: 60 } },
  { id: 'skunk',      emoji: '🦨', name: 'Skunk Tonic',     kind: 'bad',  price: 20000,   effect: { key: 'luck', x: 0.5, mins: 60 } },
  { id: 'hiccup',     emoji: '🤢', name: 'Hiccup Brew',     kind: 'bad',  price: 40000,   effect: { key: 'cash', x: 0.5, mins: 30 } },
  { id: 'clown',      emoji: '🤡', name: 'Clown Elixir',    kind: 'bad',  price: 60000,   effect: { key: 'luck', x: 0.3, mins: 30 } },
  { id: 'jinx',       emoji: '🧟', name: 'Jinx Juice',      kind: 'bad',  price: 100000,  instant: { pct: 5 } },
];
const LABEL = { cash: 'cash', luck: 'luck' };
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
function describe(p) {
  const bits = [];
  if (p.effect) {
    const e = p.effect, pct = Math.round((e.x - 1) * 100);
    bits.push(`${pct >= 0 ? '+' : ''}${pct}% ${LABEL[e.key]} for ${e.mins >= 60 ? e.mins / 60 + 'h' : e.mins + ' min'}`);
  }
  if (p.instant?.cash) bits.push(`gives ${money(p.instant.cash)} instantly`);
  if (p.instant?.pct) bits.push(`takes ${p.instant.pct}% of the wallet instantly`);
  return bits.join(' · ');
}
// Applies a potion to a player (the caller saves). Effects overwrite a same-kind effect that is still running.
function apply(u, p) {
  if (p.effect) (u.ab ||= {})[p.effect.key] = { x: p.effect.x, until: Date.now() + p.effect.mins * 60000 };
  if (p.instant?.cash) u.wallet += p.instant.cash;
  if (p.instant?.pct) u.wallet -= Math.floor(u.wallet * p.instant.pct / 100);
  u.wallet = Math.max(0, u.wallet);
  return describe(p);
}
module.exports = { POTIONS, find, qtyName, count, add, take, apply, describe, money, norm };
