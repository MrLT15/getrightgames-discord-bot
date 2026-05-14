const { initRankSchema } = require("../features/ranks");

async function initWalletSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_wallets (
      discord_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function initRaidSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_balances (
      discord_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      faction TEXT,
      payout_nkfe INTEGER NOT NULL DEFAULT 0,
      lifetime_nkfe INTEGER NOT NULL DEFAULT 0,
      total_successes INTEGER NOT NULL DEFAULT 0,
      total_attempts INTEGER NOT NULL DEFAULT 0,
      legendary_successes INTEGER NOT NULL DEFAULT 0,
      weekly_nkfe INTEGER NOT NULL DEFAULT 0,
      weekly_successes INTEGER NOT NULL DEFAULT 0,
      weekly_attempts INTEGER NOT NULL DEFAULT 0,
      weekly_legendary_successes INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_logs (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      faction TEXT,
      convoy_id TEXT,
      route TEXT,
      legendary BOOLEAN NOT NULL DEFAULT FALSE,
      success BOOLEAN NOT NULL,
      reward INTEGER NOT NULL DEFAULT 0,
      convoy_wallet TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS faction TEXT;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS payout_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS lifetime_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS total_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS legendary_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_nkfe INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_balances ADD COLUMN IF NOT EXISTS weekly_legendary_successes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE raid_logs ADD COLUMN IF NOT EXISTS convoy_wallet TEXT;`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_withdrawals (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      amount_nkfe INTEGER NOT NULL,
      gross_amount_units TEXT,
      fee_units TEXT,
      net_amount_units TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT,
      tx_id TEXT,
      payout_error TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS raid_nkfe_ledger (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      wallet TEXT,
      entry_type TEXT NOT NULL,
      amount_units TEXT NOT NULL,
      fee_units TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function initDatabase(pool, databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add your Render Postgres Internal Database URL as an environment variable.");
  }

  await initWalletSchema(pool);
  await initRaidSchema(pool);
  await initRankSchema(pool);
}

module.exports = {
  initDatabase,
  initWalletSchema,
  initRaidSchema
};
