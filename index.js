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
const { registerCommands } = require("./src/bot/commands");
const { createInteractionHandler } = require("./src/bot/interactions");
const { startSchedules } = require("./src/bot/schedules");
const { registerWelcomeHandler } = require("./src/bot/welcome");

let verifiedWallets = {};
let scheduledRefreshRunning = false;
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
  recordRaid
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

const ROLE_RULES = [
  { type: "simple_template", name: "📜 Archive_Keeper", roleId: "1497994063465545890", templateId: "680277", quantity: 1 },
  { type: "simple_template", name: "📚 Lore_Archivist", roleId: "1497994272094290073", templateId: "776806", quantity: 1 },
  { type: "simple_template", name: "📖 Master_Historian", roleId: "1497994442383032461", templateId: "776806", quantity: 3 },

  { type: "tiered_template", group: "factory", name: "⚙️ Factory_Operator", roleId: "1497992602077630597", templateId: "708905", minLevel: 3 },
  { type: "tiered_template", group: "factory", name: "🏭 Production_Manager", roleId: "1497992304584167574", templateId: "708905", minLevel: 6 },
  { type: "tiered_template", group: "factory", name: "🏭 Industrial_Tycoon", roleId: "1497993072481406986", templateId: "708905", minLevel: 9 },

  { type: "tiered_template", group: "workforce", name: "👷 Workforce_Foreman", roleId: "1497992827131527319", templateId: "708902", minLevel: 3 },
  { type: "tiered_template", group: "workforce", name: "👷 Workforce_Supervisor", roleId: "1497993473033244893", templateId: "708902", minLevel: 6 },
  { type: "tiered_template", group: "workforce", name: "👷 Workforce_Commander", roleId: "1497993654164263074", templateId: "708902", minLevel: 9 },

  { type: "tiered_template", group: "tech_center", name: "🧪 Innovation_Engineer", roleId: "1497996265332674660", templateId: "768499", minLevel: 1 },
  { type: "tiered_template", group: "tech_center", name: "🧠 Chief_Technology_Architect", roleId: "1497996511139725383", templateId: "768499", minLevel: 3 },

  { type: "tiered_template", group: "military", name: "🪖 Tactical_Commander", roleId: "1497997983910989987", templateId: "711919", minLevel: 1 },
  { type: "tiered_template", group: "military", name: "🛡 Defense_Strategist", roleId: "1497997778893275427", templateId: "711919", minLevel: 2 },
  { type: "tiered_template", group: "military", name: "⚔️ War_Logistics_Director", roleId: "1497997553747366069", templateId: "711919", minLevel: 3 },
  { type: "tiered_template", group: "military", name: "🔥 Supreme_Military_Commander", roleId: "1497997103019069521", templateId: "711919", minLevel: 4 },

  { type: "machine_set", group: "machines", name: "🔧 Machine_Operator", roleId: "1498385988206989312", templateIds: ["708910", "708908", "708907", "708906"], minLevel: 3 },
  { type: "machine_set", group: "machines", name: "⚙️ Machine_Specialist", roleId: "1498386192104951828", templateIds: ["708910", "708908", "708907", "708906"], minLevel: 6 },
  { type: "machine_set", group: "machines", name: "🏭 Machine_Master", roleId: "1498386362276253887", templateIds: ["708910", "708908", "708907", "708906"], minLevel: 9 },

  { type: "all_templates", name: "🌟 Neon_Genesis_Founder", roleId: "1497999187944538264", templateIds: ["452006", "452005", "452004", "452003", "452002"], quantityEach: 1 },
  { type: "tiered_quantity", name: "🔥 War_Overlord", roleId: "1497831114650288209", templateId: "711919", minLevel: 4, quantity: 3 },
  { type: "founder_empire", name: "🏛 Founder_of_the_NiftyKicks_Empire", roleId: "1497998180623585531" }
];

