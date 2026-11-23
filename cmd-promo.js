// 📣 .promotegroup (hidetag) and .promotegroupstatus (group status), owner / bot admins: promote your group with a GROUP STATUS inside groups you have permission to post in.
// You queue invite links of those groups. For each one the bot joins (waiting for approval if the group needs it, with no time limit),
// posts the status (your group link), leaves, and clears that chat from its own list. Progress is DM'd to whoever queued the link.
// Joining is paced (one group per ~45s) so the number doesn't get flagged: that is not a cap, the queue can be any size.
// Works on your current Baileys (no fork): the group status is a "groupStatusMessageV2" envelope (Message field 103) sent with relayMessage.
// Baileys 6.7.18 doesn't know that field, so it is added to the encoder at runtime. This has NOT been confirmed against live WhatsApp,
// so queueing is locked until you run ".promotegroupstatus test" in a group of yours, see it show up as a group status, and send
// ".promotegroupstatus ok". Set GROUP_STATUS_API=flag|wrap if you ever move to a library with its own group status helper.
module.exports = {
  category: '📣 PROMO',
  register(def, L) {
    const { P, db, sleep, rnd } = L;
    const TICK = 45000;
    const st = () => (db.data.events.promo ||= { link: '', text: '', queue: [], done: 0 });
    const codeOf = s => (/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/.exec(s || '') || [])[1];
    const body = s => { const t = (s.text || '📣 Join my group!\n{link}'); return t.includes('{link}') ? t.replaceAll('{link}', s.link) : t + '\n' + s.link; };

    // adds Message.groupStatusMessageV2 (field 103, a FutureProofMessage) to the encoder if this Baileys doesn't know it
    function ensureProto(proto) {
      if (!proto?.Message || 'groupStatusMessageV2' in proto.Message.prototype || proto.Message.__gs2) return;
      const enc = proto.Message.encode;
      proto.Message.encode = function (m, w) {
        w = enc.call(this, m, w);
        if (m && m.groupStatusMessageV2) { w.uint32((103 << 3) | 2).fork(); proto.Message.FutureProofMessage.encode(m.groupStatusMessageV2, w); w.ldelim(); }
        return w;
      };
      proto.Message.__gs2 = true;
    }
    // how do we send a group status on this library? (null = we can't)
    function statusSender(sock) {
      let baileys = null, pkg = {};
      try { baileys = require('@whiskeysockets/baileys'); } catch {}
      try { pkg = require('@whiskeysockets/baileys/package.json'); } catch {}
      const mode = process.env.GROUP_STATUS_API || (/itsliaaa/i.test(pkg.name || '') ? 'flag' : 'relay');
      const send0 = (sock.sendRaw || sock.sendMessage).bind(sock); // unguarded: these groups are other people's, the bot is off there on purpose
      if (mode === 'flag') return (jid, text) => send0(jid, { text, groupStatus: true });
      if (mode === 'wrap') return (jid, text) => send0(jid, { groupStatusMessage: { text } });
      if (!baileys?.proto || typeof sock?.relayMessage !== 'function') return null;
      return async (jid, text) => {
        ensureProto(baileys.proto);
        const id = (baileys.generateMessageIDV2 || baileys.generateMessageID)(sock.user?.id);
        await sock.relayMessage(jid, {
          messageContextInfo: { messageSecret: require('crypto').randomBytes(32) },
          groupStatusMessageV2: { message: { extendedTextMessage: { text, backgroundArgb: 0xFF128C7E, contextInfo: { isGroupStatus: true } } } },
        }, { messageId: id, additionalNodes: [{ tag: 'meta', attrs: { is_group_status: 'true' } }] });
        return { key: { remoteJid: jid, id, fromMe: true }, messageTimestamp: Math.floor(Date.now() / 1000) };
      };
    }
    const dm = (n, text) => { const sock = L.state.sock; if (sock && n) sock.sendMessage(n + '@s.whatsapp.net', { text }).catch(() => {}); };

    let busy = false;
    async function work() {
      const sock = L.state.sock, s = st();
      if (!sock || busy || !s.queue.length) return;
      const head = s.queue[0], kind = head.kind || 'status'; let send = null;
      if (kind === 'hidetag') send = async (jid, text) => { // a normal message that silently mentions everybody (like .hidetag)
        const md = await sock.groupMetadata(jid), ids = (md.participants || []).map(p => p.id), r = await (sock.sendRaw || sock.sendMessage).call(sock, jid, { text, mentions: ids });
        return Object.assign({ key: r?.key, messageTimestamp: r?.messageTimestamp }, { _n: ids.length });
      };
      else { send = statusSender(sock); if (!send || !s.verified) { if (s.queue.some(i => (i.kind || 'status') === 'hidetag')) s.queue.push(s.queue.shift()); return; } } // never join a group for a status until posting is confirmed to work
      busy = true;
      const item = head, to = item.by || L.OWNERS[0];
      try {
        let info;
        try { info = await sock.groupGetInviteInfo(item.code); }
        catch { s.queue.shift(); db.save(); return dm(to, `⚠️ Promo: the link ${item.code.slice(0, 6)}… is invalid or expired, removed.`); }
        item.id = info.id; item.name = info.subject;
        const all = await sock.groupFetchAllParticipating().catch(() => null);
        if (!all) return;
        if (!all[info.id]) { // not in yet: ask once, then just keep checking (waits as long as it takes)
          if (!item.asked) {
            item.asked = Date.now();
            try { await sock.groupAcceptInvite(item.code); } catch (e) { item.err = String(e?.message || e); }
            db.save();
            if (!(await sock.groupFetchAllParticipating().catch(() => ({})))[info.id]) { s.queue.push(s.queue.shift()); return; }
          } else { s.queue.push(s.queue.shift()); return; }
        }
        await sleep(6000 + rnd(0, 4000)); // let the group load, like a person would
        let sent = null, err = '';
        for (let i = 0; i < 3 && !sent; i++) { try { sent = await send(info.id, body(s)); } catch (e) { err = String(e?.message || e); await sleep(5000); } }
        await sleep(4000 + rnd(0, 3000));
        await sock.groupLeave(info.id).catch(e => console.error('promo: leave failed:', e?.message || e));
        if (sent?.key) await sock.chatModify({ delete: true, lastMessages: [{ key: sent.key, messageTimestamp: sent.messageTimestamp }] }, info.id).catch(() => {});
        s.queue.shift(); if (sent) s.done++; db.save();
        dm(to, sent ? `✅ Promo ${kind === 'hidetag' ? `hidetag sent to ${sent._n ?? 'all'} members of` : 'posted in'} *${info.subject}*. Left and cleared the chat. (${s.queue.length} left in the queue)` : `❌ Promo failed in *${info.subject}* (${err || 'unknown error'}). I left the group. Re-queue it to try again.`);
      } catch (e) { console.error('promo worker failed:', e?.message || e); }
      finally { busy = false; }
    }
    setInterval(() => work(), TICK).unref();
    L.petTicks = Object.assign(L.petTicks || {}, { promoTick: work }); // so it can be run by hand / tested

    const HELP_TAG = `📣 *PROMOTE GROUP*

Joins a group you have permission to promote in, sends a *hidetag* (a message that silently mentions every member) with your group link, then leaves.

➜ ${P}promotegroup link <your group link>  (set once)
➜ ${P}promotegroup <invite link> <invite link> …
➜ ${P}promotegroup text <message>  (optional, {link} = your link)
➜ ${P}promotegroup list · stop`;
    const promoCmd = (c, kind) => {
      const s = st(), a = (c.args[0] || '').toLowerCase(), rest = c.args.slice(1).join(' ');
      if (a === 'link') {
        const l = (/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.exec(rest) || [])[0];
        if (!l) return c.reply(`⚠️ Send your own group's invite link:\n${P}promotegroupstatus link https://chat.whatsapp.com/…`);
        s.link = l; db.save(); return c.reply(`✅ Promo link saved:\n${l}`);
      }
      if (a === 'text') { s.text = rest.trim(); db.save(); return c.reply(s.text ? `✅ Status text saved. Use {link} where your link should go (it's added at the end if you don't).` : '✅ Back to the default text.'); }
      if (a === 'test') { // post a test group status in THIS group (use one of your own)
        if (!c.isGroup) return c.reply('Send this inside one of your own groups.');
        const send = statusSender(c.sock); if (!send) return c.reply('🚫 This WhatsApp library has no way to send a group status.');
        return send(c.chat, '✅ Group status test').then(() => c.reply(`📤 Sent. Open this group and check: is "✅ Group status test" showing as a *group status* (the status ring on the group)?\n\nIf yes: *${P}promotegroupstatus ok*\nIf not: tell me what you see.`)).catch(e => c.reply(`❌ Sending failed: ${String(e?.message || e)}`));
      }
      if (a === 'ok') { s.verified = true; db.save(); return c.reply('✅ Marked as working. You can queue groups now.'); }
      if (a === 'stop' || a === 'clear') { const n = s.queue.length; s.queue = []; db.save(); return c.reply(`🛑 Promo queue cleared (${n} removed).`); }
      if (a === 'list' || a === 'status') return c.reply(`📣 *PROMO*\n\n🔗 Your link: ${s.link || '_not set_'}\n🔓 Unlocked: ${s.verified ? 'yes' : 'no (run test, then ok)'}\n✅ Posted so far: *${s.done}*\n⏳ Waiting: *${s.queue.length}*${s.queue.slice(0, 15).map(i => `\n• ${i.name || i.code.slice(0, 8) + '…'}${i.asked ? ' _(asked to join)_' : ''}`).join('')}\n\n_Preview:_\n${s.link ? body(s) : '_set your link first_'}`);
      const codes = [...new Set([...c.args.join(' ').matchAll(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/g)].map(x => x[1]))];
      if (!codes.length && kind === 'hidetag') return c.reply(HELP_TAG);
      if (!codes.length) return c.reply(`📣 *PROMO STATUS*\n\nPosts a group status with your group link inside groups you have permission to post in, then leaves.\n\n➜ ${P}promotegroupstatus link <your group link>\n➜ ${P}promotegroupstatus <invite link> <invite link> …\n➜ ${P}promotegroupstatus text <message>  (optional)\n➜ ${P}promotegroupstatus list · stop`);
      if (!s.link) return c.reply(`⚠️ Set your own group link first:\n${P}promotegroupstatus link https://chat.whatsapp.com/…`);
      if (kind === 'status' && !s.verified) return c.reply(`🔒 Not unlocked yet. Run *${P}promotegroupstatus test* in one of your own groups first, check the status shows up, then send *${P}promotegroupstatus ok*.`);
      let added = 0; for (const code of codes) if (!s.queue.some(i => i.code === code)) { s.queue.push({ code, by: c.sender, at: Date.now(), kind }); added++; }
      db.save(); c.reply(`📣 Queued *${added}* group${added === 1 ? '' : 's'}. I'll join (and wait for approval if needed), post, leave, and DM you after each one.\n⏳ ${s.queue.length} in the queue`);
    };
    def(['promotegroupstatus', 'pgs'], { ba: true, usage: ['promotegroupstatus test', 'promotegroupstatus <invite link(s)>', 'promotegroupstatus link <your group link>', 'promotegroupstatus text <message>', 'promotegroupstatus list', 'promotegroupstatus stop'] }, c => promoCmd(c, 'status'));
    def(['promotegroup', 'grouppromote', 'joinpromote'], { ba: true, usage: ['promotegroup <invite link(s)>', 'promotegroup link <your group link>', 'promotegroup text <message>', 'promotegroup list', 'promotegroup stop'] }, c => promoCmd(c, 'hidetag'));
  },
};
