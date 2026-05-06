const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

// Node 18+ includes global fetch. Do not require node-fetch v3 from CommonJS.
const cron = require("node-cron");
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
const {
  rankCommands,
  initRankSchema,
  createRankFeature
} = require("./src/features/ranks");
const { createRaidFeature } = require("./src/features/raids");

let verifiedWallets = {};
let scheduledRefreshRunning = false;
let tableReadWarningKeys = new Set();

const PROFILE_BUTTON_PREFIX = "profile_action:";
const PROFILE_ACTIONS = {
  REFRESH: "refresh",
  RANK: "rank",
  RAID_STATS: "raidstats",
  RAID_LEADERBOARD: "raidleaderboard",
  RAID_FACTIONS: "raidfactions"
};

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
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

async function initDatabase() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add your Render Postgres Internal Database URL as an environment variable.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_wallets (
      discord_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_balances (
      discord_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      faction TEXT,
      payout_nkfe INTEGER NOT NULL DEFAULT 0,
      lifetime_nkfe INTEGER NOT NULL DEFAULT 0,
      total_successes INTEGER NOT NULL DEFAULT 0,
      total_attempts INTEGER NOT NULL DEFAULT 0,
      legendary_successes INTEGER NOT NULL DEFAULT 0,
      weekly_nkfe INTEGER NOT NULL DEFAULT 0,
      weekly_successes INTEGER NOT NULL DEFAULT 0,
      weekly_attempts INTEGER NOT NULL DEFAULT 0,
      weekly_legendary_successes INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_logs (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      faction TEXT,
      convoy_id TEXT,
      route TEXT,
      legendary BOOLEAN NOT NULL DEFAULT FALSE,
      success BOOLEAN NOT NULL,
      reward INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await initRankSchema(pool);

  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS faction TEXT;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS payout_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS lifetime_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS total_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS legendary_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_legendary_successes INTEGER NOT NULL DEFAULT 0;`);

}

async function loadWalletsFromDatabase() {
  const result = await pool.query("SELECT discord_id, wallet FROM verified_wallets");
  const wallets = {};
  for (const row of result.rows) wallets[row.discord_id] = row.wallet;
  return wallets;
}

async function saveWalletToDatabase(discordId, wallet) {
  await pool.query(
    `
    INSERT INTO verified_wallets (discord_id, wallet, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (discord_id)
    DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
    `,
    [discordId, wallet]
  );
  verifiedWallets[discordId] = wallet;
}

async function removeWalletFromDatabase(discordId) {
  await pool.query("DELETE FROM verified_wallets WHERE discord_id = $1", [discordId]);
  delete verifiedWallets[discordId];
}

async function getVerifiedWallet(discordId) {
  const result = await pool.query("SELECT wallet FROM verified_wallets WHERE discord_id = $1", [discordId]);
  return result.rows[0]?.wallet || null;
}

async function ensureRaiderProfile(discordId, wallet) {
  await pool.query(
    `
    INSERT INTO raid_balances (discord_id, wallet, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (discord_id)
    DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
    `,
    [discordId, wallet]
  );
}

async function getRaiderProfile(discordId) {
  const result = await pool.query("SELECT * FROM raid_balances WHERE discord_id = $1", [discordId]);
  return result.rows[0] || null;
}

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return weekStart.toISOString().slice(0, 10);
}

function getRankByXp(xp) {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (Number(xp || 0) >= rank.xp) currentRank = rank;
    else break;
  }
  return currentRank;
}

function getRankByLevel(level) {
  return RANKS.find(rank => rank.level === Number(level)) || RANKS[0];
}

function getNextRank(rank) {
  return RANKS.find(item => item.level === rank.level + 1) || null;
}

function calculateRankProgress(xp) {
  const currentRank = getRankByXp(xp);
  const nextRank = getNextRank(currentRank);
  if (!nextRank) return { currentRank, nextRank: null, progressPercent: 100, xpIntoRank: 0, xpNeededForNext: 0 };

  const xpIntoRank = Number(xp || 0) - currentRank.xp;
  const xpNeededForNext = nextRank.xp - currentRank.xp;
  const progressPercent = xpNeededForNext ? Math.floor((xpIntoRank / xpNeededForNext) * 100) : 100;
  return { currentRank, nextRank, progressPercent, xpIntoRank, xpNeededForNext };
}

function calculateConvoyPower(xp, raidProfile = null) {
  return Number(xp || 0) +
    Number(raidProfile?.total_successes || 0) * 10 +
    Number(raidProfile?.legendary_successes || 0) * 100;
}

function formatRank(rank) {
  return `${rank.name} (${rank.abbreviation})`;
}

async function ensureRankProfile(discordId, wallet) {
  const weekStart = getCurrentWeekStart();
  await pool.query(
    `
    INSERT INTO raid_ranks (discord_id, wallet, weekly_xp_week_start, updated_at)
    VALUES ($1, $2, $3::date, NOW())
    ON CONFLICT (discord_id)
    DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
    `,
    [discordId, wallet, weekStart]
  );

  await pool.query(
    `
    UPDATE raid_ranks
    SET weekly_xp = 0,
        weekly_attempt_xp = 0,
        weekly_success_xp = 0,
        weekly_legendary_xp = 0,
        weekly_bonus_xp = 0,
        weekly_xp_week_start = $2::date,
        updated_at = NOW()
    WHERE discord_id = $1 AND weekly_xp_week_start <> $2::date;
    `,
    [discordId, weekStart]
  );
}

async function getRankProfile(discordId) {
  const result = await pool.query("SELECT * FROM raid_ranks WHERE discord_id = $1", [discordId]);
  return result.rows[0] || null;
}

function capRankXp(amount, currentWeeklyAmount, cap) {
  return Math.max(Math.min(Number(amount || 0), Number(cap || 0) - Number(currentWeeklyAmount || 0)), 0);
}

async function awardRankXp(discordId, wallet, convoyId, legendary, success) {
  await ensureRankProfile(discordId, wallet);

  const rankProfile = await getRankProfile(discordId);
  const raidProfile = await getRaiderProfile(discordId);
  const rankBefore = getRankByXp(rankProfile?.xp || 0);

  const attemptXp = capRankXp(RANK_XP_REWARDS.ATTEMPT, rankProfile?.weekly_attempt_xp, RANK_WEEKLY_XP_CAPS.ATTEMPT);
  const successXp = success && !legendary
    ? capRankXp(RANK_XP_REWARDS.SUCCESS, rankProfile?.weekly_success_xp, RANK_WEEKLY_XP_CAPS.SUCCESS)
    : 0;
  const legendaryXp = success && legendary
    ? capRankXp(RANK_XP_REWARDS.LEGENDARY_SUCCESS, rankProfile?.weekly_legendary_xp, RANK_WEEKLY_XP_CAPS.LEGENDARY)
    : 0;
  const totalXp = attemptXp + successXp + legendaryXp;

  if (!totalXp) {
    return {
      xpAwarded: 0,
      attemptXp,
      successXp,
      legendaryXp,
      rankBefore,
      rankAfter: rankBefore,
      promoted: false,
      currentRank: rankBefore
    };
  }

  const newXp = Number(rankProfile?.xp || 0) + totalXp;
  const rankAfter = getRankByXp(newXp);
  const convoyPower = calculateConvoyPower(newXp, raidProfile);

  await pool.query(
    `
    UPDATE raid_ranks
    SET xp = $2,
        weekly_xp = weekly_xp + $3,
        weekly_attempt_xp = weekly_attempt_xp + $4,
        weekly_success_xp = weekly_success_xp + $5,
        weekly_legendary_xp = weekly_legendary_xp + $6,
        current_rank_level = $7,
        best_rank_level = GREATEST(best_rank_level, $7),
        convoy_power = $8,
        wallet = $9,
        updated_at = NOW()
    WHERE discord_id = $1;
    `,
    [discordId, newXp, totalXp, attemptXp, successXp, legendaryXp, rankAfter.level, convoyPower, wallet]
  );

  await pool.query(
    `
    INSERT INTO raid_xp_logs (discord_id, wallet, convoy_id, xp_source, xp_amount, rank_before, rank_after)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
    `,
    [discordId, wallet, convoyId, legendary ? "legendary_convoy_raid" : "convoy_raid", totalXp, rankBefore.level, rankAfter.level]
  );

  if (rankAfter.level > rankBefore.level) {
    await pool.query(
      `
      INSERT INTO rank_promotion_logs (discord_id, wallet, old_rank_level, new_rank_level, old_rank_name, new_rank_name)
      VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [discordId, wallet, rankBefore.level, rankAfter.level, rankBefore.name, rankAfter.name]
    );
  }

  return {
    xpAwarded: totalXp,
    attemptXp,
    successXp,
    legendaryXp,
    rankBefore,
    rankAfter,
    promoted: rankAfter.level > rankBefore.level,
    currentRank: rankAfter,
    convoyPower
  };
}


async function setRaiderFaction(discordId, wallet, faction) {
  await pool.query(
    `
    INSERT INTO raid_balances (discord_id, wallet, faction, updated_at)
    VALUES ($1, $2, $3::date, NOW())
    ON CONFLICT (discord_id)
    DO UPDATE SET wallet = EXCLUDED.wallet, faction = EXCLUDED.faction, updated_at = NOW();
    `,
    [discordId, wallet, faction]
  );
}

async function recordRaid(discordId, wallet, faction, convoyId, route, legendary, success, reward) {
  await pool.query(
    `
    INSERT INTO raid_logs (discord_id, wallet, faction, convoy_id, route, legendary, success, reward)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [discordId, wallet, faction, convoyId, route, legendary, success, reward]
  );

  await pool.query(
    `
    INSERT INTO raid_balances (
      discord_id,
      wallet,
      faction,
      payout_nkfe,
      lifetime_nkfe,
      total_successes,
      total_attempts,
      legendary_successes,
      weekly_nkfe,
      weekly_successes,
      weekly_attempts,
      weekly_legendary_successes,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $4, $5, 1, $6, $4, $5, 1, $6, NOW())
    ON CONFLICT (discord_id)
    DO UPDATE SET
      wallet = EXCLUDED.wallet,
      faction = COALESCE(raid_balances.faction, EXCLUDED.faction),
      payout_nkfe = raid_balances.payout_nkfe + EXCLUDED.payout_nkfe,
      lifetime_nkfe = raid_balances.lifetime_nkfe + EXCLUDED.lifetime_nkfe,
      total_successes = raid_balances.total_successes + EXCLUDED.total_successes,
      total_attempts = raid_balances.total_attempts + 1,
      legendary_successes = raid_balances.legendary_successes + EXCLUDED.legendary_successes,
      weekly_nkfe = raid_balances.weekly_nkfe + EXCLUDED.weekly_nkfe,
      weekly_successes = raid_balances.weekly_successes + EXCLUDED.weekly_successes,
      weekly_attempts = raid_balances.weekly_attempts + 1,
      weekly_legendary_successes = raid_balances.weekly_legendary_successes + EXCLUDED.weekly_legendary_successes,
      updated_at = NOW();
    `,
    [discordId, wallet, faction, reward, success ? 1 : 0, legendary && success ? 1 : 0]
  );
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

function buildProfileActionButton(action, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(`${PROFILE_BUTTON_PREFIX}${action}`)
    .setLabel(label)
    .setStyle(style);
}

function buildProfileActionRows() {
  return [
    new ActionRowBuilder().addComponents(
      buildProfileActionButton(PROFILE_ACTIONS.REFRESH, "Refresh Roles", ButtonStyle.Primary),
      buildProfileActionButton(PROFILE_ACTIONS.RANK, "Rank"),
      buildProfileActionButton(PROFILE_ACTIONS.RAID_STATS, "Raid Stats"),
      buildProfileActionButton(PROFILE_ACTIONS.RAID_LEADERBOARD, "Raid Board"),
      buildProfileActionButton(PROFILE_ACTIONS.RAID_FACTIONS, "Factions")
    )
  ];
}

function dedupeCommandsByName(commands) {
  const uniqueCommands = [];
  const seenNames = new Set();

  for (const command of commands) {
    if (seenNames.has(command.name)) {
      console.warn(`Skipping duplicate slash command registration for /${command.name}.`);
      continue;
    }

    seenNames.add(command.name);
    uniqueCommands.push(command);
  }

  return uniqueCommands;
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Verify your WAX wallet and receive NFT roles.")
      .addStringOption(option => option.setName("wallet").setDescription("Your WAX wallet").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("refresh")
      .setDescription("Refresh your NFT roles using your last verified wallet.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("stats")
      .setDescription("Show GetRight Games verified wallet and NFT role stats.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show the GetRight Games NFT role leaderboard.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Show your NiftyKicks Factory NFT profile.")
      .toJSON(),

    ...rankCommands,

    new SlashCommandBuilder()
      .setName("testconvoy")
      .setDescription("Admin: test posting a convoy activity message to general chat.")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raid")
      .setDescription("Attempt to raid the newest active convoy. Use alert buttons to raid specific convoys.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raidstats")
      .setDescription("Show your Convoy Raiders stats and NKFE balance.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raidleaderboard")
      .setDescription("Show the weekly Convoy Raiders leaderboard.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raidfactions")
      .setDescription("Show Convoy Raiders faction standings.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("joinfaction")
      .setDescription("Join a Convoy Raiders faction.")
      .addStringOption(option =>
        option
          .setName("faction")
          .setDescription("Choose your raider faction.")
          .setRequired(true)
          .addChoices(
            { name: "🐺 Iron Wolves", value: "iron_wolves" },
            { name: "🌌 Neon Bandits", value: "neon_bandits" },
            { name: "🐍 Steel Serpents", value: "steel_serpents" },
            { name: "🕶️ Shadow Couriers", value: "shadow_couriers" }
          )
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raidpayouts")
      .setDescription("Admin: show NKFE payouts owed to raiders.")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    new SlashCommandBuilder()
      .setName("resetraidpayouts")
      .setDescription("Admin: reset current raid payout balances after manual payment.")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON()
  ];

  const uniqueCommands = dedupeCommandsByName(commands);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: uniqueCommands });
  console.log(`Slash commands registered (${uniqueCommands.length} unique commands).`);
}

async function getAssets(wallet) {
  let allAssets = [];
  let page = 1;
  const limit = 1000;

  while (true) {
    const url =
      `https://wax.api.atomicassets.io/atomicassets/v1/assets` +
      `?owner=${wallet}` +
      `&limit=${limit}` +
      `&page=${page}`;

    const response = await fetch(url);
    const json = await response.json();
    const assets = json.data || [];
    allAssets = allAssets.concat(assets);

    if (assets.length < limit) break;
    page++;
  }

  return allAssets;
}

async function getTableRows({ code, table, lowerBound = null, upperBound = null, useOwnerIndex = false }) {
  const rows = [];
  let more = true;
  let nextKey = lowerBound;
  const limit = 1000;

  while (more) {
    const body = { json: true, code, scope: code, table, limit };

    if (useOwnerIndex) {
      body.index_position = "2";
      body.key_type = "i64";
    }

    if (nextKey) body.lower_bound = nextKey;
    if (upperBound) body.upper_bound = upperBound;

    try {
      const response = await fetch(`${WAX_CHAIN_API}/v1/chain/get_table_rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const json = await response.json();

      if (!response.ok || json.error) {
        logTableReadWarning(code, table, json.error?.what || json.message || "Unknown table error");
        break;
      }

      rows.push(...(json.rows || []));
      more = Boolean(json.more);
      if (!more) break;

      nextKey = json.next_key || json.next_key === "" ? json.next_key : null;
      if (!nextKey) break;
    } catch (error) {
      logTableReadWarning(code, table, error.message, "Failed to read table");
      break;
    }
  }

  return rows;
}

async function getRowsByOwner(code, table, wallet) {
  const rows = await getTableRows({ code, table, lowerBound: wallet, upperBound: wallet, useOwnerIndex: true });
  return rows.filter(row => row.owner === wallet || row.account === wallet);
}

async function getRowsByPrimaryAccount(code, table, wallet) {
  const rows = await getTableRows({ code, table, lowerBound: wallet, upperBound: wallet, useOwnerIndex: false });
  return rows.filter(row => row.owner === wallet || row.account === wallet);
}

function makePseudoAsset({ templateId, tier = 0, assetId = null, source = "staked" }) {
  return {
    asset_id: assetId ? String(assetId) : `${source}-${templateId}-${Math.random()}`,
    template: { template_id: String(templateId) },
    mutable_data: { tier },
    data: { tier },
    source
  };
}

async function getStakedAssets(wallet) {
  const stakedAssets = [];

  for (const contract of CONTRACT_ACCOUNTS) {
    const factories = await getRowsByOwner(contract, "factories", wallet);
    for (const row of factories) {
      stakedAssets.push(makePseudoAsset({
        templateId: row.template_id || "708905",
        tier: row.tier || 0,
        assetId: row.asset_id,
        source: `${contract}:factories`
      }));
    }

    const machines = await getRowsByOwner(contract, "machines", wallet);
    for (const row of machines) {
      stakedAssets.push(makePseudoAsset({
        templateId: row.template_id,
        tier: row.tier || 0,
        assetId: row.asset_id,
        source: `${contract}:machines`
      }));
    }

    const labourers = await getRowsByOwner(contract, "labourers", wallet);
    for (const row of labourers) {
      stakedAssets.push(makePseudoAsset({
        templateId: row.template_id || "708902",
        tier: row.tier || 0,
        assetId: row.asset_id,
        source: `${contract}:labourers`
      }));
    }

    const techCenters = await getRowsByOwner(contract, "techcenter", wallet);
    for (const row of techCenters) {
      stakedAssets.push(makePseudoAsset({
        templateId: "768499",
        tier: row.tier || 0,
        assetId: row.asset_id,
        source: `${contract}:techcenter`
      }));
    }

    const chronicles = await getRowsByOwner(contract, "chronicles", wallet);
    for (const row of chronicles) {
      stakedAssets.push(makePseudoAsset({
        templateId: row.chronicle_template_id,
        tier: 0,
        assetId: row.asset_id,
        source: `${contract}:chronicles`
      }));
    }

    const userMilitary = await getRowsByPrimaryAccount(contract, "usermilitary", wallet);
    for (const row of userMilitary) {
      const data = row.data_tier_quantity || [];

      for (const militaryTier of data) {
        const tier = militaryTier.tier || 0;
        const quantity = militaryTier.quantity || 0;

        for (let i = 0; i < quantity; i++) {
          stakedAssets.push(makePseudoAsset({
            templateId: "711919",
            tier,
            assetId: `${contract}-military-${wallet}-${tier}-${i}`,
            source: `${contract}:usermilitary`
          }));
        }
      }
    }
  }

  return dedupeAssets(stakedAssets);
}

function dedupeAssets(assets) {
  const seen = new Set();
  const unique = [];

  for (const asset of assets) {
    const key = String(asset.asset_id || "");
    if (!key) {
      unique.push(asset);
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(asset);
  }

  return unique;
}

async function getAllRoleAssets(wallet) {
  const walletAssets = await getAssets(wallet);
  const stakedAssets = await getStakedAssets(wallet);
  return {
    walletAssets,
    stakedAssets,
    combinedAssets: dedupeAssets([...walletAssets, ...stakedAssets])
  };
}

function getTemplateId(asset) {
  return String(asset.template?.template_id || asset.template_id || "");
}

function getAssetLevel(asset) {
  const sources = [asset.mutable_data, asset.immutable_data, asset.data, asset.template?.immutable_data, asset];

  for (const source of sources) {
    if (!source) continue;

    for (const field of LEVEL_FIELDS) {
      if (source[field] !== undefined && source[field] !== null) {
        const lvl = parseInt(source[field], 10);
        if (!Number.isNaN(lvl)) return lvl;
      }
    }
  }

  return 0;
}

function countTemplates(assets) {
  const counts = {};
  for (const asset of assets) {
    const templateId = getTemplateId(asset);
    if (!templateId) continue;
    counts[templateId] = (counts[templateId] || 0) + 1;
  }
  return counts;
}

function countAssetsByTemplateMinLevel(assets, templateId, minLevel) {
  return assets.filter(asset =>
    getTemplateId(asset) === String(templateId) &&
    getAssetLevel(asset) >= minLevel
  ).length;
}

function hasMachineSetAtLevel(assets, minLevel) {
  const machineTemplateIds = ["708910", "708908", "708907", "708906"];
  return machineTemplateIds.every(templateId =>
    assets.some(asset =>
      getTemplateId(asset) === templateId &&
      getAssetLevel(asset) >= minLevel
    )
  );
}

function qualifiesForFounderEmpire(assets, counts) {
  const factoryTier9 = countAssetsByTemplateMinLevel(assets, "708905", 9);
  const skillLaborerTier9 = countAssetsByTemplateMinLevel(assets, "708902", 9);
  const techCenterTier3 = countAssetsByTemplateMinLevel(assets, "768499", 3);
  const militaryTier4 = countAssetsByTemplateMinLevel(assets, "711919", 4);
  const chronicleBooks = counts["776806"] || 0;

  const hasAllMachinesTier9 = hasMachineSetAtLevel(assets, 9);
  const hasNeonGenesisSet = ["452006", "452005", "452004", "452003", "452002"]
    .every(id => (counts[id] || 0) >= 1);

  return (
    factoryTier9 >= 3 &&
    hasAllMachinesTier9 &&
    skillLaborerTier9 >= 4 &&
    techCenterTier3 >= 1 &&
    militaryTier4 >= 3 &&
    chronicleBooks >= 3 &&
    hasNeonGenesisSet
  );
}

function qualifiesForRule(rule, assets, counts) {
  if (rule.type === "simple_template") return (counts[rule.templateId] || 0) >= rule.quantity;

  if (rule.type === "tiered_template") {
    return assets.some(asset =>
      getTemplateId(asset) === rule.templateId &&
      getAssetLevel(asset) >= rule.minLevel
    );
  }

  if (rule.type === "tiered_quantity") {
    return countAssetsByTemplateMinLevel(assets, rule.templateId, rule.minLevel) >= rule.quantity;
  }

  if (rule.type === "machine_set") {
    return rule.templateIds.every(id =>
      assets.some(asset =>
        getTemplateId(asset) === id &&
        getAssetLevel(asset) >= rule.minLevel
      )
    );
  }

  if (rule.type === "all_templates") {
    return rule.templateIds.every(id => (counts[id] || 0) >= rule.quantityEach);
  }

  if (rule.type === "founder_empire") return qualifiesForFounderEmpire(assets, counts);

  return false;
}

function selectHighestGroupedRules(qualified) {
  const grouped = {};
  const final = [];

  for (const rule of qualified) {
    if (!rule.group) {
      final.push(rule);
      continue;
    }

    const current = grouped[rule.group];
    if (!current || rule.minLevel > current.minLevel) grouped[rule.group] = rule;
  }

  return [...final, ...Object.values(grouped)];
}

function buildProfileStats(assets, counts) {
  return {
    factoryTier9: countAssetsByTemplateMinLevel(assets, "708905", 9),
    machinesTier9Complete: hasMachineSetAtLevel(assets, 9),
    skillLaborerTier9: countAssetsByTemplateMinLevel(assets, "708902", 9),
    techCenterTier3: countAssetsByTemplateMinLevel(assets, "768499", 3),
    militaryTier4: countAssetsByTemplateMinLevel(assets, "711919", 4),
    chronicleBooks: counts["776806"] || 0,
    neonGenesisComplete: ["452006", "452005", "452004", "452003", "452002"]
      .every(id => (counts[id] || 0) >= 1)
  };
}

function buildProfileMessage(member, wallet, assetData, finalRules, counts, raidProfile = null, rankProfile = null) {
  const assets = assetData.combinedAssets;
  const stats = buildProfileStats(assets, counts);
  const attempts = Number(raidProfile?.total_attempts || 0);
  const successes = Number(raidProfile?.total_successes || 0);
  const failedRaids = Math.max(attempts - successes, 0);
  const successRate = attempts ? Math.round((successes / attempts) * 100) : 0;
  const rankProgress = rankFeature.calculateRankProgress(rankProfile?.xp || 0);
  const convoyPower = rankFeature.calculateConvoyPower(rankProfile?.xp || 0, raidProfile);

  return [
    "🏭 **NiftyKicks Factory Profile**",
    "",
    `**Player:** ${member.displayName}`,
    `**Wallet:** ${wallet}`,
    `**Faction:** ${getFactionLabel(raidProfile?.faction)}`,
    "",
    "🎖️ **Convoy Command Rank**",
    `Rank: **${rankFeature.formatRank(rankProgress.currentRank)}**`,
    rankProgress.nextRank
      ? `XP: **${rankProfile?.xp || 0} / ${rankProgress.nextRank.xp}** (${rankProgress.progressPercent}%)`
      : `XP: **${rankProfile?.xp || 0}** (Max Rank)`,
    rankProgress.nextRank ? `Next Rank: **${rankFeature.formatRank(rankProgress.nextRank)}**` : "Next Rank: **None — top of command**",
    `Convoy Power: **${convoyPower}**`,
    "",
    "**Convoy Raider Snapshot**",
    `Raid Attempts: **${attempts}**`,
    `Successful Raids: **${successes}**`,
    `Failed Raids: **${failedRaids}**`,
    `Success Rate: **${successRate}%**`,
    `This Week's Raid Earnings: **${raidProfile?.weekly_nkfe || 0} $NKFE**`,
    `Lifetime NKFE Earned: **${raidProfile?.lifetime_nkfe || 0} $NKFE**`,
    `Current Payout Balance: **${raidProfile?.payout_nkfe || 0} $NKFE**`,
    `Legendary Convoy Wins: **${raidProfile?.legendary_successes || 0}**`,
    "",
    "**Assets Evaluated**",
    `Wallet NFTs: **${assetData.walletAssets.length}**`,
    `Staked NFTs: **${assetData.stakedAssets.length}**`,
    `Total Evaluated: **${assetData.combinedAssets.length}**`,
    "",
    "**Progression Snapshot**",
    `🏭 Factories Tier 9: **${stats.factoryTier9}**`,
    `⚙️ Machine Set Tier 9 Complete: **${stats.machinesTier9Complete ? "Yes" : "No"}**`,
    `👷 Skill Laborers Tier 9: **${stats.skillLaborerTier9}**`,
    `🧠 Tech Centers Tier 3: **${stats.techCenterTier3}**`,
    `🔥 Military Facilities Tier 4: **${stats.militaryTier4}**`,
    `📖 Chronicle Books: **${stats.chronicleBooks}**`,
    `🌟 Neon Genesis Set Complete: **${stats.neonGenesisComplete ? "Yes" : "No"}**`,
    "",
    "**Current NFT Roles**",
    finalRules.length ? finalRules.map(r => r.name).join("\n") : "None",
    "",
    "Use the buttons below to refresh roles or jump into raid/faction views."
  ].join("\n");
}

async function getProfileForMember(member, wallet) {
  await ensureRaiderProfile(member.id, wallet);
  await rankFeature.ensureRankProfile(member.id, wallet);

  const assetData = await getAllRoleAssets(wallet);
  const raidProfile = await getRaiderProfile(member.id);
  const rankProfile = await rankFeature.getRankProfile(member.id);
  const assets = assetData.combinedAssets;
  const counts = countTemplates(assets);
  const qualified = ROLE_RULES.filter(rule => qualifiesForRule(rule, assets, counts));
  const finalRules = selectHighestGroupedRules(qualified);

  return buildProfileMessage(member, wallet, assetData, finalRules, counts, raidProfile, rankProfile);
}

async function buildProfileReplyOptions(member, wallet) {
  const content = await getProfileForMember(member, wallet);
  return {
    content,
    components: buildProfileActionRows()
  };
}

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

async function handleProfileAction(interaction, action) {
  const wallet = await getVerifiedWallet(interaction.user.id);
  if (!wallet) {
    await interaction.editReply("No wallet found for you yet. Please run `/verify yourwallet.wam` first.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (action === PROFILE_ACTIONS.REFRESH) {
    await processWalletByMember(interaction.guild, member, wallet, false, true);
    await interaction.editReply(await buildProfileReplyOptions(member, wallet));
    return;
  }

  if (action === PROFILE_ACTIONS.RANK) {
    await interaction.editReply(await rankFeature.buildRankMessage(interaction.user.id, member.displayName));
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_STATS) {
    await interaction.editReply(await raidFeature.buildRaidStatsMessage(interaction.user.id, member.displayName));
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_LEADERBOARD) {
    await raidFeature.sendRaidLeaderboard(interaction);
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_FACTIONS) {
    await raidFeature.sendRaidFactions(interaction);
    return;
  }

  await interaction.editReply("Unknown profile action.");
}

async function sendRaidLeaderboard(interaction) {
  const result = await pool.query(`
    SELECT discord_id, wallet, faction, weekly_nkfe, weekly_successes, weekly_attempts, lifetime_nkfe
    FROM raid_balances
    ORDER BY weekly_nkfe DESC, weekly_successes DESC, weekly_attempts DESC
    LIMIT 10
  `);

  if (!result.rows.length) {
    await interaction.editReply("No Convoy Raiders leaderboard data yet.");
    return;
  }

  const lines = result.rows.map((row, index) =>
    `${index + 1}. <@${row.discord_id}> — **${row.weekly_nkfe} NKFE this week** | ${row.weekly_successes}/${row.weekly_attempts} successful | Lifetime: ${row.lifetime_nkfe} NKFE | ${getFactionLabel(row.faction)}`
  );

  await interaction.editReply("🏆 **Weekly Convoy Raiders Leaderboard**\n\n" + lines.join("\n"));
}

async function sendRaidFactions(interaction) {
  const result = await pool.query(`
    SELECT faction,
           COUNT(DISTINCT discord_id) AS active_members,
           SUM(weekly_nkfe) AS total_nkfe,
           SUM(weekly_successes) AS successes,
           SUM(weekly_attempts) AS attempts
    FROM raid_balances
    WHERE faction IS NOT NULL AND weekly_attempts > 0
    GROUP BY faction
    ORDER BY total_nkfe DESC, successes DESC
  `);

  if (!result.rows.length) {
    await interaction.editReply("No faction raid data yet. Use `/joinfaction` to join a faction.");
    return;
  }

  const lines = result.rows.map((row, index) =>
    `${index + 1}. **${getFactionLabel(row.faction)}** — **${row.total_nkfe || 0} NKFE this week** | ${row.successes || 0}/${row.attempts || 0} successful | Active raiders: ${row.active_members}`
  );

  await interaction.editReply("🏴 **Convoy Raiders Faction Standings**\n\n" + lines.join("\n"));
}

async function handleProfileAction(interaction, action) {
  const wallet = await getVerifiedWallet(interaction.user.id);
  if (!wallet) {
    await interaction.editReply("No wallet found for you yet. Please run `/verify yourwallet.wam` first.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (action === PROFILE_ACTIONS.REFRESH) {
    await processWalletByMember(interaction.guild, member, wallet, false, true);
    await interaction.editReply(await buildProfileReplyOptions(member, wallet));
    return;
  }

  if (action === PROFILE_ACTIONS.RANK) {
    await interaction.editReply(await rankFeature.buildRankMessage(interaction.user.id, member.displayName));
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_STATS) {
    await interaction.editReply(await buildRaidStatsMessage(interaction.user.id, member.displayName));
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_LEADERBOARD) {
    await sendRaidLeaderboard(interaction);
    return;
  }

  if (action === PROFILE_ACTIONS.RAID_FACTIONS) {
    await sendRaidFactions(interaction);
    return;
  }

  await interaction.editReply("Unknown profile action.");
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await initDatabase();
  verifiedWallets = await loadWalletsFromDatabase();
  console.log(`Loaded ${Object.keys(verifiedWallets).length} saved wallets from database.`);

  await registerCommands();

  cron.schedule("0 * * * *", async () => {
    await refreshAllVerifiedWallets();
  });
  console.log("Automatic wallet refresh scheduled every 1 hour.");

  cron.schedule("0 9 * * *", async () => {
    await postDailyLeaderboard();
  }, { timezone: "America/Los_Angeles" });
  console.log("Daily leaderboard post scheduled for 9:00 AM Pacific.");

  cron.schedule("0 17 * * 0", async () => {
    await raidFeature.postWeeklyRaidLeaderboardAndReset();
  }, { timezone: "America/Los_Angeles" });
  console.log("Weekly raid leaderboard post scheduled for Sundays at 5:00 PM Pacific.");

  setInterval(async () => {
    await raidFeature.checkConvoyActivity();
  }, 20000);
  console.log("Real-time convoy activity tracker started. Checking every 20 seconds.");
  console.log("Convoy Raiders mini-game is active.");
});

client.on("guildMemberAdd", async member => {
  try {
    await member.send(
      `👋 Welcome to **GetRight Games**!

` +
      `To verify your WAX wallet and unlock NFT-based Discord roles, go to the server and run:

` +
      `/verify yourwallet.wam

` +
      `After you verify once, you can use:

` +
      `/refresh

` +
      `This will update your roles whenever your NFTs change.`
    );
  } catch (error) {
    console.log(`Could not DM new member ${member.id}. They may have DMs disabled.`);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  try {
    await interaction.deferReply({ flags: 64 });
  } catch (error) {
    console.log("Could not defer interaction. It may have expired.");
    return;
  }

  try {
    if (interaction.isButton()) {
      if (raidFeature.isRaidButton(interaction.customId)) {
        const raidId = raidFeature.getRaidIdFromButton(interaction.customId);
        await raidFeature.handleRaid(interaction, raidId);
        return;
      }

      if (interaction.customId.startsWith(PROFILE_BUTTON_PREFIX)) {
        const action = interaction.customId.slice(PROFILE_BUTTON_PREFIX.length);
        await handleProfileAction(interaction, action);
        return;
      }

      await interaction.editReply("Unknown button interaction.");
      return;
    }

    if (interaction.commandName === "stats") {
      const message = await buildStatsMessage(interaction.guild);
      await interaction.editReply(message);
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const message = await buildLeaderboardMessage(interaction.guild);
      await interaction.editReply(message);
      return;
    }

    if (interaction.commandName === "rank") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await interaction.editReply(await rankFeature.buildRankMessage(interaction.user.id, member.displayName));
      return;
    }

    if (interaction.commandName === "rankleaderboard") {
      await rankFeature.sendRankLeaderboard(interaction);
      return;
    }

    if (interaction.commandName === "rankrewards") {
      await interaction.editReply(rankFeature.buildRankRewardsMessage());
      return;
    }

    if (interaction.commandName === "testconvoy") {
      const channel = interaction.guild.channels.cache.get(GENERAL_CHAT_CHANNEL_ID);
      if (!channel) {
        await interaction.editReply("General chat channel not found.");
        return;
      }
      await channel.send("🚚 **Convoy Tracker Test**\n\nThis is a test message from the GetRight Games Verification Bot.");
      await interaction.editReply("Test convoy message sent to general chat.");
      return;
    }

    if (interaction.commandName === "profile") {
      const wallet = verifiedWallets[interaction.user.id];
      if (!wallet) {
        await interaction.editReply("No wallet found for you yet. Please run `/verify yourwallet.wam` first.");
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await interaction.editReply(await buildProfileReplyOptions(member, wallet));
      return;
    }

    if (interaction.commandName === "raid") {
      await raidFeature.handleRaid(interaction);
      return;
    }

    if (interaction.commandName === "raidstats") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const message = await raidFeature.buildRaidStatsMessage(interaction.user.id, member.displayName);
      await interaction.editReply(message);
      return;
    }

    if (interaction.commandName === "joinfaction") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.has(VERIFIED_WALLET_ROLE_ID)) {
        await interaction.editReply("You must verify your wallet before joining a raider faction. Run `/verify wallet.wam` first.");
        return;
      }

      const wallet = await getVerifiedWallet(interaction.user.id);
      if (!wallet) {
        await interaction.editReply("No verified wallet found in the database. Run `/verify wallet.wam` once.");
        return;
      }

      const faction = interaction.options.getString("faction");
      if (!RAIDER_FACTIONS[faction]) {
        await interaction.editReply("Invalid faction selected.");
        return;
      }

      await setRaiderFaction(interaction.user.id, wallet, faction);
      const factionInfo = RAIDER_FACTIONS[faction];
      await interaction.editReply(
        `${factionInfo.emoji} **Faction Joined!**

` +
        `You are now part of **${factionInfo.name}**.

` +
        factionInfo.description
      );
      return;
    }

    if (interaction.commandName === "raidleaderboard") {
      await raidFeature.sendRaidLeaderboard(interaction);
      return;
    }

    if (interaction.commandName === "raidfactions") {
      await raidFeature.sendRaidFactions(interaction);
      return;
    }

    if (interaction.commandName === "raidpayouts") {
      const result = await pool.query(`
        SELECT discord_id, wallet, payout_nkfe
        FROM raid_balances
        WHERE payout_nkfe > 0
        ORDER BY payout_nkfe DESC
      `);

      if (!result.rows.length) {
        await interaction.editReply("No NKFE raid payouts owed right now.");
        return;
      }

      const lines = result.rows.map(row => `${row.wallet} — **${row.payout_nkfe} NKFE** — <@${row.discord_id}>`);
      await interaction.editReply(
        "💰 **Convoy Raiders Manual Payout List**\n\n" +
        lines.join("\n") +
        "\n\nAfter paying from the treasury wallet, run `/resetraidpayouts`."
      );
      return;
    }

    if (interaction.commandName === "resetraidpayouts") {
      await pool.query("UPDATE raid_balances SET payout_nkfe = 0, updated_at = NOW()");
      await interaction.editReply("Convoy Raiders current payout balances have been reset to 0. Lifetime and weekly stats were preserved.");
      return;
    }

    let wallet;
    let saveWallet = false;
    let commandNote = "";

    if (interaction.commandName === "verify") {
      wallet = interaction.options.getString("wallet").toLowerCase().trim();
      saveWallet = true;
      commandNote = "Your wallet has been verified and saved. You can use `/refresh` any time to update your roles.";
    }

    if (interaction.commandName === "refresh") {
      wallet = verifiedWallets[interaction.user.id];
      if (!wallet) {
        await interaction.editReply("No wallet found for you yet. Please run `/verify yourwallet.wam` first.");
        return;
      }
      commandNote = "Your saved wallet was refreshed.";
    }

    if (!wallet) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await processWalletByMember(interaction.guild, member, wallet, saveWallet, true);

    await interaction.editReply(
      `✅ Wallet checked: **${result.wallet}**
` +
      `Wallet NFTs scanned: **${result.walletAssetsChecked}**
` +
      `Staked NFTs detected: **${result.stakedAssetsChecked}**
` +
      `Total NFTs evaluated: **${result.assetsChecked}**

` +
      `**Verified Wallet Role:**
` +
      `${result.verifiedRoleAdded ? "✅ GRG Verified Wallet added" : "Already verified"}

` +
      `**NFT Role Requirements Met:**
` +
      `${result.qualifiedNames.length ? result.qualifiedNames.join("\n") : "None"}

` +
      `**Roles Added:**
` +
      `${result.added.length ? result.added.join("\n") : "None"}

` +
      `**Roles Removed:**
` +
      `${result.removed.length ? result.removed.join("\n") : "None"}

` +
      commandNote
    );
  } catch (error) {
    console.error(error);
    try {
      await interaction.editReply("Something went wrong while processing your command.");
    } catch {
      console.log("Could not send error reply to interaction.");
    }
  }
});

client.login(TOKEN);