const RANKS = [
  { level: 1, name: "Private", abbreviation: "PVT", xp: 0 },
  { level: 2, name: "Private", abbreviation: "PV2", xp: 250 },
  { level: 3, name: "Private First Class", abbreviation: "PFC", xp: 750 },
  { level: 4, name: "Specialist", abbreviation: "SPC", xp: 1500 },
  { level: 5, name: "Corporal", abbreviation: "CPL", xp: 2500 },
  { level: 6, name: "Sergeant", abbreviation: "SGT", xp: 4000 },
  { level: 7, name: "Staff Sergeant", abbreviation: "SSG", xp: 6000 },
  { level: 8, name: "Sergeant First Class", abbreviation: "SFC", xp: 8500 },
  { level: 9, name: "Master Sergeant", abbreviation: "MSG", xp: 12000 },
  { level: 10, name: "First Sergeant", abbreviation: "1SG", xp: 16000 },
  { level: 11, name: "Sergeant Major", abbreviation: "SGM", xp: 22000 },
  { level: 12, name: "Command Sergeant Major", abbreviation: "CSM", xp: 30000 },
  { level: 13, name: "Sergeant Major of the Army", abbreviation: "SMA", xp: 40000 },
  { level: 14, name: "Warrant Officer 1", abbreviation: "WO1", xp: 52000 },
  { level: 15, name: "Chief Warrant Officer 2", abbreviation: "CW2", xp: 66000 },
  { level: 16, name: "Chief Warrant Officer 3", abbreviation: "CW3", xp: 82000 },
  { level: 17, name: "Chief Warrant Officer 4", abbreviation: "CW4", xp: 100000 },
  { level: 18, name: "Chief Warrant Officer 5", abbreviation: "CW5", xp: 122000 },
  { level: 19, name: "Second Lieutenant", abbreviation: "2LT", xp: 150000 },
  { level: 20, name: "First Lieutenant", abbreviation: "1LT", xp: 185000 },
  { level: 21, name: "Captain", abbreviation: "CPT", xp: 230000 },
  { level: 22, name: "Major", abbreviation: "MAJ", xp: 285000 },
  { level: 23, name: "Lieutenant Colonel", abbreviation: "LTC", xp: 350000 },
  { level: 24, name: "Colonel", abbreviation: "COL", xp: 430000 },
  { level: 25, name: "Brigadier General", abbreviation: "BG", xp: 525000 },
  { level: 26, name: "Major General", abbreviation: "MG", xp: 650000 },
  { level: 27, name: "Lieutenant General", abbreviation: "LTG", xp: 800000 },
  { level: 28, name: "General", abbreviation: "GEN", xp: 1000000 },
  { level: 29, name: "General of the Army", abbreviation: "GA", xp: 1250000 }
];

const RANK_XP_REWARDS = {
  ATTEMPT: 5,
  SUCCESS: 50,
  LEGENDARY_SUCCESS: 150
};

const RANK_WEEKLY_XP_CAPS = {
  ATTEMPT: 1000,
  SUCCESS: 5000,
  LEGENDARY: 3000
};

