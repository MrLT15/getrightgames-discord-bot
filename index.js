const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
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

const VERIFIED_WALLET_ROLE_ID = "1498390601199255794";
const LEADERBOARD_CHANNEL_ID = "1498090264734990497";
const GENERAL_CHAT_CHANNEL_ID = "872930746451513436";

const WAX_CHAIN_API = "https://wax.greymass.com";
const WAX_HISTORY_API = "https://api.waxsweden.org";

const CONTRACT_ACCOUNTS = ["niftykickgam", "niftykicksgm", "niftykickgme"];
const CONVOY_CONTRACTS = ["niftykickgam"];
const CONVOY_ACTIONS = ["sendconvoy"];
const LEVEL_FIELDS = ["level", "Level", "tier", "Tier", "lvl", "Lvl"];

const RAID_WINDOW_SECONDS = 60;
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

let verifiedWallets = {};
let scheduledRefreshRunning = false;
let seenConvoyActionIds = new Set();
let convoyTrackerInitialized = false;
let activeConvoy = null;

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

async function setRaiderFaction(discordId, wallet, faction) {
  await pool.query(
    `
    INSERT INTO raid_balances (discord_id, wallet, faction, updated_at)
    VALUES ($1, $2, $3, NOW())
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

function rollNkfeReward(legendary = false) {
  const roll = Math.random();

  if (legendary) {
    if (roll < 0.20) return 25;
    if (roll < 0.40) return 35;
    if (roll < 0.60) return 45;
    if (roll < 0.80) return 55;
    if (roll < 0.95) return 65;
    return 75;
  }

  if (roll < 0.40) return 1;
  if (roll < 0.70) return 2;
  if (roll < 0.85) return 3;
  if (roll < 0.95) return 4;
  return 5;
}

function getFactionLabel(factionKey) {
  if (!factionKey || !RAIDER_FACTIONS[factionKey]) return "No faction";
  const faction = RAIDER_FACTIONS[factionKey];
  return `${faction.emoji} ${faction.name}`;
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

    new SlashCommandBuilder()
      .setName("testconvoy")
      .setDescription("Test posting a convoy activity message to general chat.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("raid")
      .setDescription("Attempt to raid the active NiftyKicks convoy.")
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

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Slash commands registered.");
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
        console.log(`Skipping table ${code}.${table}:`, json.error?.what || json.message || "Unknown table error");
        break;
      }

      rows.push(...(json.rows || []));
      more = Boolean(json.more);
      if (!more) break;

      nextKey = json.next_key || json.next_key === "" ? json.next_key : null;
      if (!nextKey) break;
    } catch (error) {
      console.log(`Failed to read table ${code}.${table}:`, error.message);
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

function buildProfileMessage(member, wallet, assetData, finalRules, counts) {
  const assets = assetData.combinedAssets;
  const stats = buildProfileStats(assets, counts);

  return (
    `🏭 **NiftyKicks Factory Profile**

` +
    `**Player:** ${member.displayName}
` +
    `**Wallet:** ${wallet}

` +
    `**Assets Evaluated**
` +
    `Wallet NFTs: **${assetData.walletAssets.length}**
` +
    `Staked NFTs: **${assetData.stakedAssets.length}**
` +
    `Total Evaluated: **${assetData.combinedAssets.length}**

` +
    `**Progression Snapshot**
` +
    `🏭 Factories Tier 9: **${stats.factoryTier9}**
` +
    `⚙️ Machine Set Tier 9 Complete: **${stats.machinesTier9Complete ? "Yes" : "No"}**
` +
    `👷 Skill Laborers Tier 9: **${stats.skillLaborerTier9}**
` +
    `🧠 Tech Centers Tier 3: **${stats.techCenterTier3}**
` +
    `🔥 Military Facilities Tier 4: **${stats.militaryTier4}**
` +
    `📖 Chronicle Books: **${stats.chronicleBooks}**
` +
    `🌟 Neon Genesis Set Complete: **${stats.neonGenesisComplete ? "Yes" : "No"}**

` +
    `**Current NFT Roles**
` +
    `${finalRules.length ? finalRules.map(r => r.name).join("\n") : "None"}`
  );
}

async function getProfileForMember(member, wallet) {
  const assetData = await getAllRoleAssets(wallet);
  const assets = assetData.combinedAssets;
  const counts = countTemplates(assets);
  const qualified = ROLE_RULES.filter(rule => qualifiesForRule(rule, assets, counts));
  const finalRules = selectHighestGroupedRules(qualified);
  return buildProfileMessage(member, wallet, assetData, finalRules, counts);
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
  console.log("Starting scheduled wallet refresh...");

  const guild = await client.guilds.fetch(GUILD_ID);
  let checked = 0;
  let failed = 0;

  for (const discordId of Object.keys(verifiedWallets)) {
    const wallet = verifiedWallets[discordId];

    try {
      const member = await guild.members.fetch(discordId);
      await processWalletByMember(guild, member, wallet, false, true);
      checked++;
      console.log(`Refreshed ${wallet} for Discord user ${discordId}`);
      await sleep(1500);
    } catch (error) {
      failed++;
      console.error(`Failed to refresh ${wallet} for Discord user ${discordId}:`, error);
    }
  }

  scheduledRefreshRunning = false;
  console.log(`Scheduled refresh complete. Checked: ${checked}. Failed: ${failed}.`);
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

async function postWeeklyRaidLeaderboardAndReset() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);
    if (!channel) return;

    const result = await pool.query(`
      SELECT discord_id, wallet, faction, weekly_nkfe, weekly_successes, weekly_attempts, weekly_legendary_successes
      FROM raid_balances
      WHERE weekly_attempts > 0 OR weekly_nkfe > 0
      ORDER BY weekly_nkfe DESC, weekly_successes DESC, weekly_attempts DESC
    `);

    if (!result.rows.length) {
      await channel.send(
        "🏴 **Weekly Convoy Raiders Results** 🏴\n\n" +
        "No raid activity was recorded this week.\n\n" +
        "A new raid week has started."
      );
      return;
    }

    const payoutLines = result.rows.map((row, index) =>
      `${index + 1}. <@${row.discord_id}> — **${row.weekly_nkfe} NKFE** | ${row.weekly_successes}/${row.weekly_attempts} successful | Legendary wins: ${row.weekly_legendary_successes} | ${getFactionLabel(row.faction)} | Wallet: **${row.wallet}**`
    );

    const totalPayout = result.rows.reduce((sum, row) => sum + Number(row.weekly_nkfe || 0), 0);

    const factionResult = await pool.query(`
      SELECT faction,
             COUNT(DISTINCT discord_id) AS active_members,
             SUM(weekly_nkfe) AS faction_nkfe,
             SUM(weekly_successes) AS faction_successes,
             SUM(weekly_attempts) AS faction_attempts
      FROM raid_balances
      WHERE faction IS NOT NULL AND weekly_attempts > 0
      GROUP BY faction
      ORDER BY faction_nkfe DESC, faction_successes DESC, faction_attempts DESC
    `);

    const factionLines = factionResult.rows.map((row, index) =>
      `${index + 1}. **${getFactionLabel(row.faction)}** — ${row.faction_nkfe || 0} NKFE | ${row.faction_successes || 0}/${row.faction_attempts || 0} successful | Active raiders: ${row.active_members}`
    );

    const eligibleWinner = factionResult.rows.find(row =>
      Number(row.active_members || 0) >= MIN_FACTION_MEMBERS &&
      Number(row.faction_successes || 0) >= MIN_FACTION_SUCCESSFUL_RAIDS
    );

    let factionWarMessage = "";
    if (factionLines.length) {
      factionWarMessage += "\n\n⚔️ **Weekly Faction War Standings**\n" + factionLines.join("\n");
    }

    if (eligibleWinner) {
      const winnerMembersResult = await pool.query(
        `
        SELECT discord_id, wallet, weekly_successes
        FROM raid_balances
        WHERE faction = $1 AND weekly_successes > 0
        ORDER BY weekly_successes DESC, weekly_nkfe DESC
        `,
        [eligibleWinner.faction]
      );

      const winnerCount = winnerMembersResult.rows.length;
      const eachReward = winnerCount ? Math.floor(FACTION_WAR_REWARD_NKFE / winnerCount) : 0;
      const winnerLines = winnerMembersResult.rows.map(row =>
        `<@${row.discord_id}> — ${row.wallet} — **${eachReward} NKFE faction bonus**`
      );

      factionWarMessage +=
        `

🏆 **Faction War Winner:** ${getFactionLabel(eligibleWinner.faction)}
` +
        `Reward Pool: **${FACTION_WAR_REWARD_NKFE} NKFE**
` +
        `Eligible Raiders: **${winnerCount}**
` +
        `Each Eligible Raider Receives: **${eachReward} NKFE**

` +
        winnerLines.join("\n");
    } else {
      factionWarMessage +=
        "\n\n⚠️ **No faction qualified for the 500 NKFE faction reward this week.**\n" +
        `Requirement: at least ${MIN_FACTION_MEMBERS} active faction raiders and ${MIN_FACTION_SUCCESSFUL_RAIDS} successful faction raids.`;
    }

    await channel.send(
      "🏴 **Weekly Convoy Raiders Results & Payout Record** 🏴\n\n" +
      payoutLines.join("\n") +
      `

💰 **Total Raid NKFE Owed This Week:** ${totalPayout} NKFE` +
      factionWarMessage +
      "\n\nThis post is the weekly payout record.\n" +
      "The weekly raid leaderboard has now been reset for the next week."
    );

    await pool.query(`
      UPDATE raid_balances
      SET weekly_nkfe = 0,
          weekly_successes = 0,
          weekly_attempts = 0,
          weekly_legendary_successes = 0,
          updated_at = NOW()
    `);

    console.log("Weekly raid leaderboard posted and weekly stats reset.");
  } catch (error) {
    console.error("Failed to post weekly raid leaderboard:", error);
  }
}

function getActionId(action) {
  return action.global_sequence || action.account_action_seq || action.trx_id || `${action.block_num}-${action.action_ordinal}`;
}

function getActionDataValue(action, keys) {
  const data = action.act?.data || {};
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null) return data[key];
  }
  return null;
}

async function fetchRecentConvoyActions() {
  const foundActions = [];

  for (const contract of CONVOY_CONTRACTS) {
    const url = `${WAX_HISTORY_API}/v2/history/get_actions?account=${contract}&sort=desc&limit=25`;

    try {
      const response = await fetch(url);
      const json = await response.json();
      const actions = json.actions || [];

      for (const action of actions) {
        const actionName = action.act?.name || action.name || action.action;
        if (CONVOY_ACTIONS.includes(actionName)) foundActions.push({ contract, actionName, action });
      }
    } catch (error) {
      console.log(`Failed to fetch recent actions for ${contract}:`, error.message);
    }
  }

  return foundActions;
}

async function openRaidWindow({ route, convoyId, wallet, legendary }) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = guild.channels.cache.get(GENERAL_CHAT_CHANNEL_ID);
  if (!channel) return;

  activeConvoy = {
    id: String(convoyId),
    route: String(route),
    wallet: String(wallet),
    legendary: Boolean(legendary),
    startedAt: Date.now(),
    expiresAt: Date.now() + RAID_WINDOW_SECONDS * 1000,
    attemptedDiscordIds: new Set()
  };

  if (legendary) {
    await channel.send(
      "🚨 **LEGENDARY CONVOY DETECTED!** 🚨\n\n" +
      `Route / Mission: **${route}**
` +
      `Convoy ID: **${convoyId}**

` +
      `Raid window: **${RAID_WINDOW_SECONDS} seconds**
` +
      "Potential loot: **25–75 $NKFE**\n\n" +
      "Verified wallets can run `/raid` now."
    );
  } else {
    await channel.send(
      "⚠️ **Convoy Raiders Alert!** ⚠️\n\n" +
      `Route / Mission: **${route}**
` +
      `Convoy ID: **${convoyId}**

` +
      `Raid window: **${RAID_WINDOW_SECONDS} seconds**
` +
      "Reward: **1–5 $NKFE**\n\n" +
      "Verified wallets can run `/raid` now."
    );
  }

  setTimeout(() => {
    if (activeConvoy && activeConvoy.id === String(convoyId)) activeConvoy = null;
  }, RAID_WINDOW_SECONDS * 1000);
}

async function postConvoyActivity(contract, actionName, action) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = guild.channels.cache.get(GENERAL_CHAT_CHANNEL_ID);
  if (!channel) return;

  const wallet = cleanValue(getActionDataValue(action, ["user", "owner", "account", "player", "wallet", "from", "to"]));
  const route = cleanValue(getActionDataValue(action, ["route", "route_id", "routeid", "mission", "mission_id", "missionid"]));
  const convoy = cleanValue(getActionDataValue(action, ["convoy_id", "convoyid", "convoy", "id"]));

  let discordUser = null;
  for (const [discordId, savedWallet] of Object.entries(verifiedWallets)) {
    if (savedWallet === wallet) {
      discordUser = `<@${discordId}>`;
      break;
    }
  }

  const playerDisplay = discordUser ? `${wallet} (${discordUser})` : wallet;

  let convoyEmoji = "🚚";
  if (route == 2) convoyEmoji = "🚛";
  if (route == 3) convoyEmoji = "🛻";
  if (route == 4) convoyEmoji = "🚀";

  const messages = [
    "Good luck on the route!",
    "Engines roaring — another convoy begins its journey.",
    "Supplies are on the move!",
    "The factory logistics never sleep.",
    "A convoy ventures into the unknown.",
    "Drivers report all systems ready.",
    "Cargo secured. Convoy departing.",
    "Another mission underway.",
    "Routes are active across the NiftyKicks network.",
    "The convoy pushes deeper into the wasteland."
  ];

  const randomMessage = messages[Math.floor(Math.random() * messages.length)];

  await channel.send(
    `${convoyEmoji} **Convoy Dispatched!**

` +
    `Wallet: **${playerDisplay}**
` +
    `Route / Mission: **${route}**
` +
    `Convoy ID: **${convoy}**

` +
    randomMessage
  );

  const legendary = Math.random() < LEGENDARY_CONVOY_CHANCE;
  await openRaidWindow({ route, convoyId: convoy, wallet, legendary });
}

async function checkConvoyActivity() {
  try {
    const recentActions = await fetchRecentConvoyActions();
    recentActions.reverse();

    for (const item of recentActions) {
      const actionId = getActionId(item.action);
      if (!actionId) continue;

      if (!convoyTrackerInitialized) {
        seenConvoyActionIds.add(actionId);
        continue;
      }

      if (seenConvoyActionIds.has(actionId)) continue;

      seenConvoyActionIds.add(actionId);
      await postConvoyActivity(item.contract, item.actionName, item.action);
      await sleep(1000);
    }

    convoyTrackerInitialized = true;

    if (seenConvoyActionIds.size > 500) {
      seenConvoyActionIds = new Set([...seenConvoyActionIds].slice(-250));
    }
  } catch (error) {
    console.error("Convoy tracker error:", error);
  }
}

async function handleRaid(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (!member.roles.cache.has(VERIFIED_WALLET_ROLE_ID)) {
    await interaction.editReply("You must verify your wallet before raiding. Run `/verify wallet.wam` first.");
    return;
  }

  const wallet = await getVerifiedWallet(interaction.user.id);
  if (!wallet) {
    await interaction.editReply("Your Discord has the verified role, but no wallet was found in the database. Please run `/verify wallet.wam` once.");
    return;
  }

  if (!activeConvoy || Date.now() > activeConvoy.expiresAt) {
    await interaction.editReply("No active convoy raid window right now. Watch for the next convoy dispatch.");
    return;
  }

  if (activeConvoy.attemptedDiscordIds.has(interaction.user.id)) {
    await interaction.editReply("You already attempted to raid this convoy. Wait for the next one.");
    return;
  }

  await ensureRaiderProfile(interaction.user.id, wallet);
  const raiderProfile = await getRaiderProfile(interaction.user.id);
  const faction = raiderProfile?.faction || null;

  activeConvoy.attemptedDiscordIds.add(interaction.user.id);

  const successChance = activeConvoy.legendary ? LEGENDARY_RAID_SUCCESS_CHANCE : RAID_SUCCESS_CHANCE;
  const success = Math.random() < successChance;
  const reward = success ? rollNkfeReward(activeConvoy.legendary) : 0;

  await recordRaid(
    interaction.user.id,
    wallet,
    faction,
    activeConvoy.id,
    activeConvoy.route,
    activeConvoy.legendary,
    success,
    reward
  );

  const successMessages = activeConvoy.legendary
    ? [
        "You breached the legendary convoy and escaped with premium cargo.",
        "The legendary convoy took heavy damage. You got out with rare loot.",
        "Against the odds, your raid crew cracked the high-value route."
      ]
    : [
        "You slipped past the convoy escort and secured the loot.",
        "The convoy was caught off guard. Clean hit.",
        "Your raid crew moved fast and disappeared with the cargo."
      ];

  const failMessages = activeConvoy.legendary
    ? [
        "The legendary convoy escort was too strong. Your crew was forced to retreat.",
        "Defense drones locked the route down. Raid failed.",
        "The legendary convoy held formation and pushed through."
      ]
    : [
        "Security pushed you back before you could reach the cargo.",
        "The convoy drivers spotted the ambush early. Raid failed.",
        "Your crew missed the timing and the convoy escaped."
      ];

  if (success) {
    const flavor = successMessages[Math.floor(Math.random() * successMessages.length)];
    await interaction.editReply(
      "⚔️ **Raid Successful!**\n\n" +
      `Raider: **${member.displayName}**
` +
      `Wallet: **${wallet}**
` +
      `Faction: **${getFactionLabel(faction)}**
` +
      `Convoy ID: **${activeConvoy.id}**

` +
      `${flavor}

` +
      `💰 Loot gained: **${reward} $NKFE**`
    );
  } else {
    const flavor = failMessages[Math.floor(Math.random() * failMessages.length)];
    await interaction.editReply(
      "🛡️ **Raid Failed!**\n\n" +
      `Raider: **${member.displayName}**
` +
      `Wallet: **${wallet}**
` +
      `Faction: **${getFactionLabel(faction)}**
` +
      `Convoy ID: **${activeConvoy.id}**

` +
      flavor
    );
  }
}
const publicChannel = client.channels.cache.get(GENERAL_CHAT_CHANNEL_ID);

if (publicChannel) {
  const publicFlavor = success
    ? successMessages[Math.floor(Math.random() * successMessages.length)]
    : failMessages[Math.floor(Math.random() * failMessages.length)];

  const publicMessage = success
    ? `💥 **CONVOY RAID SUCCESS!**\n\nRaider: **${member.displayName}**\nFaction: **${getFactionLabel(faction)}**\nConvoy ID: **${activeConvoy.id}**\n\n${publicFlavor}\n\n💰 Loot: **${reward} $NKFE**`
    : `🛡️ **RAID FAILED!**\n\nRaider: **${member.displayName}**\nFaction: **${getFactionLabel(faction)}**\nConvoy ID: **${activeConvoy.id}**\n\n${publicFlavor}`;

  await publicChannel.send(publicMessage);
}
async function buildRaidStatsMessage(discordId, displayName) {
  const wallet = await getVerifiedWallet(discordId);
  if (!wallet) return "No verified wallet found. Run `/verify wallet.wam` first.";

  await ensureRaiderProfile(discordId, wallet);
  const row = await getRaiderProfile(discordId);
  const attempts = Number(row?.total_attempts || 0);
  const successes = Number(row?.total_successes || 0);
  const successRate = attempts ? Math.round((successes / attempts) * 100) : 0;

  return (
    "📊 **Convoy Raider Stats**\n\n" +
    `Player: **${displayName}**
` +
    `Wallet: **${wallet}**
` +
    `Faction: **${getFactionLabel(row?.faction)}**

` +
    `Current Payout Balance: **${row?.payout_nkfe || 0} $NKFE**
` +
    `This Week's Raid Earnings: **${row?.weekly_nkfe || 0} $NKFE**
` +
    `Lifetime NKFE Earned: **${row?.lifetime_nkfe || 0} $NKFE**
` +
    `Raid Attempts: **${attempts}**
` +
    `Successful Raids: **${successes}**
` +
    `Success Rate: **${successRate}%**
` +
    `Legendary Convoy Wins: **${row?.legendary_successes || 0}**`
  );
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
    await postWeeklyRaidLeaderboardAndReset();
  }, { timezone: "America/Los_Angeles" });
  console.log("Weekly raid leaderboard post scheduled for Sundays at 5:00 PM Pacific.");

  setInterval(async () => {
    await checkConvoyActivity();
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
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ flags: 64 });
  } catch (error) {
    console.log("Could not defer interaction. It may have expired.");
    return;
  }

  try {
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
      const profile = await getProfileForMember(member, wallet);
      await interaction.editReply(profile);
      return;
    }

    if (interaction.commandName === "raid") {
      await handleRaid(interaction);
      return;
    }

    if (interaction.commandName === "raidstats") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const message = await buildRaidStatsMessage(interaction.user.id, member.displayName);
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
      return;
    }

    if (interaction.commandName === "raidfactions") {
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
