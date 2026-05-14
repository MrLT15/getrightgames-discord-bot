const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.log(`✓ ${message}`);
}

function getJavaScriptFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }

  return files;
}

function checkSyntax() {
  const files = getJavaScriptFiles(repoRoot);
  for (const file of files) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }
  log(`Syntax check passed for ${files.length} JavaScript files`);
}

function requireFromRoot(relativePath) {
  return require(path.join(repoRoot, relativePath));
}

function createPoolStub() {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      return { rows: [] };
    }
  };
}

function checkCommands() {
  const { buildCommands, dedupeCommandsByName, registerCommands } = requireFromRoot("src/bot/commands.js");
  const commands = buildCommands();
  const uniqueCommands = dedupeCommandsByName(commands);
  const names = uniqueCommands.map(command => command.name);
  const requiredNames = [
    "verify",
    "refresh",
    "stats",
    "leaderboard",
    "profile",
    "rank",
    "rankleaderboard",
    "rankrewards",
    "raid",
    "raidstats",
    "raidwithdraw",
    "raidleaderboard",
    "raidfactions",
    "joinfaction",
    "testconvoy",
    "raidpayouts",
    "resetraidpayouts",
    "revertselfraids"
  ];

  assert(typeof registerCommands === "function", "registerCommands must be a function");
  assert(commands.length === uniqueCommands.length, "Slash command names must be unique");
  for (const name of requiredNames) {
    assert(names.includes(name), `Missing slash command: ${name}`);
  }

  log(`Command registry builds ${names.length} unique slash commands`);
}

function checkRepositories() {
  const { createWalletRepository } = requireFromRoot("src/db/wallets.js");
  const { createRaiderRepository } = requireFromRoot("src/db/raiders.js");
  const wallets = {};
  const pool = createPoolStub();
  const walletRepository = createWalletRepository({ pool, getWallets: () => wallets });
  const raiderRepository = createRaiderRepository({ pool });

  for (const name of ["loadWalletsFromDatabase", "saveWalletToDatabase", "removeWalletFromDatabase", "getVerifiedWallet"]) {
    assert(typeof walletRepository[name] === "function", `walletRepository.${name} must be a function`);
  }

  for (const name of ["ensureRaiderProfile", "getRaiderProfile", "setRaiderFaction", "recordRaid", "revertSelfRaids", "requestRaidWithdrawal"]) {
    assert(typeof raiderRepository[name] === "function", `raiderRepository.${name} must be a function`);
  }

  log("Wallet and raider repositories expose expected methods");
}

