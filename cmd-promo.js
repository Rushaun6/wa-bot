// .promote <your-group-link> <their-group-link>  (owner only)
// Joins THEIR group, posts YOUR link with a hidden tag-all, then leaves.
// If their group needs admin approval, the bot waits (in the background) until it is let in.
module.exports = {
  category: '👑 OWNER',
  register(def, L) {
    const { left, aliases, nj, sleep } = L;
    const DEFAULT_LINK = process.env.PROMO_LINK || '';             // used only when you give just ONE link
    const WAIT_MS = (Number(process.env.PROMO_WAIT_MIN) || 60) * 60000; // how long to wait for approval
    const POLL_MS = process.env.PROMO_POLL_MS ? Number(process.env.PROMO_POLL_MS) : 30000;
    const COOLDOWN = 3 * 60000; // WhatsApp flags accounts that join/leave groups rapidly
    const MAX_WAITING = 3;
    let last = 0, waiting = 0;
    const T = '📢 *PROMOTE*';
    const textFor = link => (process.env.PROMO_TEXT ? process.env.PROMO_TEXT.replace('{link}', link) : `📢 *Join our group!*\n\n🔗 ${link}`);

    // registered as "promolink"; index.js routes ".promote <link>" here and ".promote @user" to the normal promote
    def('promolink', { o: true, usage: 'promote <your-link> <their-group-link>' }, async c => {
      const codes = [...c.args.join(' ').matchAll(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/g)].map(m => m[1]);
      if (!codes.length) return c.reply(`${T}\n\n⚠️ Usage: ${L.P}promote <your-group-link> <their-group-link>`);
      const [mine, theirs] = codes.length >= 2 ? [codes[0], codes[1]] : [null, codes[0]];
      const myLink = mine ? 'https://chat.whatsapp.com/' + mine : DEFAULT_LINK;
      if (!myLink) return c.reply(`${T}\n\n⚠️ Give both links:\n${L.P}promote <your-group-link> <their-group-link>`);
      if (waiting >= MAX_WAITING) return c.reply(`${T}\n\n⏳ I'm already waiting on ${waiting} groups to approve me. Try again later.`);
      const wait = COOLDOWN - (Date.now() - last);
      if (wait > 0 && !process.env.NO_COOLDOWN) return c.reply(`${T}\n\n⏳ Slow down to protect the bot's number. Try again in *${left(wait)}*.`);
      last = Date.now();

      let info;
      try { info = await c.sock.groupGetInviteInfo(theirs); } catch { return c.reply(`${T}\n\n❌ Their group link is invalid or expired.`); }
      const gid = info.id, subject = info.subject || 'the group';
      const approval = !!(info.joinApprovalMode || info.membershipApprovalMode);
      await c.reply(`${T}\n\n⏳ Joining *${subject}*…${approval ? `\n🔒 This group needs admin approval — I'll keep waiting for up to *${Math.round(WAIT_MS / 60000)} min* and then post.` : ''}`);

      // everything below runs in the background so the bot stays responsive while it waits
      (async () => {
        const sock = () => L.state.sock, say = text => sock()?.sendMessage(c.chat, { text }).catch(() => {});
        const myIds = () => [nj(sock().user.id), nj(sock().user.lid || '')];
        let joined = false;
        try { await sock().groupAcceptInvite(theirs); joined = true; }
        catch (e) {
          const msg = String(e?.message || e);
          if (!/conflict|already|409/i.test(msg)) return say(`${T}\n\n❌ Couldn't join *${subject}*: ${msg}\nThe link may be revoked.`);
        }
        // wait until we really are a member (immediately, or after an admin approves the request)
        waiting++;
        let meta = null; const deadline = Date.now() + WAIT_MS; let announced = false;
        try {
          for (;;) {
            try { const m = await sock().groupMetadata(gid); if (m?.participants?.some(p => aliases(p).some(a => myIds().includes(a)))) { meta = m; break; } } catch {}
            if (Date.now() > deadline) break;
            if (!announced) { announced = true; await say(`${T}\n\n⏳ Waiting for *${subject}* to approve my request…`); }
            await sleep(POLL_MS);
          }
        } finally { waiting--; }
        if (!meta) return say(`${T}\n\n⌛ *${subject}* didn't approve me within ${Math.round(WAIT_MS / 60000)} min, so nothing was sent.`);
        let report;
        const me = meta.participants.find(p => aliases(p).some(a => myIds().includes(a)));
        if (meta.announce && !me?.admin) report = `⚠️ *${subject}* is admins-only, so I can't send there.`;
        else {
          try {
            await sock().sendMessage(gid, { text: textFor(myLink), mentions: meta.participants.map(p => p.id) }); // hidden tag-all
            report = `✅ Sent to *${subject}* (${meta.participants.length} members, hidden tag)`;
          } catch (e) { report = `❌ Couldn't send: ${e?.message || e}`; }
        }
        if (joined) { await sleep(2500); try { await sock().groupLeave(gid); report += '\n👋 Left the group.'; } catch { report += '\n⚠️ Could not leave automatically.'; } }
        else report += '\n(I was already in this group, so I stayed.)';
        await say(`${T}\n\n${report}`);
      })().catch(e => console.error('promote failed:', e?.message || e));
    });
  },
};
