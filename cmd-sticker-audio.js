// 🔊 .s : reply to a video (or send a video with ".s" as the caption) and the bot sends a native WhatsApp
// SOUND STICKER: an animated sticker with the video's audio attached (speaker badge, tap to play).
//
//   .s            sound sticker, ZOOMED IN to fill the whole square (centre-cropped, no empty bars)
//   .s -fit       keep the whole frame instead (transparent bars at the sides)     .s -audio  accepted, same as .s
//   .s 5          only the first 5 seconds (1 to MAX_SECONDS)
//   .s -clip      the OLD behaviour: a normal video message with sound (for people on old WhatsApp)
//
// HOW IT WORKS (researched from several Baileys/whatsmeow forks, see the notes at the bottom):
// Baileys 6.7.18 has no sound sticker fields, so we build the protobuf ourselves:
//   Message.audioStickerMessage (field 134, FutureProofMessage) -> message (1) -> Message.stickerMessage (26)
//   -> StickerMessage.audioMessage (field 26) = the Opus audio.
// A tiny, inert patch on proto.Message.encode appends those extra bytes only for messages we tag.
// Needs ffmpeg with libwebp + libopus (ffmpeg-static has both): "npm i ffmpeg-static". Drop-in for index.js's folder.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');

const MAX_SECONDS = Number(process.env.SOUND_STICKER_MAX || 10); // longest clip (WhatsApp's own limit is about 10s)
const MAX_INPUT_SECONDS = 300;           // refuse longer source videos
const MAX_INPUT_BYTES = 50 * 1024 * 1024; // refuse bigger downloads
const WEBP_TARGET = 500 * 1024;          // WhatsApp's animated sticker size target
const WEBP_HARD_MAX = 950 * 1024;        // above ~1 MB the upload fails (HTTP 413)
const SIZE = 512;
// quality ladder: first one that fits WEBP_TARGET wins
const LADDER = [{ fps: 15, q: 65 }, { fps: 12, q: 50 }, { fps: 10, q: 40 }, { fps: 8, q: 30 }, { fps: 8, q: 20 }, { fps: 6, q: 12 }];

// WhatsApp wraps some messages in these; look inside them
const unwrap = m => { m = m?.ephemeralMessage?.message || m; return m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m; };

// ---------- ffmpeg ----------
function ffmpeg(bin, args, { allowFail = false, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', ...args]);
    let err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); code === 0 || allowFail ? resolve(err) : reject(new Error(err.slice(-300))); });
  });
}
const hasAudio = log => /Stream #\d+:\d+.*Audio:/.test(log);
const durationOf = log => { const r = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log); return r ? +r[1] * 3600 + +r[2] * 60 + +r[3] : 0; };

// animated WebP, always a SIZE x SIZE canvas. crop=true fills it, otherwise the frame is kept and padded transparent.
function webpFilters(fps, crop) {
  const fit = crop
    ? `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SIZE}:${SIZE}`
    : `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos`;
  // some static ffmpeg builds don't know the word "transparent", so try a few spellings of "fully transparent black"
  return (crop ? [''] : [',format=rgba,pad=SIZE:SIZE:(ow-iw)/2:(oh-ih)/2:color=black@0', ',format=rgba,pad=SIZE:SIZE:(ow-iw)/2:(oh-ih)/2:color=0x00000000'])
    .map(pad => `${fit}${fps ? ',fps=' + fps : ''}${pad.replace(/SIZE/g, SIZE)}${crop ? ',format=rgba' : ''}`);
}
async function makeWebp(bin, inFile, outFile, secs, crop, inArgs = [], still = false) { // still: input is one picture looped by inArgs (no fps filter, only quality steps down)
  let best = null, lastErr;
  for (const { fps, q } of (still ? LADDER.map(r => ({ ...r, fps: 0 })) : LADDER)) {
    let buf = null;
    for (const vf of webpFilters(fps, crop)) {
      try {
        await ffmpeg(bin, ['-y', ...inArgs, '-i', inFile, '-t', String(secs), '-an', '-vf', vf, '-c:v', 'libwebp', '-loop', '0',
          '-lossless', '0', '-quality', String(q), '-compression_level', '4', '-preset', 'default', outFile]);
        buf = fs.readFileSync(outFile); if (buf.length) break;
      } catch (e) { lastErr = e; }
    }
    if (!buf?.length) continue;
    if (!best || buf.length < best.length) best = buf;
    if (buf.length <= WEBP_TARGET) return buf;
  }
  if (best && best.length <= WEBP_HARD_MAX) return best;
  throw best ? new Error('TOO_BIG') : (lastErr || new Error('webp failed'));
}
// Opus in Ogg. These exact flags matter: without them the sticker shows up but the sound will not play.
async function makeOgg(bin, inFile, outFile, secs) {
  await ffmpeg(bin, ['-y', '-i', inFile, '-t', String(secs), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '48000',
    '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-compression_level', '10', '-frame_duration', '20',
    '-avoid_negative_ts', 'make_zero', '-f', 'ogg', outFile]);
  const buf = fs.readFileSync(outFile);
  if (!buf.length || buf.slice(0, 4).toString() !== 'OggS') throw new Error('bad ogg');
  return buf;
}

