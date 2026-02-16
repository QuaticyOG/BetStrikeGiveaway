const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const cfg = require("./config");

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("startgiveaways")
      .setDescription("Start the giveaways (admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("stopgiveaways")
      .setDescription("Stop the giveaways (admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("setgiveawaychannel")
      .setDescription("Set the channel where winners are posted (admin only)")
      .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("setwinnerslog")
      .setDescription("Set the staff winners log channel (admin only)")
      .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("resetwinners")
      .setDescription("Reset winners (admin only)")
      .addStringOption(o =>
      o.setName("scope")
      .setDescription("Reset scope")
      .setRequired(false)
      .addChoices(
        { name: "today", value: "today" },
        { name: "all", value: "all" }
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    
    new SlashCommandBuilder()
      .setName("drawnow")
      .setDescription("Draw a random eligible winner right now (admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ].map(c => c.toJSON());
}

new SlashCommandBuilder()
  .setName("eligibility")
  .setDescription("Check a user's eligibility for the giveaway (admin only)")
  .addUserOption(o =>
    o.setName("user").setDescription("User to check").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

async function registerCommands(client) {
  const rest = new REST({ version: "10" }).setToken(cfg.BOT_TOKEN);
  const body = buildCommands();

  if (cfg.GUILD_ID) {
    // ✅ Register guild commands (instant)
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, cfg.GUILD_ID),
      { body }
    );
    console.log("✅ Slash commands registered (guild)");

    // 🧹 Clear global commands to prevent duplicates
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );
    console.log("🧹 Cleared global commands");
  } else {
    // Global commands (slow)
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body }
    );
    console.log("✅ Slash commands registered (global)");
  }
}


module.exports = { registerCommands };
