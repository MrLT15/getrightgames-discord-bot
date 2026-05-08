const {
  Client,
  GatewayIntentBits
} = require("discord.js");

// Node 18+ includes global fetch. Do not require node-fetch v3 from CommonJS.
const { Pool } = require("pg");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const REQUIRED_ENV_VARS = { TOKEN, GUILD_ID, CLIENT_ID, DATABASE_URL };
for (const [key, value] of Object.entries(REQUIRED_ENV_VARS)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const {
  VERIFIED_WALLET_ROLE_ID,
  LEADERBOARD_CHANNEL_ID,
  GENERAL_CHAT_CHANNEL_ID,
  WAX_CHAIN_API,
  CONTRACT_ACCOUNTS,
  LEVEL_FIELDS,
  RAIDER_FACTIONS
} = require("./src/config/constants");
const { createRankFeature } = require("./src/features/ranks");
const { createRaidFeature } = require("./src/features/raids");
const { createProfileFeature } = require("./src/features/profile");
const { initDatabase } = require("./src/db/init");
const { createWalletRepository } = require("./src/db/wallets");
const { createRaiderRepository } = require("./src/db/raiders");
const { createWaxService } = require("./src/services/wax");
const { createAssetService } = require("./src/services/assets");
const { ROLE_RULES, createRoleService } = require("./src/services/roles");
const { registerCommands } = require("./src/bot/commands");
const { createInteractionHandler } = require("./src/bot/interactions");
const { startSchedules } = require("./src/bot/schedules");
const { registerWelcomeHandler } = require("./src/bot/welcome");

let verifiedWallets = {};
let tableReadWarningKeys = new Set();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

const {
  loadWalletsFromDatabase,
  saveWalletToDatabase,
  removeWalletFromDatabase,
  getVerifiedWallet
} = createWalletRepository({
  pool,
  getWallets: () => verifiedWallets
});

const {
  ensureRaiderProfile,
  getRaiderProfile,
  setRaiderFaction,
  recordRaid,
  revertSelfRaids
} = createRaiderRepository({ pool });

const waxService = createWaxService({
  waxChainApi: WAX_CHAIN_API,
  logTableReadWarning
});

const {
  getAllRoleAssets,
  countTemplates,
  countAssetsByTemplateMinLevel,
  hasMachineSetAtLevel,
  qualifiesForRule,
  selectHighestGroupedRules
} = createAssetService({
  contractAccounts: CONTRACT_ACCOUNTS,
  levelFields: LEVEL_FIELDS,
  waxService
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanValue(value, fallback = "Unknown") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function logTableReadWarning(code, table, reason, prefix = "Skipping table") {
  const warningKey = `${prefix}:${code}.${table}:${reason}`;
  if (tableReadWarningKeys.has(warningKey)) return;

  tableReadWarningKeys.add(warningKey);
  console.log(`${prefix} ${code}.${table}: ${reason}`);
}

function getFactionLabel(factionKey) {
  if (!factionKey || !RAIDER_FACTIONS[factionKey]) return "No faction";
  const faction = RAIDER_FACTIONS[factionKey];
  return `${faction.emoji} ${faction.name}`;
}

const {
  processWalletByMember,
  refreshAllVerifiedWallets,
  buildStatsMessage,
  buildLeaderboardMessage,
  postDailyLeaderboard
} = createRoleService({
  client,
  guildId: GUILD_ID,
  leaderboardChannelId: LEADERBOARD_CHANNEL_ID,
  verifiedWalletRoleId: VERIFIED_WALLET_ROLE_ID,
  getWallets: () => verifiedWallets,
  saveWalletToDatabase,
  removeWalletFromDatabase,
  getAllRoleAssets,
  countTemplates,
  qualifiesForRule,
  selectHighestGroupedRules,
  sleep
});

const rankFeature = createRankFeature({
  pool,
  getVerifiedWallet,
  ensureRaiderProfile,
  getRaiderProfile,
  getFactionLabel
});

const raidFeature = createRaidFeature({
  client,
  pool,
  guildId: GUILD_ID,
  getVerifiedWallet,
  ensureRaiderProfile,
  getRaiderProfile,
  recordRaid,
  revertSelfRaids,
  rankFeature,
  getFactionLabel,
  getVerifiedWallets: () => verifiedWallets,
  cleanValue,
  sleep
});

const profileFeature = createProfileFeature({
  roleRules: ROLE_RULES,
  getVerifiedWallet,
  getAllRoleAssets,
  countTemplates,
  countAssetsByTemplateMinLevel,
  hasMachineSetAtLevel,
  qualifiesForRule,
  selectHighestGroupedRules,
  ensureRaiderProfile,
  getRaiderProfile,
  processWalletByMember,
  rankFeature,
  raidFeature,
  getFactionLabel
});

const handleInteraction = createInteractionHandler({
  pool,
  verifiedWalletRoleId: VERIFIED_WALLET_ROLE_ID,
  generalChatChannelId: GENERAL_CHAT_CHANNEL_ID,
  raiderFactions: RAIDER_FACTIONS,
  getVerifiedWallets: () => verifiedWallets,
  getVerifiedWallet,
  setRaiderFaction,
  processWalletByMember,
  refreshAllVerifiedWallets,
  buildStatsMessage,
  buildLeaderboardMessage,
  rankFeature,
  raidFeature,
  profileFeature
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await initDatabase(pool, DATABASE_URL);
  verifiedWallets = await loadWalletsFromDatabase();
  console.log(`Loaded ${Object.keys(verifiedWallets).length} saved wallets from database.`);

  await registerCommands({ token: TOKEN, clientId: CLIENT_ID, guildId: GUILD_ID });

  startSchedules({
    refreshAllVerifiedWallets,
    postDailyLeaderboard,
    raidFeature
  });
});

registerWelcomeHandler(client);
client.on("interactionCreate", handleInteraction);

client.login(TOKEN);
