// 🎵 .ms : build a SOUND STICKER from a picture (or video) plus ANY audio (song, voice note, mp3...).
//
//   1. reply to an audio with  .ms     -> the bot keeps it for you for 10 minutes
//   2. reply to an image or video with .ms   -> the bot sends the sound sticker
//   (works in the other order too: image/video first, then the audio)
//   Shortcut: send an image/video with ".ms" as the caption while replying to an audio, and it is done in one go.
//
//   .ms -fit     keep the whole picture (transparent bars) instead of zooming in to fill the square
//   .ms 6        use only the first 6 seconds of the audio (default and maximum 10)
//   .ms clear    forget what you sent me
//
// WhatsApp builds sound stickers from ANIMATED stickers, so a still image becomes a short looping animation. A video is used
// as the picture only: its own sound is dropped and replaced by your audio (use .s if you want a video's own sound).
// Reuses the sound-sticker engine in cmd-sticker-audio.js (keep both files in the same folder).
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const SA = require('./cmd-sticker-audio.js')._t;

const TTL = 10 * 60 * 1000;                       // how long a half-finished sticker is remembered
const MAX_AUDIO_BYTES = 20 * 1024 * 1024, MAX_IMAGE_BYTES = 20 * 1024 * 1024, MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const pending = new Map();                        // "chat|sender" -> { role: 'audio'|'visual', buf, kind, mime, at }

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
function classify(x) { // one message body -> what it is for us
  if (!x) return null;
  if (x.audioMessage) return { role: 'audio', type: 'audioMessage', media: x.audioMessage };
  const d = x.documentMessage, mt = String(d?.mimetype || '');
  if (d && mt.startsWith('audio/')) return { role: 'audio', type: 'documentMessage', media: d };
  if (x.imageMessage) return { role: 'visual', kind: 'image', type: 'imageMessage', media: x.imageMessage };
  if (x.videoMessage) return { role: 'visual', kind: 'video', type: 'videoMessage', media: x.videoMessage };
  if (x.stickerMessage) return x.stickerMessage.isAnimated ? { role: 'bad', why: 'That is an animated sticker. Send the original video instead.' } : { role: 'visual', kind: 'image', type: 'stickerMessage', media: x.stickerMessage };
  if (d && mt.startsWith('image/')) return { role: 'visual', kind: 'image', type: 'documentMessage', media: d };
  if (d && mt.startsWith('video/')) return { role: 'visual', kind: 'video', type: 'documentMessage', media: d };
  return null;
}

