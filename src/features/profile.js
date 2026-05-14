const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const PROFILE_BUTTON_PREFIX = "profile_action:";
const PROFILE_ACTIONS = {
  REFRESH: "refresh",
  RANK: "rank",
  RAID_STATS: "raidstats",
  RAID_LEADERBOARD: "raidleaderboard",
  RAID_FACTIONS: "raidfactions"
};

function createProfileFeature({
  roleRules,
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
}) {
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
      `Withdrawable Payout Balance: **${raidProfile?.payout_nkfe || 0} $NKFE**`,
      "Use `/raidwithdraw` to withdraw your available raid payout balance.",
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
    const qualified = roleRules.filter(rule => qualifiesForRule(rule, assets, counts));
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

  function isProfileButton(customId) {
    return customId.startsWith(PROFILE_BUTTON_PREFIX);
  }

  function getProfileActionFromButton(customId) {
    return customId.slice(PROFILE_BUTTON_PREFIX.length);
  }

  return {
    buttonPrefix: PROFILE_BUTTON_PREFIX,
    actions: PROFILE_ACTIONS,
    buildProfileActionRows,
    buildProfileStats,
    buildProfileMessage,
    getProfileForMember,
    buildProfileReplyOptions,
    handleProfileAction,
    isProfileButton,
    getProfileActionFromButton
  };
}

module.exports = {
  PROFILE_BUTTON_PREFIX,
  PROFILE_ACTIONS,
  createProfileFeature
};