// ---------- protobuf bits Baileys 6.7.18 does not have ----------
const TAIL = Symbol.for('econobot.protoTail'); // [[fieldNumber, payload], ...] appended to a message when it is encoded
const varint = n => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return Buffer.from(o); };
const frame = (no, payload) => Buffer.concat([varint(no * 8 + 2), varint(payload.length), Buffer.from(payload)]); // length-delimited field

function patchProto(proto) {
  const M = proto?.Message;
  if (!M?.encode) return false;
  if (M.encode.__tail) return true; // already patched (idempotent)
  const orig = M.encode;
  // Works for the top-level call (Baileys: encode(m).finish()) and for nested calls (encode(m, writer), e.g. inside
  // deviceSentMessage in DMs): always append through the writer. Messages without TAIL pass straight through untouched.
  const patched = function (m, w) {
    const out = orig.call(this, m, w);
    const tail = m && m[TAIL];
    if (tail) for (const [no, payload] of tail) out.uint32((no * 8 + 2) >>> 0).bytes(payload);
    return out;
  };
  patched.__tail = true;
  M.encode = patched;
  return true;
}

// the quote shown above our sticker (the .s message the person sent)
function quoteInfo(B, c, expiration) {
  const q = c.msg, norm = B.normalizeMessageContent(q.message), type = B.getContentType(norm);
  const info = { stanzaId: q.key.id, participant: B.jidNormalizedUser(q.key.participant || q.key.remoteJid) };
  if (type) { const v = norm[type]; info.quotedMessage = { [type]: v && typeof v === 'object' ? { ...v, contextInfo: undefined } : v }; }
  if (expiration) info.expiration = expiration;
  return info;
}

async function sendSoundSticker(c, webp, ogg, seconds, ci) {
  const B = require('@whiskeysockets/baileys'), { proto } = B;
  if (!patchProto(proto)) throw new Error('proto.Message.encode missing');
  const logger = require('pino')({ level: 'silent' }), upload = c.sock.waUploadToServer;

  // upload both files (encrypted, separately), exactly like a normal sticker and a normal audio message
  const st = (await B.prepareWAMessageMedia({ sticker: webp, mimetype: 'image/webp', isAnimated: true, width: SIZE, height: SIZE }, { upload, logger })).stickerMessage;
  const au = (await B.prepareWAMessageMedia({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: false, seconds }, { upload, logger })).audioMessage;
  st.stickerSentTs = Date.now();
  try { st.contextInfo = proto.ContextInfo.fromObject(quoteInfo(B, c, ci?.expiration)); } catch (e) { console.error('s: quote skipped:', e?.message || e); }

  const audioBytes = proto.Message.AudioMessage.encode(au).finish();
  const stickerBytes = Buffer.concat([Buffer.from(proto.Message.StickerMessage.encode(st).finish()), frame(26, audioBytes)]); // StickerMessage.audioMessage = 26
  const inner = frame(26, stickerBytes);   // Message { stickerMessage = 26 }
  const fpm = frame(1, inner);             // FutureProofMessage { message = 1 }
  const outer = proto.Message.create({});  // Message { audioStickerMessage = 134 }
  outer[TAIL] = [[134, fpm]];

  const id = (B.generateMessageIDV2 || B.generateMessageID)(c.sock.user?.id);
  await c.sock.relayMessage(c.chat, outer, { messageId: id });
}

