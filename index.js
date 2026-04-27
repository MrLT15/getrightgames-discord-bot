const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const ROLE_RULES = [
  {
    roleId: "Master_Historian",
    templateId: "776806",
    quantity: 3
  }
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

async function getAssets(wallet) {
  const url = `https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${wallet}&limit=1000`;

  const response = await fetch(url);
  const json = await response.json();

  return json.data || [];
}

function countTemplates(assets) {
  const counts = {};

  for (const asset of assets) {
    const templateId = asset.template?.template_id;

    if (!templateId) continue;

    counts[templateId] = (counts[templateId] || 0) + 1;
  }

  return counts;
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verify") {
    const wallet = interaction.options.getString("wallet");

    const assets = await getAssets(wallet);
    const counts = countTemplates(assets);

    const member = await interaction.guild.members.fetch(interaction.user.id);

    for (const rule of ROLE_RULES) {
      const owned = counts[rule.templateId] || 0;

      if (owned >= rule.quantity) {
        await member.roles.add(rule.roleId);
      }
    }

    await interaction.reply({
      content: "Wallet verified and roles updated!",
      ephemeral: true
    });
  }
});

client.login(TOKEN);
