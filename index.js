const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fetch = require("node-fetch");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

const LEVEL_FIELDS = ["level", "Level", "tier", "Tier", "lvl", "Lvl"];

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

  { type: "machine_set", group: "machines", name: "🔧 Machine_Operator", roleId: "1498385988206989312", templateIds: ["708910","708908","708907","708906"], minLevel: 3 },
  { type: "machine_set", group: "machines", name: "⚙️ Machine_Specialist", roleId: "1498386192104951828", templateIds: ["708910","708908","708907","708906"], minLevel: 6 },
  { type: "machine_set", group: "machines", name: "🏭 Machine_Master", roleId: "1498386362276253887", templateIds: ["708910","708908","708907","708906"], minLevel: 9 },

  { type: "all_templates", name: "🌟 Neon_Genesis_Founder", roleId: "1497999187944538264", templateIds: ["452006","452005","452004","452003","452002"], quantityEach: 1 }
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

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
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Slash command /verify registered.");
}

async function getAssets(wallet) {
  const url =
    `https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${wallet}&limit=1000`;

  const response = await fetch(url);
  const json = await response.json();

  return json.data || [];
}

function getTemplateId(asset) {
  return String(asset.template?.template_id || "");
}

function getAssetLevel(asset) {
  const sources = [
    asset.mutable_data,
    asset.immutable_data,
    asset.data,
    asset.template?.immutable_data
  ];

  for (const source of sources) {
    if (!source) continue;

    for (const field of LEVEL_FIELDS) {
      if (source[field] !== undefined) {
        const lvl = parseInt(source[field]);
        if (!isNaN(lvl)) return lvl;
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "verify") return;

  const wallet = interaction.options.getString("wallet").toLowerCase();

  await interaction.deferReply({ ephemeral: true });

  try {
    const assets = await getAssets(wallet);
    const counts = countTemplates(assets);
    const member = await interaction.guild.members.fetch(interaction.user.id);

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

    await interaction.editReply(
      `✅ Wallet checked: **${wallet}**\n\n` +
      `Roles Added:\n${added.length ? added.join("\n") : "None"}\n\n` +
      `Lower Tier Roles Removed:\n${removed.length ? removed.join("\n") : "None"}`
    );

  } catch (error) {
    console.error(error);
    await interaction.editReply("Something went wrong while checking your wallet.");
  }
});

client.login(TOKEN);