const MILESTONE_ROLES = {
  "1497998180623585531": {
    title: "🏛 Founder of the NiftyKicks Empire",
    message:
      "🌟 **HISTORY HAS BEEN MADE!** 🌟\n\n" +
      "**{player}** has become a\n\n" +
      "🏛 **Founder of the NiftyKicks Empire** 🏛\n\n" +
      "This is one of the highest achievements in NiftyKicks Factory — representing dominance across factories, machines, workforce, tech, military, chronicles, and Genesis history.\n\n" +
      "A new legend has entered the factory."
  },
  "1497831114650288209": {
    title: "🔥 War Overlord",
    message:
      "🔥 **NEW POWERHOUSE UNLOCKED!** 🔥\n\n" +
      "**{player}** has become a\n\n" +
      "🔥 **War Overlord** 🔥\n\n" +
      "Commanding overwhelming military strength inside NiftyKicks Factory.\n\n" +
      "The battlefield just changed."
  },
  "1497999187944538264": {
    title: "🌟 Neon Genesis Founder",
    message:
      "🌟 **GENESIS STATUS UNLOCKED!** 🌟\n\n" +
      "**{player}** has become a\n\n" +
      "🌟 **Neon Genesis Founder** 🌟\n\n" +
      "Holding the full original Neon Kicks set — one of the rarest legacy achievements in NiftyKicks Factory."
  },
  "1497993072481406986": {
    title: "🏭 Industrial Tycoon",
    message:
      "🏭 **FACTORY EMPIRE EXPANDED!** 🏭\n\n" +
      "**{player}** has become an\n\n" +
      "🏭 **Industrial Tycoon** 🏭\n\n" +
      "Maximum factory power has been achieved."
  }
};

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
  buildStatsMessage,
  buildLeaderboardMessage,
  rankFeature,
  raidFeature,
  profileFeature
});

async function announceMilestones(guild, member, addedRoleIds) {
  const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);
  if (!channel) return;

  for (const roleId of addedRoleIds) {
    const milestone = MILESTONE_ROLES[roleId];
    if (!milestone) continue;

    const message = milestone.message.replace("{player}", member.displayName);
    try {
      await channel.send(message);
    } catch (error) {
      console.error(`Failed to send milestone announcement for ${milestone.title}:`, error);
    }
  }
}

async function processWalletByMember(guild, member, wallet, saveWallet = false, announce = false) {
  const assetData = await getAllRoleAssets(wallet);
  const assets = assetData.combinedAssets;
  const counts = countTemplates(assets);

  let verifiedRoleAdded = false;

  if (!member.roles.cache.has(VERIFIED_WALLET_ROLE_ID)) {
    await member.roles.add(VERIFIED_WALLET_ROLE_ID);
    verifiedRoleAdded = true;
  }

  if (saveWallet) await saveWalletToDatabase(member.id, wallet);

  const qualified = ROLE_RULES.filter(rule => qualifiesForRule(rule, assets, counts));
  const finalRules = selectHighestGroupedRules(qualified);
  const finalRoleIds = new Set(finalRules.map(r => r.roleId));

  const added = [];
  const addedRoleIds = [];
  const removed = [];

  for (const rule of finalRules) {
    if (!member.roles.cache.has(rule.roleId)) {
      await member.roles.add(rule.roleId);
      added.push(rule.name);
      addedRoleIds.push(rule.roleId);
    }
  }

  for (const rule of ROLE_RULES) {
    if (member.roles.cache.has(rule.roleId) && !finalRoleIds.has(rule.roleId)) {
      await member.roles.remove(rule.roleId);
      removed.push(rule.name);
    }
  }

  if (announce && addedRoleIds.length) await announceMilestones(guild, member, addedRoleIds);

  return {
    wallet,
    walletAssetsChecked: assetData.walletAssets.length,
    stakedAssetsChecked: assetData.stakedAssets.length,
    assetsChecked: assets.length,
    verifiedRoleAdded,
    qualifiedNames: finalRules.map(r => r.name),
    added,
    removed
  };
}

async function refreshAllVerifiedWallets() {
  if (scheduledRefreshRunning) {
    console.log("Scheduled refresh already running. Skipping duplicate run.");
    return;
  }

  scheduledRefreshRunning = true;
  let checked = 0;
  let failed = 0;

  try {
    console.log("Starting scheduled wallet refresh...");

    const guild = await client.guilds.fetch(GUILD_ID);

    for (const discordId of Object.keys(verifiedWallets)) {
      const wallet = verifiedWallets[discordId];

      try {
        const member = await guild.members.fetch(discordId);
        await processWalletByMember(guild, member, wallet, false, true);
        checked++;
        console.log(`Refreshed ${wallet} for Discord user ${discordId}`);
        await sleep(1500);
      } catch (error) {
        if (error?.code === 10007 || error?.status === 404) {
          await removeWalletFromDatabase(discordId);
          console.log(`Removed stale wallet ${wallet} for Discord user ${discordId}: member no longer in guild.`);
          continue;
        }

        failed++;
        console.error(`Failed to refresh ${wallet} for Discord user ${discordId}:`, error);
      }
    }

    console.log(`Scheduled refresh complete. Checked: ${checked}. Failed: ${failed}.`);
  } catch (error) {
    console.error("Scheduled wallet refresh failed:", error);
  } finally {
    scheduledRefreshRunning = false;
  }
}

