const VERIFIED_WALLET_ROLE_ID = "1498390601199255794";
const LEADERBOARD_CHANNEL_ID = "1498090264734990497";

const GENERAL_CHAT_CHANNEL_ID = "1498087642120851677";

const WAX_CHAIN_API = "https://wax.greymass.com";
const WAX_HISTORY_API = "https://api.waxsweden.org";
const DEFAULT_WAX_HISTORY_APIS = [
  WAX_HISTORY_API,
  "https://wax.eosrio.io",
  "https://wax.eosphere.io",
  "https://api.wax.alohaeos.com"
];
const WAX_HISTORY_APIS = (process.env.WAX_HISTORY_APIS || DEFAULT_WAX_HISTORY_APIS.join(","))
  .split(",")
  .map(api => api.trim())
  .filter(Boolean);
const CONTRACT_ACCOUNTS = ["niftykickgam", "niftykicksgm", "niftykickgme"];
const CONVOY_CONTRACTS = ["niftykickgam"];
const CONVOY_ACTIONS = ["sendconvoy"];
const LEVEL_FIELDS = ["level", "Level", "tier", "Tier", "lvl", "Lvl"];

const RAID_WINDOW_SECONDS = 120;
const RAID_SUCCESS_CHANCE = 0.40;
const LEGENDARY_CONVOY_CHANCE = 0.08;
const LEGENDARY_RAID_SUCCESS_CHANCE = 0.25;
const FACTION_WAR_REWARD_NKFE = 500;
const MIN_FACTION_MEMBERS = 3;
const MIN_FACTION_SUCCESSFUL_RAIDS = 5;

const RAIDER_FACTIONS = {
  iron_wolves: {
    name: "Iron Wolves",
    emoji: "🐺",
    description: "Aggressive raiders who strike fast and hard."
  },
  neon_bandits: {
    name: "Neon Bandits",
    emoji: "🌌",
    description: "Flashy scavengers chasing high-value convoys."
  },
  steel_serpents: {
    name: "Steel Serpents",
    emoji: "🐍",
    description: "Patient strategists waiting for the perfect ambush."
  },
  shadow_couriers: {
    name: "Shadow Couriers",
    emoji: "🕶️",
    description: "Silent interceptors operating in the dark routes."
  }
};

module.exports = {
  VERIFIED_WALLET_ROLE_ID,
  LEADERBOARD_CHANNEL_ID,
  GENERAL_CHAT_CHANNEL_ID,
  WAX_CHAIN_API,
  WAX_HISTORY_API,
  WAX_HISTORY_APIS,
  CONTRACT_ACCOUNTS,
  CONVOY_CONTRACTS,
  CONVOY_ACTIONS,
  LEVEL_FIELDS,
  RAID_WINDOW_SECONDS,
  RAID_SUCCESS_CHANCE,
  LEGENDARY_CONVOY_CHANCE,
  LEGENDARY_RAID_SUCCESS_CHANCE,
  FACTION_WAR_REWARD_NKFE,
  MIN_FACTION_MEMBERS,
  MIN_FACTION_SUCCESSFUL_RAIDS,
  RAIDER_FACTIONS
};
