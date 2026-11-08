// JAMAICA TIME. America/Jamaica is UTC-5 all year (Jamaica has no daylight saving time).
// Everything in the bot that depends on "what day" or "what hour" it is uses this file, so it doesn't matter which timezone the server runs in.
const OFFSET = -5 * 3600000, DAY = 86400000, HALF = 43200000;
const pad = n => String(n).padStart(2, '0');
const local = ts => new Date(ts + OFFSET);                                   // read it with the getUTC* methods
const dayNum = ts => Math.floor((ts + OFFSET) / DAY);                        // Jamaica calendar day number (changes at 12:00 AM Jamaica time)
const dayKey = ts => local(ts).toISOString().slice(0, 10);                   // 'YYYY-MM-DD' (Jamaica date)
const nextMidnight = ts => (dayNum(ts) + 1) * DAY - OFFSET;                  // the next 12:00 AM in Jamaica, as a timestamp
const nextHalfDay = ts => (Math.floor((ts + OFFSET) / HALF) + 1) * HALF - OFFSET; // the next 12:00 AM or 12:00 PM in Jamaica
const parts = ts => { const d = local(ts); return { h: d.getUTCHours(), m: d.getUTCMinutes(), key: dayKey(ts) }; };
const stamp = ts => local(ts).toISOString().slice(5, 16).replace('T', ' ');  // 'MM-DD HH:MM'
const clock = ts => { const { h, m } = parts(ts); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; }; // '7:05 PM'
module.exports = { OFFSET, DAY, dayNum, dayKey, nextMidnight, nextHalfDay, parts, stamp, clock };
