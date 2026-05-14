function env(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : value;
}

function envFlag(name, fallback = false) {
  const value = env(name, fallback ? "true" : "false");
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function envInteger(name, fallback = 0) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function envNumber(name, fallback = 0) {
  const value = Number.parseFloat(env(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function envIntegerList(name, fallback = "") {
  return env(name, fallback)
    .split(",")
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isInteger(value) && value >= 0);
}

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
const WAX_HISTORY_APIS = env("WAX_HISTORY_APIS", DEFAULT_WAX_HISTORY_APIS.join(","))
  .split(",")
  .map(api => api.trim())
  .filter(Boolean);
const CONTRACT_ACCOUNTS = ["niftykickgam", "niftykicksgm", "niftykickgme"];
const CONVOY_CONTRACTS = ["niftykickgam"];
const CONVOY_ACTIONS = ["sendconvoy"];
const LEVEL_FIELDS = ["level", "Level", "tier", "Tier", "lvl", "Lvl"];

const RAID_WINDOW_SECONDS = Math.max(1, envInteger("RAID_DURATION_SECONDS", envInteger("RAID_WINDOW_SECONDS", 120)));
const RAID_SUCCESS_CHANCE = 0.40;
const LEGENDARY_CONVOY_CHANCE = 0.08;
const LEGENDARY_RAID_SUCCESS_CHANCE = 0.25;
const FACTION_WAR_REWARD_NKFE = 500;
const MIN_FACTION_MEMBERS = 3;
const MIN_FACTION_SUCCESSFUL_RAIDS = 5;

const NKFE_SYSTEM_ENABLED = envFlag("NKFE_SYSTEM_ENABLED", true);
const NKFE_WITHDRAWALS_ENABLED = envFlag("NKFE_WITHDRAWALS_ENABLED", true);
const NKFE_PAYOUTS_ENABLED = envFlag("NKFE_PAYOUTS_ENABLED", true);
const NKFE_PAYOUT_API_URL = env("NKFE_PAYOUT_API_URL", "");
const NKFE_PAYOUT_API_KEY = env("NKFE_PAYOUT_API_KEY", "");
const NKFE_PAYOUT_TIMEOUT_MS = envInteger("NKFE_PAYOUT_TIMEOUT_MS", 15000);
const NKFE_TOKEN_DECIMALS = envInteger("NKFE_TOKEN_DECIMALS", 8);
const NKFE_PAYOUT_DECIMAL_FALLBACKS = envIntegerList("NKFE_PAYOUT_DECIMAL_FALLBACKS", "4");
const NKFE_WITHDRAWAL_FEE_PERCENT = envNumber("NKFE_WITHDRAWAL_FEE_PERCENT", 0.03);
const NKFE_WITHDRAWAL_COOLDOWN_DAYS = envInteger("NKFE_WITHDRAWAL_COOLDOWN_DAYS", 14);
const DEV_BYPASS_WITHDRAWAL_COOLDOWN = envFlag("DEV_BYPASS_WITHDRAWAL_COOLDOWN", false);

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
  env,
  envFlag,
  envInteger,
  envNumber,
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
  NKFE_SYSTEM_ENABLED,
  NKFE_WITHDRAWALS_ENABLED,
  NKFE_PAYOUTS_ENABLED,
  NKFE_PAYOUT_API_URL,
  NKFE_PAYOUT_API_KEY,
  NKFE_PAYOUT_TIMEOUT_MS,
  NKFE_TOKEN_DECIMALS,
  NKFE_PAYOUT_DECIMAL_FALLBACKS,
  NKFE_WITHDRAWAL_FEE_PERCENT,
  NKFE_WITHDRAWAL_COOLDOWN_DAYS,
  DEV_BYPASS_WITHDRAWAL_COOLDOWN,
  RAIDER_FACTIONS
};
