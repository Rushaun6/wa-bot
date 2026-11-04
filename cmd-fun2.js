// MORE FUN: .kill .gun .simp (.sym) .fuck (.fu) .hack .jail .rizz .iq .flip .vibe
// All pretend and harmless: nothing here touches money. (.shoot already exists as "shoot your shot", so the gun one is .gun)
const crypto = require('crypto');
module.exports = {
  category: '🎉 FUN',
  register(def, L) {
    const { P, db, rnd } = L;
    const pick = a => a[rnd(0, a.length - 1)];
    const day = () => new Date().toDateString();
    // same number all day for the same person + command, so people can't spam for a better roll
    const score = (n, salt, lo, hi) => lo + parseInt(crypto.createHash('sha1').update(n + day() + salt).digest('hex').slice(0, 8), 16) % (hi - lo + 1);
    const bar = p => { const k = Math.max(0, Math.min(10, Math.round(p / 10))); return '█'.repeat(k) + '░'.repeat(10 - k); };
    const tier = (v, steps) => steps.find(([lim]) => v <= lim)[1];
    const sleepAnim = (c, frames, final, mentions) => L.animate(c, frames, final, mentions);
    const needTarget = (c, name, hint) => { const t = c.target(); if (!t) { c.reply(`${hint}\n\n⚠️ Tag someone or reply to them.\nExample: ${P}${name} @user`); return null; } return t; };
    const selfCheck = (c, t, msg) => { if (t.n === c.sender) { c.reply(msg); return true; } return false; };

    // ---------- .kill @user (cartoon fight, nobody is really hurt) ----------
    const KILLS = [
      'slipped on a banana peel the size of a car 🍌', 'got hit by a very angry pigeon 🐦', 'was rickrolled so hard they turned to dust 🎵',
      'lost an argument with a goose 🪿', 'ate the last slice of pizza and was cursed by the group 🍕', 'was sat on by a sumo wrestler 🤼',
      'tried to carry too many grocery bags in one trip 🛍️', 'got launched into space by a trampoline 🚀', 'was out-stared by a cat 🐈',
      'blinked during a staring contest with a statue 🗿', 'was defeated by a single Lego in the dark 🧱', 'got a "seen" and could not handle it 💬',
    ];
    def('kill', { g: true, usage: 'kill @user' }, async c => {
      const t = needTarget(c, 'kill', '☠️ *KILL*'); if (!t) return;
      if (selfCheck(c, t, '🙃 Pick someone else for this one.')) return;
      if (L.cooldown(c, 'fun', 5000)) return;
      const me = db.user(c.sender); me.kills = (me.kills || 0) + 1;
      const victim = db.data.users[t.n]; if (victim) victim.deaths = (victim.deaths || 0) + 1; db.save();
      const T = '☠️ *KILL*';
      sleepAnim(c, [`${T}\n\n🥷 @${c.sender} sneaks up on @${t.n}…`, `${T}\n\n⚔️ @${c.sender} attacks!! 💥`],
        `${T}\n\n💀 @${t.n} ${pick(KILLS)}\n\n🪦 RIP @${t.n}. Respawning in 10 seconds…\n🏆 @${c.sender} kills: *${me.kills}*`, [c.senderJid, t.jid]);
    });

    // ---------- .gun @user (toy gun, can miss) ----------
    const GUNS = ['🔫 water pistol', '🍌 banana blaster', '🎈 balloon cannon', '🧊 ice-cube launcher', '🍅 tomato gun', '🪀 yo-yo blaster'];
    def(['gun', 'bang'], { g: true, usage: 'gun @user' }, c => {
      const t = needTarget(c, 'gun', '🔫 *GUN*'); if (!t) return;
      if (selfCheck(c, t, '🙃 Point it at someone else.')) return;
      if (L.cooldown(c, 'fun', 5000)) return;
      const g = pick(GUNS), miss = rnd(1, 100) <= 25, T = '🔫 *GUN*';
      sleepAnim(c, [`${T}\n\n@${c.sender} pulls out a ${g}…`, `${T}\n\n🎯 Aiming at @${t.n}…`],
        miss ? `${T}\n\n💨 @${c.sender} fired the ${g} and *MISSED*. @${t.n} is laughing.` : `${T}\n\n💥 *BANG!* @${c.sender} got @${t.n} with the ${g}! ${pick(['They are soaked.', 'Direct hit.', 'That is going on the highlight reel.', 'They will remember that.'])}`, [c.senderJid, t.jid]);
    });

    // ---------- .simp [@user] (same result all day) ----------
    def(['simp', 'sym'], { usage: 'simp [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, v = score(n, 'simp', 0, 100);
      const txt = tier(v, [[10, 'Nobody has a hold on this one. 😎'], [30, 'Healthy. Mostly.'], [55, 'Gets a little soft for a good profile pic. 🥺'], [80, 'Types "good morning beautiful" to everyone. 🌹'], [95, 'Would send the whole wallet for a smile. 💸'], [100, 'LEGENDARY SIMP. Has a shrine. 🛐']]);
      c.reply(`🥺 *SIMP METER*\n\n@${n}\n[${bar(v)}] *${v}%*\n\n${txt}`, [t ? t.jid : c.senderJid]);
    });

    // ---------- .fuck u / .fu @user (a rude comeback; swearing, nothing sexual) ----------
    const FU = [
      '🖕 {a} says *fuck you* to {b}.', '🖕 {a} looked right at {b} and said *fuck you*. Cold.', '🖕 {b}, {a} has a message for you: *fuck you*. Have a lovely day.',
      '🖕 {a} to {b}: *fuck you*, but in a respectful way.', '🖕 *Fuck you*, {b}. Sincerely, {a}.',
    ];
    def(['fuck', 'fu', 'fuckyou'], { usage: 'fuck u [@user]' }, c => {
      const t = c.target(); if (L.cooldown(c, 'fun', 5000)) return;
      const line = pick(FU).replace('{a}', '@' + c.sender).replace('{b}', t ? '@' + t.n : 'everyone');
      c.reply(line, [c.senderJid, ...(t ? [t.jid] : [])]);
    });

    // ---------- .hack @user (totally fake) ----------
    def('hack', { g: true, usage: 'hack @user' }, c => {
      const t = needTarget(c, 'hack', '💻 *HACK*'); if (!t) return;
      if (L.cooldown(c, 'fun', 8000)) return;
      const T = '💻 *HACKING*', step = (p, s) => `${T} @${t.n}\n\n[${bar(p)}] ${p}%\n${s}`;
      sleepAnim(c, [step(10, '🔍 Finding their IP… 192.0.2.' + rnd(1, 254)), step(35, '🔓 Bypassing the firewall…'), step(60, '📂 Downloading chat history…'), step(85, '🕵️ Reading their search history… oh no.')],
        `${T} @${t.n}\n\n[${bar(100)}] 100%\n✅ *HACK COMPLETE*\n\n🔑 Password: ${pick(['password123', 'ilovepizza', 'qwerty', 'letmein', '12345678', 'hunter2'])}\n📜 Top search: "${pick(['how to look busy', 'am I the main character', 'is cereal a soup', 'why is my phone at 1%', 'free coins'])}"\n\n😂 _Fake. Nothing was hacked._`, [t.jid]);
    });

    // ---------- .jail @user ----------
    const CRIMES = ['stealing the last slice of pizza', 'leaving everyone on read', 'typing "k" as a full reply', 'talking during the movie', 'using the group as a diary', 'being too good at rock paper scissors', 'sending a voice note that was 9 minutes long', 'sharing spoilers'];
    def('jail', { g: true, usage: 'jail @user' }, c => {
      const t = needTarget(c, 'jail', '🚔 *JAIL*'); if (!t) return;
      if (L.cooldown(c, 'fun', 5000)) return;
      const T = '🚔 *JAIL*';
      sleepAnim(c, [`${T}\n\n🚨 Sirens… 🚨`, `${T}\n\n👮 @${t.n} is being arrested…`],
        `${T}\n\n⛓️ @${t.n} was jailed by @${c.sender}\n📜 Crime: *${pick(CRIMES)}*\n⏳ Sentence: *${rnd(2, 99)} minutes*\n🔑 Bail: one funny meme`, [c.senderJid, t.jid]);
    });

    // ---------- .rizz / .iq / .vibe [@user] (same result all day) ----------
    def('rizz', { usage: 'rizz [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, v = score(n, 'rizz', 0, 100);
      c.reply(`😎 *RIZZ METER*\n\n@${n}\n[${bar(v)}] *${v}%*\n\n${tier(v, [[15, 'Negative aura. Needs a mentor. 😬'], [40, 'Says "hey" and waits. 🙂'], [65, 'Smooth enough. Mostly. 😏'], [85, 'Has game. Careful. 🔥'], [100, 'W RIZZ. Unspoken. Undeniable. 👑']])}`, [t ? t.jid : c.senderJid]);
    });
    def('iq', { usage: 'iq [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, v = score(n, 'iq', 60, 200);
      c.reply(`🧠 *IQ TEST*\n\n@${n}\nIQ today: *${v}*\n\n${tier(v, [[80, 'The wifi has more brain cells. 📶'], [100, 'Perfectly average. 😌'], [130, 'Solid. Reads the instructions. 📖'], [160, 'Big brain energy. 🧠'], [200, 'Genius. Probably argues with the calculator. 🧮']])}`, [t ? t.jid : c.senderJid]);
    });
    def('vibe', { usage: 'vibe [@user]' }, c => {
      const t = c.target(), n = t ? t.n : c.sender, v = score(n, 'vibe', 0, 100), pass = v >= 50;
      c.reply(`${pass ? '✅' : '❌'} *VIBE CHECK*\n\n@${n}\n[${bar(v)}] *${v}%*\n\n${pass ? pick(['Vibes: immaculate. ✨', 'Passed. Good energy. 🌈', 'Certified good vibes. 😎']) : pick(['Failed. Go touch some grass. 🌱', 'Vibes are off today. 🌧️', 'Needs a snack and a nap. 🥱'])}`, [t ? t.jid : c.senderJid]);
    });

    // ---------- .flip ----------
    def('flip', { usage: 'flip' }, c => {
      if (L.cooldown(c, 'fun', 3000)) return;
      const side = rnd(0, 1) ? ['🪙 *HEADS*', 'Heads'] : ['🪙 *TAILS*', 'Tails'];
      sleepAnim(c, ['🪙 *COIN FLIP*\n\nFlipping… 🌀'], `🪙 *COIN FLIP*\n\n${side[0]}`, []);
    });
  },
};
