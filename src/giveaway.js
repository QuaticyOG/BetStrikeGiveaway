// src/giveaway.js
const { EmbedBuilder } = require("discord.js");
const db = require("./db");
const cfg = require("./config");
const { isEligible } = require("./eligibility");

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
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

async function setWinnersLogChannel(guildId, channelId) {
  await db.query(
    "INSERT INTO bot_config (guild_id, log_channel_id) VALUES ($1, $2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET log_channel_id=EXCLUDED.log_channel_id, updated_at=NOW()",
    [guildId, channelId]
  );
}

function findEligibleRole(guild) {
  if (cfg.ELIGIBLE_ROLE_ID) return guild.roles.cache.get(cfg.ELIGIBLE_ROLE_ID) || null;
  return guild.roles.cache.find((r) => r.name === cfg.ELIGIBLE_ROLE_NAME) || null;
}

async function hasWonToday(guildId, userId, winDateUTC) {
  const res = await db.query(
    "SELECT 1 FROM daily_winners WHERE guild_id=$1 AND user_id=$2 AND win_date=$3::date",
    [guildId, userId, winDateUTC]
  );
  return res.rowCount > 0;
}

async function hasWonWithinCooldown(guildId, userId, cooldownDays) {
  if (!cooldownDays || cooldownDays <= 0) return false;

  const res = await db.query(
    `
    SELECT 1
    FROM daily_winners
    WHERE guild_id = $1
      AND user_id = $2
      AND win_date >= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))
    LIMIT 1
    `,
    [guildId, userId, cooldownDays]
  );

  return res.rowCount > 0;
}

/**
 * Reset winners for testing.
 * - scope "today": deletes rows where win_date matches today's UTC date (same as the bot stores)
 * - scope "all": deletes all winners for that guild
 */
async function resetWinners(guildId, scope = "today") {
  if (scope === "all") {
    const res = await db.query("DELETE FROM daily_winners WHERE guild_id=$1", [guildId]);
    return { deleted: "all", rows: res.rowCount };
  }

  const winDateUTC = todayISODateUTC();
  const res = await db.query(
    "DELETE FROM daily_winners WHERE guild_id=$1 AND win_date=$2::date",
    [guildId, winDateUTC]
  );
  return { deleted: "today", rows: res.rowCount, winDateUTC };
}

async function pickWinner(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) return { winner: null, reason: "Giveaways are stopped." };

  const winDateUTC = todayISODateUTC();

  const role = findEligibleRole(guild);
  if (!role) return { winner: null, reason: "Eligible role not found. Check ELIGIBLE_ROLE_ID." };

  // Cache warm if role.members isn't populated yet
  if (role.members.size === 0) {
    if (client._lastMemberChunkAt && Date.now() - client._lastMemberChunkAt < 30_000) {
      return { winner: null, reason: "Member cache warming up. Try again in ~30 seconds." };
    }
    client._lastMemberChunkAt = Date.now();
    try {
      await guild.members.fetch();
    } catch (e) {
      console.error("Member cache warm failed:", e);
      return { winner: null, reason: "Discord rate limited member fetch. Try again shortly." };
    }
  }

  console.log(
    `[DRAW] Guild=${guild.id} Role=${role.name} RoleMembers=${role.members.size} Date=${winDateUTC}`
  );

  const eligible = [];
  for (const [, member] of role.members) {
    if (await hasWonToday(guild.id, member.id, winDateUTC)) continue;
    if (await hasWonWithinCooldown(guild.id, member.id, cfg.WIN_COOLDOWN_DAYS)) continue;
    if (await isEligible(member)) eligible.push(member);
  }

  console.log(`[DRAW] EligibleAfterChecks=${eligible.length}`);

  if (eligible.length === 0) return { winner: null, reason: "No eligible members found." };

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  // record winner (prevents same-day duplicates)
  await db.query(
    "INSERT INTO daily_winners (guild_id, user_id, win_date) VALUES ($1, $2, $3::date) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDateUTC]
  );

  // Public winner channel
  const publicChannelId = conf.giveaway_channel_id;
  const publicChannel = publicChannelId ? guild.channels.cache.get(publicChannelId) : null;

  if (publicChannel) {
    const embed = new EmbedBuilder()
      .setColor(cfg.GIVEAWAY_COLOR)
      .setTitle("🎉 Giveaway Winner 🎉")
      .setDescription(cfg.GIVEAWAY_MESSAGE.replace("{user}", `<@${winner.id}>`))
      .setTimestamp();

    await publicChannel.send({ embeds: [embed] });
  }

  // Staff log channel
  const logChannelId = conf.log_channel_id;
  const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor(cfg.GIVEAWAY_COLOR)
      .setTitle("🧾 Winners Log")
      .setDescription(`Winner: <@${winner.id}>`)
      .addFields(
        { name: "Date (UTC)", value: winDateUTC, inline: true },
        { name: "Cooldown days", value: String(cfg.WIN_COOLDOWN_DAYS), inline: true },
        { name: "Role", value: `${role.name} (${role.id})`, inline: false }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [logEmbed] });
  }

  return { winner, reason: null };
}

module.exports = {
  getOrCreateConfig,
  setGiveawaysRunning,
  setGiveawayChannel,
  setWinnersLogChannel,
  pickWinner,
  resetWinners
};
