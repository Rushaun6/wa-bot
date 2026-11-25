// 🔊 .s: reply to a video (or send a video with ".s" as the caption) and the bot sends back a
// short clip WITH its sound (first 10 seconds, scaled down). This is a normal video message that plays its audio
// when tapped, not a native WhatsApp sound sticker (this Baileys version has no sound sticker support).
// Needs ffmpeg: run "npm i ffmpeg-static" in the repo. Drop this file next to index.js as cmd-sticker-audio.js.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');

const MAX_SECONDS = 10;     // length of the clip
const MAX_INPUT_SECONDS = 300; // refuse anything longer than this to save time and memory

// WhatsApp wraps some messages in these; look inside them
const unwrap = m => { m = m?.ephemeralMessage?.message || m; return m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m; };

// ffmpeg prints the streams it finds to stderr; used to tell whether the video has any sound
function ffmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve(err) : reject(new Error(err.slice(-300)))));
  });
}

module.exports = {
  category: '🎬 MEDIA',
  register(def, L) {
    const { P, cooldown } = L;

    async function run(c) {
      if (cooldown(c, 'sticker-audio', 15000)) return;

      let ffBin;
      try { ffBin = require('ffmpeg-static'); } catch {}
      if (!ffBin) return c.reply('⚠️ ffmpeg is not installed on the bot. Run `npm i ffmpeg-static` and redeploy.');

      // find the video: either the message itself, or the message it replies to
      const m = unwrap(c.msg.message) || {};
      const ci = m.extendedTextMessage?.contextInfo || m.videoMessage?.contextInfo;
      const quoted = unwrap(ci?.quotedMessage);
      let key, vid;
      if (m.videoMessage) { key = c.msg.key; vid = m.videoMessage; }
      else if (quoted?.videoMessage) {
        key = { remoteJid: c.chat, id: ci.stanzaId, participant: ci.participant, fromMe: false };
        vid = quoted.videoMessage;
      } else {
        return c.reply(`⚠️ Reply to a *video* with *${P}s*, or send a video with *${P}s* as the caption.`);
      }
      if ((vid.seconds || 0) > MAX_INPUT_SECONDS) return c.reply(`⚠️ That video is too long (max ${MAX_INPUT_SECONDS / 60} minutes).`);

      const id = crypto.randomBytes(6).toString('hex');
      const inFile = path.join(os.tmpdir(), `sa-${id}.mp4`), outFile = path.join(os.tmpdir(), `sa-${id}-out.mp4`);
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buf = await downloadMediaMessage({ key, message: { videoMessage: vid } }, 'buffer', {}, {
          reuploadRequest: c.sock.updateMediaMessage,
          logger: require('pino')({ level: 'silent' }),
        });
        fs.writeFileSync(inFile, buf);

        // 10 seconds max, max 480px wide, H.264 video + AAC audio so every phone plays it
        const log = await ffmpeg(ffBin, [
          '-y', '-i', inFile,
          '-t', String(MAX_SECONDS),
          '-map', '0:v:0', '-map', '0:a:0?',
          '-vf', "scale='min(480,iw)':-2",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '96k',
          '-movflags', '+faststart',
          outFile,
        ]);
        if (!/Stream #0:\d+.*Audio/.test(log)) return c.reply('🔇 That video has no sound, so there is nothing to keep. Send one with audio.');

        await c.sock.sendMessage(c.chat, {
          video: fs.readFileSync(outFile),
          mimetype: 'video/mp4',
          caption: `🔊 ${MAX_SECONDS}s`,
        }, { quoted: c.msg });
      } catch (e) {
        console.error('s -audio failed:', e?.message || e);
        await c.reply('⚠️ Could not make that clip. Try a different video.');
      } finally {
        for (const f of [inFile, outFile]) fs.rm(f, { force: true }, () => {});
      }
    }

    def(['s'], { usage: ['s (reply to a video)'] }, run);
  },
};