module.exports = {
  category: '🎬 MEDIA',
  register(def, L) {
    const { P, cooldown } = L;

    // the message itself (image/video with ".ms" as caption) and/or the message it replies to
    function findParts(c) {
      const m = SA.unwrap(c.msg.message) || {};
      const ci = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.documentMessage?.contextInfo;
      const own = classify(m), q = ci?.quotedMessage ? classify(SA.unwrap(ci.quotedMessage)) : null;
      return {
        ci,
        own: own && { ...own, key: c.msg.key },
        quoted: q && { ...q, key: { remoteJid: c.chat, id: ci.stanzaId, participant: ci.participant, fromMe: false } },
      };
    }

    async function download(c, part) {
      const cap = part.role === 'audio' ? MAX_AUDIO_BYTES : part.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (Number(part.media.fileLength || 0) > cap) throw new Error('TOO_BIG');
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const buf = await downloadMediaMessage({ key: part.key, message: { [part.type]: part.media } }, 'buffer', {}, {
        reuploadRequest: c.sock.updateMediaMessage, logger: require('pino')({ level: 'silent' }),
      });
      if (buf.length > cap) throw new Error('TOO_BIG');
      return { role: part.role, kind: part.kind, mime: String(part.media.mimetype || '').split(';')[0], buf, at: Date.now() };
    }

    async function build(c, vis, aud, ci, secsArg, crop) {
      let ffBin; try { ffBin = require('ffmpeg-static'); } catch {}
      if (!ffBin) return c.reply('⚠️ ffmpeg is not installed on the bot. Run `npm i ffmpeg-static` and redeploy.');
      const id = crypto.randomBytes(6).toString('hex'), tmp = x => path.join(os.tmpdir(), `ms-${id}-${x}`);
      const visFile = tmp('vis.' + (vis.kind === 'video' ? 'mp4' : EXT[vis.mime] || 'jpg')), audFile = tmp('aud.bin'), webpFile = tmp('o.webp'), oggFile = tmp('o.ogg');
      try {
        fs.writeFileSync(visFile, vis.buf); fs.writeFileSync(audFile, aud.buf);
        const info = await SA.ffmpeg(ffBin, ['-i', audFile], { allowFail: true });
        if (!SA.hasAudio(info)) return c.reply('⚠️ I could not find any sound in that audio file.');
        const len = Math.min(secsArg || SA.MAX_SECONDS, SA.MAX_SECONDS, SA.durationOf(info) || SA.MAX_SECONDS), seconds = Math.max(1, Math.round(len));
        const webp = await SA.makeWebp(ffBin, visFile, webpFile, len, crop, vis.kind === 'image' ? ['-loop', '1', '-framerate', String(2 / len)] : [], vis.kind === 'image'); // a still = just 2 frames spread over the audio length: tiny file, still an animated sticker
        const ogg = await SA.makeOgg(ffBin, audFile, oggFile, len);
        try {
          await SA.sendSoundSticker(c, webp, ogg, seconds, ci);
        } catch (e) {
          console.error('ms sound sticker failed:', e?.stack || e?.message || e);
          await c.sock.sendMessage(c.chat, { sticker: webp, isAnimated: true }, { quoted: c.msg });
          await c.reply('⚠️ Could not attach the sound, so this is a normal animated sticker.');
        }
      } finally { for (const f of [visFile, audFile, webpFile, oggFile]) fs.rm(f, { force: true }, () => {}); }
    }

    def(['ms', 'musicsticker'], { usage: ['ms (reply to an audio, then reply to an image/video)', 'ms -fit | ms 6 | ms clear'] }, async c => {
      const key = c.chat + '|' + c.sender, now = Date.now();
      for (const [k, v] of pending) if (now - v.at > TTL) pending.delete(k);
      const flags = c.args.map(a => a.toLowerCase());
      if (flags.includes('clear')) { pending.delete(key); return c.reply('🧹 Cleared.'); }
      const crop = !flags.some(a => /^-{1,2}(f|fit)$/.test(a)), secsArg = flags.map(a => /^\d+$/.test(a) ? +a : 0).find(Boolean);

      const { own, quoted, ci } = findParts(c);
      const parts = [own, quoted].filter(Boolean), bad = parts.find(p => p.role === 'bad');
      if (bad) return c.reply('⚠️ ' + bad.why);
      const vPart = parts.find(p => p.role === 'visual'), aPart = parts.find(p => p.role === 'audio');
      if (!vPart && !aPart) return c.reply(`🎵 *MUSIC STICKER*\n\n1. Reply to an *audio* with *${P}ms*\n2. Reply to an *image or video* with *${P}ms*\n\nI send you a sticker that plays your audio when tapped.\nOptions: *${P}ms -fit*, *${P}ms 6* (seconds), *${P}ms clear*`);

      try {
        let vis, aud;
        if (vPart && aPart) { [vis, aud] = await Promise.all([download(c, vPart), download(c, aPart)]); }
        else {
          const got = await download(c, vPart || aPart), other = pending.get(key);
          if (!other || other.role === got.role) { // nothing to pair it with yet: remember it
            pending.set(key, got);
            return c.reply(got.role === 'audio' ? '🎵 Got your audio. Now reply to an *image or video* with *' + P + 'ms*.'
              : `🖼️ Got your ${got.kind}. Now reply to an *audio* with *${P}ms*.`);
          }
          [vis, aud] = got.role === 'visual' ? [got, other] : [other, got];
        }
        if (cooldown(c, 'music-sticker', 15000)) return;
        pending.delete(key);
        await build(c, vis, aud, ci, secsArg, crop);
      } catch (e) {
        console.error('ms failed:', e?.message || e);
        await c.reply(e?.message === 'TOO_BIG' ? '⚠️ That is too big or too detailed for a sticker. Try a smaller picture or a shorter video.' : '⚠️ Could not make that sticker. Try a different image or audio.');
      }
    });
  },
};
