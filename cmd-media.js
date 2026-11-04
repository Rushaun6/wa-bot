// MEDIA TOOLS: .sticker turns an image or short video into a WhatsApp sticker. .audio pulls the sound out of a video or voice note as mp3.
// Send the media with the command as its caption, or reply to a message that has the media.
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
let FF = process.env.FFMPEG_PATH || null;
if (!FF) { try { FF = require('ffmpeg-static'); } catch {} }
FF = FF || 'ffmpeg';

const unwrap = m => { m = m?.ephemeralMessage?.message || m; return m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m; };
const KINDS = ['imageMessage', 'videoMessage', 'audioMessage'];
const mimeExt = (mt, def) => (mt ? mt.split('/')[1]?.split(';')[0] : '') || def;

// finds the media on this message, or on the message it replies to
function findMedia(msg) {
  const m = unwrap(msg.message) || {};
  const quoted = unwrap(m.extendedTextMessage?.contextInfo?.quotedMessage || m.imageMessage?.contextInfo?.quotedMessage ||
    m.videoMessage?.contextInfo?.quotedMessage || m.audioMessage?.contextInfo?.quotedMessage) || {};
  for (const src of [m, quoted]) for (const k of KINDS) if (src[k]) return { node: src[k], kind: k.replace('Message', '') };
  return null;
}
async function download(node, kind) {
  const stream = await downloadContentFromMessage(node, kind), chunks = [];
  for await (const ch of stream) chunks.push(ch);
  return Buffer.concat(chunks);
}
// runs ffmpeg on a buffer through temp files (mp4 and similar can't be piped in). Times out after 30s.
function convert(input, inExt, outExt, args) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wab-'));
    const inp = path.join(dir, 'in.' + inExt), out = path.join(dir, 'out.' + outExt);
    fs.writeFileSync(inp, input);
    const p = spawn(FF, ['-y', '-v', 'error', '-i', inp, ...args, out]);
    const timer = setTimeout(() => p.kill('SIGKILL'), 30000);
    p.on('error', e => { clearTimeout(timer); fs.rmSync(dir, { recursive: true, force: true }); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      try { if (code === 0) resolve(fs.readFileSync(out)); else reject(new Error('ffmpeg exit ' + code)); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });
}

module.exports = {
  category: '🛠️ MEDIA TOOLS',
  register(def, L) {
    const { P } = L;

    def('sticker', { usage: 'sticker (send or reply to an image or video)' }, async c => {
      const src = findMedia(c.msg);
      if (!src || !['image', 'video'].includes(src.kind)) return c.reply(`🖼️ Send or reply to an *image* or *short video* with ${P}sticker`);
      try {
        const input = await download(src.node, src.kind);
        const ext = mimeExt(src.node.mimetype, src.kind === 'image' ? 'jpg' : 'mp4');
        const buf = await convert(input, ext, 'webp', ['-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
          '-t', '6', '-an', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-f', 'webp']);
        await c.sock.sendMessage(c.chat, { sticker: buf }, { quoted: c.msg });
      } catch (e) { console.error('sticker failed:', e.message); c.reply('⚠️ Could not make a sticker from that.'); }
    });

    def(['audio', 'mp3'], { usage: 'audio (reply to a video or voice note)' }, async c => {
      const src = findMedia(c.msg);
      if (!src || !['video', 'audio'].includes(src.kind)) return c.reply(`🎵 Reply to a *video* or *voice note* with ${P}audio`);
      try {
        const input = await download(src.node, src.kind);
        const ext = mimeExt(src.node.mimetype, src.kind === 'video' ? 'mp4' : 'ogg');
        const buf = await convert(input, ext, 'mp3', ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3']);
        await c.sock.sendMessage(c.chat, { audio: buf, mimetype: 'audio/mpeg', fileName: 'audio.mp3' }, { quoted: c.msg });
      } catch (e) { console.error('audio failed:', e.message); c.reply('⚠️ Could not extract audio from that.'); }
    });
  },
};
