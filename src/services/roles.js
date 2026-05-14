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

function createRoleService({
  client,
  guildId,
  leaderboardChannelId,
  verifiedWalletRoleId,
  getWallets,
  saveWalletToDatabase,
  removeWalletFromDatabase,
  getAllRoleAssets,
  countTemplates,
  qualifiesForRule,
  selectHighestGroupedRules,
  sleep
}) {
  let scheduledRefreshRunning = false;

  async function announceMilestones(guild, member, addedRoleIds) {
    const channel = guild.channels.cache.get(leaderboardChannelId);
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

    if (!member.roles.cache.has(verifiedWalletRoleId)) {
      await member.roles.add(verifiedWalletRoleId);
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

      const guild = await client.guilds.fetch(guildId);

      for (const discordId of Object.keys(getWallets())) {
        const wallet = getWallets()[discordId];

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
    const verifiedRole = guild.roles.cache.get(verifiedWalletRoleId);
    const verifiedCount = verifiedRole ? verifiedRole.members.size : 0;
    const savedWalletCount = Object.keys(getWallets()).length;

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
      const guild = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(leaderboardChannelId);
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

  return {
    announceMilestones,
    processWalletByMember,
    refreshAllVerifiedWallets,
    buildStatsMessage,
    buildLeaderboardMessage,
    postDailyLeaderboard
  };
}

module.exports = {
  ROLE_RULES,
  MILESTONE_ROLES,
  createRoleService
};
