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

  async function recordRaid(discordId, wallet, faction, convoyId, route, legendary, success, reward, convoyWallet = null) {
    await pool.query(
      `
      INSERT INTO raid_logs (discord_id, wallet, faction, convoy_id, route, legendary, success, reward, convoy_wallet)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [discordId, wallet, faction, convoyId, route, legendary, success, reward, convoyWallet]
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


  async function revertSelfRaids() {
    await pool.query("BEGIN");

    try {
      const result = await pool.query(`
        WITH self_raids AS (
          SELECT id, discord_id, wallet, convoy_id, legendary, success, reward, created_at
          FROM raid_logs
          WHERE convoy_wallet IS NOT NULL
            AND LOWER(wallet) = LOWER(convoy_wallet)
        ),
        raid_totals AS (
          SELECT
            discord_id,
            COUNT(*)::integer AS attempts,
            COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END), 0)::integer AS successes,
            COALESCE(SUM(CASE WHEN legendary AND success THEN 1 ELSE 0 END), 0)::integer AS legendary_successes,
            COALESCE(SUM(reward), 0)::integer AS reward
          FROM self_raids
          GROUP BY discord_id
        ),
        xp_totals AS (
          SELECT
            x.discord_id,
            COALESCE(SUM(x.xp_amount), 0)::integer AS xp,
            COALESCE(SUM(CASE WHEN r.created_at >= date_trunc('week', NOW()) THEN x.xp_amount ELSE 0 END), 0)::integer AS weekly_xp,
            COALESCE(SUM(CASE WHEN r.created_at >= date_trunc('week', NOW()) THEN LEAST(x.xp_amount, 5) ELSE 0 END), 0)::integer AS weekly_attempt_xp,
            COALESCE(SUM(CASE WHEN r.created_at >= date_trunc('week', NOW()) AND r.success AND NOT r.legendary THEN GREATEST(x.xp_amount - 5, 0) ELSE 0 END), 0)::integer AS weekly_success_xp,
            COALESCE(SUM(CASE WHEN r.created_at >= date_trunc('week', NOW()) AND r.success AND r.legendary THEN GREATEST(x.xp_amount - 5, 0) ELSE 0 END), 0)::integer AS weekly_legendary_xp
          FROM raid_xp_logs x
          JOIN self_raids r
            ON r.discord_id = x.discord_id
           AND r.convoy_id IS NOT DISTINCT FROM x.convoy_id
          GROUP BY x.discord_id
        ),
        updated_balances AS (
          UPDATE raid_balances b
          SET payout_nkfe = GREATEST(b.payout_nkfe - t.reward, 0),
              lifetime_nkfe = GREATEST(b.lifetime_nkfe - t.reward, 0),
              total_successes = GREATEST(b.total_successes - t.successes, 0),
              total_attempts = GREATEST(b.total_attempts - t.attempts, 0),
              legendary_successes = GREATEST(b.legendary_successes - t.legendary_successes, 0),
              weekly_nkfe = GREATEST(b.weekly_nkfe - t.reward, 0),
              weekly_successes = GREATEST(b.weekly_successes - t.successes, 0),
              weekly_attempts = GREATEST(b.weekly_attempts - t.attempts, 0),
              weekly_legendary_successes = GREATEST(b.weekly_legendary_successes - t.legendary_successes, 0),
              updated_at = NOW()
          FROM raid_totals t
          WHERE b.discord_id = t.discord_id
          RETURNING b.discord_id
        ),
        updated_ranks AS (
          UPDATE raid_ranks rr
          SET xp = GREATEST(rr.xp - xt.xp, 0),
              weekly_xp = GREATEST(rr.weekly_xp - xt.weekly_xp, 0),
              weekly_attempt_xp = GREATEST(rr.weekly_attempt_xp - xt.weekly_attempt_xp, 0),
              weekly_success_xp = GREATEST(rr.weekly_success_xp - xt.weekly_success_xp, 0),
              weekly_legendary_xp = GREATEST(rr.weekly_legendary_xp - xt.weekly_legendary_xp, 0),
              updated_at = NOW()
          FROM xp_totals xt
          WHERE rr.discord_id = xt.discord_id
          RETURNING rr.discord_id
        ),
        deleted_xp_logs AS (
          DELETE FROM raid_xp_logs x
          USING self_raids r
          WHERE r.discord_id = x.discord_id
            AND r.convoy_id IS NOT DISTINCT FROM x.convoy_id
          RETURNING x.id
        ),
        deleted_raid_logs AS (
          DELETE FROM raid_logs l
          USING self_raids r
          WHERE l.id = r.id
          RETURNING l.id
        )
        SELECT
          (SELECT COUNT(*) FROM deleted_raid_logs)::integer AS reverted_raids,
          COALESCE((SELECT SUM(attempts) FROM raid_totals), 0)::integer AS reverted_attempts,
          COALESCE((SELECT SUM(successes) FROM raid_totals), 0)::integer AS reverted_successes,
          COALESCE((SELECT SUM(reward) FROM raid_totals), 0)::integer AS reverted_reward,
          COALESCE((SELECT SUM(xp) FROM xp_totals), 0)::integer AS reverted_xp;
      `);

      await pool.query(`
        UPDATE raid_ranks rr
        SET current_rank_level = derived.rank_level,
            convoy_power = derived.convoy_power,
            updated_at = NOW()
        FROM (
          SELECT
            rr.discord_id,
            COALESCE((
              SELECT level
              FROM (VALUES
                (1, 0), (2, 250), (3, 750), (4, 1500), (5, 2500),
                (6, 4000), (7, 6000), (8, 8500), (9, 12000), (10, 16000),
                (11, 22000), (12, 30000), (13, 40000), (14, 52000), (15, 66000),
                (16, 82000), (17, 100000), (18, 122000), (19, 150000), (20, 185000),
                (21, 230000), (22, 285000), (23, 350000), (24, 430000), (25, 525000),
                (26, 650000), (27, 800000), (28, 1000000), (29, 1250000)
              ) AS ranks(level, xp_required)
              WHERE rr.xp >= xp_required
              ORDER BY xp_required DESC
              LIMIT 1
            ), 1) AS rank_level,
            rr.xp + COALESCE(rb.total_successes, 0) * 10 + COALESCE(rb.legendary_successes, 0) * 100 AS convoy_power
          FROM raid_ranks rr
          LEFT JOIN raid_balances rb ON rb.discord_id = rr.discord_id
        ) AS derived
        WHERE rr.discord_id = derived.discord_id;
      `);

      await pool.query("COMMIT");
      return result.rows[0] || { reverted_raids: 0, reverted_attempts: 0, reverted_successes: 0, reverted_reward: 0, reverted_xp: 0 };
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }


  return {
    ensureRaiderProfile,
    getRaiderProfile,
    setRaiderFaction,
    recordRaid,
    revertSelfRaids
  };
}

module.exports = {
  createRaiderRepository
};
