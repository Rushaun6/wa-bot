# What to upload

**add/** = new files. Drop them next to your other cmd-*.js files (no clashes with your existing commands).
**replace/** = 4 existing files with small edits. If you changed them on GitHub since, apply `changes.patch` instead of replacing.
No new npm packages needed.

## .song setup (put these in your .env or hosting variables)
JAMENDO_CLIENT_ID   free key from devportal.jamendo.com  -> enables Jamendo (Creative Commons music, downloadable)
YOUTUBE_API_KEY     YouTube Data API v3 key (Google Cloud) -> enables YouTube results (LINK ONLY, never downloaded)
MUSIC_DIR           optional, default ./music  -> put MP3s you own in it, named "Artist - Title.mp3"
Optional limits: SONG_MAX_JOBS (2), SONG_DL_TIMEOUT_MS (180000), SONG_MAX_MB (80), SONG_DOC_MAX_MB (64)
The Internet Archive needs no key. ffmpeg is already covered by ffmpeg-static (or set FFMPEG_PATH).

## Commands
.song <name> (.music)  search, then reply with the result number
.slot5 <bet|all>       5-reel slot, wild + scatter, 90.7% payout
.kill .gun(.bang) .simp(.sym) .fuck/.fu .hack .jail .rizz .iq .vibe .flip
.groupstatus on|off    auto-delete group status posts (needs index.js edit + bot admin)
+ events, gifting, potions, pet battles (.battle/.wild), story, .sticker, .audio

## Edits to existing files
items.js      mystery box loot table lowered (pays back ~54% instead of ~100-190%)
cmd-shop.js   NO_PET_BONUS list: crate pets no longer apply to the mystery box
index.js      (1) group status auto-delete  (2) a plain "2" answers a .song search  (3) loads group info for that reply only when a search is waiting
db.js         adds the `events` key so event timers sync to Supabase
