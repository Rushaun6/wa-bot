// SONG: .song <name> searches YouTube, selects the first result, requests its MP3 from KnightBot, and sends it.
// YouTube search needs YOUTUBE_API_KEY. KnightBot defaults to the endpoint and parameters supplied by the user.
// Downloads run in the background (max 2 at once, 1 per person), are checked with ffmpeg,
// and temporary files are deleted after sending.
const fs = require('fs'), fsp = require('fs/promises'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

let FF = process.env.FFMPEG_PATH || null;
if (!FF) { try { FF = require('ffmpeg-static'); } catch {} }
FF = FF || 'ffmpeg';

const MB = 1048576, ENV = process.env;
const CFG = {
  jamendoBase: ENV.JAMENDO_BASE || 'https://api.jamendo.com/v3.0',
  archiveBase: ENV.ARCHIVE_BASE || 'https://archive.org',
  ytBase: ENV.YT_BASE || 'https://www.googleapis.com/youtube/v3',
  jamendoId: ENV.JAMENDO_CLIENT_ID || '',
  ytKey: ENV.YOUTUBE_API_KEY || '',
  knightBase: ENV.KNIGHTBOT_BASE || 'https://knightbotapi.stream/api/download/ytaudio',
  knightKey: ENV.KNIGHTBOT_API_KEY || 'knight',
  knightFormat: ENV.KNIGHTBOT_FORMAT || '128kbps',
  musicDir: ENV.MUSIC_DIR || path.join(process.cwd(), 'music'),
  searchMs: Number(ENV.SONG_SEARCH_TIMEOUT_MS || 12000),
  downloadMs: Number(ENV.SONG_DL_TIMEOUT_MS || 180000),   // whole download, 3 min
  maxDlBytes: Number(ENV.SONG_MAX_MB || 80) * MB,         // refuse to download more than this
  audioLimit: 15.5 * MB,                                  // WhatsApp plays audio messages up to ~16 MB, bigger goes as a document
  docLimit: Number(ENV.SONG_DOC_MAX_MB || 64) * MB,       // bigger than this is refused
  maxJobs: Number(ENV.SONG_MAX_JOBS || 2), maxQueue: 5,
};
const UA = 'Mozilla/5.0 (compatible; wa-bot-song/1.0)';

class SongError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
const MSG = {
  TIMEOUT: '⏱️ The source took too long to respond. Try again in a minute.',
  NO_YT_KEY: '⚙️ YouTube search is not configured. Add YOUTUBE_API_KEY to your bot environment.',
  NETWORK: '📡 Network error while reaching the source. Try again shortly.',
  UNAVAILABLE: '🚫 Download unavailable. The source did not return a usable audio file for this track.',
  UNAUTHORIZED: '🔒 The source did not authorize this download, so I will not send it.',
  INCOMPLETE: '⚠️ The download was cut off before it finished, so I did not send it. Try again.',
  BAD_AUDIO: '⚠️ That file was not valid, complete audio, so I did not send it.',
  TOO_LARGE: `📦 That file is too large for WhatsApp (limit about ${Math.round(CFG.docLimit / MB)} MB).`,
  BUSY: '🚦 Too many downloads in progress right now. Try again in a minute.',
  NO_FFMPEG: '⚙️ Audio processing is not set up on this bot (ffmpeg is missing).',
};

// ---------- small helpers ----------
const fmtDur = s => {
  if (!Number.isFinite(s) || s <= 0) return '—'; s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const fmtMB = b => (b / MB).toFixed(1) + ' MB';
const netErr = e => {
  if (e instanceof SongError) return e;
  const n = e?.name || '', cn = e?.cause?.name || '';
  return /Timeout|Abort/.test(n + cn) ? new SongError('TIMEOUT') : new SongError('NETWORK', e?.message);
};
async function getJson(url, ms = CFG.searchMs) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'user-agent': UA, accept: 'application/json' } }); } catch (e) { throw netErr(e); }
  if (!r.ok) throw new SongError('HTTP', `HTTP ${r.status}`);
  try { return await r.json(); } catch { throw new SongError('HTTP', 'bad response'); }
}
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new SongError('TIMEOUT')), ms); })]).finally(() => clearTimeout(t)); };
const ccName = u => {
  u = String(u || ''); const m = u.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  return /publicdomain|\/zero\//i.test(u) ? 'Public Domain / CC0' : '';
};
const isoDur = s => { const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || ''); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null; };
const unent = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const words = q => q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
const safeName = s => String(s).replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'song';

