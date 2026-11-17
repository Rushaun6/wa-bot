// 🛟 DATABASE RECOVERY (owner only): .dbbackups lists every saved copy of the database that is on the bot's disk,
// .dbrestore <name> brings one back. The bot keeps rolling backups (backup0-7, one per 3 hours = the last 24h), a copy of the disk file
// from each of the last 5 starts (start1-5), and a copy of the current data before every restore (before-restore-...).
const fs = require('fs'), path = require('path');
module.exports = {
  category: '🛟 DATABASE',
  register(def, L) {
    const { P, db } = L;
    const DIR = path.dirname(db.FILE), BASE = path.basename(db.FILE, '.json'); // "db"
    const tz = process.env.BOT_TZ || 'America/Jamaica';
    const when = ms => ms ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) : '?';
    const short = n => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e15 ? (a / 1e15).toFixed(1) + 'Qd' : a >= 1e12 ? (a / 1e12).toFixed(1) + 'T' : a >= 1e9 ? (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : String(Math.round(a))); };
    const files = () => { // name -> path
      const out = {}; let all = []; try { all = fs.readdirSync(DIR); } catch {}
      for (const f of all) { let m;
        if ((m = new RegExp(`^${BASE}\\.backup(\\d+)\\.json$`).exec(f))) out['backup' + m[1]] = f;
        else if ((m = new RegExp(`^${BASE}\\.start(\\d+)\\.json$`).exec(f))) out['start' + m[1]] = f;
        else if ((m = new RegExp(`^${BASE}\\.before-restore-(\\d+)\\.json$`).exec(f))) out['before-restore-' + m[1]] = f;
        else if (f === `${BASE}.json.bak`) out.bak = f; }
      return out;
    };
    function read(name) { const f = files()[name]; if (!f) return null; try { const p = path.join(DIR, f); const obj = JSON.parse(fs.readFileSync(p, 'utf8')); return { name, obj, mtime: fs.statSync(p).mtimeMs, at: Number(obj.pushedBy?.at) || fs.statSync(p).mtimeMs }; } catch { return null; } }
    const stats = o => { let users = 0, coins = 0, pets = 0; for (const u of Object.values(o.users || {})) { if (!u || typeof u !== 'object') continue; users++; coins += (Number(u.wallet) || 0) + (Number(u.bank) || 0); pets += Array.isArray(u.pets) ? u.pets.length : 0; } return { users, coins, pets }; };
    const need = c => c.isOwner ? true : (c.reply('🚫 Only the bot owner can use this.'), false);

    def(['dbbackups', 'dbcopies'], { usage: ['dbbackups'] }, c => {
      if (!need(c)) return;
      const rows = Object.keys(files()).map(read).filter(Boolean).sort((a, b) => b.at - a.at);
      const cur = stats(db.data);
      if (!rows.length) return c.reply('🛟 No saved copies found on the disk yet.');
      c.reply(`🛟 *DATABASE COPIES* (newest first)\n\n▶️ Right now: ${cur.users} users · $${short(cur.coins)} · ${cur.pets} pets\n\n` + rows.map(r => { const s = stats(r.obj); return `*${r.name}* · ${when(r.at)}\n│   ${s.users} users · $${short(s.coins)} · ${s.pets} pets`; }).join('\n\n') + `\n\nBring one back: *${P}dbrestore <name>* (previews first)\nOnly the players: default · whole database: *${P}dbrestore <name> all*`);
    });

    def(['dbrestore'], { usage: ['dbrestore backup3', 'dbrestore backup3 confirm', 'dbrestore backup3 all confirm'] }, c => {
      if (!need(c)) return;
      const name = (c.args[0] || '').toLowerCase(), rest = c.args.slice(1).map(x => x.toLowerCase()), all = rest.includes('all'), confirm = rest.includes('confirm');
      if (!name) return c.reply(`Which copy? See ${P}dbbackups, then e.g. ${P}dbrestore backup3`);
      const r = read(name); if (!r) return c.reply(`⚠️ No readable copy called "${name}". See ${P}dbbackups`);
      const cur = db.data.users || {}, old = r.obj.users || {};
      const merged = all ? old : { ...cur, ...old }; // players mode: everyone from the copy is restored, players who joined since stay as they are
      let rolledBack = 0, kept = 0, added = 0; for (const k of Object.keys(old)) { if (!cur[k]) added++; else if (JSON.stringify(cur[k]) !== JSON.stringify(old[k])) rolledBack++; } for (const k of Object.keys(cur)) if (!old[k]) kept++;
      if (!confirm) return c.reply(`🛟 *RESTORE PREVIEW* · ${name} (${when(r.at)})\n\nMode: ${all ? '*whole database* (settings, groups and players)' : '*players only* (settings and groups stay as they are now)'}\n• ${rolledBack} players go back to how they were in that copy\n• ${added} players in the copy are added back\n• ${kept} players who are newer than the copy ${all ? '*are removed*' : 'stay as they are'}\n\nAnything players did after ${when(r.at)} is lost for those who change. A copy of right now is saved first.\n\nTo do it: *${P}dbrestore ${name}${all ? ' all' : ''} confirm*`);
      try { fs.writeFileSync(path.join(DIR, `${BASE}.before-restore-${Date.now()}.json`), JSON.stringify(db.data)); } catch (e) { return c.reply('⚠️ Could not save a copy of the current data first, so I did NOT restore: ' + (e?.message || e)); }
      if (all) db.restore(r.obj); else db.restore({ users: merged }, ['users']);
      const s = stats(db.data); c.reply(`✅ *RESTORED* from ${name} (${when(r.at)})\n\n${s.users} users · $${short(s.coins)} · ${s.pets} pets now.\nThe data from just before is kept as before-restore-… (see ${P}dbbackups).`);
    });
  },
};
