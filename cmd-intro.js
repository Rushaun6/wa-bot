// INTRO WELCOME: when people join a group, the bot tells them to introduce themselves (pic, name, age).
// If several people join within 5 seconds of each other, they all get ONE message together.
//   .intro on / .intro off   turn it on or off for this group (group admins; it is OFF until you turn it on)
//   .intro                   shows the status      .intro test   shows what new members will see
const WINDOW = 5000; // everyone who joins within 5 seconds of the first joiner goes in the same message

module.exports = {
  category: '🛡️ GROUP TOOLS',
  register(def, L) {
    const { P, db, nj } = L;
    const pending = new Map(); // group jid -> { ids: Set, timer }
    const tagName = jid => '@' + String(jid).split('@')[0];
    const message = jids => `👋 *WELCOME* ${jids.map(tagName).join(' ')}!\n\nPlease introduce ${jids.length > 1 ? 'yourselves' : 'yourself'} so we can get to know you:\n📸 *Pic*\n📝 *Name*\n🎂 *Age*\n\nSend them here in the chat 👇`;

    async function flush(sock, groupJid) {
      const p = pending.get(groupJid); if (!p) return; pending.delete(groupJid);
      const jids = [...p.ids]; if (!jids.length) return;
      await sock.sendMessage(groupJid, { text: message(jids), mentions: jids }).catch(e => console.error('intro send failed:', e?.message || e));
    }
    // called by index.js for every group-participants.update
    function onUpdate(sock, u) {
      if (u?.action !== 'add' || !db.data.groups[u.id]?.intro) return;
      const own = [nj(sock.user?.id || ''), nj(sock.user?.lid || '')];
      let p = pending.get(u.id);
      for (const x of u.participants || []) {
        const jid = typeof x === 'string' ? x : (x?.id || x?.phoneNumber);
        if (!jid || own.includes(nj(jid))) continue; // not the bot itself
        if (!p) { p = { ids: new Set(), timer: setTimeout(() => flush(sock, u.id), WINDOW) }; pending.set(u.id, p); }
        p.ids.add(jid);
      }
    }
    (L.state.joinHooks ||= []).push(onUpdate);

    def('intro', { g: true, a: true, usage: ['intro on', 'intro off', 'intro'] }, c => {
      const g = db.group(c.chat), arg = (c.args[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') { g.intro = arg === 'on'; db.save(); }
      if (arg === 'test') return c.reply(message([c.senderJid]), [c.senderJid]);
      c.reply(`👋 *INTRO WELCOME*\n\nStatus: ${g.intro ? '🟢 ON' : '🔴 OFF'}\n\nWhen ON, new members are told to introduce themselves with a *pic, name and age*. If several people join within 5 seconds, they all get one message.\n\n${P}intro on  •  ${P}intro off  •  ${P}intro test`);
    });
    module.exports._test = { onUpdate, pending, message };
  },
};
