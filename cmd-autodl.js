// 📥 AUTO DOWNLOADER: TikTok, Instagram and Pinterest links.
//
//   .autodl on            turn it on in THIS chat (group admins only in groups; anyone in a private chat)
//   .autodl off           turn it off          .autodl on tiktok   /  .autodl off pinterest   (pick sites)
//   .autodl               show what is on
//   .dl <link>            download one link right now (or reply to a message that has a link). Works even when autodl is off.
//
// Once it is on, anyone posting a TikTok / Instagram / Pinterest link gets the media posted straight back (reply to their message).
// While working the bot reacts to the link with ⏳, and with ❌ if it could not get it. It never posts the source link, so it can not loop.
//
// Needs the 3-line link hook in index.js (see the patch notes) and nothing else: no extra npm packages (ffmpeg-static is already there).
// OPTIONAL but recommended for Instagram/Pinterest: a self-hosted cobalt instance, used as a fallback for all three sites:
//   COBALT_API_URL=https://your-cobalt.up.railway.app     COBALT_API_KEY=...   (leave the key out if you did not turn auth on)
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const https = require('https'), http = require('http'), zlib = require('zlib');
const { spawn } = require('child_process');

const MAX_VIDEO = 64 * 1024 * 1024, MAX_IMAGE = 20 * 1024 * 1024, MAX_ITEMS = 6;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
// Instagram only serves its embed page to requests that look like a page load (since 2026-10-15)
const NAV = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1', 'Upgrade-Insecure-Requests': '1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- tiny HTTP client ----------
// Not fetch(): Node's fetch forces "Sec-Fetch-Mode: cors" and Instagram rejects that. node:https sends the headers exactly as given.
const net = {
  get(url, { headers = {}, maxBytes = 5e6, nav = false, method = 'GET', body, timeout = 25000, hops = 5 } = {}) {
    return new Promise((resolve, reject) => {
      let u; try { u = new URL(url); } catch { return reject(new Error('bad url')); }
      if (!/^https?:$/.test(u.protocol)) return reject(new Error('bad protocol'));
      const h = { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br', ...(nav ? NAV : {}), ...headers };
      let done = false; const fail = e => { if (!done) { done = true; reject(e); } };
      const req = (u.protocol === 'https:' ? https : http).request(u, { method, headers: h, timeout }, res => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && hops > 0) {
          res.resume(); done = true;
          return resolve(net.get(new URL(loc, u).href, { headers, maxBytes, nav, timeout, hops: hops - 1 }));
        }
        if (Number(res.headers['content-length']) > maxBytes) { req.destroy(); return fail(new Error('TOO_BIG')); }
        const enc = res.headers['content-encoding'];
        const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks = []; let n = 0;
        stream.on('data', d => { n += d.length; if (n > maxBytes) { req.destroy(); fail(new Error('TOO_BIG')); } else chunks.push(d); });
        stream.on('end', () => { if (!done) { done = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url: u.href }); } });
        stream.on('error', fail);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', fail);
      if (body) req.write(body);
      req.end();
    });
  },
};
const okUrl = u => { try { const x = new URL(u); if (process.env.COBALT_API_URL && x.host === new URL(process.env.COBALT_API_URL).host) return true;
  return x.protocol === 'https:' && !/^(localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(x.hostname); } catch { return false; } };
const unesc = s => s.replace(/\\+u0026/gi, '&').replace(/\\+u002F/gi, '/').replace(/\\+\//g, '/').replace(/\\"/g, '"').replace(/\\/g, '');
const meta = (html, prop) => { const r = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html); return r && r[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'"); };

// ---------- site extractors: each returns { items: [{ type: 'video'|'image', url, hls? }], caption } ----------
async function tiktok(url) { // TikWM public API: no watermark, also photo slideshows
  const call = async () => { const r = await net.get('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), { maxBytes: 2e6, headers: { Accept: 'application/json' } }); try { return JSON.parse(r.body.toString()); } catch { return null; } };
  let j = await call();
  if (j && j.code !== 0 && /limit/i.test(j.msg || '')) { await sleep(1400); j = await call(); } // free tier: 1 request per second
  if (!j || j.code !== 0 || !j.data) throw new Error('tikwm: ' + (j?.msg || 'no answer'));
  const d = j.data, abs = u => u && (/^https?:/.test(u) ? u : 'https://www.tikwm.com' + u);
  const caption = [d.author?.unique_id && '@' + d.author.unique_id, d.title].filter(Boolean).join('\n').slice(0, 300);
  if (d.images?.length) return { items: d.images.slice(0, MAX_ITEMS).map(u => ({ type: 'image', url: abs(u) })), caption };
  const best = d.hdplay && (!d.hd_size || d.hd_size < 40e6) ? d.hdplay : (d.play || d.wmplay);
  if (!best) throw new Error('tikwm: no video url');
  return { items: [{ type: 'video', url: abs(best) }], caption };
}

function igMedia(n) { // one Instagram media node (GraphQL or API shaped) -> items
  const kids = n.edge_sidecar_to_children?.edges?.map(e => e.node) || n.carousel_media;
  if (kids?.length) return kids.flatMap(igMedia);
  const v = n.video_url || n.video_versions?.[0]?.url, i = n.display_url || n.image_versions2?.candidates?.[0]?.url;
  return v ? [{ type: 'video', url: v }] : i ? [{ type: 'image', url: i }] : [];
}
function igFind(o, d = 0) {
  if (!o || typeof o !== 'object' || d > 9) return null;
  if (o.shortcode_media) return o.shortcode_media;
  if (o.video_url || o.edge_sidecar_to_children || o.carousel_media) return o;
  for (const k of Object.keys(o)) { const r = igFind(o[k], d + 1); if (r) return r; }
  return null;
}
function igParse(html) { // exported for tests
  const j = s => { try { return JSON.parse(s); } catch { return null; } };
  const cm = /"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html);
  const node = cm && igFind(j(j('"' + cm[1] + '"')) || {});
  if (node) {
    const items = igMedia(node);
    if (items.length) return { items, owner: node.owner?.username, caption: node.edge_media_to_caption?.edges?.[0]?.node?.text };
  }
  const v = /video_url\\*"\s*:\s*\\*"(https:.*?)\\*"/.exec(html)?.[1] || meta(html, 'og:video:secure_url') || meta(html, 'og:video');
  if (v) return { items: [{ type: 'video', url: unesc(v) }] };
  const i = /display_url\\*"\s*:\s*\\*"(https:.*?)\\*"/.exec(html)?.[1];
  return i ? { items: [{ type: 'image', url: unesc(i) }] } : null;
}
async function instagram(url) {
  if (/instagram\.com\/share\//i.test(url)) url = (await net.get(url, { nav: true, maxBytes: 3e6 })).url; // share links redirect to the real post
  const code = /instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i.exec(url)?.[1];
  if (!code) throw new Error('instagram: no post code');
  const r = await net.get(`https://www.instagram.com/p/${code}/embed/captioned/`, { nav: true, maxBytes: 6e6 });
  const got = r.status === 200 && igParse(r.body.toString('utf8'));
  if (!got) throw new Error('instagram: nothing public in the embed (private post, login wall or blocked)');
  const caption = [got.owner && '@' + got.owner, got.caption].filter(Boolean).join('\n').slice(0, 300);
  return { items: got.items.slice(0, MAX_ITEMS), caption };
}

async function pinterest(url) {
  const r = await net.get(url, { nav: true, maxBytes: 6e6 }); // also follows pin.it short links
  if (!/\/pin\/\d+/.test(r.url)) throw new Error('pinterest: not a pin');
  if (r.status !== 200) throw new Error('pinterest: HTTP ' + r.status);
  const html = r.body.toString('utf8').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const t = (meta(html, 'og:title') || '').trim(), caption = /^(pin|pinterest)\b/i.test(t) ? '' : t.slice(0, 200);
  const mp4 = /https:\/\/v\d*\.pinimg\.com\/[^"'\\\s<>]+?\.mp4/.exec(html)?.[0] || meta(html, 'og:video:url') || meta(html, 'og:video');
  if (mp4) return { items: [{ type: 'video', url: mp4 }], caption };
  const m3u8 = /https:\/\/v\d*\.pinimg\.com\/[^"'\\\s<>]+?\.m3u8/.exec(html)?.[0];
  if (m3u8) { // the HLS playlist has a sibling plain mp4 on most pins: try it, otherwise let ffmpeg stitch the playlist
    const guess = m3u8.replace('/hls/', '/720p/').replace(/\.m3u8$/, '.mp4');
    const ok = await net.get(guess, { method: 'HEAD', maxBytes: 1e5 }).then(x => x.status === 200).catch(() => false);
    return { items: [ok ? { type: 'video', url: guess } : { type: 'video', url: m3u8, hls: true }], caption };
  }
  if (/og:video|"is_video":\s*true|video_list|\.m3u8/i.test(html)) throw new Error('pinterest: video pin, but the stream is hidden from anonymous visitors');
  const img = meta(html, 'og:image');
  if (!img) throw new Error('pinterest: no media found');
  const orig = img.replace(/\/\d+x\d*\//, '/originals/');
  const good = orig !== img && await net.get(orig, { method: 'HEAD', maxBytes: 1e5 }).then(x => x.status === 200).catch(() => false);
  return { items: [{ type: 'image', url: good ? orig : img }], caption };
}

async function cobalt(url) { // optional fallback for all three sites (your own instance; public ones need keys)
  const base = process.env.COBALT_API_URL;
  if (!base) throw new Error('cobalt not configured');
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (process.env.COBALT_API_KEY) headers.Authorization = 'Api-Key ' + process.env.COBALT_API_KEY;
  const r = await net.get(base.replace(/\/+$/, '') + '/', { method: 'POST', headers, body: JSON.stringify({ url, videoQuality: '720', filenameStyle: 'basic' }), maxBytes: 1e6, timeout: 40000 });
  let j; try { j = JSON.parse(r.body.toString()); } catch { throw new Error('cobalt: bad answer (HTTP ' + r.status + ')'); }
  if (j.status === 'tunnel' || j.status === 'redirect') return { items: [{ type: /\.(jpe?g|png|webp)$/i.test(j.filename || '') ? 'image' : 'video', url: j.url }], caption: '' };
  if (j.status === 'picker' && j.picker?.length) return { items: j.picker.slice(0, MAX_ITEMS).map(p => ({ type: p.type === 'photo' ? 'image' : 'video', url: p.url })), caption: '' };
  throw new Error('cobalt: ' + (j.error?.code || j.status || 'failed'));
}

// ---------- link detection ----------
const SITES = {
  tiktok: { re: /https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[\w-]+|(?:www\.|m\.)?tiktok\.com\/(?:t\/[\w-]+|@[\w.-]+\/(?:video|photo)\/\d+|v\/\d+))[^\s<>"']*/i, chain: [tiktok, cobalt] },
  instagram: { re: /https?:\/\/(?:www\.)?instagram\.com\/(?:(?:[\w.]+\/)?(?:p|reels?|tv)|share(?:\/(?:p|reel|tv))?)\/[\w-]+[^\s<>"']*/i, chain: [instagram, cobalt] },
  pinterest: { re: /https?:\/\/(?:(?:[\w-]+\.)?pinterest\.[a-z.]+\/pin\/\d+|pin\.it\/[\w-]+)[^\s<>"']*/i, chain: [pinterest, cobalt] },
};
function findLink(text) {
  for (const [site, s] of Object.entries(SITES)) { const m = s.re.exec(text || ''); if (m) return { site, url: m[0].replace(/[).,!?;:]+$/, '') }; }
  return null;
}

// ---------- download + send ----------
const hlsToMp4 = (bin, src) => new Promise((resolve, reject) => {
  const out = path.join(os.tmpdir(), 'dl-' + crypto.randomBytes(6).toString('hex') + '.mp4');
  const p = spawn(bin, ['-hide_banner', '-nostdin', '-y', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-i', src, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out]);
  let err = ''; const t = setTimeout(() => p.kill('SIGKILL'), 90000);
  p.stderr.on('data', d => { err += d; });
  p.on('error', e => { clearTimeout(t); reject(e); });
  p.on('close', code => { clearTimeout(t); try { if (code !== 0) throw new Error(err.slice(-200)); const b = fs.readFileSync(out); if (b.length > MAX_VIDEO) throw new Error('TOO_BIG'); resolve(b); } catch (e) { reject(e); } finally { fs.rm(out, { force: true }, () => {}); } });
});
async function fetchItem(it) {
  if (it.hls) { let bin; try { bin = require('ffmpeg-static'); } catch {} if (!bin) throw new Error('ffmpeg missing'); return hlsToMp4(bin, it.url); }
  if (!okUrl(it.url)) throw new Error('blocked url');
  const r = await net.get(it.url, { maxBytes: it.type === 'video' ? MAX_VIDEO : MAX_IMAGE, timeout: 90000 });
  if (r.status !== 200 || !r.body.length) throw new Error('download HTTP ' + r.status);
  return r.body;
}
async function resolve(link) {
  const errs = [];
  for (const fn of SITES[link.site].chain) {
    try { const r = await fn(link.url); if (r?.items?.length) return r; } catch (e) { errs.push(e?.message || String(e)); }
  }
  throw new Error(errs.filter(e => e !== 'cobalt not configured').join(' | ') || 'no extractor worked');
}

let active = 0;
const lastChat = new Map(), recent = new Map();
async function deliver({ sock, chat, msg, link, manual, reply }) {
  if (active >= 2) { if (manual) reply('⏳ Two downloads are already running, try again in a moment.'); return; }
  active++;
  const react = t => sock.sendMessage(chat, { react: { text: t, key: msg.key } }).catch(() => {});
  react('⏳');
  try {
    const res = await resolve(link);
    let first = true;
    for (const it of res.items) {
      if (!first) await sleep(700); // little pause between the pictures of a slideshow / carousel
      const buf = await fetchItem(it), caption = first ? res.caption || undefined : undefined;
      await sock.sendMessage(chat, it.type === 'image' ? { image: buf, caption } : { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
      first = false;
    }
    react('');
  } catch (e) {
    console.error(`autodl ${link.site} failed:`, e?.message || e);
    react('❌');
    if (manual) reply(e?.message === 'TOO_BIG' ? '⚠️ That file is too big to send (max 64 MB).' : `⚠️ Could not download that ${link.site} link. It may be private, removed, or blocked.`);
  } finally { active--; }
}

// ---------- settings + commands ----------
const msgText = m => { m = m?.ephemeralMessage?.message || m; return m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || ''; };

module.exports = {
  category: '📥 DOWNLOADER',
  _t: { net, findLink, igParse, hlsToMp4, tiktok, instagram, pinterest, cobalt, deliver },
  register(def, L) {
    const { db, P, aliases, cooldown } = L, state = L.state;

    // called by index.js for every plain (non-command) message, in groups AND private chats
    async function auto({ sock, msg, chat, text, fromMe }) {
      const cfg = db.data.groups[chat]?.autodl;
      if (!cfg) return;
      if (fromMe) { const m = msg.message?.ephemeralMessage?.message || msg.message; if (!(m?.conversation || m?.extendedTextMessage)) return; } // the bot's own media must never retrigger it
      const link = findLink(text);
      if (!link || !cfg[link.site]) return;
      const now = Date.now(), key = chat + '|' + link.url;
      if (now < (lastChat.get(chat) || 0) || now < (recent.get(key) || 0)) return; // 6s per chat, same link only once per 2 minutes
      lastChat.set(chat, now + 6000); recent.set(key, now + 120000);
      if (recent.size > 500) for (const [k, v] of recent) if (v < now) recent.delete(k);
      await deliver({ sock, chat, msg, link, manual: false });
    }
    (state.linkHooks ||= []).push(auto);

    def('autodl', { usage: ['autodl on|off [tiktok|instagram|pinterest]', 'autodl'] }, async c => {
      const { chat, isGroup, meta, senderJid, isOwner, args } = c;
      if (isGroup && !(isOwner || meta?.participants?.find(p => aliases(p).includes(senderJid))?.admin)) return c.reply('🛡️ Group admins only.');
      const sub = (args[0] || '').toLowerCase(), picked = args.slice(1).map(a => a.toLowerCase()).filter(a => SITES[a]);
      if (sub === 'on' || sub === 'off') {
        const g = db.group(chat), cfg = g.autodl || { tiktok: false, instagram: false, pinterest: false };
        for (const s of picked.length ? picked : Object.keys(SITES)) cfg[s] = sub === 'on';
        g.autodl = Object.values(cfg).some(Boolean) ? cfg : undefined; db.save();
      } else if (sub) return c.reply(`Usage: *${P}autodl on|off* [tiktok|instagram|pinterest]`);
      const cfg = db.data.groups[chat]?.autodl || {};
      return c.reply(`📥 *AUTO DOWNLOAD*\n\n${Object.keys(SITES).map(s => `${cfg[s] ? '✅' : '❌'} ${s}`).join('\n')}\n\n` +
        (Object.values(cfg).some(Boolean) ? 'Post a link and I will send the video here.' : `Turn it on with *${P}autodl on*.`) +
        `\nOne-off download: *${P}dl <link>*` + (process.env.COBALT_API_URL ? '' : '\n_(no COBALT_API_URL set: Instagram and Pinterest use the built-in methods only)_'));
    });

    def(['dl', 'download'], { usage: ['dl <tiktok/instagram/pinterest link>'] }, async c => {
      const quoted = msgText(c.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);
      const link = findLink(c.args.join(' ') + ' ' + quoted);
      if (!link) return c.reply(`⚠️ Send *${P}dl <link>* (TikTok, Instagram or Pinterest), or reply to a message that has one.`);
      if (cooldown(c, 'dl', 8000)) return;
      await deliver({ sock: c.sock, chat: c.chat, msg: c.msg, link, manual: true, reply: c.reply });
    });
  },
};