function checkServices() {
  const { createWaxService } = requireFromRoot("src/services/wax.js");
  const { toUnits, formatTokenAmount, formatPayoutAmount, calculateFeeUnits, executeNkfePayout } = requireFromRoot("src/services/payouts.js");
  const { createAssetService } = requireFromRoot("src/services/assets.js");
  const { ROLE_RULES, MILESTONE_ROLES, createRoleService } = requireFromRoot("src/services/roles.js");

  const waxService = createWaxService({ waxChainApi: "https://example.invalid", logTableReadWarning: () => {} });
  for (const name of ["getTableRows", "getRowsByOwner", "getRowsByPrimaryAccount"]) {
    assert(typeof waxService[name] === "function", `waxService.${name} must be a function`);
  }

  assert(toUnits(250, 8).toString() === "25000000000", "toUnits should convert whole NKFE to token units");
  assert(formatTokenAmount(25000000000n, 8) === "250", "formatTokenAmount should format token units");
  assert(formatPayoutAmount(25000000000n, 8, 4) === "250.0000", "formatPayoutAmount should format fallback payout decimals from source units");
  assert(calculateFeeUnits(25000000000n, 0.03).toString() === "750000000", "calculateFeeUnits should floor fee units");
  assert(typeof executeNkfePayout === "function", "executeNkfePayout must be a function");

  const assetService = createAssetService({ contractAccounts: [], levelFields: ["level", "tier"], waxService });
  for (const name of [
    "getAssets",
    "getStakedAssets",
    "getAllRoleAssets",
    "getTemplateId",
    "getAssetLevel",
    "countTemplates",
    "countAssetsByTemplateMinLevel",
    "hasMachineSetAtLevel",
    "qualifiesForRule",
    "selectHighestGroupedRules"
  ]) {
    assert(typeof assetService[name] === "function", `assetService.${name} must be a function`);
  }

  const counts = assetService.countTemplates([{ template: { template_id: "708905" } }, { template_id: "708905" }]);
  assert(counts["708905"] === 2, "countTemplates should count both template id formats");
  assert(assetService.getAssetLevel({ mutable_data: { tier: "9" } }) === 9, "getAssetLevel should parse configured level fields");

  assert(Array.isArray(ROLE_RULES) && ROLE_RULES.length > 0, "ROLE_RULES must be a non-empty array");
  assert(MILESTONE_ROLES && typeof MILESTONE_ROLES === "object", "MILESTONE_ROLES must be an object");
  const roleService = createRoleService({
    client: { guilds: { fetch: async () => ({ channels: { cache: new Map() } }) } },
    guildId: "guild",
    leaderboardChannelId: "channel",
    verifiedWalletRoleId: "verified",
    getWallets: () => ({}),
    saveWalletToDatabase: async () => {},
    removeWalletFromDatabase: async () => {},
    getAllRoleAssets: async () => ({ walletAssets: [], stakedAssets: [], combinedAssets: [] }),
    countTemplates: () => ({}),
    qualifiesForRule: () => false,
    selectHighestGroupedRules: () => [],
    sleep: async () => {}
  });

  for (const name of [
    "announceMilestones",
    "processWalletByMember",
    "refreshAllVerifiedWallets",
    "buildStatsMessage",
    "buildLeaderboardMessage",
    "postDailyLeaderboard"
  ]) {
    assert(typeof roleService[name] === "function", `roleService.${name} must be a function`);
  }

  log("WAX, asset, and role services expose expected methods");
}

