// SONG DROP: posts a song from a chosen artist into a chosen group every 3 hours.
//   .addartist / .atr <artist[, artist2]>   add artist(s) to the list
//   .artistlist / .atrl                     show the list
//   .rmartist / .atrm <number|name>         remove an artist
//   .slg <group link> [artist]              start drops in that group (random artist from the list, or only [artist])
//   .slg off [group link] | .slg now | .slg status
// Reuses the .song engine (cmd-song.js) so the drop looks exactly like a .song result.
// Data is saved in SONGDROP_FILE (default ./data/songdrop.json). On Railway/Render point it at a volume or it resets on redeploy.
const fsp = require('fs/promises'), path = require('path');
const ENV = process.env;
const EVERY = Number(ENV.SONGDROP_HOURS || 3) * 3600000, RETRY = 30 * 60000;
const FILE = ENV.SONGDROP_FILE || path.join(process.cwd(), 'data', 'songdrop.json');
const TZ = ENV.TZ || 'America/Jamaica';
const S = require('./cmd-song.js')._t;

// ---------- storage ----------
let db = { artists: [], targets: {} }, loaded = false, saving = Promise.resolve();
async function load() {
  if (loaded) return; loaded = true;
  try { const j = JSON.parse(await fsp.readFile(FILE, 'utf8')); db = { artists: j.artists || [], targets: j.targets || {} }; } catch {}
}
const save = () => (saving = saving.then(async () => {
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE + '.tmp', JSON.stringify(db, null, 2));
  await fsp.rename(FILE + '.tmp', FILE);
}).catch(e => console.error('songdrop save failed:', e.message)));

// ---------- helpers ----------
const unent = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = s => unent(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isoDur = s => { const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || ''); return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null; };
const BAD = /\b(cover|karaoke|reaction|tutorial|slowed|sped up|nightcore|instrumental|bass boosted|8d|interview|behind the scenes|full album|playlist|compilation|mix|live|shorts?)\b/;
const numOf = j => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const when = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

// Picks a random, not-yet-dropped song by the artist (YouTube search, ranked by artist-name match).
async function pickSong(artist, g) {
  const key = S.CFG.ytKey; if (!key) throw new S.SongError('NO_YT_KEY');
  const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(S.CFG.searchMs) }); if (!r.ok) throw new S.SongError('HTTP', 'HTTP ' + r.status); return r.json(); };
  const a = norm(artist);
  let cands = [];
  for (const cat of ['10', null]) { // music category first, then anything
    const p = { part: 'snippet', type: 'video', maxResults: '40', order: 'relevance', relevanceLanguage: 'en', regionCode: 'JM', q: `${artist} official video`, key };
    if (cat) p.videoCategoryId = cat;
    const s = await get(`${S.CFG.ytBase}/search?` + new URLSearchParams(p));
    cands = (s.items || []).filter(x => x.id?.videoId && x.snippet?.title && (norm(x.snippet.title).includes(a) || norm(x.snippet.channelTitle).includes(a)) && !BAD.test(norm(x.snippet.title)));
    if (cands.length) break;
  }
  if (!cands.length) return null;
  let det = new Map();
  try {
    const v = await get(`${S.CFG.ytBase}/videos?` + new URLSearchParams({ part: 'contentDetails', id: cands.map(x => x.id.videoId).join(','), key }));
    det = new Map((v.items || []).map(x => [x.id, x.contentDetails]));
  } catch {}
  let pool = cands.filter(x => {
    const d = det.get(x.id.videoId), sec = isoDur(d?.duration), rr = d?.regionRestriction;
    if (rr?.blocked?.includes('JM') || (Array.isArray(rr?.allowed) && !rr.allowed.includes('JM'))) return false;
    return sec == null || (sec >= 90 && sec <= 600);
  });
  const fresh = pool.filter(x => !g.seen.includes(x.id.videoId));
  if (!fresh.length) { g.seen = []; } else pool = fresh; // everything was dropped already: start over
  if (!pool.length) return null;
  const x = pool[Math.floor(Math.random() * pool.length)], link = `https://www.youtube.com/watch?v=${x.id.videoId}`;
  return { source: 'YouTube', title: unent(x.snippet.title), artist: unent(x.snippet.channelTitle).replace(/ - Topic$/i, ''), duration: isoDur(det.get(x.id.videoId)?.duration), kind: 'knight-download', url: link, link, id: x.id.videoId };
}

