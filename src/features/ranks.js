const { SlashCommandBuilder } = require("discord.js");

const RANKS = [
  { level: 1, name: "Private", abbreviation: "PVT", xp: 0 },
  { level: 2, name: "Private", abbreviation: "PV2", xp: 250 },
  { level: 3, name: "Private First Class", abbreviation: "PFC", xp: 750 },
  { level: 4, name: "Specialist", abbreviation: "SPC", xp: 1500 },
  { level: 5, name: "Corporal", abbreviation: "CPL", xp: 2500 },
  { level: 6, name: "Sergeant", abbreviation: "SGT", xp: 4000 },
  { level: 7, name: "Staff Sergeant", abbreviation: "SSG", xp: 6000 },
  { level: 8, name: "Sergeant First Class", abbreviation: "SFC", xp: 8500 },
  { level: 9, name: "Master Sergeant", abbreviation: "MSG", xp: 12000 },
  { level: 10, name: "First Sergeant", abbreviation: "1SG", xp: 16000 },
  { level: 11, name: "Sergeant Major", abbreviation: "SGM", xp: 22000 },
  { level: 12, name: "Command Sergeant Major", abbreviation: "CSM", xp: 30000 },
  { level: 13, name: "Sergeant Major of the Army", abbreviation: "SMA", xp: 40000 },
  { level: 14, name: "Warrant Officer 1", abbreviation: "WO1", xp: 52000 },
  { level: 15, name: "Chief Warrant Officer 2", abbreviation: "CW2", xp: 66000 },
  { level: 16, name: "Chief Warrant Officer 3", abbreviation: "CW3", xp: 82000 },
  { level: 17, name: "Chief Warrant Officer 4", abbreviation: "CW4", xp: 100000 },
  { level: 18, name: "Chief Warrant Officer 5", abbreviation: "CW5", xp: 122000 },
  { level: 19, name: "Second Lieutenant", abbreviation: "2LT", xp: 150000 },
  { level: 20, name: "First Lieutenant", abbreviation: "1LT", xp: 185000 },
  { level: 21, name: "Captain", abbreviation: "CPT", xp: 230000 },
  { level: 22, name: "Major", abbreviation: "MAJ", xp: 285000 },
  { level: 23, name: "Lieutenant Colonel", abbreviation: "LTC", xp: 350000 },
  { level: 24, name: "Colonel", abbreviation: "COL", xp: 430000 },
  { level: 25, name: "Brigadier General", abbreviation: "BG", xp: 525000 },
  { level: 26, name: "Major General", abbreviation: "MG", xp: 650000 },
  { level: 27, name: "Lieutenant General", abbreviation: "LTG", xp: 800000 },
  { level: 28, name: "General", abbreviation: "GEN", xp: 1000000 },
  { level: 29, name: "General of the Army", abbreviation: "GA", xp: 1250000 }
];

const RANK_XP_REWARDS = {
  ATTEMPT: 5,
  SUCCESS: 50,
  LEGENDARY_SUCCESS: 150
};

const RANK_WEEKLY_XP_CAPS = {
  ATTEMPT: 1000,
  SUCCESS: 5000,
  LEGENDARY: 3000
};

const rankCommands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your Convoy Command rank and XP progress.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rankleaderboard")
    .setDescription("Show the Convoy Command XP leaderboard.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rankrewards")
    .setDescription("Show Convoy Command rank milestones and XP rules.")
    .toJSON()
];

