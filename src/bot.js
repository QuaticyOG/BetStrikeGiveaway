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

    const now = new Date();

    for (const [, m] of members) {
      for (const rid of tracked) {
        if (!m.roles.cache.has(rid)) continue;
        await db.query(
          `INSERT INTO role_assignments (guild_id,user_id,role_id,assigned_at)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [guild.id, m.id, rid, now]
        );
      }
    }
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
    if (!oldRoles.has(rid) && newRoles.has(rid)) {
      await db.query(
        `INSERT INTO role_assignments (guild_id,user_id,role_id,assigned_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO UPDATE SET assigned_at=$4`,
        [newM.guild.id, newM.id, rid, now]
      );
    }

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
    const accou
