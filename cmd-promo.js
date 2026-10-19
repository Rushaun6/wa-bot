// .promote <group-invite-link>  (owner only): join the group, send your invite with a hidden tag-all, then leave
module.exports = {
  category: '👑 OWNER',
  register(def, L) {
    const { left, aliases, nj } = L;
    const LINK = process.env.PROMO_LINK || 'https://chat.whatsapp.com/Fbfzd6l3eE0KCjCHPO1iTH';
    const TEXT = process.env.PROMO_TEXT || `📢 *Join our group!*\n\n🔗 ${LINK}`;
    const COOLDOWN = 3 * 60000; // WhatsApp flags accounts that join/leave groups rapidly
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let last = 0;

    // registered as "promolink"; index.js routes ".promote <link>" here and ".promote @user" to the normal promote
    def('promolink', { o: true, usage: 'promote <group-link>' }, async c => {
      const code = (c.args.join(' ').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/) || [])[1];
      if (!code) return c.reply(`📢 *PROMOTE*\n\n⚠️ Usage: ${L.P}promote <group-invite-link>`);
      const wait = COOLDOWN - (Date.now() - last);
      if (wait > 0) return c.reply(`📢 *PROMOTE*\n\n⏳ Slow down to protect the bot's number. Try again in *${left(wait)}*.`);
      last = Date.now();

      let gid, subject = 'the group';
      try { const info = await c.sock.groupGetInviteInfo(code); gid = info.id; subject = info.subject || subject; }
      catch { return c.reply('📢 *PROMOTE*\n\n❌ That link is invalid or expired.'); }

      await c.reply(`📢 *PROMOTE*\n\n⏳ Joining *${subject}*…`);
      let joined = false;
      try { await c.sock.groupAcceptInvite(code); joined = true; }
      catch (e) {
        const msg = String(e?.message || e);
        if (!/conflict|already|409/i.test(msg)) return c.reply(`📢 *PROMOTE*\n\n❌ Couldn't join: ${msg}\nThe link may be revoked, or the group needs admin approval.`);
      }
      await sleep(3000);

      let meta = null;
      try { meta = await c.sock.groupMetadata(gid); } catch {}
      let report;
      if (!meta) {
        report = '❌ Join request sent but not approved yet (the group needs admin approval).';
      } else {
        const ids = [nj(c.sock.user.id), nj(c.sock.user.lid || '')];
        const me = meta.participants.find(p => aliases(p).some(a => ids.includes(a)));
        if (meta.announce && !me?.admin) report = `⚠️ *${subject}* is admins-only, so I can't send there.`;
        else {
          try {
            await c.sock.sendMessage(gid, { text: TEXT, mentions: meta.participants.map(p => p.id) }); // hidden tag-all
            report = `✅ Sent to *${subject}* (${meta.participants.length} members, hidden tag)`;
          } catch (e) { report = `❌ Couldn't send: ${e?.message || e}`; }
        }
      }
      if (joined && meta) { await sleep(2500); try { await c.sock.groupLeave(gid); report += '\n👋 Left the group.'; } catch { report += '\n⚠️ Could not leave automatically.'; } }
      else if (!joined) report += '\n(I was already in this group, so I stayed.)';
      await c.reply(`📢 *PROMOTE*\n\n${report}`);
    });
  },
};
