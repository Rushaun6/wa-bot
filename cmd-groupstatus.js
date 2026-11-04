// .groupstatus on|off: auto-delete group status posts. Works in ANY group where the bot is an admin (the bot has to be admin to delete).
// The deleting itself happens in index.js (see the edits in index.js). Group admins are never deleted.
module.exports = {
  category: '👥 GROUP TOOLS',
  register(def, L) {
    const { P, db } = L;
    def('groupstatus', { g: true, a: true, b: true, usage: ['groupstatus on', 'groupstatus off'] }, c => {
      const g = db.group(c.chat), arg = (c.args[0] || '').toLowerCase();
      if (arg === 'on' || arg === 'off') { g.autodelStatus = arg === 'on'; db.save(); }
      c.reply(`🧹 *GROUP STATUS AUTO-DELETE*\n\nStatus: ${g.autodelStatus ? '🟢 ON' : '🔴 OFF'}\n\nWhen ON, group status posts from members are deleted automatically. Group admins are exempt.\n\n${P}groupstatus on  •  ${P}groupstatus off`);
    });
  },
};
