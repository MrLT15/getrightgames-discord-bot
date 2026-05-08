function createWalletRepository({ pool, getWallets }) {
  async function loadWalletsFromDatabase() {
    const result = await pool.query("SELECT discord_id, wallet FROM verified_wallets");
    const wallets = {};
    for (const row of result.rows) wallets[row.discord_id] = row.wallet;
    return wallets;
  }

  async function saveWalletToDatabase(discordId, wallet) {
    await pool.query(
      `
      INSERT INTO verified_wallets (discord_id, wallet, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = NOW();
      `,
      [discordId, wallet]
    );
    getWallets()[discordId] = wallet;
  }

  async function removeWalletFromDatabase(discordId) {
    await pool.query("DELETE FROM verified_wallets WHERE discord_id = $1", [discordId]);
    delete getWallets()[discordId];
  }

  async function getVerifiedWallet(discordId) {
    const result = await pool.query("SELECT wallet FROM verified_wallets WHERE discord_id = $1", [discordId]);
    return result.rows[0]?.wallet || null;
  }

  return {
    loadWalletsFromDatabase,
    saveWalletToDatabase,
    removeWalletFromDatabase,
    getVerifiedWallet
  };
}

module.exports = {
  createWalletRepository
};
