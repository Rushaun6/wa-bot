// .ds: delete every group status the bot has seen in this group (index.js records them as they are posted).
// Group admins / owner only. Nothing is sent in the group: the result goes to the sender's inbox.
module.exports = {
  category: '👥 GROUP TOOLS',
  register(def, L) {
    const { db, aliases, nj, sleep } = L;
    def('ds', { usage: ['ds'] }, async c => {
      const { sock, chat, meta, sender, senderJid, isOwner } = c;
      if (!c.isGroup) return;
      const dm = t => sock.sendMessage(sender + '@s.whatsapp.net', { text: t }).catch(() => {});
      const mine = [nj(sock.user.id), nj(sock.user.lid || '')];
      const parts = meta?.participants || [];
      const senderAdmin = isOwner || !!parts.find(p => aliases(p).includes(senderJid))?.admin;
      if (!senderAdmin) return; // stay silent for non-admins
      const name = meta?.subject || 'the group';
      if (!parts.find(p => aliases(p).some(a => mine.includes(a)))?.admin) return dm('⚠️ .ds failed in ' + name + ': make me a group admin first.');
      const g = db.group(chat), keys = g.statusKeys || []; g.statusKeys = []; db.save();
      let ok = 0, bad = 0, err = '';
      for (const k of keys) {
        try { await sock.sendMessage(chat, { delete: { remoteJid: chat, id: k.id, participant: k.p, fromMe: !!k.me } }); ok++; } catch (e) { bad++; err = err || e.message; }
        await sleep(500);
      }
      return dm(ok || bad ? (ok ? '✅ .ds: deleted ' + ok + ' group status' + (ok > 1 ? 'es' : '') : '❌ .ds: nothing deleted') + ' in ' + name + (bad ? ' (' + bad + ' failed: ' + err + ')' : '')
                   : 'ℹ️ .ds: no group status to delete in ' + name + ' (I only know the ones posted while I was running).');
    });
  },
};
