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
      tickle: ['🤭 {a} tickled {b}!', 'tickle', 'poke'], highfive: ['🙌 {a} high-fived {b}!', 'highfive', 'highfive'], handhold: ['🤝 {a} is holding {b}\'s hand!', 'handhold', 'handhold'],
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
      const caption = tpl.replace('{a}', a).replace('{b}', b);
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

    for (const [name, spec] of Object.entries(WITH)) {
      def(name, { g: true, usage: `${name} @user` }, c => {
        const t = c.target(); if (!t) return c.reply(`💞 *${name.toUpperCase()}*\n\n⚠️ Tag someone or reply to them.\nExample: ${L.P}${name} @user`);
        return run(c, spec, t);
      });
    }
    for (const [name, spec] of Object.entries(SOLO)) def(name, { usage: name }, c => run(c, spec, null));
    def('wave', { usage: 'wave [@user]' }, c => { const t = c.target(); return run(c, [t ? '👋 {a} waved at {b}!' : '👋 {a} says hi!', 'wave', 'wave'], t); });
  },
};
