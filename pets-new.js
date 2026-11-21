// 65 new pets with non-animal emojis, using the new abilities (all explained in pets.js describe()):
//   luck (gambling luck), incmult (+% on ALL your pet income: +100 = x2 money), payday (% chance beg/work/daily pays double),
//   cratedrop (a crate every `mins` minutes worth about `avg` coins, see cmd-crates.js), explorer (+% expedition loot), swift (-% expedition time),
//   slayer (+% boss damage), broker (-% trading spread), silver (rumors work better / get caught less), mutagen (+% fusion mutation chance).
// format: [tier, id, name, emoji, income per 3 min, [abilities]]
const L = (base) => ({ type: 'luck', base }), I = (base) => ({ type: 'incmult', base }), PD = (base) => ({ type: 'payday', base }),
  C = (mins, avg) => ({ type: 'cratedrop', mins, avg }), X = (base) => ({ type: 'explorer', base }), SW = (base) => ({ type: 'swift', base }),
  SL = (base) => ({ type: 'slayer', base }), B = (base) => ({ type: 'broker', base }), SI = (base) => ({ type: 'silver', base }), M = (base) => ({ type: 'mutagen', base }),
  G = (base) => ({ type: 'guard', base }), D = (base) => ({ type: 'duel', base }), R = (base) => ({ type: 'robboost', base }), RL = (base) => ({ type: 'robloot', base }),
  LP = (base) => ({ type: 'lockpick', base }), CB = (base) => ({ type: 'cashback', base });