// ---------- ffmpeg ----------
function runFF(args, ms = 120000) {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '', killed = false;
    p.stderr.on('data', d => { err += d; if (err.length > 300000) err = err.slice(-150000); });
    const t = setTimeout(() => { killed = true; p.kill('SIGKILL'); }, ms);
    p.on('error', e => { clearTimeout(t); reject(e.code === 'ENOENT' ? new SongError('NO_FFMPEG') : e); });
    p.on('close', code => { clearTimeout(t); resolve({ code: killed ? -1 : code, err, killed }); });
  });
}
const toSec = (h, m, s) => (+h) * 3600 + (+m) * 60 + parseFloat(s);
async function probe(file) { // ffmpeg exits 1 here on purpose (no output file); we only read the header text
  const { err } = await runFF(['-hide_banner', '-i', file], 30000);
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err), a = /Audio:\s*([a-z0-9_]+)/i.exec(err);
  return { duration: d ? toSec(d[1], d[2], d[3]) : 0, codec: a ? a[1].toLowerCase() : '' };
}
// writes an MP3 with title/artist tags; returns how many seconds ffmpeg actually processed
async function convert(inp, out, { copy, bitrate, meta }) {
  const args = ['-y', '-hide_banner', '-v', 'error', '-stats', '-i', inp, '-vn', '-map_metadata', '-1',
    ...(copy ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-b:a', bitrate || '192k']), '-id3v2_version', '3'];
  for (const [k, v] of Object.entries(meta || {})) if (v) args.push('-metadata', `${k}=${String(v).replace(/[\r\n]+/g, ' ').slice(0, 200)}`);
  args.push('-f', 'mp3', out);
  const { code, err, killed } = await runFF(args);
  if (killed) throw new SongError('TIMEOUT');
  if (code !== 0) throw new SongError('BAD_AUDIO', err.slice(-200));
  const times = [...err.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  return times.length ? toSec(...times[times.length - 1].slice(1)) : 0;
}
// validates the download and builds the file that gets sent
async function prepareAudio(inp, dir, item) {
  const info = await probe(inp);
  if (!info.codec || !info.duration) throw new SongError('BAD_AUDIO', 'not audio');
  const meta = { title: item.title, artist: item.artist, album: item.album, comment: ['Source: ' + item.source, item.license && 'License: ' + item.license].filter(Boolean).join(' | ') };
  const complete = sec => sec >= 5 && sec >= info.duration * 0.9 && (!item.duration || sec >= item.duration * 0.85);
  let file = path.join(dir, 'song.mp3'), sec = await convert(inp, file, { copy: info.codec === 'mp3', meta });
  if (!complete(sec)) throw new SongError('INCOMPLETE', `got ${sec}s of ${item.duration || info.duration}s`);
  let size = (await fsp.stat(file)).size;
  if (size > CFG.audioLimit) { // too big to play as an audio message: shrink to 128 kbps
    const small = path.join(dir, 'song128.mp3'), sec2 = await convert(inp, small, { copy: false, bitrate: '128k', meta });
    if (!complete(sec2)) throw new SongError('INCOMPLETE');
    const s2 = (await fsp.stat(small)).size; if (s2 < size) { file = small; size = s2; sec = sec2; }
  }
  if (size > CFG.docLimit) throw new SongError('TOO_LARGE');
  if (size < 10000) throw new SongError('BAD_AUDIO', 'empty output');
  return { file, size, seconds: sec, asDocument: size > CFG.audioLimit };
}

// ---------- downloading ----------
async function download(url, dest, onProgress) {
  let res;
  try { res = await fetch(url, { signal: AbortSignal.timeout(CFG.downloadMs), headers: { 'user-agent': UA }, redirect: 'follow' }); } catch (e) { throw netErr(e); }
  if (res.status === 401 || res.status === 403) throw new SongError('UNAUTHORIZED');
  if (res.status === 404 || res.status === 410) throw new SongError('UNAVAILABLE');
  if (!res.ok) throw new SongError('HTTP', 'HTTP ' + res.status);
  if (/^text\/|json|xml/i.test(res.headers.get('content-type') || '')) throw new SongError('UNAVAILABLE', 'web page, not audio');
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > CFG.maxDlBytes) throw new SongError('TOO_LARGE');
  let got = 0;
  const counter = new Transform({ transform(chunk, _e, cb) { got += chunk.length; if (got > CFG.maxDlBytes) return cb(new SongError('TOO_LARGE')); onProgress && onProgress(got, total); cb(null, chunk); } });
  try { await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest)); }
  catch (e) { if (e instanceof SongError) throw e; throw /Timeout|Abort/.test((e?.name || '') + (e?.cause?.name || '')) ? new SongError('TIMEOUT') : new SongError('INCOMPLETE', e?.message); }
  if (got < 10000) throw new SongError('UNAVAILABLE', 'empty file');
  if (total && got !== total && !res.headers.get('content-encoding')) throw new SongError('INCOMPLETE');
  return got;
}