async function initRankSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_ranks (
      discord_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      weekly_xp INTEGER NOT NULL DEFAULT 0,
      weekly_attempt_xp INTEGER NOT NULL DEFAULT 0,
      weekly_success_xp INTEGER NOT NULL DEFAULT 0,
      weekly_legendary_xp INTEGER NOT NULL DEFAULT 0,
      weekly_bonus_xp INTEGER NOT NULL DEFAULT 0,
      weekly_xp_week_start DATE NOT NULL DEFAULT CURRENT_DATE,
      current_rank_level INTEGER NOT NULL DEFAULT 1,
      best_rank_level INTEGER NOT NULL DEFAULT 1,
      convoy_power INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_xp_logs (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      convoy_id TEXT,
      xp_source TEXT NOT NULL,
      xp_amount INTEGER NOT NULL,
      rank_before INTEGER NOT NULL,
      rank_after INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rank_promotion_logs (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      old_rank_level INTEGER NOT NULL,
      new_rank_level INTEGER NOT NULL,
      old_rank_name TEXT NOT NULL,
      new_rank_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE raid_ranks ADD COLUMN IF NOT EXISTS weekly_bonus_xp INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_ranks ADD COLUMN IF NOT EXISTS weekly_xp_week_start DATE NOT NULL DEFAULT CURRENT_DATE;`);
  await pool.query(`ALTER TABLE raid_ranks ADD COLUMN IF NOT EXISTS convoy_power INTEGER NOT NULL DEFAULT 0;`);
}

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return weekStart.toISOString().slice(0, 10);
}

function getRankByXp(xp) {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (Number(xp || 0) >= rank.xp) currentRank = rank;
    else break;
  }
  return currentRank;
}

function getRankByLevel(level) {
  return RANKS.find(rank => rank.level === Number(level)) || RANKS[0];
}

function getNextRank(rank) {
  return RANKS.find(item => item.level === rank.level + 1) || null;
}

function calculateRankProgress(xp) {
  const currentRank = getRankByXp(xp);
  const nextRank = getNextRank(currentRank);
  if (!nextRank) return { currentRank, nextRank: null, progressPercent: 100, xpIntoRank: 0, xpNeededForNext: 0 };

  const xpIntoRank = Number(xp || 0) - currentRank.xp;
  const xpNeededForNext = nextRank.xp - currentRank.xp;
  const progressPercent = xpNeededForNext ? Math.floor((xpIntoRank / xpNeededForNext) * 100) : 100;
  return { currentRank, nextRank, progressPercent, xpIntoRank, xpNeededForNext };
}

function calculateConvoyPower(xp, raidProfile = null) {
  return Number(xp || 0) +
    Number(raidProfile?.total_successes || 0) * 10 +
    Number(raidProfile?.legendary_successes || 0) * 100;
}

function formatRank(rank) {
  return `${rank.name} (${rank.abbreviation})`;
}

function capRankXp(amount, currentWeeklyAmount, cap) {
  return Math.max(Math.min(Number(amount || 0), Number(cap || 0) - Number(currentWeeklyAmount || 0)), 0);
}

function createRankFeature({ pool, getVerifiedWallet, ensureRaiderProfile, getRaiderProfile, getFactionLabel }) {
  async function ensureRankProfile(discordId, wallet) {
    const weekStart = getCurrentWeekStart();
    await pool.query(
      `
      INSERT INTO raid_ranks (discord_id, wallet, weekly_xp_week_start, updated_at)
      VALUES ($1, $2, $3::date, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
      `,
      [discordId, wallet, weekStart]
    );

    await pool.query(
      `
      UPDATE raid_ranks
      SET weekly_xp = 0,
          weekly_attempt_xp = 0,
          weekly_success_xp = 0,
          weekly_legendary_xp = 0,
          weekly_bonus_xp = 0,
          weekly_xp_week_start = $2::date,
          updated_at = NOW()
      WHERE discord_id = $1 AND weekly_xp_week_start <> $2::date;
      `,
      [discordId, weekStart]
    );
  }

  async function getRankProfile(discordId) {
    const result = await pool.query("SELECT * FROM raid_ranks WHERE discord_id = $1", [discordId]);
    return result.rows[0] || null;
  }

  async function awardRankXp(discordId, wallet, convoyId, legendary, success) {
    await ensureRankProfile(discordId, wallet);

    const rankProfile = await getRankProfile(discordId);
    const raidProfile = await getRaiderProfile(discordId);
    const rankBefore = getRankByXp(rankProfile?.xp || 0);

    const attemptXp = capRankXp(RANK_XP_REWARDS.ATTEMPT, rankProfile?.weekly_attempt_xp, RANK_WEEKLY_XP_CAPS.ATTEMPT);
    const successXp = success && !legendary
      ? capRankXp(RANK_XP_REWARDS.SUCCESS, rankProfile?.weekly_success_xp, RANK_WEEKLY_XP_CAPS.SUCCESS)
      : 0;
    const legendaryXp = success && legendary
      ? capRankXp(RANK_XP_REWARDS.LEGENDARY_SUCCESS, rankProfile?.weekly_legendary_xp, RANK_WEEKLY_XP_CAPS.LEGENDARY)
      : 0;
    const totalXp = attemptXp + successXp + legendaryXp;

    if (!totalXp) {
      return {
        xpAwarded: 0,
        attemptXp,
        successXp,
        legendaryXp,
        rankBefore,
        rankAfter: rankBefore,
        promoted: false,
        currentRank: rankBefore
      };
    }

    const newXp = Number(rankProfile?.xp || 0) + totalXp;
    const rankAfter = getRankByXp(newXp);
    const convoyPower = calculateConvoyPower(newXp, raidProfile);

    await pool.query(
      `
      UPDATE raid_ranks
      SET xp = $2,
          weekly_xp = weekly_xp + $3,
          weekly_attempt_xp = weekly_attempt_xp + $4,
          weekly_success_xp = weekly_success_xp + $5,
          weekly_legendary_xp = weekly_legendary_xp + $6,
          current_rank_level = $7,
          best_rank_level = GREATEST(best_rank_level, $7),
          convoy_power = $8,
          wallet = $9,
          updated_at = NOW()
      WHERE discord_id = $1;
      `,
      [discordId, newXp, totalXp, attemptXp, successXp, legendaryXp, rankAfter.level, convoyPower, wallet]
    );

    await pool.query(
      `
      INSERT INTO raid_xp_logs (discord_id, wallet, convoy_id, xp_source, xp_amount, rank_before, rank_after)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
      `,
      [discordId, wallet, convoyId, legendary ? "legendary_convoy_raid" : "convoy_raid", totalXp, rankBefore.level, rankAfter.level]
    );

    if (rankAfter.level > rankBefore.level) {
      await pool.query(
        `
        INSERT INTO rank_promotion_logs (discord_id, wallet, old_rank_level, new_rank_level, old_rank_name, new_rank_name)
        VALUES ($1, $2, $3, $4, $5, $6);
        `,
        [discordId, wallet, rankBefore.level, rankAfter.level, rankBefore.name, rankAfter.name]
      );
    }

    return {
      xpAwarded: totalXp,
      attemptXp,
      successXp,
      legendaryXp,
      rankBefore,
      rankAfter,
      promoted: rankAfter.level > rankBefore.level,
      currentRank: rankAfter,
      convoyPower
    };
  }

  async function buildRankMessage(discordId, displayName) {
    const wallet = await getVerifiedWallet(discordId);
    if (!wallet) return "No verified wallet found. Run `/verify wallet.wam` first.";

    await ensureRaiderProfile(discordId, wallet);
    await ensureRankProfile(discordId, wallet);
    const rankProfile = await getRankProfile(discordId);
    const raidProfile = await getRaiderProfile(discordId);
    const progress = calculateRankProgress(rankProfile?.xp || 0);
    const attempts = Number(raidProfile?.total_attempts || 0);
    const successes = Number(raidProfile?.total_successes || 0);
    const successRate = attempts ? Math.round((successes / attempts) * 100) : 0;
    const convoyPower = calculateConvoyPower(rankProfile?.xp || 0, raidProfile);

    return [
      "🎖️ **Convoy Command Rank**",
      "",
      `Player: **${displayName}**`,
      `Wallet: **${wallet}**`,
      `Faction: **${getFactionLabel(raidProfile?.faction)}**`,
      "",
      `Rank: **${formatRank(progress.currentRank)}**`,
      progress.nextRank
        ? `XP: **${rankProfile?.xp || 0} / ${progress.nextRank.xp}** (${progress.progressPercent}%)`
        : `XP: **${rankProfile?.xp || 0}** (Max Rank)`,
      progress.nextRank ? `Next Rank: **${formatRank(progress.nextRank)}**` : "Next Rank: **None — top of command**",
      `Convoy Power: **${convoyPower}**`,
      "",
      "**Raid Record**",
      `Attempts: **${attempts}**`,
      `Successful Raids: **${successes}**`,
      `Failed Raids: **${Math.max(attempts - successes, 0)}**`,
      `Success Rate: **${successRate}%**`,
      `Legendary Wins: **${raidProfile?.legendary_successes || 0}**`,
      "",
      "**Weekly XP Caps**",
      `Attempt XP: **${rankProfile?.weekly_attempt_xp || 0} / ${RANK_WEEKLY_XP_CAPS.ATTEMPT}**`,
      `Success XP: **${rankProfile?.weekly_success_xp || 0} / ${RANK_WEEKLY_XP_CAPS.SUCCESS}**`,
      `Legendary XP: **${rankProfile?.weekly_legendary_xp || 0} / ${RANK_WEEKLY_XP_CAPS.LEGENDARY}**`
    ].join("\n");
  }

  async function sendRankLeaderboard(interaction) {
    const result = await pool.query(`
      SELECT discord_id, wallet, xp, convoy_power, current_rank_level
      FROM raid_ranks
      WHERE xp > 0
      ORDER BY xp DESC, convoy_power DESC
      LIMIT 10
    `);

    if (!result.rows.length) {
      await interaction.editReply("No Convoy Command rank data yet. Raid a convoy to earn XP.");
      return;
    }

    const lines = result.rows.map((row, index) => {
      const rank = getRankByLevel(row.current_rank_level);
      return `${index + 1}. <@${row.discord_id}> — **${formatRank(rank)}** | ${row.xp} XP | Power: ${row.convoy_power}`;
    });

    await interaction.editReply("🏆 **Convoy Command XP Leaderboard**\n\n" + lines.join("\n"));
  }

  function buildRankRewardsMessage() {
    return [
      "🎖️ **Convoy Command Rank Rewards & XP Rules**",
      "",
      "**XP Sources**",
      `Raid attempt: **${RANK_XP_REWARDS.ATTEMPT} XP**`,
      `Successful normal raid: **+${RANK_XP_REWARDS.SUCCESS} XP**`,
      `Successful legendary raid: **+${RANK_XP_REWARDS.LEGENDARY_SUCCESS} XP**`,
      "",
      "**Weekly XP Caps**",
      `Attempt XP cap: **${RANK_WEEKLY_XP_CAPS.ATTEMPT} XP**`,
      `Normal success XP cap: **${RANK_WEEKLY_XP_CAPS.SUCCESS} XP**`,
      `Legendary success XP cap: **${RANK_WEEKLY_XP_CAPS.LEGENDARY} XP**`,
      "",
      "**Rank Milestones**",
      "Sergeant: first major promotion shoutout tier",
      "Sergeant Major: senior enlisted prestige",
      "Warrant Officer 1: technical raider tier",
      "Second Lieutenant: officer corps entry",
      "Colonel: high command prestige",
      "General: elite command status",
      "General of the Army: five-star long-term grind",
      "",
      "XP is earned through convoy raiding power only. It is not NKFE and cannot be bought, sold, or converted."
    ].join("\n");
  }

  return {
    ensureRankProfile,
    getRankProfile,
    awardRankXp,
    buildRankMessage,
    sendRankLeaderboard,
    buildRankRewardsMessage,
    calculateRankProgress,
    calculateConvoyPower,
    formatRank,
    getRankByLevel
  };
}

module.exports = {
  RANKS,
  RANK_XP_REWARDS,
  RANK_WEEKLY_XP_CAPS,
  rankCommands,
  initRankSchema,
  createRankFeature,
  getRankByXp,
  getRankByLevel,
  calculateRankProgress,
  calculateConvoyPower,
  formatRank
};
