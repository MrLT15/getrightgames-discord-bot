function createInteractionHandler({
  pool,
  verifiedWalletRoleId,
  generalChatChannelId,
  raiderFactions,
  getVerifiedWallets,
  getVerifiedWallet,
  setRaiderFaction,
  processWalletByMember,
  buildStatsMessage,
  buildLeaderboardMessage,
  rankFeature,
  raidFeature,
  profileFeature
}) {
  async function handleButtonInteraction(interaction) {
    if (raidFeature.isRaidButton(interaction.customId)) {
      const raidId = raidFeature.getRaidIdFromButton(interaction.customId);
      await raidFeature.handleRaid(interaction, raidId);
      return;
    }

    if (profileFeature.isProfileButton(interaction.customId)) {
      const action = profileFeature.getProfileActionFromButton(interaction.customId);
      await profileFeature.handleProfileAction(interaction, action);
      return;
    }

    await interaction.editReply("Unknown button interaction.");
  }

  async function handleJoinFactionCommand(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(verifiedWalletRoleId)) {
      await interaction.editReply("You must verify your wallet before joining a raider faction. Run `/verify wallet.wam` first.");
      return;
    }

    const wallet = await getVerifiedWallet(interaction.user.id);
    if (!wallet) {
      await interaction.editReply("No verified wallet found in the database. Run `/verify wallet.wam` once.");
      return;
    }

    const faction = interaction.options.getString("faction");
    if (!raiderFactions[faction]) {
      await interaction.editReply("Invalid faction selected.");
      return;
    }

    await setRaiderFaction(interaction.user.id, wallet, faction);
    const factionInfo = raiderFactions[faction];
    await interaction.editReply(
      `${factionInfo.emoji} **Faction Joined!**\n\n` +
      `You are now part of **${factionInfo.name}**.\n\n` +
      factionInfo.description
    );
  }

  async function handleRaidPayoutsCommand(interaction) {
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
  }

  async function handleWalletCommand(interaction) {
    let wallet;
    let saveWallet = false;
    let commandNote = "";

    if (interaction.commandName === "verify") {
      wallet = interaction.options.getString("wallet").toLowerCase().trim();
      saveWallet = true;
      commandNote = "Your wallet has been verified and saved. You can use `/refresh` any time to update your roles.";
    }

    if (interaction.commandName === "refresh") {
      wallet = getVerifiedWallets()[interaction.user.id];
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
      `**Roles Removed:**\n` +
      `${result.removed.length ? result.removed.join("\n") : "None"}\n\n` +
      commandNote
    );
  }

  async function handleSlashCommand(interaction) {
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
      const channel = interaction.guild.channels.cache.get(generalChatChannelId);
      if (!channel) {
        await interaction.editReply("General chat channel not found.");
        return;
      }
      await channel.send("🚚 **Convoy Tracker Test**\n\nThis is a test message from the GetRight Games Verification Bot.");
      await interaction.editReply("Test convoy message sent to general chat.");
      return;
    }

    if (interaction.commandName === "profile") {
      const wallet = getVerifiedWallets()[interaction.user.id];
      if (!wallet) {
        await interaction.editReply("No wallet found for you yet. Please run `/verify yourwallet.wam` first.");
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await interaction.editReply(await profileFeature.buildProfileReplyOptions(member, wallet));
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
      await handleJoinFactionCommand(interaction);
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
      await handleRaidPayoutsCommand(interaction);
      return;
    }

    if (interaction.commandName === "resetraidpayouts") {
      await pool.query("UPDATE raid_balances SET payout_nkfe = 0, updated_at = NOW()");
      await interaction.editReply("Convoy Raiders current payout balances have been reset to 0. Lifetime and weekly stats were preserved.");
      return;
    }

    if (interaction.commandName === "revertselfraids") {
      const result = await raidFeature.revertRecordedSelfRaids();
      await interaction.editReply(
        "🧹 **Self-Raid Revert Complete**\n\n" +
        `Reverted raids: **${result.reverted_raids || 0}**\n` +
        `Attempts removed: **${result.reverted_attempts || 0}**\n` +
        `Successes removed: **${result.reverted_successes || 0}**\n` +
        `NKFE removed: **${result.reverted_reward || 0}**\n` +
        `Rank XP removed: **${result.reverted_xp || 0}**\n\n` +
        "Note: only raids with a stored convoy owner wallet can be identified and reverted."
      );
      return;
    }

    await handleWalletCommand(interaction);
  }

  return async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    try {
      await interaction.deferReply({ flags: 64 });
    } catch (error) {
      console.log("Could not defer interaction. It may have expired.");
      return;
    }

    try {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
        return;
      }

      await handleSlashCommand(interaction);
    } catch (error) {
      console.error(error);
      try {
        await interaction.editReply("Something went wrong while processing your command.");
      } catch {
        console.log("Could not send error reply to interaction.");
      }
    }
  };
}

module.exports = {
  createInteractionHandler
};