// ---------- search sources ----------
async function searchJamendo(q) {
  if (!CFG.jamendoId) return [];
  const j = await getJson(`${CFG.jamendoBase}/tracks/?` + new URLSearchParams({ client_id: CFG.jamendoId, format: 'json', limit: '5', search: q, audiodlformat: 'mp32' }));
  if (j.headers && j.headers.status && j.headers.status !== 'success') throw new SongError('HTTP', j.headers.error_message || 'Jamendo error');
  return (j.results || []).slice(0, 5).map(t => ({
    source: 'Jamendo', title: t.name, artist: t.artist_name, album: t.album_name, duration: Number(t.duration) || null, license: ccName(t.license_ccurl),
    kind: t.audiodownload_allowed && t.audiodownload ? 'download' : 'link', url: t.audiodownload, link: t.shareurl || `https://www.jamendo.com/track/${t.id}`,
  }));
}
const parseLen = v => { if (v == null) return null; v = String(v); if (v.includes(':')) { const p = v.split(':').map(Number); return p.reduce((a, b) => a * 60 + b, 0) || null; } return Number(v) || null; };
async function searchArchive(q) {
  const w = words(q); if (!w.length) return [];
  const t = w.join(' AND '), p = new URLSearchParams();
  p.set('q', `(title:(${t}) OR creator:(${t})) AND mediatype:audio`);
  for (const f of ['identifier', 'title', 'creator']) p.append('fl[]', f);
  p.set('rows', '6'); p.set('output', 'json'); p.append('sort[]', 'downloads desc');
  const docs = (await getJson(`${CFG.archiveBase}/advancedsearch.php?${p}`))?.response?.docs || [];
  const metas = await Promise.allSettled(docs.map(d => getJson(`${CFG.archiveBase}/metadata/${encodeURIComponent(d.identifier)}`, 9000)));
  const out = [];
  metas.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const md = r.value, meta = md.metadata || {}, id = docs[i].identifier;
    const lic = String([].concat(meta.licenseurl || [])[0] || '');
    if (!/creativecommons\.org|publicdomain/i.test(lic)) return; // only items that carry an open license
    const seen = new Set(), tracks = (md.files || []).filter(f => /mp3/i.test(f.format || '') && Number(f.size) > 50000)
      .map(f => ({ f, title: f.title || String(f.name).split('/').pop().replace(/\.mp3$/i, '').replace(/^\d+[\s._-]+/, '') }))
      .filter(x => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    // a one-track item with no track title is named after the item ("Sunrise Waltz"), not its file name ("waltz")
    const scored = tracks.map(x => { const title = !x.f.title && tracks.length === 1 && meta.title ? meta.title : x.title; return { f: x.f, title, score: w.filter(k => title.toLowerCase().includes(k)).length }; });
    const files = (scored.some(x => x.score > 0) ? scored.filter(x => x.score > 0) : scored.map(x => ({ ...x, title: meta.title ? `${meta.title}: ${x.title}` : x.title }))).sort((x, y) => y.score - x.score).slice(0, 2);
    for (const { f, title } of files) out.push({
      source: 'Internet Archive', title: unent(title), artist: unent([].concat(f.creator || meta.creator || 'Unknown')[0]), duration: parseLen(f.length), license: ccName(lic),
      kind: 'download', url: `${CFG.archiveBase}/download/${encodeURIComponent(id)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`, link: `https://archive.org/details/${encodeURIComponent(id)}`,
    });
  });
  return out.slice(0, 4);
}
const YT_NOISE = new Set(['official', 'audio', 'video', 'music', 'lyrics', 'lyric', 'hd', '4k', 'full', 'visualizer', 'topic']);
const YT_ALT_FORMATS = ['cover', 'karaoke', 'reaction', 'tutorial', 'slowed', 'sped up', 'nightcore', 'instrumental', 'bass boosted', '8d audio'];
function normalizeYTText(value) {
  return unent(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function scoreYouTubeResult(query, item, position) {
  const q = normalizeYTText(query);
  const title = normalizeYTText(item.snippet?.title);
  const channel = normalizeYTText(item.snippet?.channelTitle);
  const queryTokens = [...new Set(q.split(/\s+/).filter(t => t.length > 1 && !YT_NOISE.has(t)))];
  if (!queryTokens.length) return 100 - position;

  const titleTokens = new Set(title.split(/\s+/));
  const channelTokens = new Set(channel.split(/\s+/));
  const titleHits = queryTokens.filter(t => titleTokens.has(t)).length;
  const channelHits = queryTokens.filter(t => channelTokens.has(t)).length;
  const titleCoverage = titleHits / queryTokens.length;
  const channelCoverage = channelHits / queryTokens.length;
  let score = titleCoverage * 72 + channelCoverage * 22;

  // Exact phrase/title matches are strong signals, but tolerate official labels and punctuation.
  if (q && title.includes(q)) score += 45;
  if (queryTokens.length > 1) {
    let adjacent = 0;
    for (let n = 0; n < queryTokens.length - 1; n++) {
      if (title.includes(`${queryTokens[n]} ${queryTokens[n + 1]}`)) adjacent++;
    }
    score += adjacent * 5;
  }

  // Prefer an artist's own YouTube Topic channel, without making it mandatory.
  if (/\btopic\b/.test(channel)) score += 5;
  const rawTitle = normalizeYTText(item.snippet?.title);
  for (const marker of YT_ALT_FORMATS) {
    if (rawTitle.includes(marker) && !q.includes(marker)) score -= 18;
  }
  // Preserve YouTube's relevance ordering as a small tie-breaker.
  return score + Math.max(0, 9 - position) * 0.15;
}

async function searchYouTube(q) {
  if (!CFG.ytKey) throw new SongError('NO_YT_KEY');
  // Search several candidates, then rank by title/artist match instead of blindly downloading result #1.
  const s = await getJson(`${CFG.ytBase}/search?` + new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: '10', order: 'relevance', relevanceLanguage: 'en',
    regionCode: 'JM', q, key: CFG.ytKey,
  }));
  const candidates = (s.items || []).filter(x => x.id?.videoId && x.snippet?.title);
  if (!candidates.length) return [];

  // Fetch durations and region restrictions in one request, rather than making one request per result.
  const ids = candidates.map(x => x.id.videoId).join(',');
  let details = new Map();
  try {
    const v = await getJson(`${CFG.ytBase}/videos?` + new URLSearchParams({ part: 'contentDetails,status', id: ids, key: CFG.ytKey }));
    details = new Map((v.items || []).map(x => [x.id, x]));
  } catch {}

  const ranked = candidates.map((item, position) => {
    const detail = details.get(item.id.videoId);
    const restriction = detail?.contentDetails?.regionRestriction;
    const blockedInJamaica = restriction?.blocked?.includes('JM') ||
      (Array.isArray(restriction?.allowed) && !restriction.allowed.includes('JM'));
    return { item, detail, position, score: scoreYouTubeResult(q, item, position), blockedInJamaica };
  }).filter(x => !x.blockedInJamaica)
    .sort((a, b) => b.score - a.score || a.position - b.position);

  const best = ranked[0];
  if (!best || best.score < 8) return [];
  const i = best.item, link = `https://www.youtube.com/watch?v=${i.id.videoId}`;
  return [{
    source: 'YouTube', title: unent(i.snippet.title),
    artist: unent(i.snippet.channelTitle).replace(/ - Topic$/i, ''),
    duration: isoDur(best.detail?.contentDetails?.duration),
    kind: 'knight-download', url: link, link,
  }];
}

