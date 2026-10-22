// .clonegroup [name]  -> creates a new group and moves this group's members into it
// .addto <group-link>  -> moves this group's members into an existing group of yours
// Built to be gentle on the bot's number: owner only, you must be a REAL admin of the group, small daily budget,
// slow randomized pacing, privacy-blocked people are skipped (never retried), and it stops itself on any WhatsApp pushback.
module.exports = {
  category: '👥 MEMBERS',
  register(def, L) {
    const { P, db, left, rnd, sleep, aliases, nj, resolveNum, OWNERS } = L;
    const FAST = !!process.env.ADD_FAST; // tests only
    const DAILY_MAX = Number(process.env.ADD_DAILY_MAX) || 50;      // add attempts per day (every attempt counts, even refused ones)
    const CREATE_MAX = Number(process.env.GROUP_CREATE_MAX) || 2;   // new groups per day
    const JOB_COOLDOWN = FAST ? 0 : 20 * 60000;
    const pause = (a, b) => sleep(FAST ? 5 : rnd(a, b));
    const M = db.data.migrations;
    let job = null, lastEnd = 0;

    const budget = () => { const day = new Date().toISOString().slice(0, 10); if (M.day !== day) { M.day = day; M.used = 0; M.created = 0; } return Math.max(0, DAILY_MAX - M.used); };
    const isAdminOf = (c, meta) => !!meta?.participants?.find(p => aliases(p).includes(c.senderJid))?.admin;
    const botIds = () => [nj(L.state.sock.user.id), nj(L.state.sock.user.lid || '')];
    const botAdmin = meta => !!meta?.participants?.find(p => aliases(p).some(a => botIds().includes(a)))?.admin;
    const dmJidOf = c => { const p = c.meta?.participants?.find(p => aliases(p).includes(c.senderJid)); const pn = p && aliases(p).find(a => a.endsWith('@s.whatsapp.net')); return pn || (OWNERS[0] ? OWNERS[0] + '@s.whatsapp.net' : null); };
    const say = (jid, text) => jid && L.state.sock ? L.state.sock.sendMessage(jid, { text }).catch(() => {}) : null;
    const T = '👥 *MOVE MEMBERS*';

    async function runJob(src, dstId, dstMeta, dm, label) {
      const rec = (M.jobs[src.id + '>' + dstId] ||= { done: {} });
      const mine = botIds(), inDst = new Set(dstMeta.participants.flatMap(p => [...aliases(p), resolveNum(dstMeta, p.id)]));
      const banned = new Set(db.data.banned), cands = [];
      for (const p of src.participants) {
        const n = resolveNum(src, p.id);
        if (aliases(p).some(a => mine.includes(a) || inDst.has(a)) || inDst.has(n) || rec.done[n] || banned.has(n)) continue;
        cands.push({ n, id: p.id });
      }
      const list = cands.slice(0, budget());
      job = { label, stop: false, total: list.length, left: cands.length, added: 0, blocked: 0, other: 0, started: Date.now(), reason: '' };
      if (!list.length) { await say(dm, `${T}\n\n${cands.length ? '⏳ Today\'s add budget is used up. Run the command again tomorrow to continue.' : '✅ Nobody left to add — everyone is already there or was already tried.'}`); job = null; return; }
      const eta = Math.ceil(list.length * 13 / 60);
      await say(dm, `${T}\n\n➡️ *${label}*\n👤 To try: *${list.length}*${cands.length > list.length ? ` (+${cands.length - list.length} left for another day)` : ''}\n🐢 Slow on purpose to protect the bot number\n⏱️ About *${eta} min*\n\nStop anytime: *${P}addto stop*`);
      let streak = 0, run403 = [];
      for (let i = 0; i < list.length; i++) {
        if (job.stop) { job.reason = 'stopped by you'; break; }
        const t = list[i]; let st = '';
        try { const r = await L.state.sock.groupParticipantsUpdate(dstId, [t.id], 'add'); st = String(r?.[0]?.status ?? '200'); }
        catch (e) { st = /rate|429|overlimit/i.test(String(e?.message || e)) || String(e?.data) === '429' ? '429' : 'err'; }
        M.used++;
        if (st === '200') { rec.done[t.n] = 'added'; job.added++; streak = 0; run403 = []; }
        else if (st === '403') { rec.done[t.n] = 'blocked'; job.blocked++; streak = 0; run403.push(t.n); } // their privacy settings: skip for good
        else if (['409', '408', '404'].includes(st)) { rec.done[t.n] = 'other'; job.other++; streak = 0; }
        else if (st === '429') { job.reason = 'WhatsApp is rate-limiting the bot. Leave it alone for 24 hours.'; break; }
        else if (++streak >= 3) { job.reason = 'three errors in a row'; break; }
        if (run403.length >= 6 && job.added === 0) { for (const n of run403) delete rec.done[n]; job.blocked -= run403.length; job.reason = 'six refusals in a row with no success — check that I am an admin there. Nobody was marked as skipped.'; break; }
        job.left = cands.length - i - 1; db.save();
        if (i < list.length - 1) { await pause(8000, 18000); if ((i + 1) % 10 === 0) await pause(45000, 90000); }
      }
      db.save(); lastEnd = Date.now();
      const j = job; job = null;
      await say(dm, `${T}\n\n${j.reason ? '🛑 Stopped: ' + j.reason + '\n\n' : '✅ *Done!*\n\n'}┏━ ✅ Added: *${j.added}*\n│ 🔒 Privacy-blocked (skipped): *${j.blocked}*\n│ ➖ Already in / left / not found: *${j.other}*\n┗━ 📆 Today's budget left: *${budget()}*${cands.length - j.added - j.blocked - j.other > 0 ? `\n\n➜ Run the command again later to continue with the rest.` : ''}`);
    }

    // shared checks before any job
    const guard = (c, needCreate) => {
      if (!isAdminOf(c, c.meta)) return '🚫 You must be a real admin of THIS group to move its members.';
      if (job) return `⏳ A move is already running (*${job.label}*). See *${P}addto status*.`;
      const wait = JOB_COOLDOWN - (Date.now() - lastEnd);
      if (wait > 0) return `⏳ Let the bot rest. Try again in *${left(wait)}*.`;
      if (budget() <= 0) return `📆 Today's limit of *${DAILY_MAX}* adds is used up. Try again tomorrow.`;
      if (needCreate && M.created >= CREATE_MAX) return `📆 Today's limit of *${CREATE_MAX}* new groups is used up. Try again tomorrow.`;
      return null;
    };

    def('clonegroup', { g: true, o: true, usage: 'clonegroup [name]' }, async c => {
      const bad = guard(c, true); if (bad) return c.reply(`${T}\n\n${bad}`);
      const dm = dmJidOf(c); if (!dm) return c.reply(`${T}\n\n⚠️ I can't tell your number. Set OWNER_NUMBER.`);
      const name = (c.args.join(' ').trim() || c.meta.subject + ' 2').slice(0, 25);
      await c.reply(`${T}\n\n🆕 Creating *${name}*…\nI'll DM you the link and progress.`);
      (async () => {
        try {
          const g = await L.state.sock.groupCreate(name, [dm]); M.created++; db.save();
          await L.state.sock.groupParticipantsUpdate(g.id, [dm], 'promote').catch(() => {});
          const code = await L.state.sock.groupInviteCode(g.id).catch(() => null);
          await say(dm, `${T}\n\n✅ Group created: *${name}*\n${code ? '🔗 https://chat.whatsapp.com/' + code : ''}\n\nI'll start adding members shortly.`);
          await pause(10000, 20000);
          const dstMeta = await L.state.sock.groupMetadata(g.id);
          await runJob(c.meta, g.id, dstMeta, dm, `${c.meta.subject} → ${name}`);
        } catch (e) { job = null; console.error('clonegroup failed:', e?.message || e); await say(dm, `${T}\n\n❌ Failed: ${e?.message || e}`); }
      })();
    });

    def('addto', { g: true, o: true, usage: ['addto <your-group-link>', 'addto status', 'addto stop'] }, async c => {
      const a = (c.args[0] || '').toLowerCase();
      if (a === 'status') return c.reply(`${T}\n\n${job ? `🔄 Running: *${job.label}*\n✅ Added: *${job.added}*  🔒 Blocked: *${job.blocked}*\n👤 Remaining in this run: *${job.left}*` : '💤 Nothing running.'}\n📆 Budget left today: *${budget()}* of ${DAILY_MAX}`);
      if (a === 'stop') { if (!job) return c.reply(`${T}\n\n💤 Nothing is running.`); job.stop = true; return c.reply(`${T}\n\n🛑 Stopping after the current add…`); }
      const code = (c.args.join(' ').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/) || [])[1];
      if (!code) return c.reply(`${T}\n\n⚠️ Usage: ${P}addto <your-group-link>\nType it in the group whose members you want to move.\nI must be an *admin* in your group.`);
      const bad = guard(c, false); if (bad) return c.reply(`${T}\n\n${bad}`);
      let info; try { info = await c.sock.groupGetInviteInfo(code); } catch { return c.reply(`${T}\n\n❌ That link is invalid or expired.`); }
      if (info.id === c.chat) return c.reply(`${T}\n\n⚠️ That's this same group.`);
      let dst; try { dst = await c.sock.groupMetadata(info.id); } catch { return c.reply(`${T}\n\n⚠️ I'm not in *${info.subject}*. Add me and make me an admin first.`); }
      if (!botAdmin(dst)) return c.reply(`${T}\n\n⚠️ Make me an *admin* in *${dst.subject}* first.`);
      if (!isAdminOf(c, dst)) return c.reply(`${T}\n\n🚫 You must also be an admin of *${dst.subject}*.`);
      const dm = dmJidOf(c);
      await c.reply(`${T}\n\n➡️ *${c.meta.subject} → ${dst.subject}*\nI'll DM you progress.`);
      runJob(c.meta, info.id, dst, dm, `${c.meta.subject} → ${dst.subject}`).catch(async e => { job = null; console.error('addto failed:', e?.message || e); await say(dm, `${T}\n\n❌ Failed: ${e?.message || e}`); });
    });
  },
};
