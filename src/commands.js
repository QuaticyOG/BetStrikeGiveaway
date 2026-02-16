const { SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require("discord.js");
const cfg = require("./config");

function buildCommands() {
  return [

    new SlashCommandBuilder()
      .setName("startgiveaways")
      .setDescription("Start giveaways")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("stopgiveaways")
      .setDescription("Stop giveaways")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("drawnow")
      .setDescription("Draw a winner now")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("resetwinners")
      .setDescription("Reset winners")
      .addStringOption(o =>
        o.setName("scope")
          .setDescription("today / all")
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ✅ NEW: eligibility command
    new SlashCommandBuilder()
  .setName("eligibility")
  .setDescription("Check a user's giveaway eligibility")
  .addUserOption(o =>
    o.setName("user")
      .setDescription("User to check")
      .setRequired(false) // optional so they can check themselves
  ),

  ].map(cmd => cmd.toJSON());
}

async function registerCommands(client) {
  const rest = new REST({ version: "10" }).setToken(cfg.BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.GUILD_ID),
    { body: buildCommands() }
  );

  console.log("✅ Slash commands registered");
}

module.exports = { registerCommands };