async function buildStatsMessage(guild) {
  const verifiedRole = guild.roles.cache.get(VERIFIED_WALLET_ROLE_ID);
  const verifiedCount = verifiedRole ? verifiedRole.members.size : 0;
  const savedWalletCount = Object.keys(verifiedWallets).length;

  const lines = [];
  lines.push("📊 **GetRight Games Wallet Verification Stats**");
  lines.push("");
  lines.push(`✅ **GRG Verified Wallet Role:** ${verifiedCount}`);
  lines.push(`💾 **Saved Wallets for /refresh:** ${savedWalletCount}`);
  lines.push("");
  lines.push("**NiftyKicks Role Counts**");

  const alreadyListed = new Set();
  for (const rule of ROLE_RULES) {
    if (alreadyListed.has(rule.roleId)) continue;

    const role = guild.roles.cache.get(rule.roleId);
    const count = role ? role.members.size : 0;
    lines.push(`${rule.name}: ${count}`);
    alreadyListed.add(rule.roleId);
  }

  lines.push("");
  lines.push("_Note: Stats are based on currently cached Discord role data. Scheduled refresh runs every 1 hour._");

  return lines.join("\n");
}

async function buildLeaderboardMessage(guild) {
  const leaderboardRoles = [
    { title: "🏛 Founders of the NiftyKicks Empire", roleId: "1497998180623585531" },
    { title: "🔥 War Overlords", roleId: "1497831114650288209" },
    { title: "🌟 Neon Genesis Founders", roleId: "1497999187944538264" },
    { title: "🏭 Industrial Tycoons", roleId: "1497993072481406986" },
    { title: "👷 Workforce Commanders", roleId: "1497993654164263074" },
    { title: "🏭 Machine Masters", roleId: "1498386362276253887" },
    { title: "🔥 Supreme Military Commanders", roleId: "1497997103019069521" },
    { title: "🧠 Chief Technology Architects", roleId: "1497996511139725383" },
    { title: "📖 Master Historians", roleId: "1497994442383032461" }
  ];

  const lines = [];
  lines.push("🏆 **GetRight Games NFT Leaderboard**");
  lines.push("");

  for (const item of leaderboardRoles) {
    const role = guild.roles.cache.get(item.roleId);
    const members = role ? [...role.members.values()] : [];

    lines.push(`**${item.title}: ${members.length}**`);

    if (members.length) {
      const names = members.slice(0, 10).map((member, index) => `${index + 1}. ${member.displayName}`).join("\n");
      lines.push(names);
    } else {
      lines.push("_No holders yet_");
    }

    lines.push("");
  }

  lines.push("_Leaderboard is based on currently cached Discord role data._");
  return lines.join("\n");
}

async function postDailyLeaderboard() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);
    if (!channel) return;

    const message = await buildLeaderboardMessage(guild);
    await channel.send(
      "🏆 **Daily NiftyKicks Factory Prestige Board** 🏆\n\n" +
      message +
      "\n\nUse `/verify wallet.wam` to claim your roles.\nUse `/leaderboard` anytime to view the current board."
    );
    console.log("Daily leaderboard posted.");
  } catch (error) {
    console.error("Failed to post daily leaderboard:", error);
  }
}

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
