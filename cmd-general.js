// menu, ping, owner, update info, vv
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  category: '🧭 GENERAL',
  register(def, L) {
    const { P, BOT, OWNERS, db, left } = L;

    def('menu', { usage: 'menu' }, c => c.reply(L.buildMenu()));

    def(['ping', 'uptime'], { usage: ['ping', 'uptime'] }, c => c.reply(`🏓 *PONG*\n\n⏱️ Uptime: *${left(process.uptime() * 1000)}*`));

    def('owner', {}, c => c.reply(`👑 *OWNER*\n\n${[...new Set([...OWNERS, ...db.data.owners])].map(o => 'wa.me/' + o).join('\n') || 'Not set'}`));

    // ---------- .update info ----------
    const UPDATE_OLD = `📜 *${BOT} — LAST UPDATE*

🎒 *Inventory & new shop*
• ${P}shop is now the NEGATRON SHOP — gear, protection, businesses, luxury, crates
• ${P}buy <item> • ${P}inv • ${P}use <item> • ${P}open <crate> • ${P}sell <item>
• Padlock is $2,000 (${P}use padlock) and Picklock is $4,000 (${P}pl @user, 50%)
• ${P}profile shows wallet, bank, net worth, luxury items & businesses
• Cars & the mansion unlock at *6 rebirths*

🐾 *Pets*
• 104 pets — every animal emoji! New tiers: ✨ Divine, 🌌 Celestial, 🪐 Cosmic
• Shop restocks every *2 hours* with *6* pets
• 🐐 *CR7* ($777,777,777): every 70 hours it has a 7% chance to multiply your bank by 7x
• ${P}noti all / ${P}noti legendary … — get a DM when the shop has what you want
• 🆕 New pets have creative abilities: crate luck, shop haggling, business boosts, bank interest, cheaper loans, mafia protection, picklock bonus, gambling cashback and more (see ${P}pet info <name>)

🏦 *Loans*
• ${P}bm <amount> to borrow, ${P}repay all within *6 hours*
• Don't pay and the Russian mafia takes your inventory — the more you borrowed, the worse it gets. Leftover debt makes your wallet negative

💸 *Passive income*
• Businesses pay every 3 min • the top 3 on the ${P}lb earn too

🤝 *Trading*: ${P}trade @user → ${P}trade add … → ${P}trade confirm
🙏 ${P}beg has way more replies (some react to your pets & items)
🛡️ *Group tools*: ${P}warn @user [reason] (3 warnings = removed), ${P}warns, ${P}unwarn
💞 ${P}facecard @user (facecard stamp) • 🏹 ${P}shoot @user — they answer ${P}yes / ${P}no
💥 *New admin abuses* (${P}ab): shop <tier>, luck, cash, sale, frenzy, jackpot, crate, petrain, forgive • ${P}boosts shows yours
💸 ${P}pay now only works on players who have at least $45,000
📉 ${P}anilb • 🔁 pet abilities now work on ${P}rob, ${P}beg, ${P}work, ${P}daily & ${P}duel`;
    // ---------- .update info: this update first, then the last one ----------
    const UPDATE_NEW = `🆕 *${BOT} — THIS UPDATE*

🎲 *Random events*
• A random event every *3 hours* (23 of them: cash rain, bank bonus, income burst, bandits, tax audit, supply drops, math races…) that scale with how rich you are
• 🍀 *Luck hour* at 12 AM and 12 PM *Jamaica time*
• ${P}eventinfo • ${P}eventlist • ${P}grab • ${P}solve <answer> • ${P}evjoin

🏦 *Bank heist*: ${P}bankheist @user (${P}bh) — rob someone's BANK. Very low chance, once a day. You put up a stake, fail and you lose it
🔒 *Auto padlock*: ${P}autopadlock on — $50,000,000, lasts 12 hours, puts your padlock back on by itself using padlocks from your inventory (no padlocks = no protection)
🎁 *Daily* now resets at *12:00 AM Jamaica time* — claim it every day, no more waiting a full 24 hours
🕐 All daily resets use *Jamaica time*

🎁 ${P}gift @user <pet/item/potion> — a 10% fee is added
🧪 *Potions*: ${P}potions • ${P}buypotion • ${P}drink — 13 potions. Cursed ones can only be gifted 😈
📦 *New items & crates*: Ghost Cloak, Guard Dog, Alarm System, Vault Door, Coffee Shop, Factory, Casino, Space Port, Rare Painting, Helicopter, Private Jet, Moon Base • Copper, Potion, Emerald, Frost, Inferno & Cosmic crates • the mystery box was rebalanced
⚔️ *Pet battles*: ${P}battle @user [bet] • ${P}wild
📖 *Story mode*: ${P}story (a new chapter every 8 hours)
🎰 ${P}slot5 — 5 reels, wilds and scatters
🎉 *Fun*: ${P}kill ${P}gun ${P}simp ${P}fuck ${P}hack ${P}jail ${P}rizz ${P}iq ${P}vibe ${P}flip
🛠️ ${P}sticker • ${P}audio

🛡️ *Group tools*: ${P}close <time> • ${P}open <time> (e.g. ${P}close 30m) • ${P}intro on (new members are told to send a pic, name & age) • ${P}groupstatus on
🩺 The leaderboard can no longer be broken by a huge balance`;
    def(['update', 'updateinfo', 'whatsnew'], { usage: 'update info' }, async c => { await c.reply(UPDATE_NEW); await c.reply(UPDATE_OLD); });

    // ---------- .vv — reply to a view-once photo/video/voice note to get it back as a normal message ----------
    const unwrap = m => m?.ephemeralMessage?.message || m?.viewOnceMessageV2?.message || m?.viewOnceMessageV2Extension?.message || m?.viewOnceMessage?.message || m;
    def(['vv', 'viewonce'], { ba: true, usage: 'vv (reply to a view-once)' }, async c => {
      let mm = c.msg.message; mm = mm?.ephemeralMessage?.message || mm;
      const ci = mm?.extendedTextMessage?.contextInfo, quoted = unwrap(unwrap(ci?.quotedMessage));
      if (!quoted) return c.reply(`👁️ *VIEW ONCE*\n\nReply to a view-once photo, video or voice note with *${P}vv*`);
      const kind = ['imageMessage', 'videoMessage', 'audioMessage'].find(k => quoted[k]);
      if (!kind) return c.reply('👁️ That message isn\'t a photo, video or voice note.');
      try {
        const media = quoted[kind], stream = await downloadContentFromMessage(media, kind.replace('Message', '')), parts = [];
        for await (const ch of stream) parts.push(ch);
        const buf = Buffer.concat(parts); if (!buf.length) throw new Error('empty');
        const caption = media.caption ? `👁️ ${media.caption}` : '👁️ View-once opened';
        const out = kind === 'imageMessage' ? { image: buf, caption } : kind === 'videoMessage' ? { video: buf, caption } : { audio: buf, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: !!media.ptt };
        await c.sock.sendMessage(c.chat, out, { quoted: c.msg });
      } catch (e) {
        console.error('vv failed:', e?.message || e);
        c.reply('⚠️ Couldn\'t open it. The media may have expired or WhatsApp no longer lets the bot read it.');
      }
    });
  },
};
