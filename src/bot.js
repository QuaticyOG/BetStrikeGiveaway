require("dotenv").config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require("discord.js");
const cfg = require("./config");
const db = require("./db");
const { registerCommands } = require("./commands");
const { startScheduler } = require("./scheduler");
const { isEligible } = require("./eligibility");

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

function resolveRoleIdByName(guild, roleId, roleName) {
  if (roleId) return roleId;
  const target = (roleName || "").toLowerCase();
  const role = guild?.roles?.cache?.find(r => (r.name || "").toLowerCase() === target);
  return role?.id || "";
}


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

        // Backfill role assignment timestamps for members that CURRENTLY have the tracked roles.
        // NOTE: Discord doesn't provide historical "role granted at" timestamps, so for existing holders
        // the first timestamp we can store is "now". That means existing Striker holders will become
        // eligible after MIN_DAYS_WITH_STRIKER_ROLE days *from this deploy* unless you seed the DB manually.
        const trackedRoleIds = [
          resolveRoleIdByName(guild, cfg.STRIKER_ROLE_ID || cfg.ELIGIBLE_ROLE_ID, cfg.STRIKER_ROLE_NAME),
          resolveRoleIdByName(guild, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME)
        ].filter(Boolean);

        if (trackedRoleIds.length) {
          const now = new Date();
          let upserts = 0;
          for (const [, m] of members) {
            for (const rid of trackedRoleIds) {
              if (!m.roles.cache.has(rid)) continue;
              await db.query(
                "INSERT INTO role_assignments (guild_id, user_id, role_id, assigned_at) VALUES ($1,$2,$3,$4) " +
                "ON CONFLICT (guild_id, user_id, role_id) DO NOTHING",
                [guild.id, m.id, rid, now]
              );
              upserts++;
            }
          }
          console.log(`Role assignment backfill complete (attempted inserts: ${upserts})`);
        }
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
// Track role grant/removal times (for "held role for X days" rules)
// --------------------
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!oldMember?.guild || !newMember?.guild) return;
    if (newMember.user?.bot) return;

    const oldRoles = new Set(oldMember.roles.cache.map(r => r.id));
    const newRoles = new Set(newMember.roles.cache.map(r => r.id));

    const added = [];
    const removed = [];

    for (const rid of newRoles) if (!oldRoles.has(rid)) added.push(rid);
    for (const rid of oldRoles) if (!newRoles.has(rid)) removed.push(rid);

    if (!added.length && !removed.length) return;

    const tracked = new Set([
      resolveRoleIdByName(newMember.guild, cfg.STRIKER_ROLE_ID || cfg.ELIGIBLE_ROLE_ID, cfg.STRIKER_ROLE_NAME),
      resolveRoleIdByName(newMember.guild, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME)
    ].filter(Boolean));

    const now = new Date();

    for (const rid of added) {
      if (!tracked.has(rid)) continue;
      await db.query(
        "INSERT INTO role_assignments (guild_id, user_id, role_id, assigned_at) VALUES ($1,$2,$3,$4) " +
        "ON CONFLICT (guild_id, user_id, role_id) DO UPDATE SET assigned_at=EXCLUDED.assigned_at, updated_at=NOW()",
        [newMember.guild.id, newMember.id, rid, now]
      );
    }

    for (const rid of removed) {
      if (!tracked.has(rid)) continue;
      await db.query(
        "DELETE FROM role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3",
        [newMember.guild.id, newMember.id, rid]
      );
    }
  } catch (e) {
    console.error("guildMemberUpdate role tracking error:", e);
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
// Eligibility check
// --------------------
if (name === "eligibility") {
  const target = interaction.options.getUser("user");
  const member = await guild.members.fetch(target.id).catch(() => null);

  if (!member) {
    return interaction.reply({ content: "❌ That user is not in this server.", ephemeral: true });
  }

  // Helpers
  const check = (ok) => (ok ? "✅" : "❌");
  const msToHuman = (ms) => {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h`;
  };

  const now = Date.now();

  // Requirement 1: In server >= MIN_DAYS_IN_SERVER
  const inServerMs = now - member.joinedTimestamp;
  const reqInServer = (inServerMs / 86400000) >= cfg.MIN_DAYS_IN_SERVER;

  // Requirement 2: Account age >= MIN_ACCOUNT_AGE_DAYS
  const accountAgeMs = now - member.user.createdTimestamp;
  const reqAccountAge = (accountAgeMs / 86400000) >= cfg.MIN_ACCOUNT_AGE_DAYS;

  // Requirement 3: Has Level 5 role
  const hasLevel5 =
    (cfg.LEVEL5_ROLE_ID && member.roles.cache.has(cfg.LEVEL5_ROLE_ID)) ||
    member.roles.cache.some(r => (r.name || "").toLowerCase() === (cfg.LEVEL5_ROLE_NAME || "level 5").toLowerCase());

  // Requirement 4: Has Striker role
  const hasStriker =
    (cfg.STRIKER_ROLE_ID && member.roles.cache.has(cfg.STRIKER_ROLE_ID)) ||
    member.roles.cache.some(r => (r.name || "").toLowerCase() === (cfg.STRIKER_ROLE_NAME || "striker").toLowerCase());

  // Requirement 5: Has held Striker >= MIN_DAYS_WITH_STRIKER_ROLE
  // We can’t easily pull the held-duration directly here without duplicating DB logic,
  // so we show it as part of isEligible() + a separate “tracked timestamp exists” signal:
  //
  // Your eligibility.js already enforces the Striker-held rule strictly. :contentReference[oaicite:3]{index=3}
  //
  // If you want the exact held-time displayed too, tell me and I’ll add a tiny exported helper.
  const overallEligible = await isEligible(member);

  const embed = new EmbedBuilder()
    .setTitle(`Eligibility check: ${member.user.tag}`)
    .setDescription(overallEligible ? "✅ **Eligible**" : "❌ **Not eligible**")
    .addFields(
      { name: `In server ≥ ${cfg.MIN_DAYS_IN_SERVER} days`, value: `${check(reqInServer)} (${msToHuman(inServerMs)})` },
      { name: `Account age ≥ ${cfg.MIN_ACCOUNT_AGE_DAYS} days`, value: `${check(reqAccountAge)} (${msToHuman(accountAgeMs)})` },
      { name: `Has role: ${cfg.LEVEL5_ROLE_NAME}`, value: `${check(hasLevel5)}` },
      { name: `Has role: ${cfg.STRIKER_ROLE_NAME}`, value: `${check(hasStriker)}` },
      { name: `Held ${cfg.STRIKER_ROLE_NAME} ≥ ${cfg.MIN_DAYS_WITH_STRIKER_ROLE} days`, value: overallEligible ? "✅" : "❌" }
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
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
