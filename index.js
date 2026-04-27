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

const ROLE_RULES = [
  {
    roleId: "YOUR_MASTER_HISTORIAN_ROLE_ID",
    templateId: "776806",
    quantity: 3
  }
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
          .setDescription("Your WAX wallet, example: abcde.wam")
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "verify") return;

  const wallet = interaction.options.getString("wallet").toLowerCase().trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    const assets = await getAssets(wallet);
    const counts = countTemplates(assets);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    const added = [];

    for (const rule of ROLE_RULES) {
      const owned = counts[rule.templateId] || 0;

      if (owned >= rule.quantity) {
        await member.roles.add(rule.roleId);
        added.push(rule.templateId);
      }
    }

    await interaction.editReply(
      `Wallet checked: ${wallet}\nRoles updated successfully.`
    );
  } catch (error) {
    console.error(error);
    await interaction.editReply(
      "Something went wrong while checking your wallet."
    );
  }
});

client.login(TOKEN);
