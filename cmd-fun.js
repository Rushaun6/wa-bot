// joke, 8ball, truth, dare, ship, rate, roast, pick, rps, guess, trivia, answer
const crypto = require('crypto');
module.exports = {
  category: '🎉 FUN',
  register(def, L) {
    const { P, rnd, left } = L;
    const pickOne = a => a[rnd(0, a.length - 1)];
    const hash = s => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
    const bar = n => '█'.repeat(Math.round(n / 10)) + '░'.repeat(10 - Math.round(n / 10));
    const mentionsOf = c => {
      let mm = c.msg.message || {}; mm = mm.ephemeralMessage?.message || mm; mm = mm.viewOnceMessage?.message || mm;
      return mm.extendedTextMessage?.contextInfo?.mentionedJid || [];
    };
    const numOf = j => String(j).split('@')[0].split(':')[0];

    const JOKES = [
      "Why don't scientists trust atoms? Because they make up everything.",
      'I told my phone I needed space. Now it won\'t stop showing me "storage full".',
      'Why did the scarecrow win an award? He was outstanding in his field.',
      'I asked the gym for a trainer. They gave me a mirror and said "start there".',
      "Why can't you give Elsa a balloon? She'll let it go.",
      'My WiFi and I have a lot in common. We both drop out when things get serious.',
      'I used to hate facial hair, but then it grew on me.',
      'Why did the math book look sad? It had too many problems.',
      "What do you call a fake noodle? An impasta.",
      'I only know 25 letters of the alphabet. I don\'t know y.',
      'Why do bees have sticky hair? They use honeycombs.',
      "I'm reading a book about anti-gravity. It's impossible to put down.",
      'What did the ocean say to the beach? Nothing, it just waved.',
      'Why was the phone wearing glasses? It lost its contacts.',
      'I would tell you a construction joke, but I am still working on it.',
    ];
    const BALL = ['✅ It is certain.', '✅ Without a doubt.', '✅ Yes, definitely.', '✅ Most likely.', '✅ Signs point to yes.', '🤔 Reply hazy, try again.', '🤔 Ask again later.', '🤔 Cannot predict now.', '🤔 Concentrate and ask again.', "❌ Don't count on it.", '❌ My reply is no.', '❌ Very doubtful.', '❌ Outlook not so good.'];
    const TRUTHS = [
      "What's the most embarrassing thing you've done in front of a crowd?", "What's a lie you told that you still feel bad about?", "Who in this group would you trade lives with for a day?",
      "What's the weirdest thing you've ever searched on the internet?", "What's your most useless talent?", "What's the last thing you cried over?",
      "What's a secret you've never told anyone in this group?", "What's the worst gift you've ever received?", "What's the silliest fear you have?",
      "What's the longest you've gone without showering?", "Who was your first crush?", "What's one habit of yours that annoys people?",
    ];
    const DARES = [
      'Send a voice note singing the chorus of your favorite song.', 'Change your WhatsApp status to "I love pineapple pizza" for an hour.', 'Send the 5th photo in your gallery (keep it clean!).',
      'Talk in rhymes for the next 5 messages.', 'Send a voice note doing your best animal impression.', "Text your best friend 'I know your secret' and screenshot the reply.",
      'Write a two-line poem about the person above you in the chat.', 'Do 10 push-ups and send proof.', 'Say the alphabet backwards in a voice note.', 'Send a selfie making your silliest face.',
    ];
    const ROASTS = [
      '{u} your WiFi has better stability than your decisions.', '{u} you bring so much energy to the group chat. Mostly typing indicators and then nothing.',
      "{u} you're the reason the group has a mute button.", '{u} if procrastination was a sport, you would still be warming up.',
      '{u} you laugh at your own jokes and honestly, you might be their only audience.', '{u} you have the confidence of someone who has never lost a game of rock paper scissors. Spoiler: you have.',
      '{u} your phone battery lasts longer than your attention span.', "{u} you're proof that the 'seen' feature was a mistake.",
      "{u} you walk into rooms like they owe you money. Everyone owes you an apology for the vibes though.", '{u} you have main character energy. Unfortunately it is a background-character script.',
    ];
    const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
    const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const QS = [
      ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Mars'], ['What is the capital of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Seoul'],
      ['What is the capital of Jamaica?', 'Kingston', 'Montego Bay', 'Spanish Town', 'Port Antonio'], ['Which country is Usain Bolt from?', 'Jamaica', 'USA', 'Kenya', 'Brazil'],
      ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'], ['How many continents are there?', '7', '5', '6', '8'],
      ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Picasso'], ['What is the fastest land animal?', 'Cheetah', 'Lion', 'Horse', 'Leopard'],
      ['What is the largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'], ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Mercury', 'Jupiter'],
      ['How many days are in a leap year?', '366', '365', '364', '367'], ['What is the square root of 144?', '12', '14', '11', '13'],
      ['What is the tallest animal?', 'Giraffe', 'Elephant', 'Ostrich', 'Camel'], ['What language is mainly spoken in Brazil?', 'Portuguese', 'Spanish', 'English', 'French'],
      ['How many players per team are on the field in soccer?', '11', '10', '12', '9'], ['Which gas do plants absorb from the air?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
      ['What is the largest mammal?', 'Blue whale', 'Elephant', 'Giraffe', 'Hippo'], ['How many bones are in an adult human body?', '206', '201', '212', '300'],
      ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'], ['What is the hardest natural substance?', 'Diamond', 'Gold', 'Iron', 'Quartz'],
    ];
    const trivia = new Map();

    def('joke', { usage: 'joke' }, c => c.reply(`😂 *JOKE*\n\n${pickOne(JOKES)}`));
    def(['8ball', 'eightball'], { usage: '8ball <question>' }, c => {
      if (!c.args.length) return c.reply(`🎱 *8BALL*\n\n⚠️ Ask a question!\nExample: ${P}8ball will I be rich?`);
      c.reply(`🎱 *8BALL*\n\n❓ ${c.args.join(' ')}\n\n${pickOne(BALL)}`);
    });
    def('truth', { usage: 'truth' }, c => c.reply(`🫣 *TRUTH*\n\n${pickOne(TRUTHS)}`));
    def('dare', { usage: 'dare' }, c => c.reply(`😈 *DARE*\n\n${pickOne(DARES)}`));

    def('ship', { g: true, usage: 'ship @a @b' }, c => {
      const ms = [...new Set(mentionsOf(c).map(numOf))];
      const a = ms.length >= 2 ? ms[0] : c.sender, b = ms.length >= 2 ? ms[1] : ms[0];
      if (!b) return c.reply(`💘 *SHIP*\n\n⚠️ Usage: ${P}ship @user @user2 (or just @user to ship with you)`);
      const pct = hash([a, b].sort().join('+')) % 101;
      const msg = pct <= 20 ? '💔 Not meant to be...' : pct <= 50 ? '😬 Just friends vibes.' : pct <= 80 ? '💞 There is potential here!' : '💘 A perfect match!';
      c.reply(`💘 *SHIP*\n\n@${a} ❤️ @${b}\n\n${bar(pct)} *${pct}%*\n${msg}`, [a + '@s.whatsapp.net', b + '@s.whatsapp.net']);
    });
    def('rate', { usage: 'rate <anything>' }, c => {
      const what = c.args.join(' ').trim();
      if (!what) return c.reply(`⭐ *RATE*\n\n⚠️ Usage: ${P}rate <anything>`);
      const s = hash(what.toLowerCase()) % 11;
      c.reply(`⭐ *RATE*\n\n*${what}*\n\n${'⭐'.repeat(s)}${'▫️'.repeat(10 - s)}\n*${s}/10*`);
    });
    def('roast', { g: true, usage: 'roast @user' }, c => {
      const t = c.target(); const n = t ? t.n : c.sender, jid = t ? t.jid : c.senderJid;
      c.reply(`🔥 *ROAST*\n\n${pickOne(ROASTS).replace('{u}', '@' + n)}\n\n_(all love 😘)_`, [jid]);
    });
    def('pick', { g: true, usage: 'pick' }, c => {
      const p = pickOne(c.meta.participants), n = L.num(p.id);
      c.reply(`🎯 *PICKED*\n\n${c.args.length ? c.args.join(' ') + '\n\n' : ''}The chosen one is @${n} 🎉`, [p.id]);
    });

    def('rps', { usage: 'rps <rock|paper|scissors>' }, c => {
      const me = (c.args[0] || '').toLowerCase();
      if (!RPS[me]) return c.reply(`✂️ *ROCK PAPER SCISSORS*\n\n⚠️ Usage: ${P}rps rock | paper | scissors`);
      const bot = pickOne(Object.keys(RPS));
      const res = me === bot ? '🤝 *Draw!*' : BEATS[me] === bot ? '✅ *You win!*' : '❌ *You lose!*';
      c.reply(`✂️ *ROCK PAPER SCISSORS*\n\nYou: ${RPS[me]} ${me}\nBot: ${RPS[bot]} ${bot}\n\n${res}`);
    });
    def('guess', { usage: 'guess <1-10>' }, c => {
      const g = parseInt(c.args[0], 10);
      if (!(g >= 1 && g <= 10)) return c.reply(`🎯 *GUESS*\n\n⚠️ Pick a number from 1 to 10.\nExample: ${P}guess 7`);
      const n = rnd(1, 10);
      c.reply(`🎯 *GUESS*\n\nYou guessed *${g}*\nI was thinking *${n}*\n\n${g === n ? '🎉 *Correct! You read my mind!*' : '❌ Nope, try again!'}`);
    });

    def('trivia', { g: true, usage: 'trivia' }, c => {
      const cur = trivia.get(c.chat);
      if (cur && Date.now() < cur.exp) return c.reply(`🧠 *TRIVIA* (still open)\n\n${cur.text}\n\n⏳ ${left(cur.exp - Date.now())} left • ${P}answer <a-d>`);
      const [q, ...opts] = pickOne(QS);
      const shuffled = opts.map(o => [o, rnd(0, 1e6)]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
      const correct = shuffled.indexOf(opts[0]);
      const text = `${q}\n\n` + shuffled.map((o, i) => `*${'ABCD'[i]}.* ${o}`).join('\n');
      trivia.set(c.chat, { text, correct, answer: opts[0], tried: new Set(), exp: Date.now() + 60000 });
      c.reply(`🧠 *TRIVIA*\n\n${text}\n\n⏳ 60s • Answer with ${P}answer <a-d>`);
    });
    def(['answer', 'ans'], { g: true, usage: 'answer <a-d>' }, c => {
      const t = trivia.get(c.chat);
      if (!t) return c.reply(`🧠 No trivia running. Start one with ${P}trivia`);
      if (Date.now() > t.exp) { trivia.delete(c.chat); return c.reply(`🧠 *TRIVIA*\n\n⏳ Time's up! The answer was *${t.answer}*.`); }
      const i = 'abcd'.indexOf((c.args[0] || '').toLowerCase());
      if (i < 0 || !c.args[0] || c.args[0].length !== 1) return c.reply(`⚠️ Answer with ${P}answer a, b, c or d`);
      if (t.tried.has(c.sender)) return c.reply('⚠️ You already tried this one!');
      if (i === t.correct) { trivia.delete(c.chat); return c.reply(`🧠 *TRIVIA*\n\n✅ @${c.sender} got it right!\nThe answer was *${t.answer}* 🎉`, [c.senderJid]); }
      t.tried.add(c.sender);
      c.reply(`🧠 *TRIVIA*\n\n❌ @${c.sender} wrong! Anyone else can still answer.`, [c.senderJid]);
    });
  },
};
