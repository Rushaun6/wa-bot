// 🌍 WORLD EVENTS: every 8-20 hours the "world" does something surprising for 40-60 minutes, for everyone: double pet income, robbery free-for-all,
// lucky hour, casino night, blackout (padlocks fail), pet fire sale, expedition boom, crate rain, market frenzy, boss rush.
// Effects ride on lib.js abOf (cash, luck, sale, frenzy, jackpot) plus: blackout, expo, crate, vol. Announced only in groups where the bot AND the economy are on.
module.exports = {
  category: '🌍 EVENTS',
  register(def, L) {
    const { P, db, rnd, left } = L;
    const EV = {
      goldrush: { name: 'Gold Rush', emoji: '💰', mins: 45, ab: { cash: 2 }, text: ['A mysterious billionaire dumped crates of gold on the city.', 'Gold was found under the bot HQ. Everybody grab a shovel!'], what: 'ALL pet income and beg/work/daily pay *double*' },
      purge: { name: 'Purge Hour', emoji: '🔪', mins: 40, ab: { frenzy: 1 }, text: ['The police are on a coffee break.', 'Crime is legal for a while. Lock your doors.'], what: 'Robbing has *no cooldown* and +25% success' },
      lucky: { name: 'Lucky Hour', emoji: '🍀', mins: 60, ab: { luck: 1.6 }, text: ['A rainbow appeared over the casino.', 'Somebody spilled a bag of four-leaf clovers.'], what: '*+6 luck*: better coin flips, more lucky saves, luckier begging' },
      casino: { name: 'Casino Night', emoji: '🎰', mins: 50, ab: { jackpot: 1.25 }, text: ['The casino is feeling generous tonight.', 'High rollers get VIP treatment.'], what: 'Gambling *wins pay +25%*' },
      blackout: { name: 'Blackout', emoji: '🌑', mins: 30, ab: { blackout: 1 }, text: ['The power grid failed. Every alarm is dead.', 'Lights out across the city!'], what: '*Padlocks don\'t work* and guard pets are half as good' },
      sale: { name: 'Pet Fire Sale', emoji: '🏷️', mins: 60, ab: { sale: 30 }, text: ['The pet shop owner lost a bet.', 'Clearance! The shop wants those cages empty.'], what: 'Pet shop is *30% off*' },
      expo: { name: 'Expedition Boom', emoji: '🧭', mins: 60, ab: { expo: 2 }, text: ['Treasure maps are literally falling from the sky.', 'A new continent was discovered overnight.'], what: 'Expeditions give *double loot* and are *2x faster*' },
      crates: { name: 'Crate Rain', emoji: '📦', mins: 45, ab: { crate: 2 }, text: ['A cargo plane lost its load over the city.', 'Crates are raining from the clouds!'], what: 'Crate pets make crates *twice as fast*' },
      frenzy: { name: 'Market Frenzy', emoji: '📈', mins: 45, ab: { vol: 2 }, text: ['Traders have gone completely wild.', 'Somebody tweeted something. Prices are going crazy.'], what: 'Trading prices swing *twice as hard*' },
      bossrush: { name: 'Boss Rush', emoji: '🐉', mins: 10, ab: {}, text: ['The portals are open. Everything is coming through.', 'Every boss in the realm woke up angry.'], what: 'A *world boss spawns in every active group*', action: () => L.raid?.spawnAll?.() },
    };
    const ids = Object.keys(EV), st = () => (db.data.events.world ||= { cur: null, next: 0, last: '' });
    const econGroups = () => Object.keys(db.data.groups).filter(id => id.endsWith('@g.us') && db.data.groups[id]?.bot === true && db.data.groups[id]?.economy === true);
    const announce = text => { const s = L.state.sock; if (s) for (const id of econGroups()) s.sendMessage(id, { text }).catch(() => {}); };
    function start(id, mins) {
      const e = EV[id], w = st(), until = Date.now() + (mins || e.mins) * 60000;
      w.cur = { id, until, ab: e.ab, name: e.name }; w.last = id; w.next = until + rnd(8, 20) * 3600000; L.state.worldEvent = w.cur; db.save();
      announce(`🌍 *WORLD EVENT: ${e.emoji} ${e.name.toUpperCase()}!*\n\n_${e.text[rnd(0, e.text.length - 1)]}_\n\n✨ ${e.what}\n⏳ For *${left(until - Date.now())}*`);
      e.action?.();
    }
    function stop() { const w = st(); if (!w.cur) return; const e = EV[w.cur.id]; w.cur = null; L.state.worldEvent = null; db.save(); announce(`🌍 The ${e?.emoji || ''} *${e?.name || 'event'}* is over. Back to normal!`); }
    function tick() {
      const w = st(), now = Date.now();
      if (w.cur && now < w.cur.until) { L.state.worldEvent = w.cur; return; } // (also re-applies it after a restart)
      if (w.cur) return stop();
      L.state.worldEvent = null;
      if (!w.next) { w.next = now + rnd(2, 8) * 3600000; db.save(); return; }
      if (now >= w.next && econGroups().length) { const pool = ids.filter(i => i !== w.last); start(pool[rnd(0, pool.length - 1)]); }
    }
    setInterval(() => { try { tick(); } catch (e) { console.error('event tick failed:', e?.message || e); } }, 30000).unref();
    L.petTicks = Object.assign(L.petTicks || {}, { eventTick: tick });
    L.events = { start, stop, EV };

    def(['event', 'events', 'worldevent'], { usage: ['event'] }, c => {
      const a = (c.args[0] || '').toLowerCase(), w = st();
      if (c.isOwner && a === 'start') { const id = (c.args[1] || '').toLowerCase(); if (!EV[id]) return c.reply(`⚠️ Events: ${ids.join(', ')}`); if (w.cur) stop(); start(id, parseInt(c.args[2], 10) || 0); return c.reply(`✅ Started ${EV[id].name}.`); }
      if (c.isOwner && a === 'stop') { stop(); return c.reply('🛑 Event stopped.'); }
      if (c.isOwner && a === 'list') return c.reply('🌍 Events: ' + ids.map(i => `${EV[i].emoji} ${i}`).join(' · ') + `\n${P}event start <id> [minutes] · ${P}event stop`);
      const cur = w.cur && Date.now() < w.cur.until ? EV[w.cur.id] : null;
      c.reply(cur ? `🌍 *WORLD EVENT: ${cur.emoji} ${cur.name.toUpperCase()}*\n\n✨ ${cur.what}\n⏳ *${left(w.cur.until - Date.now())}* left` : `🌍 *WORLD EVENTS*\n\nNothing going on right now.\nEvery 8-20 hours something surprising happens to the whole world: double income, robbery free-for-alls, boss rushes, crate rain and more.${w.next > Date.now() ? '' : ''}`);
    });
  },
};