// KnightBot receives the first YouTube search result URL and returns an MP3 URL.
async function resolveKnightAudio(videoUrl) {
  if (!CFG.knightKey) throw new SongError('UNAUTHORIZED');
  let endpoint;
  try {
    endpoint = new URL(CFG.knightBase);
    endpoint.search = new URLSearchParams({ apikey: CFG.knightKey, format: CFG.knightFormat, url: videoUrl }).toString();
  } catch { throw new SongError('UNAVAILABLE'); }
  const j = await getJson(endpoint.toString(), CFG.downloadMs);
  const audioUrl = j?.success && Number(j?.status) === 200
    ? (j.result?.download || j.result?.dl_url || j.result?.dl)
    : null;
  if (!audioUrl) throw new SongError('UNAVAILABLE', 'KnightBot did not return a download URL');
  let parsed;
  try { parsed = new URL(audioUrl); } catch { throw new SongError('UNAVAILABLE'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'knightbotapi.stream' || !parsed.pathname.startsWith('/files/')) {
    throw new SongError('UNAVAILABLE', 'KnightBot returned an unexpected download host');
  }
  return audioUrl;
}
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;
async function searchLocal(q) {
  let files; try { files = await fsp.readdir(CFG.musicDir); } catch { return []; }
  const w = words(q); if (!w.length) return [];
  const hit = files.filter(f => AUDIO_EXT.test(f) && w.every(x => f.toLowerCase().includes(x))).slice(0, 3);
  return Promise.all(hit.map(async f => {
    const base = f.replace(AUDIO_EXT, ''), m = /^(.+?)\s+-\s+(.+)$/.exec(base), file = path.join(CFG.musicDir, f);
    const info = await probe(file).catch(() => ({ duration: 0 }));
    return { source: 'My Library', title: m ? m[2] : base, artist: m ? m[1] : 'Unknown', duration: info.duration || null, kind: 'download', file };
  }));
}
const SOURCES = [['My Library', searchLocal], ['Jamendo', searchJamendo], ['Internet Archive', searchArchive], ['YouTube', searchYouTube]];
const audiomackLink = q => 'https://audiomack.com/search?q=' + encodeURIComponent(q);

// ---------- job queue ----------
let running = 0, inFlight = 0; const waiting = [], busyUsers = new Set();
const acquire = () => running < CFG.maxJobs ? (running++, Promise.resolve()) : new Promise(r => waiting.push(r));
const release = () => { const n = waiting.shift(); if (n) n(); else running--; };
async function sweepStale() { // temp folders left over from a crash
  try { for (const d of await fsp.readdir(os.tmpdir())) if (d.startsWith('wab-song-')) { const p = path.join(os.tmpdir(), d); const st = await fsp.stat(p).catch(() => null); if (st && Date.now() - st.mtimeMs > 3600000) await fsp.rm(p, { recursive: true, force: true }); } } catch {}
}

async function runJob(ctx, item, P, initialStatus = null) {
  const { sock, chat, msg, sender } = ctx;
  if (busyUsers.has(sender)) return ctx.reply('⏳ You already have a download running. Wait for it to finish.');
  if (inFlight >= CFG.maxJobs + CFG.maxQueue) return ctx.reply(MSG.BUSY); // counted right away, so a burst of picks can't slip past the cap
  busyUsers.add(sender); inFlight++;
  const ahead = inFlight - CFG.maxJobs; // above 0 = this one has to wait its turn
  let acquired = false, dir = null, status = null, lastEdit = 0;
  const edit = async (text, force) => {
    const now = Date.now(); if (!status || (!force && now - lastEdit < 2500)) return; lastEdit = now;
    await sock.sendMessage(chat, { text, edit: status.key }).catch(() => {});
  };
  const label = `*${item.title}* — ${item.artist}`;
  try {
    status = initialStatus || await sock.sendMessage(chat, { text: ahead > 0 ? `⏳ Queued (position ${ahead}): ${label}` : `⏳ Preparing: ${label}` }, { quoted: msg });
    await edit(ahead > 0 ? `⏳ Queued (position ${ahead}): ${label}` : `⏳ Preparing: ${label}`, true);
    await acquire(); acquired = true;
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wab-song-'));
    let src;
    if (item.file) src = item.file;
    else {
      src = path.join(dir, 'source.bin');
      let audioUrl = item.url;
      if (item.kind === 'knight-download') {
        await edit(`🎧 Requesting the MP3 from KnightBot…\n${label}`, true);
        audioUrl = await resolveKnightAudio(item.url);
      }
      await edit(`⬇️ Downloading: ${label}`, true);
      await download(audioUrl, src, (got, total) => edit(total ? `⬇️ Downloading… *${Math.floor(got / total * 100)}%* (${fmtMB(got)} / ${fmtMB(total)})\n${label}` : `⬇️ Downloading… ${fmtMB(got)}\n${label}`));
    }
    await edit(`🎛️ Checking and tagging the audio…\n${label}`, true);
    const out = await prepareAudio(src, dir, item);
    await edit(`📤 Sending (${fmtMB(out.size)})…\n${label}`, true);
    const name = safeName(`${item.artist} - ${item.title}`) + '.mp3';
    const caption = `🎵 *${item.title}*\n👤 ${item.artist}\n⏱ ${fmtDur(out.seconds)} · 📀 ${item.source}${item.license ? ' · 📜 ' + item.license : ''}${item.link ? '\n🔗 ' + item.link : ''}`;
    if (out.asDocument) {
      await sock.sendMessage(chat, {
        document: { url: out.file },
        mimetype: 'audio/mpeg',
        fileName: name,
        caption,
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chat, {
        audio: { url: out.file },
        mimetype: 'audio/mpeg',
        seconds: Math.round(out.seconds),
        ptt: false,
      }, { quoted: msg });
      // WhatsApp audio-message payloads do not reliably support captions.
      await sock.sendMessage(chat, { text: caption }, { quoted: msg });
    }
    await edit(`✅ Sent *${item.title}* — ${item.artist} (${fmtMB(out.size)}).`, true);
  } catch (e) {
    const err = e instanceof SongError ? e : /ENOENT/.test(e?.message) ? new SongError('NO_FFMPEG') : netErr(e);
    console.error('song failed:', err.code, err.message);
    const text = (MSG[err.code] || '⚠️ Something went wrong while getting that song. Try again.') + `\n\n${label}`;
    const shown = status ? await sock.sendMessage(chat, { text, edit: status.key }).then(() => true, () => false) : false;
    if (!shown) await ctx.reply(text).catch(() => {}); // the progress message could not be edited: send the error as a new message
  } finally {
    if (acquired) release();
    inFlight--; busyUsers.delete(sender);
    if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  category: '🎵 MUSIC',
  _t: { CFG, SongError, MSG, fmtDur, download, prepareAudio, searchYouTube, resolveKnightAudio, runJob, busyUsers }, // for tests
  register(def, L) {
    const { P } = L;
    sweepStale();

    def(['song', 'music'], { usage: 'song <song name>' }, async c => {
      const q = c.args.join(' ').trim();
      if (!q) return c.reply(`🎵 *SONG*\n\nUsage: *${P}song <song name>*\n\nI search YouTube, choose the closest title/artist match, and send its MP3.`);
      if (/https?:\/\/|www\./i.test(q)) return c.reply(`🔎 Enter a song name, not a video link.\n\nExample: *${P}song song name*`);
      if (L.cooldown(c, 'song', 4000)) return;

      const status = await c.reply(`🔎 Searching YouTube for *${q}*...`);
      const updateStatus = async text => {
        if (status?.key) {
          try {
            await c.sock.sendMessage(c.chat, { text, edit: status.key });
            return;
          } catch {}
        }
        await c.reply(text);
      };

      try {
        const results = await withTimeout(searchYouTube(q), CFG.searchMs + 14000);
        const item = results[0];
        if (!item) {
          await updateStatus(`🔍 No YouTube result found for *${q}*. Try a different spelling.`);
          return;
        }
        await updateStatus(`🎵 Found the closest YouTube match: *${item.title}* — ${item.artist}\n🎧 Requesting MP3...`);
        // No numbered menu: immediately pass the first YouTube result to KnightBot.
        runJob({ sock: c.sock, chat: c.chat, msg: c.msg, sender: c.sender, reply: c.reply }, item, P, status)
          .catch(e => console.error('song job crashed:', e?.message || e));
      } catch (e) {
        const err = e instanceof SongError ? e : netErr(e);
        console.error('song search failed:', err.code, err.message);
        await updateStatus((MSG[err.code] || '⚠️ Could not search YouTube right now. Try again.') + `\n\n${q}`);
      }
    });
  },
};
