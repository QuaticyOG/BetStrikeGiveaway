// src/giveaway.js
const { EmbedBuilder } = require("discord.js");
const db = require("./db");
const cfg = require("./config");
const { isEligible, hasWonToday } = require("./eligibility");

function todayISODate() {
  // YYYY-MM-DD in UTC
  return new Date().toISOString().slice(0, 10);
}

async function getOrCreateConfig(guildId) {
  await db.query(
    "INSERT INTO bot_config (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
    [guildId]
  );

  const res = await db.query("SELECT * FROM bot_config WHERE guild_id=$1", [guildId]);
  return res.rows[0];
}

async function setGiveawaysRunning(guildId, running) {
  await db.query(
    "INSERT INTO bot_config (guild_id, giveaways_running) VALUES ($1, $2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET giveaways_running=EXCLUDED.giveaways_running, updated_at=NOW()",
    [guildId, running]
  );
}

async function setGiveawayChannel(guildId, channelId) {
  await db.query(
    "INSERT INTO bot_config (guild_id, giveaway_channel_id) VALUES ($1, $2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET giveaway_channel_id=EXCLUDED.giveaway_channel_id, updated_at=NOW()",
    [guildId, channelId]
  );
}

function findEligibleRole(guild) {
  // Prefer ID if provided, fallback to name
  if (cfg.ELIGIBLE_ROLE_ID) {
    return guild.roles.cache.get(cfg.ELIGIBLE_ROLE_ID) || null;
  }
  const role = guild.roles.cache.find((r) => r.name === cfg.ELIGIBLE_ROLE_NAME);
  return role || null;
}

async function pickWinner(client, guild) {
  const conf = await getOrCreateConfig(guild.id);

  if (!conf.giveaways_running) {
    return { winner: null, reason: "Giveaways are stopped." };
  }

  const winDate = todayISODate();

  // ✅ Only consider members who have the eligible role (avoids opcode 8 chunking / rate limits)
  const role = findEligibleRole(guild);
  if (!role) {
    return {
      winner: null,
      reason: `Eligible role not found. Set ELIGIBLE_ROLE_ID or ensure role name "${cfg.ELIGIBLE_ROLE_NAME}" exists.`
    };
  }

  // NOTE:
  // role.members is a cache-backed collection. In most guilds it is accurate once members are cached.
  // We avoid guild.members.fetch() (full) which triggers gateway opcode 8 rate limits.
  // If role.members is empty but you *know* there are role holders, ensure Server Members Intent is enabled,
  // and consider restarting the bot after it has been in the guild for a bit.
  const roleMembers = role.members;

  console.log(
    `[DRAW] Guild=${guild.id} Role=${role.name} RoleMembers=${roleMembers.size} Date=${winDate}`
  );

  const eligible = [];

  for (const [, member] of roleMembers) {
    // Prevent same-day duplicate winners
    if (await hasWonToday(guild.id, member.id, winDate)) continue;

    // Apply all eligibility rules (bot check, join age, account age, message count, etc.)
    if (await isEligible(member)) eligible.push(member);
  }

  console.log(`[DRAW] EligibleAfterChecks=${eligible.length}`);

  if (eligible.length === 0) {
    return {
      winner: null,
      reason:
        "No eligible members found. Common causes: MIN_MESSAGES too high (counts since bot went online), " +
        "role has no cached members yet, or join/account-age requirements exclude everyone."
    };
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  // Record winner (prevents same-day duplicates)
  await db.query(
    "INSERT INTO daily_winners (guild_id, user_id, win_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDate]
  );

  // Announce in configured channel (must be set via /setgiveawaychannel)
  const channelId = conf.giveaway_channel_id;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;

  if (!channel) {
    return {
      winner,
      reason:
        "Winner chosen, but no giveaway channel is set or bot cannot access it. Use /setgiveawaychannel."
    };
  }

  const embed = new EmbedBuilder()
    .setColor(cfg.GIVEAWAY_COLOR)
    .setTitle("🎉 Giveaway Winner 🎉")
    .setDescription(cfg.GIVEAWAY_MESSAGE.replace("{user}", `<@${winner.id}>`))
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  return { winner, reason: null };
}

module.exports = {
  getOrCreateConfig,
  setGiveawaysRunning,
  setGiveawayChannel,
  pickWinner
};
