const cron = require("node-cron");

function startSchedules({ refreshAllVerifiedWallets, postDailyLeaderboard, raidFeature }) {
  cron.schedule("0 * * * *", async () => {
    await refreshAllVerifiedWallets();
  });
  console.log("Automatic wallet refresh scheduled every 1 hour.");

  cron.schedule("0 9 * * *", async () => {
    await postDailyLeaderboard();
  }, { timezone: "America/Los_Angeles" });
  console.log("Daily leaderboard post scheduled for 9:00 AM Pacific.");

  cron.schedule("0 17 * * 0", async () => {
    await raidFeature.postWeeklyRaidLeaderboardAndReset();
  }, { timezone: "America/Los_Angeles" });
  console.log("Weekly raid leaderboard post scheduled for Sundays at 5:00 PM Pacific.");

  setInterval(async () => {
    await raidFeature.checkConvoyActivity();
  }, 20000);
  console.log("Real-time convoy activity tracker started. Checking every 20 seconds.");
  console.log("Convoy Raiders mini-game is active.");
}

module.exports = {
  startSchedules
};
