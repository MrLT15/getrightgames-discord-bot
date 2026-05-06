function createRaiderRepository({ pool }) {
  async function ensureRaiderProfile(discordId, wallet) {
    await pool.query(
      `
      INSERT INTO raid_balances (discord_id, wallet, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
      `,
      [discordId, wallet]
    );
  }

  async function getRaiderProfile(discordId) {
    const result = await pool.query("SELECT * FROM raid_balances WHERE discord_id = $1", [discordId]);
    return result.rows[0] || null;
  }

  async function setRaiderFaction(discordId, wallet, faction) {
    await pool.query(
      `
      INSERT INTO raid_balances (discord_id, wallet, faction, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET wallet = EXCLUDED.wallet, faction = EXCLUDED.faction, updated_at = NOW();
      `,
      [discordId, wallet, faction]
    );
  }

  async function recordRaid(discordId, wallet, faction, convoyId, route, legendary, success, reward) {
    await pool.query(
      `
      INSERT INTO raid_logs (discord_id, wallet, faction, convoy_id, route, legendary, success, reward)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [discordId, wallet, faction, convoyId, route, legendary, success, reward]
    );

    await pool.query(
      `
      INSERT INTO raid_balances (
        discord_id,
        wallet,
        faction,
        payout_nkfe,
        lifetime_nkfe,
        total_successes,
        total_attempts,
        legendary_successes,
        weekly_nkfe,
        weekly_successes,
        weekly_attempts,
        weekly_legendary_successes,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $4, $5, 1, $6, $4, $5, 1, $6, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET
        wallet = EXCLUDED.wallet,
        faction = COALESCE(raid_balances.faction, EXCLUDED.faction),
        payout_nkfe = raid_balances.payout_nkfe + EXCLUDED.payout_nkfe,
        lifetime_nkfe = raid_balances.lifetime_nkfe + EXCLUDED.lifetime_nkfe,
        total_successes = raid_balances.total_successes + EXCLUDED.total_successes,
        total_attempts = raid_balances.total_attempts + 1,
        legendary_successes = raid_balances.legendary_successes + EXCLUDED.legendary_successes,
        weekly_nkfe = raid_balances.weekly_nkfe + EXCLUDED.weekly_nkfe,
        weekly_successes = raid_balances.weekly_successes + EXCLUDED.weekly_successes,
        weekly_attempts = raid_balances.weekly_attempts + 1,
        weekly_legendary_successes = raid_balances.weekly_legendary_successes + EXCLUDED.weekly_legendary_successes,
        updated_at = NOW();
      `,
      [discordId, wallet, faction, reward, success ? 1 : 0, legendary && success ? 1 : 0]
    );
  }

  return {
    ensureRaiderProfile,
    getRaiderProfile,
    setRaiderFaction,
    recordRaid
  };
}

module.exports = {
  createRaiderRepository
};