module.exports = {
  category: '🎵 MUSIC',
  register(def, L) {
    const { P } = L;
    let lastSock = null;
    const getSock = () => L.sock || (typeof L.getSock === 'function' && L.getSock()) || lastSock;
    const ownerNums = String(ENV.OWNER_NUMBER || '').split(/[,\s]+/).map(numOf).filter(Boolean);
    const isOwner = c => c.isOwner === true || (typeof L.isOwner === 'function' && !!L.isOwner(c)) || ownerNums.includes(numOf(c.sender));
    const guard = fn => async c => {
      lastSock = c.sock || lastSock; await load();
      if (!isOwner(c)) return c.reply('🔒 Owner only.');
      return fn(c);
    };

    // ----- the drop itself -----
    async function drop(jid, g) {
      const sock = getSock(); if (!sock) return false;
      const pool = g.artist ? [g.artist] : db.artists; if (!pool.length) return false;
      const artist = pool[Math.floor(Math.random() * pool.length)];
      let item;
      try { item = await pickSong(artist, g); } catch (e) { console.error('songdrop search failed:', e?.code, e?.message); return false; }
      if (!item) { console.error('songdrop: no song found for', artist); return false; }
      let ok = false;
      const real = await S.startLoader(sock, jid, 'Dropping a song');
      const loader = { stage: s => real.stage(s), finish: async t => { ok = t.startsWith('🎵'); await real.finish(t); } };
      await S.runJob({ sock, chat: jid, sender: 'songdrop:' + jid, reply: t => sock.sendMessage(jid, { text: t }) }, item, P, loader);
      if (ok) g.seen = [...g.seen, item.id].slice(-300);
      return ok;
    }
    let ticking = false;
    async function tick() {
      if (ticking) return; ticking = true;
      try {
        await load();
        for (const [jid, g] of Object.entries(db.targets)) {
          if (!g.enabled || Date.now() < g.nextAt) continue;
          if (!getSock()) break;
          const ok = await drop(jid, g);
          g.fails = ok ? 0 : (g.fails || 0) + 1;
          g.nextAt = Date.now() + (ok || g.fails >= 3 ? EVERY : RETRY);
          if (g.fails >= 3) g.fails = 0;
          await save();
        }
      } catch (e) { console.error('songdrop tick failed:', e?.message); } finally { ticking = false; }
    }
    load();
    const timer = setInterval(tick, 60000); timer.unref?.();

    // ----- artists -----
    def(['addartist', 'atr'], { usage: 'addartist <artist>' }, guard(async c => {
      const names = c.args.join(' ').split(',').map(s => s.trim()).filter(Boolean);
      if (!names.length) return c.reply(`🎤 Usage: *${P}atr <artist>* (you can add several with commas)`);
      const added = [], dupes = [];
      for (const n of names) (db.artists.some(x => norm(x) === norm(n)) ? dupes : (db.artists.push(n), added)).push(n);
      await save();
      c.reply((added.length ? `✅ Added: *${added.join('*, *')}*\n` : '') + (dupes.length ? `⚠️ Already in the list: ${dupes.join(', ')}\n` : '') + `\n🎤 ${db.artists.length} artist(s) total. See them with *${P}atrl*`);
    }));
    def(['artistlist', 'atrl'], { usage: 'artistlist' }, async c => {
      lastSock = c.sock || lastSock; await load();
      if (!db.artists.length) return c.reply(`🎤 No artists yet. Add one with *${P}atr <artist>*`);
      c.reply(`🎤 *ARTIST LIST* (${db.artists.length})\n\n${db.artists.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nAdd: *${P}atr <artist>*\nRemove: *${P}atrm <number|name>*`);
    });
    def(['rmartist', 'atrm'], { usage: 'rmartist <number|name>' }, guard(async c => {
      const q = c.args.join(' ').trim(); if (!q) return c.reply(`🎤 Usage: *${P}atrm <number|name>*`);
      const i = /^\d+$/.test(q) ? Number(q) - 1 : db.artists.findIndex(x => norm(x) === norm(q));
      if (!db.artists[i]) return c.reply(`❌ Not in the list. Check *${P}atrl*`);
      const [gone] = db.artists.splice(i, 1);
      for (const g of Object.values(db.targets)) if (g.artist && norm(g.artist) === norm(gone)) g.artist = null; // that group goes back to random
      await save(); c.reply(`🗑️ Removed *${gone}*`);
    }));

    // ----- group target -----
    async function resolveGroup(c, raw) {
      const jidM = /(\d[\d-]*@g\.us)/.exec(raw); if (jidM) return { jid: jidM[1] };
      const m = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i.exec(raw); if (!m) return null;
      const info = await c.sock.groupGetInviteInfo(m[1]);
      const jid = String(info.id).includes('@') ? info.id : info.id + '@g.us';
      let inGroup = true; try { inGroup = !!(await c.sock.groupFetchAllParticipating())[jid]; } catch {}
      if (!inGroup) await c.sock.groupAcceptInvite(m[1]);
      return { jid, name: info.subject };
    }
    const nameOf = async (c, jid) => (await c.sock.groupMetadata(jid).catch(() => null))?.subject || jid;
    const artistText = g => g.artist ? `only *${g.artist}*` : 'random from the artist list';

    def(['slg'], { usage: 'slg <group link> [artist]' }, guard(async c => {
      const first = (c.args[0] || '').toLowerCase();
      const hint = `🎵 *SONG DROP*\n\n*${P}slg <group link> [artist]* start drops (every ${EVERY / 3600000}h)\n*${P}slg off [group link]* stop\n*${P}slg now* drop one now\n*${P}slg status* see active groups`;

      if (first === 'status' || (!c.args.length && !String(c.chat).endsWith('@g.us'))) {
        const act = Object.entries(db.targets).filter(([, g]) => g.enabled);
        if (!act.length) return c.reply(hint);
        const lines = await Promise.all(act.map(async ([jid, g]) => `• *${await nameOf(c, jid)}* — ${artistText(g)} — next ~${when(g.nextAt)}`));
        return c.reply(`🎵 *SONG DROPS*\n\n${lines.join('\n')}\n\nArtists: ${db.artists.length}`);
      }
      if (first === 'now') {
        const act = Object.values(db.targets).filter(g => g.enabled);
        if (!act.length) return c.reply('⚠️ No active group. Start one with *' + P + 'slg <group link>*');
        act.forEach(g => { g.nextAt = 0; }); setTimeout(tick, 500);
        return c.reply('🎵 Dropping now…');
      }
      if (first === 'off' || first === 'stop') {
        const raw = c.args.slice(1).join(' ');
        let jid = null;
        if (raw) { try { jid = (await resolveGroup(c, raw))?.jid; } catch {} if (!jid) return c.reply('❌ I could not read that group link.'); }
        else if (String(c.chat).endsWith('@g.us')) jid = c.chat;
        const keys = jid ? [jid] : Object.keys(db.targets);
        keys.forEach(k => { if (db.targets[k]) db.targets[k].enabled = false; });
        await save(); return c.reply(jid ? '🛑 Song drops stopped for that group.' : '🛑 Song drops stopped everywhere.');
      }

      // start / update
      let raw = c.args[0] || '', rest = c.args.slice(1);
      if (!/chat\.whatsapp\.com|@g\.us/i.test(raw)) { // no link given: use the group this was typed in
        if (!String(c.chat).endsWith('@g.us')) return c.reply(hint);
        raw = c.chat; rest = c.args;
      }
      if (!db.artists.length) return c.reply(`🎤 Add some artists first with *${P}atr <artist>*`);
      let artist = null;
      const aq = rest.join(' ').trim();
      if (aq) {
        const i = /^\d+$/.test(aq) ? Number(aq) - 1 : db.artists.findIndex(x => norm(x) === norm(aq));
        if (!db.artists[i]) return c.reply(`❌ *${aq}* is not in the artist list. Add it with *${P}atr ${aq}* or check *${P}atrl*`);
        artist = db.artists[i];
      }
      let grp;
      try { grp = await resolveGroup(c, raw); }
      catch (e) { console.error('slg group failed:', e?.message); return c.reply('❌ I could not get into that group. Add the bot to it (or check the link is valid) and try again.'); }
      if (!grp) return c.reply('❌ That is not a WhatsApp group link.');
      const old = db.targets[grp.jid];
      db.targets[grp.jid] = { enabled: true, artist, nextAt: Date.now(), seen: old?.seen || [], fails: 0 };
      await save(); setTimeout(tick, 1000);
      c.reply(`✅ Song drops set for *${grp.name || await nameOf(c, grp.jid)}*\n🎤 ${artistText(db.targets[grp.jid])}\n⏱ First one now, then every ${EVERY / 3600000} hours.`);
    }));
  },
};
