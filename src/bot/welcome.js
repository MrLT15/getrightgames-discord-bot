function registerWelcomeHandler(client) {
  client.on("guildMemberAdd", async member => {
    try {
      await member.send(
        `👋 Welcome to **GetRight Games**!\n\n` +
        `To verify your WAX wallet and unlock NFT-based Discord roles, go to the server and run:\n\n` +
        `/verify yourwallet.wam\n\n` +
        `After you verify once, you can use:\n\n` +
        `/refresh\n\n` +
        `This will update your roles whenever your NFTs change.`
      );
    } catch (error) {
      console.log(`Could not DM new member ${member.id}. They may have DMs disabled.`);
    }
  });
}

module.exports = {
  registerWelcomeHandler
};
