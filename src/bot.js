require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cfg = require("./config");
const db = require("./db");
const { registerCommands } = require("./commands");
const { startScheduler, scheduleToday } = require("./scheduler");
const { setGiveawaysRunning, setGiveawayChannel, pickWinner, getOrCreateConfig } = require("./giveaway");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client._timers = [];

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Ensure tables exist (safe to run every boot)
  // If you prefer, run `npm run db:init` instead.
  const fs = require("fs");
  const path = require("path");
  const schema = fs.readFileSync(path.join(process.cwd(), "sql", "schema.sql"), "utf8");
  await db.query(schema);

  await registerCommands(client);

  // Start scheduler
  await startScheduler(client);

  console.log("✅ Scheduler running");
});

// Track messages live for accurate MIN_MESSAGES
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild) return;
    if (msg.author.bot) return;

    await db.query(
      "INSERT INTO message_counts (guild_id, user_id, count) VALUES ($1,$2,1) " +
      "ON CONFLICT (guild_id, user_id) DO UPDATE SET count = message_counts.count + 1, updated_at=NOW()",
      [msg.guild.id, msg.author.id]
    );
  } catch (e) {
    console.error("messageCreate tracking error:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const guild = interaction.guild;
    if (!guild) return;

    const name = interaction.commandName;

    if (name === "stopgiveaways") {
      await setGiveawaysRunning(guild.id, false);

      // Stop any currently scheduled timeouts
      for (const t of client._timers) clearTimeout(t);
      client._timers = [];

      return interaction.reply({ content: "✅ Giveaways stopped.", ephemeral: true });
    }

    if (name === "startgiveaways") {
      await setGiveawaysRunning(guild.id, true);
      await scheduleToday(client, guild);
      return interaction.reply({ content: "✅ Giveaways started.", ephemeral: true });
    }

    if (name === "setgiveawaychannel") {
      const channel = interaction.options.getChannel("channel");
      await setGiveawayChannel(guild.id, channel.id);
      return interaction.reply({ content: `✅ Giveaway channel set to ${channel}.`, ephemeral: true });
    }

    if (name === "drawnow") {
      // still respects eligibility + "no duplicate winner today"
      await interaction.reply({ content: "🎲 Drawing a winner now...", ephemeral: true });

      const conf = await getOrCreateConfig(guild.id);
      if (!conf.giveaway_channel_id) {
        return interaction.followUp({
          content: "⚠️ No giveaway channel set. Use /setgiveawaychannel first.",
          ephemeral: true
        });
      }

      const result = await pickWinner(client, guild);
      if (!result.winner) {
        return interaction.followUp({ content: `No winner drawn: ${result.reason}`, ephemeral: true });
      }

      return interaction.followUp({ content: `✅ Winner drawn: <@${result.winner.id}>`, ephemeral: true });
    }
  } catch (e) {
    console.error("interactionCreate error:", e);
    if (interaction?.isRepliable()) {
      try {
        await interaction.reply({ content: "❌ Something went wrong handling that command.", ephemeral: true });
      } catch {}
    }
  }
});

client.login(cfg.BOT_TOKEN);
