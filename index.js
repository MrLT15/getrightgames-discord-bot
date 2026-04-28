const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fetch = require("node-fetch");
const fs = require("fs");
const cron = require("node-cron");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

const WALLETS_FILE = "./wallets.json";
const VERIFIED_WALLET_ROLE_ID = "1498390601199255794";

const WAX_CHAIN_API = "https://wax.greymass.com";

const CONTRACT_ACCOUNTS = [
  "niftykickgam",
  "niftykicksgm",
  "niftykickgme"
];

const LEVEL_FIELDS = ["level", "Level", "tier", "Tier", "lvl", "Lvl"];

let verifiedWallets = {};

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

  { type: "all_templates", name: "🌟 Neon_Genesis_Founder", roleId: "1497999187944538264", templateIds: ["452006", "452005", "452004", "452003", "452002"], quantityEach: 1 }
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function loadWallets() {
  if (!fs.existsSync(WALLETS_FILE)) return {};

  try {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  } catch (error) {
    console.error("Failed to read wallets.json:", error);
    return {};
  }
}

function saveWallets(wallets) {
  verifiedWallets = wallets;

  try {
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  } catch (error) {
    console.error("Failed to save wallets.json:", error);
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Verify your WAX wallet and receive NFT roles.")
      .addStringOption(option =>
        option
          .setName("wallet")
          .setDescription("Your WAX wallet")
          .setRequired(true)
      )
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
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Slash commands /verify, /refresh, /stats, and /leaderboard registered.");
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
    const body = {
      json: true,
      code,
      scope: code,
      table,
      limit
    };

    if (useOwnerIndex) {
      body.index_position = "2";
      body.key_type = "i64";
    }

    if (nextKey) {
      body.lower_bound = nextKey;
    }

    if (upperBound) {
      body.upper_bound = upperBound;
    }

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
  const rows = await getTableRows({
    code,
    table,
    lowerBound: wallet,
    upperBound: wallet,
    useOwnerIndex: true
  });

  return rows.filter(row => row.owner === wallet || row.account === wallet);
}

async function getRowsByPrimaryAccount(code, table, wallet) {
  const rows = await getTableRows({
    code,
    table,
    lowerBound: wallet,
    upperBound: wallet,
    useOwnerIndex: false
  });

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

    const museums = await getRowsByOwner(contract, "kickmuseum", wallet);
    for (const row of museums) {
      stakedAssets.push(makePseudoAsset({
        templateId: "KICK_MUSEUM",
        tier: row.tier || 0,
        assetId: row.asset_id,
        source: `${contract}:kickmuseum`
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
  const sources = [
    asset.mutable_data,
    asset.immutable_data,
    asset.data,
    asset.template?.immutable_data,
    asset
  ];

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

function qualifiesForRule(rule, assets, counts) {
  if (rule.type === "simple_template") {
    return (counts[rule.templateId] || 0) >= rule.quantity;
  }

  if (rule.type === "tiered_template") {
    return assets.some(asset =>
      getTemplateId(asset) === rule.templateId &&
      getAssetLevel(asset) >= rule.minLevel
    );
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
    return rule.templateIds.every(id =>
      (counts[id] || 0) >= rule.quantityEach
    );
  }

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

    if (!current || rule.minLevel > current.minLevel) {
      grouped[rule.group] = rule;
    }
  }

  return [...final, ...Object.values(grouped)];
}

async function processWalletByMember(guild, member, wallet, saveWallet = false) {
  const assetData = await getAllRoleAssets(wallet);
  const assets = assetData.combinedAssets;
  const counts = countTemplates(assets);

  let verifiedRoleAdded = false;

  if (!member.roles.cache.has(VERIFIED_WALLET_ROLE_ID)) {
    await member.roles.add(VERIFIED_WALLET_ROLE_ID);
    verifiedRoleAdded = true;
  }

  if (saveWallet) {
    const wallets = { ...verifiedWallets };
    wallets[member.id] = wallet;
    saveWallets(wallets);
  }

  const qualified = ROLE_RULES.filter(rule =>
    qualifiesForRule(rule, assets, counts)
  );

  const finalRules = selectHighestGroupedRules(qualified);
  const finalRoleIds = new Set(finalRules.map(r => r.roleId));

  const added = [];
  const removed = [];

  for (const rule of finalRules) {
    if (!member.roles.cache.has(rule.roleId)) {
      await member.roles.add(rule.roleId);
      added.push(rule.name);
    }
  }

  for (const rule of ROLE_RULES) {
    if (!rule.group) continue;

    if (
      member.roles.cache.has(rule.roleId) &&
      !finalRoleIds.has(rule.roleId)
    ) {
      await member.roles.remove(rule.roleId);
      removed.push(rule.name);
    }
  }

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
  console.log("Starting scheduled wallet refresh...");

  const guild = await client.guilds.fetch(GUILD_ID);

  let checked = 0;
  let failed = 0;

  for (const discordId of Object.keys(verifiedWallets)) {
    const wallet = verifiedWallets[discordId];

    try {
      const member = await guild.members.fetch(discordId);
      await processWalletByMember(guild, member, wallet, false);

      checked++;
      console.log(`Refreshed ${wallet} for Discord user ${discordId}`);
    } catch (error) {
      failed++;
      console.error(`Failed to refresh ${wallet} for Discord user ${discordId}:`, error);
    }
  }

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
  lines.push("_Note: Stats are based on currently cached Discord role data. Scheduled refresh runs every 6 hours._");

  return lines.join("\n");
}

async function buildLeaderboardMessage(guild) {
  const leaderboardRoles = [
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
      const names = members
        .slice(0, 10)
        .map((member, index) => `${index + 1}. ${member.displayName}`)
        .join("\n");

      lines.push(names);
    } else {
      lines.push("_No holders yet_");
    }

    lines.push("");
  }

  lines.push("_Leaderboard is based on currently cached Discord role data._");

  return lines.join("\n");
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  verifiedWallets = loadWallets();
  console.log(`Loaded ${Object.keys(verifiedWallets).length} saved wallets.`);

  await registerCommands();

  cron.schedule("0 */6 * * *", async () => {
    await refreshAllVerifiedWallets();
  });

  console.log("Automatic wallet refresh scheduled every 6 hours.");
});

client.on("guildMemberAdd", async member => {
  try {
    await member.send(
      `👋 Welcome to **GetRight Games**!\n\n` +
      `To verify your WAX wallet and unlock NFT-based Discord roles, go to the server and run:\n\n` +
      `/verify yourwallet.wam\n\n` +
      `After you verify once, you can use:\n\n` +
      `/refresh\n\n` +
      `This will update your roles whenever your NFTs change.`
    );
  } catch (error) {
    console.log(`Could not DM new member ${member.id}. They may have DMs disabled.`);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

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
        await interaction.editReply(
          "No wallet found for you yet. Please run `/verify yourwallet.wam` first."
        );
        return;
      }

      commandNote = "Your saved wallet was refreshed.";
    }

    if (!wallet) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await processWalletByMember(
      interaction.guild,
      member,
      wallet,
      saveWallet
    );

    await interaction.editReply(
      `✅ Wallet checked: **${result.wallet}**\n` +
      `Wallet NFTs scanned: **${result.walletAssetsChecked}**\n` +
      `Staked NFTs detected: **${result.stakedAssetsChecked}**\n` +
      `Total NFTs evaluated: **${result.assetsChecked}**\n\n` +
      `**Verified Wallet Role:**\n` +
      `${result.verifiedRoleAdded ? "✅ GRG Verified Wallet added" : "Already verified"}\n\n` +
      `**NFT Role Requirements Met:**\n` +
      `${result.qualifiedNames.length ? result.qualifiedNames.join("\n") : "None"}\n\n` +
      `**Roles Added:**\n` +
      `${result.added.length ? result.added.join("\n") : "None"}\n\n` +
      `**Lower Tier Roles Removed:**\n` +
      `${result.removed.length ? result.removed.join("\n") : "None"}\n\n` +
      `${commandNote}`
    );

  } catch (error) {
    console.error(error);
    await interaction.editReply("Something went wrong while processing your command.");
  }
});

client.login(TOKEN);