function checkFeatures() {
  const { RANKS, rankCommands, getRankByXp, calculateRankProgress, createRankFeature } = requireFromRoot("src/features/ranks.js");
  const { RAID_BUTTON_PREFIX, createRaidFeature, isSameWallet } = requireFromRoot("src/features/raids.js");
  const { PROFILE_BUTTON_PREFIX, PROFILE_ACTIONS, createProfileFeature } = requireFromRoot("src/features/profile.js");
  const pool = createPoolStub();

  assert(Array.isArray(RANKS) && RANKS.length > 0, "RANKS must be a non-empty array");
  assert(Array.isArray(rankCommands) && rankCommands.length === 3, "rankCommands should expose three commands");
  assert(typeof getRankByXp === "function", "getRankByXp must be exported as a function");
  assert(typeof calculateRankProgress === "function", "calculateRankProgress must be exported as a function");

  const rankFeature = createRankFeature({
    pool,
    getVerifiedWallet: async () => "wallet.wam",
    ensureRaiderProfile: async () => {},
    getRaiderProfile: async () => null,
    getFactionLabel: () => "No faction"
  });
  for (const name of [
    "getRankByLevel",
    "calculateRankProgress",
    "calculateConvoyPower",
    "formatRank",
    "ensureRankProfile",
    "getRankProfile",
    "awardRankXp",
    "buildRankMessage",
    "sendRankLeaderboard",
    "buildRankRewardsMessage"
  ]) {
    assert(typeof rankFeature[name] === "function", `rankFeature.${name} must be a function`);
  }

  assert(RAID_BUTTON_PREFIX === "raid_convoy:", "Unexpected raid button prefix");
  assert(isSameWallet("PLAYER.WAM ", "player.wam"), "isSameWallet should normalize wallet case and whitespace");
  assert(!isSameWallet("player.wam", "other.wam"), "isSameWallet should reject different wallets");
  const raidFeature = createRaidFeature({
    client: {},
    pool,
    guildId: "guild",
    getVerifiedWallet: async () => "wallet.wam",
    ensureRaiderProfile: async () => {},
    getRaiderProfile: async () => null,
    recordRaid: async () => {},
    revertSelfRaids: async () => ({ reverted_raids: 0 }),
    rankFeature,
    getFactionLabel: () => "No faction",
    getVerifiedWallets: () => ({}),
    cleanValue: value => String(value || "Unknown"),
    sleep: async () => {}
  });
  for (const name of [
    "buildRaidButtonRow",
    "openRaidWindow",
    "checkConvoyActivity",
    "handleRaid",
    "buildRaidStatsMessage",
    "sendRaidLeaderboard",
    "sendRaidFactions",
    "postWeeklyRaidLeaderboardAndReset",
    "revertRecordedSelfRaids",
    "isRaidButton",
    "getRaidIdFromButton"
  ]) {
    assert(typeof raidFeature[name] === "function", `raidFeature.${name} must be a function`);
  }

  assert(PROFILE_BUTTON_PREFIX === "profile_action:", "Unexpected profile button prefix");
  assert(PROFILE_ACTIONS.RANK === "rank", "Unexpected profile rank action");
  const profileFeature = createProfileFeature({
    roleRules: [],
    getVerifiedWallet: async () => "wallet.wam",
    getAllRoleAssets: async () => ({ walletAssets: [], stakedAssets: [], combinedAssets: [] }),
    countTemplates: () => ({}),
    countAssetsByTemplateMinLevel: () => 0,
    hasMachineSetAtLevel: () => false,
    qualifiesForRule: () => false,
    selectHighestGroupedRules: () => [],
    ensureRaiderProfile: async () => {},
    getRaiderProfile: async () => null,
    processWalletByMember: async () => ({}),
    rankFeature,
    raidFeature,
    getFactionLabel: () => "No faction"
  });
  for (const name of [
    "buildProfileActionRows",
    "buildProfileStats",
    "buildProfileMessage",
    "getProfileForMember",
    "buildProfileReplyOptions",
    "handleProfileAction",
    "isProfileButton",
    "getProfileActionFromButton"
  ]) {
    assert(typeof profileFeature[name] === "function", `profileFeature.${name} must be a function`);
  }

  log("Rank, raid, and profile features expose expected methods");
}

function checkBotInfrastructure() {
  const { createInteractionHandler } = requireFromRoot("src/bot/interactions.js");
  const { startSchedules } = requireFromRoot("src/bot/schedules.js");
  const { registerWelcomeHandler } = requireFromRoot("src/bot/welcome.js");
  const { initDatabase, initWalletSchema, initRaidSchema } = requireFromRoot("src/db/init.js");

  assert(typeof startSchedules === "function", "startSchedules must be a function");
  assert(typeof registerWelcomeHandler === "function", "registerWelcomeHandler must be a function");
  assert(typeof initDatabase === "function", "initDatabase must be a function");
  assert(typeof initWalletSchema === "function", "initWalletSchema must be a function");
  assert(typeof initRaidSchema === "function", "initRaidSchema must be a function");

  const handler = createInteractionHandler({
    pool: createPoolStub(),
    verifiedWalletRoleId: "verified",
    generalChatChannelId: "general",
    raiderFactions: {},
    getVerifiedWallets: () => ({}),
    getVerifiedWallet: async () => null,
    setRaiderFaction: async () => {},
    processWalletByMember: async () => ({}),
    buildStatsMessage: async () => "",
    buildLeaderboardMessage: async () => "",
    rankFeature: {},
    raidFeature: {},
    profileFeature: {}
  });
  assert(typeof handler === "function", "createInteractionHandler must return a function");

  log("Bot infrastructure modules expose expected methods");
}

function main() {
  checkSyntax();
  checkCommands();
  checkRepositories();
  checkServices();
  checkFeatures();
  checkBotInfrastructure();
  console.log("\nSmoke tests passed.");
}

main();
