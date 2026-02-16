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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client._timers = [];

function resolveRoleIdByName(guild, roleId, roleName) {
  if (roleId) return roleId;
  const target = (roleName || "").toLowerCase();
  const role = guild.roles.cache.find(r => r.name.toLowerCase() === target);
  return role?.id || "";
}

// --------------------
// Global safety handlers
// --------------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// --------------------
// Ready
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const fs = require("fs");
  const path = require("path");
  const schema = fs.readFileSync(path.join(process.cwd(), "sql", "schema.sql"), "utf8");
  await db.query(schema);

  await registerCommands(client);

// Warm member cache + backfill role timestamps
setTimeout(async () => {
  const guild = client.guilds.cache.get(cfg.GUILD_ID);
  if (!guild) return;

  const members = await guild.members.fetch();
  const tracked = [
    resolveRoleIdByName(guild, cfg.STRIKER_ROLE_ID, cfg.STRIKER_ROLE_NAME),
    resolveRoleIdByName(guild, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME)
  ].filter(Boolean);

  // Pretend existing holders received the role MIN_DAYS_WITH_STRIKER_ROLE days ago
  const backfillDate = new Date(Date.now() - (cfg.MIN_DAYS_WITH_STRIKER_ROLE * 86400000));

  for (const [, m] of members) {
    for (const rid of tracked) {
      if (!m.roles.cache.has(rid)) continue;

      await db.query(
        `INSERT INTO role_assignments (guild_id, user_id, role_id, assigned_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id, role_id)
         DO UPDATE SET assigned_at = EXCLUDED.assigned_at`,
        [guild.id, m.id, rid, backfillDate]
      );
    }
  }

  console.log("✅ Role assignment backfill complete");
}, 5000);

  await startScheduler(client);
});

// --------------------
// Track role changes
// --------------------
client.on("guildMemberUpdate", async (oldM, newM) => {
  const oldRoles = new Set(oldM.roles.cache.keys());
  const newRoles = new Set(newM.roles.cache.keys());

  const tracked = [
    resolveRoleIdByName(newM.guild, cfg.STRIKER_ROLE_ID, cfg.STRIKER_ROLE_NAME),
    resolveRoleIdByName(newM.guild, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME)
  ].filter(Boolean);

  const now = new Date();

  for (const rid of tracked) {
    // Role added → store timestamp
    if (!oldRoles.has(rid) && newRoles.has(rid)) {
      await db.query(
        `INSERT INTO role_assignments (guild_id, user_id, role_id, assigned_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id, role_id)
         DO UPDATE SET assigned_at = EXCLUDED.assigned_at`,
        [newM.guild.id, newM.id, rid, now]
      );
    }

    // Role removed → delete timestamp
    if (oldRoles.has(rid) && !newRoles.has(rid)) {
      await db.query(
        `DELETE FROM role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3`,
        [newM.guild.id, newM.id, rid]
      );
    }
  }
});

// --------------------
// Slash commands
// --------------------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild } = interaction;

  // --------------------
  // ELIGIBILITY COMMAND
  // --------------------
  if (commandName === "eligibility") {
    const user = interaction.options.getUser("user");
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: "❌ User not found.", ephemeral: true });
    }

    const now = Date.now();
    const check = v => (v ? "✅" : "❌");
    const days = ms => `${Math.floor(ms / 86400000)}d`;

    const inServerMs = now - member.joinedTimestamp;
    const accountAgeMs = now - member.user.createdTimestamp;

    const strikerRoleId = resolveRoleIdByName(guild, cfg.STRIKER_ROLE_ID, cfg.STRIKER_ROLE_NAME);
    const level5RoleId = resolveRoleIdByName(guild, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME);

    const hasStriker = member.roles.cache.has(strikerRoleId);
    const hasLevel5 = member.roles.cache.has(level5RoleId);

    const roleRow = strikerRoleId
      ? await db.query(
          "SELECT assigned_at FROM role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3",
          [guild.id, member.id, strikerRoleId]
        )
      : null;

    const assignedAt = roleRow?.rows?.[0]?.assigned_at;
    const strikerHeldMs = assignedAt ? now - new Date(assignedAt).getTime() : 0;

    const embed = new EmbedBuilder()
      .setTitle(`Eligibility: ${member.user.tag}`)
      .setDescription((await isEligible(member)) ? "✅ **Eligible**" : "❌ **Not Eligible**")
      .addFields(
        { name: "In server ≥ 7 days", value: `${check(inServerMs >= 7 * 86400000)} (${days(inServerMs)})` },
        { name: "Account ≥ 60 days", value: `${check(accountAgeMs >= 60 * 86400000)} (${days(accountAgeMs)})` },
        { name: "Has Striker role", value: check(hasStriker) },
        { name: "Has Level 5 role", value: check(hasLevel5) },
        {
          name: "Held Striker ≥ 7 days",
          value: hasStriker && assignedAt
            ? `${check(strikerHeldMs >= 7 * 86400000)} (${days(strikerHeldMs)})`
            : "❌"
        }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // --------------------
  // Existing commands
  // --------------------
  if (commandName === "startgiveaways") {
    await setGiveawaysRunning(guild.id, true);
    return interaction.reply({ content: "✅ Giveaways started.", ephemeral: true });
  }

  if (commandName === "stopgiveaways") {
    await setGiveawaysRunning(guild.id, false);
    return interaction.reply({ content: "🛑 Giveaways stopped.", ephemeral: true });
  }

  if (commandName === "drawnow") {
    const result = await pickWinner(client, guild);
    return interaction.reply({
      content: result.winner ? `🎉 <@${result.winner.id}>` : `❌ ${result.reason}`,
      ephemeral: true
    });
  }

  if (commandName === "resetwinners") {
    const scope = interaction.options.getString("scope") || "today";
    const res = await resetWinners(guild.id, scope);
    return interaction.reply({ content: `♻️ Reset (${res.deleted})`, ephemeral: true });
  }
});

// --------------------
// Login
// --------------------
client.login(cfg.BOT_TOKEN);
