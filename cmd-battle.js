// PET BATTLES (Pokémon-style): every pet has a type, HP, attack and speed.
// Super-effective hits do 1.5x, resisted hits 0.75x, and every turn is animated in one message.
const TYPE = { fire: '🔥', water: '🌊', grass: '🌿', electric: '⚡', dark: '🌑', light: '🌟' };
const KEYS = Object.keys(TYPE);
const BEATS = { fire: 'grass', grass: 'water', water: 'fire', electric: 'water', dark: 'light', light: 'dark' };
const MOVE = { fire: 'Flame Burst', water: 'Aqua Jet', grass: 'Vine Whip', electric: 'Thunder Shock', dark: 'Shadow Claw', light: 'Sun Beam' };
const bar = (hp, max) => { const n = Math.max(0, Math.min(10, Math.round(hp / max * 10))); return '█'.repeat(n) + '░'.repeat(10 - n); };
const strHash = s => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

module.exports = {
  category: '🐾 PETS',
  register(def, L) {
    const { P, db, m, parseAmt, animate } = L;
    const PT = L.pets;

    // a pet's battle stats come from its tier (rarer = stronger) and its level
    const fighter = (pet, lvl = 0) => {
      const ti = PT.tierIdx(pet);
      return { name: pet.name, emoji: pet.emoji, type: KEYS[strHash(pet.id) % KEYS.length],
        hp: 60 + ti * 30 + lvl * 20, max: 60 + ti * 30 + lvl * 20, atk: 12 + ti * 7 + lvl * 4, spd: 10 + ti * 3 + lvl * 2 };
    };
    const best = u => {
      const list = (u.pets || []).map(o => ({ pet: PT.BY_ID[o.id], lvl: o.lvl || 0 })).filter(e => e.pet);
      list.sort((a, b) => PT.tierIdx(b.pet) - PT.tierIdx(a.pet) || b.lvl - a.lvl);
      return list[0] || null;
    };

    function hit(a, d) {
      if (Math.random() < 0.08) return `💨 ${a.emoji} ${a.name}'s *${MOVE[a.type]}* missed!`;
      const eff = BEATS[a.type] === d.type ? 1.5 : BEATS[d.type] === a.type ? 0.75 : 1;
      const crit = Math.random() < 0.1 ? 1.5 : 1;
      const dmg = Math.max(1, Math.round(a.atk * (0.85 + Math.random() * 0.3) * eff * crit));
      d.hp = Math.max(0, d.hp - dmg);
      return `${TYPE[a.type]} ${a.emoji} ${a.name} used *${MOVE[a.type]}*!` +
        (crit > 1 ? ' 💥 Critical hit!' : '') + (eff > 1 ? ' 🔥 Super effective!' : eff < 1 ? ' 🫤 Not very effective…' : '') + ` (-${dmg})`;
    }
    const board = (A, B, turn, log) =>
      `🆚 *PET BATTLE* · Turn ${turn}\n\n${A.emoji} *${A.name}* ${TYPE[A.type]}\n${bar(A.hp, A.max)} ${A.hp}/${A.max}\n\n${B.emoji} *${B.name}* ${TYPE[B.type]}\n${bar(B.hp, B.max)} ${B.hp}/${B.max}\n\n${log}`;

    // runs the whole fight; returns one animation frame per turn, and who won ('A', 'B' or 'draw')
    function fight(A, B) {
      const frames = [];
      const order = A.spd >= B.spd ? [[A, B], [B, A]] : [[B, A], [A, B]];
      for (let turn = 1; turn <= 12 && A.hp > 0 && B.hp > 0; turn++) {
        const logs = [];
        for (const [a, d] of order) if (a.hp > 0 && d.hp > 0) logs.push(hit(a, d));
        frames.push(board(A, B, turn, logs.join('\n')));
      }
      const ap = A.hp / A.max, bp = B.hp / B.max;
      const winner = A.hp > 0 && B.hp <= 0 ? 'A' : B.hp > 0 && A.hp <= 0 ? 'B' : ap > bp ? 'A' : bp > ap ? 'B' : 'draw';
      return { frames, winner, last: frames[frames.length - 1] };
    }

    // PvP: .battle @user [bet]. The bet is a pot: the winner takes both sides.
    def('battle', { g: true, usage: 'battle @user [bet]' }, c => {
      const t = c.target();
      if (!t) return c.reply(`⚔️ Tag the player you want to battle.\nExample: ${P}battle @user   or   ${P}battle @user 5k`);
      if (t.n === c.sender) return c.reply('🙃 You cannot battle yourself.');
      const me = db.user(c.sender), them = db.user(t.n);
      const mine = best(me), theirs = best(them);
      if (!mine) return c.reply(`🐾 You have no pets yet. Get one with ${P}petshop`);
      if (!theirs) return c.reply(`🐾 @${t.n} has no pets to fight with.`, [t.jid]);
      const bet = parseAmt(c.args.filter(a => !a.startsWith('@')).pop() || '') || 0;
      if (bet && (me.wallet < bet || them.wallet < bet)) return c.reply(`⚠️ Both players need *${m(bet)}* in their wallet for this bet.`, [t.jid]);
      if (L.cooldown(c, 'battle', 60000)) return;

      if (bet) { me.wallet -= bet; them.wallet -= bet; }
      const r = fight(fighter(mine.pet, mine.lvl), fighter(theirs.pet, theirs.lvl));
      let head;
      if (r.winner === 'A') { me.wallet += bet * 2; head = `🏆 *@${c.sender} WINS!*` + (bet ? `\n💵 Prize: *+${m(bet)}*` : ''); }
      else if (r.winner === 'B') { them.wallet += bet * 2; head = `🏆 *@${t.n} WINS!*` + (bet ? `\n💵 Prize: *+${m(bet)}*` : ''); }
      else { me.wallet += bet; them.wallet += bet; head = '🤝 *DRAW*' + (bet ? '\nBets returned.' : ''); }
      db.save();
      animate(c, r.frames, `${head}\n\n${r.last}`, [c.senderJid, t.jid]);
    });

    // PvE: .wild fights a wild pet of about your pet's tier. Win = cash, and a 10% chance to catch it.
    def('wild', { usage: 'wild' }, c => {
      const u = db.user(c.sender), mine = best(u);
      if (!mine) return c.reply(`🐾 You have no pets yet. Get one with ${P}petshop`);
      if (L.cooldown(c, 'wild', 120000)) return;
      const ti = Math.max(0, Math.min(PT.ORDER.length - 1, PT.tierIdx(mine.pet) + rint(-1, 1)));
      const pool = PT.PETS.filter(p => p.tier === PT.ORDER[ti]);
      const wild = pool[rint(0, pool.length - 1)], lvl = rint(0, 1);
      const B = fighter(wild, lvl); B.name = 'Wild ' + wild.name;
      const r = fight(fighter(mine.pet, mine.lvl), B);
      let head;
      if (r.winner === 'A') {
        const prize = 1500 * (ti + 1) * (lvl + 1);
        u.wallet += prize;
        let caught = '';
        if (!PT.owned(u, wild.id) && rint(1, 100) <= 10) { u.pets.push({ id: wild.id, lvl: 0 }); caught = `\n🎯 You caught ${wild.emoji} *${wild.name}*!`; }
        head = `🏆 *YOU WON!*\n💵 Prize: *+${m(prize)}*${caught}`;
      } else if (r.winner === 'B') head = `💀 *${B.name} won.* Level up your pets and try again.`;
      else head = '🤝 *DRAW*';
      db.save();
      animate(c, r.frames, `${head}\n\n${r.last}`);
    });
  },
};