// ---------- the command ----------
module.exports = {
  category: '🎬 MEDIA',
  _t: { ffmpeg, makeWebp, makeOgg, sendSoundSticker, hasAudio, durationOf, unwrap, MAX_SECONDS }, // reused by cmd-music-sticker.js
  register(def, L) {
    const { P, cooldown } = L;
    try { patchProto(require('@whiskeysockets/baileys').proto); } catch (e) { console.error('s: proto patch failed:', e?.message || e); }

    function findSource(c) {
      const m = unwrap(c.msg.message) || {};
      const ci = m.extendedTextMessage?.contextInfo || m.videoMessage?.contextInfo || m.documentMessage?.contextInfo;
      const pick = x => x?.videoMessage ? { kind: 'videoMessage', media: x.videoMessage }
        : String(x?.documentMessage?.mimetype || '').startsWith('video/') ? { kind: 'documentMessage', media: x.documentMessage } : null;
      const own = pick(m);
      if (own) return { ...own, key: c.msg.key, ci };
      const q = pick(unwrap(ci?.quotedMessage));
      return q && { ...q, key: { remoteJid: c.chat, id: ci.stanzaId, participant: ci.participant, fromMe: false }, ci };
    }

    async function run(c) {
      let ffBin;
      try { ffBin = require('ffmpeg-static'); } catch {}
      if (!ffBin) return c.reply('⚠️ ffmpeg is not installed on the bot. Run `npm i ffmpeg-static` and redeploy.');

      const src = findSource(c);
      if (!src) return c.reply(`⚠️ Reply to a *video* with *${P}s*, or send a video with *${P}s* as the caption.\n\nOptions: *${P}s -fit*, *${P}s 5* (seconds), *${P}s -clip* (plain video with sound)`);
      if ((src.media.seconds || 0) > MAX_INPUT_SECONDS) return c.reply(`⚠️ That video is too long (max ${MAX_INPUT_SECONDS / 60} minutes).`);
      if (Number(src.media.fileLength || 0) > MAX_INPUT_BYTES) return c.reply('⚠️ That video file is too big (max 50 MB).');

      const flags = c.args.map(a => a.toLowerCase());
      const crop = !flags.some(a => /^-{1,2}(f|fit)$/.test(a)), clip = flags.some(a => /^-{1,2}(clip|video)$/.test(a));
      const n = flags.map(a => /^\d+$/.test(a) ? +a : 0).find(Boolean);
      const secs = Math.min(MAX_SECONDS, Math.max(1, n || MAX_SECONDS));
      if (cooldown(c, 'sticker-audio', 15000)) return;

      const id = crypto.randomBytes(6).toString('hex'), tmp = x => path.join(os.tmpdir(), `sa-${id}-${x}`);
      const inFile = tmp('in.mp4'), webpFile = tmp('out.webp'), oggFile = tmp('out.ogg'), clipFile = tmp('clip.mp4');
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buf = await downloadMediaMessage({ key: src.key, message: { [src.kind]: src.media } }, 'buffer', {}, {
          reuploadRequest: c.sock.updateMediaMessage, logger: require('pino')({ level: 'silent' }),
        });
        fs.writeFileSync(inFile, buf);

        const info = await ffmpeg(ffBin, ['-i', inFile], { allowFail: true }); // no output file: ffmpeg just lists the streams
        if (!hasAudio(info)) return c.reply('🔇 That video has no sound, so there is nothing to attach. Send one with audio.');
        const len = Math.min(secs, durationOf(info) || secs), seconds = Math.max(1, Math.round(len));

        if (clip) { // old behaviour: normal video message that plays its sound when tapped
          await ffmpeg(ffBin, ['-y', '-i', inFile, '-t', String(secs), '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(480,iw)':-2",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', clipFile]);
          return void await c.sock.sendMessage(c.chat, { video: fs.readFileSync(clipFile), mimetype: 'video/mp4', caption: `🔊 ${secs}s` }, { quoted: c.msg });
        }

        const [webp, ogg] = [await makeWebp(ffBin, inFile, webpFile, len, crop), await makeOgg(ffBin, inFile, oggFile, len)];
        try {
          await sendSoundSticker(c, webp, ogg, seconds, src.ci);
        } catch (e) { // never leave the person with nothing: send the animated sticker without its sound
          console.error('s sound sticker failed:', e?.stack || e?.message || e);
          await c.sock.sendMessage(c.chat, { sticker: webp, isAnimated: true }, { quoted: c.msg });
          await c.reply(`⚠️ Could not attach the sound, so this is a normal animated sticker. Try *${P}s -clip* for a video with sound.`);
        }
      } catch (e) {
        console.error('s failed:', e?.message || e);
        await c.reply(e?.message === 'TOO_BIG' ? '⚠️ That clip is too detailed to fit in a sticker. Try a shorter one, like *' + P + 's 4*.' : '⚠️ Could not make that sticker. Try a different video.');
      } finally {
        for (const f of [inFile, webpFile, oggFile, clipFile]) fs.rm(f, { force: true }, () => {});
      }
    }

    def(['s'], { usage: ['s (reply to a video) - sound sticker', 's -fit | s 5 | s -clip'] }, run);
  },
};

// RESEARCH NOTES (so the next person does not have to redo it)
// * Wire format confirmed by WhatsApp Web's protobuf diff (Message.audioStickerMessage = 134, StickerMessage.audioMessage = 26)
//   and by working implementations: flextofc804/proyects-bot- PR #101 (Baileys 6.7 runtime patch), idlanyor/zapota PR #10
//   (raw unknown fields, phone-tested), moothz/whatsgoapi + ravena-ai (whatsmeow), oxidezap/whatsapp-rust PR #2110.
// * Send through relayMessage so the stanza type stays "text"; type="media" makes phones silently drop it (zapota).
// * Opus flags (-vbr on -compression_level 10 -frame_duration 20 -avoid_negative_ts make_zero) are mandatory (zapota).
// * Keep the WebP under 1 MB or the upload fails with 413; 500 KB is WhatsApp's own target.
// * A reply to a sound sticker arrives as a plain stickerMessage with audioMessage at field 26 (no 134 wrapper) (montx2 PR #35).
// * Recipients need a recent WhatsApp (feature rolled out Nov 2026); older apps just show a normal sticker or nothing.
