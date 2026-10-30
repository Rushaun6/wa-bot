// Discord-style GIF reactions: .slap .hug .kiss .pat ... (GIFs come from the free nekos.best API, waifu.pics as backup)
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
let ffmpeg = process.env.FFMPEG_PATH || null;
if (!ffmpeg) { try { ffmpeg = require('ffmpeg-static'); } catch {} }
ffmpeg = ffmpeg || 'ffmpeg';

module.exports = {
  category: '💞 ACTIONS',
  register(def, L) {
    const UA = { 'User-Agent': 'EconoBot/1.0 (WhatsApp bot)' };
    // name: [text with {a}=you {b}=target, nekos.best category, waifu.pics backup category]
    const WITH = { // need someone tagged
      slap: ['👋 {a} slapped {b}!', 'slap', 'slap'], hug: ['🤗 {a} hugged {b}!', 'hug', 'hug'], kiss: ['💋 {a} kissed {b}!', 'kiss', 'kiss'],
      pat: ['🥰 {a} patted {b}!', 'pat', 'pat'], punch: ['👊 {a} punched {b}!', 'punch', 'bonk'], yeet: ['🦵 {a} yeeted {b} out!', 'kick', 'kick'],
      cuddle: ['🫂 {a} cuddled {b}!', 'cuddle', 'cuddle'], bite: ['😬 {a} bit {b}!', 'bite', 'bite'], poke: ['👉 {a} poked {b}!', 'poke', 'poke'],
      tickle: ['🤭 {a} tickled {b}!', 'tickle', 'poke'], facecard: ['{a} gave {b} facecard stamp {stars}', 'pat', 'pat'], // same GIF as .pat
      highfive: ['🙌 {a} high-fived {b}!', 'highfive', 'highfive'], handhold: ['🤝 {a} is holding {b}\'s hand!', 'handhold', 'handhold'],
    };
    const SOLO = { // just you
      cry: ['😢 {a} is crying...', 'cry', 'cry'], dance: ['💃 {a} is dancing!', 'dance', 'dance'], laugh: ['😂 {a} is laughing!', 'laugh', 'happy'], blush: ['😊 {a} is blushing...', 'blush', 'blush'],
    };

    async function getJson(url) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
      finally { clearTimeout(t); }
    }
    async function getBuf(url, max = 8e6) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { headers: UA, signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = Buffer.from(await r.arrayBuffer()); if (b.length > max) throw new Error('GIF too big'); return b;
      } finally { clearTimeout(t); }
    }
    async function findGif(nekos, waifu) {
      const tries = [async () => (await getJson(`https://nekos.best/api/v2/${nekos}`)).results?.[0]?.url, async () => (await getJson(`https://api.waifu.pics/sfw/${waifu}`)).url];
      for (const t of tries) { try { const u = await t(); if (u) return u; } catch (e) { console.error('gif api failed:', e?.message || e); } }
      return null;
    }
    // WhatsApp plays "GIFs" as muted mp4 video, so convert with ffmpeg
    function toMp4(buf) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gif-')), inp = path.join(dir, 'in.gif'), out = path.join(dir, 'out.mp4');
      fs.writeFileSync(inp, buf);
      return new Promise((resolve, reject) => {
        const p = spawn(ffmpeg, ['-y', '-v', 'error', '-i', inp, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-an', out]);
        const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timeout')); }, 25000);
        p.on('error', e => { clearTimeout(timer); reject(e); });
        p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(fs.readFileSync(out)) : reject(new Error('ffmpeg exit ' + code)); });
      }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
    }

    let running = 0;
    async function run(c, spec, target) {
      if (L.cooldown(c, 'gif', 6000)) return;
      if (running >= 2) return c.reply('⏳ Busy making GIFs, try again in a few seconds.');
      const [tpl, nekos, waifu] = spec;
      const a = '@' + c.sender, b = target ? '@' + target.n : '';
      const stars = () => '⭐'.repeat(L.rnd(1, 4)) + '🌟'; // 2-5 stars, the last one glows
      const caption = tpl.replace('{a}', a).replace('{b}', b).replace('{stars}', stars());
      const mentions = [c.senderJid, ...(target ? [target.jid] : [])];
      running++;
      try {
        const url = await findGif(nekos, waifu);
        if (!url) return c.reply(`${caption}\n\n_(no GIF available right now)_`, mentions);
        try {
          const video = await toMp4(await getBuf(url));
          return await c.sock.sendMessage(c.chat, { video, gifPlayback: true, caption, mentions }, { quoted: c.msg });
        } catch (e) { console.error('gif send failed, falling back to link:', e?.message || e); return c.reply(`${caption}\n\n${url}`, mentions); }
      } finally { running--; }
    }

    const ALIAS = { facecard: ['facecardstamp', 'fcs'] }; // .facecard stamp @user works too ("stamp" is ignored)
    for (const [name, spec] of Object.entries(WITH)) {
      def([name, ...(ALIAS[name] || [])], { g: true, usage: `${name} @user` }, c => {
        const t = c.target(); if (!t) return c.reply(`💞 *${name.toUpperCase()}*\n\n⚠️ Tag someone or reply to them.\nExample: ${L.P}${name} @user`);
        return run(c, spec, t);
      });
    }
    for (const [name, spec] of Object.entries(SOLO)) def(name, { usage: name }, c => run(c, spec, null));
    def('wave', { usage: 'wave [@user]' }, c => { const t = c.target(); return run(c, [t ? '👋 {a} waved at {b}!' : '👋 {a} says hi!', 'wave', 'wave'], t); });

    // ---------- .shoot @user — shoot your shot. They answer .yes or .no within 2 minutes ----------
    const shots = new Map(); // target number -> who shot
    def('shoot', { g: true, usage: 'shoot @user' }, async c => {
      const t = c.target(); if (!t) return c.reply(`🏹 *SHOOT YOUR SHOT*\n\n⚠️ Tag who you're shooting your shot at.\nExample: ${L.P}shoot @user`);
      if (t.n === c.sender) return c.reply("🤨 You can't shoot your shot at yourself.");
      if (L.cooldown(c, 'shoot', 20000)) return;
      shots.set(t.n, { from: c.sender, fromJid: c.senderJid, jid: t.jid, exp: Date.now() + 120000 });
      if (shots.size > 500) for (const [k, v] of shots) if (v.exp < Date.now()) shots.delete(k);
      await L.animate(c, ['🏹 *SHOOT YOUR SHOT*\n\n🏹 Taking aim…', '🏹 *SHOOT YOUR SHOT*\n\n💘 Shooting…'],
        `🏹 *SHOOT YOUR SHOT* 💘\n\n@${c.sender} shot their shot at @${t.n}!\n\n❓ @${t.n}, will you give @${c.sender} a chance?\n\nReply *${L.P}yes* or *${L.P}no* (2 min)`, [c.senderJid, t.jid]);
    });
    const answer = yes => c => {
      const s = shots.get(c.sender);
      if (!s || Date.now() > s.exp) return c.reply('🏹 Nobody has shot their shot at you (or it expired).');
      shots.delete(c.sender);
      const lines = yes ? ['💖 *{b}* gave *{a}* a chance!', '🥰 *{b}* said yes to *{a}*!', '💘 The shot landed! *{b}* is giving *{a}* a chance!'] : ['💔 *{b}* said no to *{a}*...', '😬 *{b}* turned *{a}* down. Ouch.', '🚫 *{b}* is not giving *{a}* a chance. Better luck next time!'];
      const txt = lines[L.rnd(0, lines.length - 1)].replace('{a}', '@' + s.from).replace('{b}', '@' + c.sender);
      return c.reply(`🏹 *SHOOT YOUR SHOT*\n\n${txt}`, [s.fromJid, c.senderJid]);
    };
    def('yes', { g: true, usage: 'yes' }, answer(true));
    def('no', { g: true, usage: 'no' }, answer(false));
  },
};
