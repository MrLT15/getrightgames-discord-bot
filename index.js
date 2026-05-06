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

function logTableReadWarning(code, table, reason, prefix = "Skipping table") {
  const warningKey = `${prefix}:${code}.${table}:${reason}`;
  if (tableReadWarningKeys.has(warningKey)) return;

  tableReadWarningKeys.add(warningKey);
  console.log(`${prefix} ${code}.${table}: ${reason}`);
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
