require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cfg = require("./config");
const db = require("./db");
const { registerCommands } = require("./commands");
const { startScheduler } = require("./scheduler");

const {
  setGiveawaysRunning,
  setGiveawayChannel,
  setWinnersLogChannel,
  pickWinner,
  resetWinners,
  getOrCreateConfig
} = require("./giveaway");


// --------------------
// Create Discord client
// --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // REQUIRED for role member detection
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client._timers = [];


// --------------------
// Global safety handlers (prevent Railway crash loops)
// --------------------
process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});


// --------------------
// Ready event
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    // Ensure DB schema exists
    const fs = require("fs");
    const path = require("path");
    const schema = fs.readFileSync(path.join(process.cwd(), "sql", "schema.sql"), "utf8");
    await db.query(schema);

    // Register slash commands
    await registerCommands(client);

    // 🔥 DELAYED FULL MEMBER CACHE WARM (fixes missing role members)
    setTimeout(async () => {
      try {
        const guild = client.guilds.cache.get(cfg.GUILD_ID);
        if (!guild) {
          console.log("Cache warm skipped: guild not found");
          return;
        }

        console.log("Warming full member cache...");
        const members = await guild.members.fetch(); // fetch ALL members once
        console.log(`Member cache ready: ${members.size} members`);
      } catch (err) {
        console.error("Member cache warm failed:", err.message);
      }
    }, 5000); // wait 5 seconds after ready

    // Start giveaway scheduler
    await startScheduler(client);
    console.log("✅ Scheduler running");

  } catch (err) {
    console.error("Startup error:", err);
  }
});


// --------------------
// Track messages for MIN_MESSAGES requirement
// --------------------
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


// --------------------
// Slash command handler
// --------------------
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const guild = interaction.guild;
    if (!guild) return;

    const name = interaction.commandName;

    // --------------------
    // Start giveaways
    // --------------------
    if (name === "startgiveaways") {
      await setGiveawaysRunning(guild.id, true);
      return interaction.reply({ content: "✅ Giveaways started.", ephemeral: true });
    }

    // --------------------
    // Stop giveaways
    // --------------------
    if (name === "stopgiveaways") {
      await setGiveawaysRunning(guild.id, false);

      // Clear scheduled timers
      for (const t of client._timers) clearTimeout(t);
      client._timers = [];

      return interaction.reply({ content: "🛑 Giveaways stopped.", ephemeral: true });
    }

    // --------------------
    // Set public giveaway channel
    // --------------------
    if (name === "setgiveawaychannel") {
      const channel = interaction.options.getChannel("channel");
      await setGiveawayChannel(guild.id, channel.id);

      return interaction.reply({
        content: `✅ Giveaway channel set to ${channel}.`,
        ephemeral: true
      });
    }

    // --------------------
    // Set winners log channel
    // --------------------
    if (name === "setwinnerslog") {
      const channel = interaction.options.getChannel("channel");
      await setWinnersLogChannel(guild.id, channel.id);

      return interaction.reply({
        content: `🧾 Winners log channel set to ${channel}.`,
        ephemeral: true
      });
    }

    // --------------------
    // Manual draw
    // --------------------
    if (name === "drawnow") {
      await interaction.reply({ content: "🎲 Drawing a winner...", ephemeral: true });

      const conf = await getOrCreateConfig(guild.id);
      if (!conf.giveaway_channel_id) {
        return interaction.followUp({
          content: "⚠️ No giveaway channel set. Use /setgiveawaychannel first.",
          ephemeral: true
        });
      }

      const result = await pickWinner(client, guild);

      if (!result.winner) {
        return interaction.followUp({
          content: `❌ No winner drawn: ${result.reason}`,
          ephemeral: true
        });
      }

      return interaction.followUp({
        content: `✅ Winner drawn: <@${result.winner.id}>`,
        ephemeral: true
      });
    }

    // --------------------
    // Reset winners
    // --------------------
    if (name === "resetwinners") {
      const scope = interaction.options.getString("scope") || "today";
      const res = await resetWinners(guild.id, scope);

      return interaction.reply({
        content: `♻️ Winners reset (${res.deleted}). Rows removed: ${res.rows}`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error("interactionCreate error:", err);

    if (interaction?.isRepliable()) {
      try {
        await interaction.reply({
          content: "❌ Something went wrong while executing that command.",
          ephemeral: true
        });
      } catch {}
    }
  }
});


// --------------------
// Login
// --------------------
client.login(cfg.BOT_TOKEN);
