# What to upload

**add/**      new files. Drop them next to your other cmd-*.js files. (potions.js and cmd-potions.js REPLACE last round's copies.)
**replace/**  4 existing files with edits. If you changed them on GitHub since, apply `changes.patch` instead of replacing.

## Added this round
18 new items/crates, 13 potions (was 10), and a Potion Crate.
- Robbery: Ghost Cloak.  Protection: Guard Dog, Alarm System, Vault Door.
- Business: Coffee Shop, Factory, Casino, Space Port.  Luxury: Rare Painting, Helicopter (6 rebirths), Private Jet, Moon Base.
- Crates: Copper, Potion, Emerald, Frost, Inferno, Cosmic.
- Potions good: Luck Brew, Four-Leaf Tonic, Stardust Elixir, Adrenaline Shot, Rage Potion, Rainbow Remedy, Lucky Flask.
- Potions bad (gift only): Skunk Tonic, Snake Oil, Clown Elixir, Jinx Juice, Leaky Pocket, Jail Juice.

## Fixed from last round (potions)
Money Flask paid 2x its price, and the cash potions multiplied passive income (worth millions to rich players). Removed.
Curses that take money are now capped (Jinx max $300k, Leaky max $120k).

## Old crates still exploitable
bronze/silver/gold/diamond/shadow/negatron return 150-200% with crate pets (negatron 101% even without).
To fix: add their ids to NO_PET_BONUS in cmd-shop.js (negatron also needs a lower loot table).