module.exports = [
  // ---------- common
  ['common', 'boba', 'Boba Sprite', '🧋', 130, [L(1)]], ['common', 'pizza', 'Pizza Slice Golem', '🍕', 140, []], ['common', 'taco', 'Taco Tank', '🌮', 135, [G(3)]],
  ['common', 'cactus', 'Grumpy Cactus', '🌵', 100, [G(5)]], ['common', 'sock', 'Lucky Sock', '🧦', 0, [L(2), PD(3)]], ['common', 'bubblebath', 'Bubble Bath Buddy', '🛁', 0, [C(30, 1500)]],
  ['common', 'petrock', 'Pet Rock', '🪨', 110, [G(3)]], ['common', 'lamp', 'Bright Idea Lamp', '💡', 120, [PD(3)]], ['common', 'popcorn', 'Popcorn Pup', '🍿', 0, [C(30, 1400), L(1)]],
  ['common', 'balloon', 'Balloon Buddy', '🎈', 0, [L(1), X(5)]],
  // ---------- rare
  ['rare', 'clover', 'Four-Leaf Fairy', '🍀', 100, [L(4)]], ['rare', 'compass', 'Wandering Compass', '🧭', 120, [X(15)]], ['rare', 'ufo', 'Tiny UFO', '🛸', 200, [X(8)]],
  ['rare', 'ghost', 'Friendly Ghost', '👻', 150, [G(10), SW(5)]], ['rare', 'robo', 'Rusty Robo', '🤖', 200, [I(8)]], ['rare', 'mimic', 'Box Mimic', '📦', 0, [C(15, 2000)]],
  ['rare', 'hatwizard', 'Hat Wizard', '🧙', 100, [L(2), SI(10)]], ['rare', 'candle', 'Candle Spirit', '🕯️', 150, [PD(6)]], ['rare', 'kite', 'Storm Kite', '🪁', 150, [SW(10), X(6)]],
  ['rare', 'stargazer', 'Star Gazer', '🔭', 100, [B(6)]], ['rare', 'drum', 'Drum Beast', '🥁', 150, [SL(8)]], ['rare', 'anchor', 'Salty Anchor', '⚓', 100, [G(12)]],
  // ---------- epic
  ['epic', 'genie', 'Pocket Genie', '🧞', 300, [L(5), PD(8)]], ['epic', 'ninja', 'Shadow Ninja', '🥷', 300, [R(12), LP(8)]], ['epic', 'vampire', 'Count Cashula', '🧛', 400, [I(15)]],
  ['epic', 'oracle', 'Crystal Ball Oracle', '🔮', 200, [L(6), SI(20)]], ['epic', 'comet', 'Comet Cub', '☄️', 300, [X(25), SW(12)]], ['epic', 'gobling', 'Gift Goblin', '🎁', 0, [C(9, 3100)]],
  ['epic', 'moneybag', 'Money Bag Beast', '💰', 400, [I(18)]], ['epic', 'knight', 'Grandmaster Knight', '♟️', 300, [D(9), SL(15)]], ['epic', 'slime', 'Rainbow Slime', '🌈', 200, [L(4), PD(10)]],
  ['epic', 'pixelmage', 'Pixel Mage', '👾', 250, [B(10), SI(15)]], ['epic', 'tornado', 'Pocket Tornado', '🌪️', 250, [SW(18), X(15)]], ['epic', 'imp', 'Ember Imp', '🔥', 300, [SL(22)]],
  // ---------- legendary
  ['legendary', 'phoenix', 'Phoenix Feather', '🪶', 0, [C(6, 6500), L(6)]], ['legendary', 'samurai', 'Ghost Samurai', '⚔️', 800, [D(14), R(14), SL(30)]], ['legendary', 'pharaoh', 'Golden Pharaoh', '🏺', 800, [I(30), PD(12)]],
  ['legendary', 'alchemist', 'Alchemist Owl', '⚗️', 600, [M(25), L(7)]], ['legendary', 'pirate', 'Captain Booty', '🏴‍☠️', 800, [X(40), RL(20)]], ['legendary', 'astronaut', 'Astro Nibbles', '🧑‍🚀', 600, [X(35), SW(25)]],
  ['legendary', 'jester', 'Chaos Jester', '🃏', 500, [L(9), PD(15)]], ['legendary', 'chestcrab', 'Treasure Chest Crab', '🧰', 0, [C(6, 7000)]], ['legendary', 'witch', 'Moonlit Witch', '🪄', 500, [SI(40), B(15)]],
  ['legendary', 'bellhop', 'Bell Hop Bandit', '🛎️', 700, [I(25), LP(12)]],
  // ---------- mythic
  ['mythic', 'timeweaver', 'Time Weaver', '⏳', 1500, [SW(40), X(50)]], ['mythic', 'midashound', 'King Midas Hound', '👑', 2000, [I(60)]], ['mythic', 'voidwhale', 'Void Whale', '🕳️', 1500, [SL(60), L(10)]],
  ['mythic', 'arcade', 'Arcade Spirit', '🕹️', 0, [L(11), PD(18), C(4, 14000)]], ['mythic', 'thunder', 'Thunder God Pup', '⚡', 1500, [SL(50), D(14)]], ['mythic', 'nebulafox', 'Nebula Fox', '🌠', 1500, [L(10), X(60)]],
  ['mythic', 'jackpotgenie', 'Jackpot Genie', '🎰', 1000, [L(12), PD(20)]], ['mythic', 'bankangel', 'Banker Angel', '😇', 2000, [I(50), CB(8)]],
  // ---------- divine
  ['divine', 'solar', 'Solar Sovereign', '☀️', 5000, [I(80), PD(22)]], ['divine', 'lunar', 'Lunar Oracle', '🌙', 4000, [L(13), B(30), SI(50)]], ['divine', 'dragonet', 'Diamond Dragonet', '💎', 0, [C(3, 39000), I(40)]],
  ['divine', 'sphinx', 'Crown Jewel Sphinx', '🔱', 5000, [SL(90), D(18)]], ['divine', 'infinity', 'Infinity Loop', '♾️', 3000, [PD(30), I(60)]], ['divine', 'phantomking', 'Phantom Heist King', '🎭', 5000, [RL(40), LP(20), R(20)]],
  // ---------- celestial
  ['celestial', 'singularity', 'Singularity', '⚫', 10000, [I(120), L(14)]], ['celestial', 'worldtree', 'World Tree Spirit', '🌳', 0, [C(3, 143000), X(100), I(60)]],
  ['celestial', 'supernova', 'Supernova Serpent', '💥', 10000, [SL(150), PD(35)]], ['celestial', 'clockwork', 'Clockwork Titan', '⚙️', 10000, [SW(60), B(50), SI(80)]],
  // ---------- cosmic
  ['cosmic', 'omegamidas', 'Omega Midas', '🏆', 20000, [I(100), PD(25), L(15)]], ['cosmic', 'cratedeity', 'Crate Deity', '🧿', 0, [C(3, 195000), L(12)]],
  ['cosmic', 'hacker', 'Reality Hacker', '🌀', 20000, [I(60), B(50), SL(200), X(150)]],
];
