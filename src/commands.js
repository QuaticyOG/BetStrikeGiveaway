const {
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

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
      .setName("setgiveawaychannel")
      .setDescription("Set the giveaway channel")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("Channel where winners are posted")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("setwinnerlog")
      .setDescription("Set the winner log channel")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("Channel for winner logs")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
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

    new SlashCommandBuilder()
      .setName("eligibility")
      .setDescription("Check a user's giveaway eligibility")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to check")
          .setRequired(false)
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
