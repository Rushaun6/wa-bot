// 🤖 .bot on / .bot off: the bot does NOTHING in a group until a group admin sends ".bot on" (the default is OFF, so it can't spam
// groups it was just added to). Private chats always work. The economy has its own switch: ".economy on" (also default OFF).
// While the bot is off in a group it ignores everything except ".bot ...", and nothing can be sent into that group (index.js guards it).
module.exports = {
  category: '🤖 BOT SWITCH',
  register(def, L) {
    const { P, db, aliases } = L;
    const say = (c, text) => (c.sock.sendRaw || c.sock.sendMessage).call(c.sock, c.chat, { text }, c.msg ? { quoted: c.msg } : undefined).catch(() => {}); // sendRaw works even when the bot is off here
    const isAdmin = c => c.isOwner || !!c.meta?.participants?.find(p => aliases(p).includes(c.senderJid))?.admin;
    const state = g => `🤖 Bot: ${g.bot === true ? '*ON* ✅' : '*OFF* ❌'}\n💰 Economy: ${g.economy === true ? '*ON* ✅' : '*OFF* ❌'}`;

    def(['bot'], { usage: ['bot on', 'bot off', 'bot'] }, async c => {
      const a = (c.args[0] || '').toLowerCase();
      if ((a === 'list' || a === 'alloff') && c.isOwner) { // owner tools, work anywhere
        const on = Object.entries(db.data.groups).filter(([id, g]) => id.endsWith('@g.us') && g?.bot === true);
        if (a === 'alloff') { for (const [, g] of on) g.bot = false; db.save(); return say(c, `🛑 Bot switched OFF in *${on.length}* group${on.length === 1 ? '' : 's'}. Admins turn it back on with *${P}bot on*.`); }
        let names = {}; try { for (const g of Object.values(await c.sock.groupFetchAllParticipating())) names[g.id] = g.subject; } catch {}
        return say(c, `🤖 *BOT IS ON IN ${on.length} GROUP${on.length === 1 ? '' : 'S'}*\n\n` + (on.map(([id, g]) => `• ${names[id] || id.slice(0, 14) + '…'}${g.economy === true ? ' · 💰' : ''}`).join('\n') || '_none_') + `\n\n💰 = economy on · ${P}bot alloff turns it off everywhere`);
      }
      if (!c.isGroup) return say(c, `🤖 In private chats I always work.\nIn a group, a group admin turns me on with *${P}bot on*.`);
      const g = db.group(c.chat);
      if (a === 'on' || a === 'off') {
        if (!isAdmin(c)) return say(c, '🚫 Only group admins can switch me on or off here.');
        if (a === 'on') { g.bot = true; db.save(); return say(c, `🤖 *BOT ON*\n\nI'm active in this group now.\n💰 The economy is ${g.economy === true ? 'on' : `*off* (group admins: *${P}economy on* to turn it on)`}.\n\n${P}menu for commands · *${P}bot off* switches me off.`); }
        await say(c, `🤖 *BOT OFF*\n\nI won't respond or post anything in this group until an admin sends *${P}bot on*.`);
        g.bot = false; db.save(); return;
      }
      say(c, `${state(g)}\n\nGroup admins: *${P}bot on* / *${P}bot off* · *${P}economy on* / *${P}economy off*`);
    });
  },
};
