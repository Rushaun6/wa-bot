# What to upload

**add/**      new files. Drop them next to your other cmd-*.js files.
              (cmd-events.js, potions.js and cmd-potions.js REPLACE earlier copies.)
**replace/**  4 existing files with edits (items.js, cmd-shop.js, index.js, db.js).
              If you changed them on GitHub since, apply `changes.patch` instead of replacing.

## This round
- cmd-events.js     23 events that scale with wealth (see .eventlist). Warnings, live races, an opt-in gamble.
- cmd-audit.js      owner command .audit: shows the richest accounts' raw values + everything the money-safety code fixed.
- db.js             money safety: text/NaN/Infinity/null balances are repaired on every save (last good value restored), names are cleaned.
- index.js          stamps `seen` on each player (events skip accounts inactive for 7 days). Also has the group-status delete from before.

## Tuning the events
All numbers are in cmd-events.js: the first lines of each event (percentages, minimums, minutes) and `w:` (how common it is).
Average effect of the money events is roughly +1-2% of net worth per day, with tax/repair/bandits as money sinks.

## Known issues I did NOT change
- bronze/silver/gold/diamond/shadow/negatron crates return 150-200% with crate pets (see NO_PET_BONUS in cmd-shop.js).
- Shop loop: with haggle + sell-bonus pets at their caps you buy at 75% and sell at 80% (about +25k per $500k item, repeatable).
