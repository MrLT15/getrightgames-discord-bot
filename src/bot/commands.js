const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { rankCommands } = require("../features/ranks");

const walletCommands = [
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
    .toJSON()
];

const profileCommands = [
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show your NiftyKicks Factory NFT profile.")
    .toJSON()
];

const raidCommands = [
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
    .toJSON()
];

const adminCommands = [
  new SlashCommandBuilder()
    .setName("testconvoy")
    .setDescription("Admin: test posting a convoy activity message to general chat.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .toJSON(),

  new SlashCommandBuilder()
    .setName("revertselfraids")
    .setDescription("Admin: revert any recorded raids where players raided their own convoys.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON()
];

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

function buildCommands() {
  return [
    ...walletCommands,
    ...profileCommands,
    ...rankCommands,
    ...adminCommands,
    ...raidCommands
  ];
}

async function registerCommands({ token, clientId, guildId }) {
  const uniqueCommands = dedupeCommandsByName(buildCommands());
  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: uniqueCommands });
  console.log(`Slash commands registered (${uniqueCommands.length} unique commands).`);
}

module.exports = {
  walletCommands,
  profileCommands,
  raidCommands,
  adminCommands,
  buildCommands,
  dedupeCommandsByName,
  registerCommands
};
