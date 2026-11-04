// STORY MODE: "Two Days in Negatron City". Six chapters, one unlocks every 8 hours, so the whole story takes 2 days.
// Chapters are read with .story read. Each one pays a reward, and the finale also gives an epic pet.
const GAP = 8 * 3600000;
const CHAPTERS = [
  { title: 'Chapter 1 · The Letter', reward: 25000,
    body: 'At midnight a sealed envelope slides under your door. Inside is one gold coin and a note: "The Negatron Vault opens in 48 hours. Come alone, or come with everything you have."' },
  { title: 'Chapter 2 · The Pet Market', reward: 40000,
    body: 'The city is strange today. Shopkeepers whisper about a crown that only appears when someone stops working. Following the rumours, you reach the pet market, where an old woman sells you a map drawn on a pig\'s ear.' },
  { title: 'Chapter 3 · The Shadow Crew', reward: 60000,
    body: 'A crew in black masks is also heading for the Vault. Their leader, Vex, finds you in an alley and offers a deal: help them crack the first lock, and split the gold.' },
  { title: 'Chapter 4 · Heist Night (Day 2)', reward: 100000,
    body: 'The Vault is guarded by bank pets that never sleep. Your loyal pets hold the line while you crack the first lock. It clicks open. Vex grins and says, "Now the hard part."' },
  { title: 'Chapter 5 · The Betrayal', reward: 150000,
    body: 'Vex locks you out and vanishes with the first crate. But the second lock was never a lock. It was a test, and you passed it without knowing.' },
  { title: 'Chapter 6 · The Vault', reward: 1000000, finale: true,
    body: 'The Vault opens. Inside: a throne of gold, a mirror that shows your bank balance, and one egg glowing with cosmic light. You claim the Vault, and the whole city remembers your name.' },
];

module.exports = {
  category: '📖 STORY',
  register(def, L) {
    const { P, db, m, left, animate } = L;
    const PT = L.pets;

    def('story', { usage: ['story', 'story read'] }, c => {
      const u = db.user(c.sender);
      u.story ||= { start: Date.now(), read: 0 }; // the first .story starts the adventure
      const s = u.story, now = Date.now(), sub = (c.args[0] || '').toLowerCase();

      if (sub !== 'read') {
        const lines = CHAPTERS.map((ch, i) => {
          const at = s.start + i * GAP;
          if (i < s.read) return `✅ ${ch.title}`;
          if (now >= at) return `🔓 ${ch.title}  ← ready`;
          return `🔒 ${ch.title}  (in ${left(at - now)})`;
        });
        const done = s.read >= CHAPTERS.length;
        return c.reply(`📖 *TWO DAYS IN NEGATRON CITY*\n\n${lines.join('\n')}\n\n${done ? '🏁 *You finished the story!*' : `Read the next chapter with *${P}story read*`}`);
      }

      if (s.read >= CHAPTERS.length) return c.reply(`🏁 *You already finished the story.*\nThe Negatron Vault is yours. Play on with ${P}battle, ${P}wild and ${P}gift.`);
      const i = s.read, ch = CHAPTERS[i], at = s.start + i * GAP;
      if (now < at) return c.reply(`🔒 *${ch.title}* opens in *${left(at - now)}*.\nCome back then, or read ${P}story to see the timetable.`);

      // a typing effect: the text appears a bit more on each edit
      const frames = [1, 2, 3].map(k => `📜 *${ch.title}*\n\n${ch.body.slice(0, Math.floor(ch.body.length * k / 4))}…`);
      let bonus = '';
      if (ch.finale) {
        const free = PT.PETS.filter(p => p.tier === 'epic' && !PT.owned(u, p.id));
        if (free.length) { const pet = free[Math.floor(Math.random() * free.length)]; u.pets.push({ id: pet.id, lvl: 0 }); bonus = `\n🎁 Finale bonus: ${pet.emoji} *${pet.name}* joins you!`; }
      }
      u.wallet += ch.reward; s.read++; db.save();
      animate(c, frames, `📜 *${ch.title}*\n\n${ch.body}\n\n💵 Reward: *+${m(ch.reward)}*${bonus}\n💰 Wallet: *${m(u.wallet)}*`);
    });
  },
};
