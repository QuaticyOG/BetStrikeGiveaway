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
  // ✅ Prefer explicit role ID if present
  if (cfg.ELIGIBLE_ROLE_ID) {
    return guild.roles.cache.get(cfg.ELIGIBLE_ROLE_ID) || null;
  }
  // fallback to name
  return guild.roles.cache.find((r) => r.name === cfg.ELIGIBLE_ROLE_NAME) || null;
}

async function pickWinner(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) return { winner: null, reason: "Giveaways are stopped." };

  const winDate = todayISODate();

  // ✅ Only draw from members with eligible role (avoids scanning whole guild)
  const role = findEligibleRole(guild);
  if (!role) {
    return {
      winner: null,
      reason: `Eligible role not found. Set ELIGIBLE_ROLE_ID to your Striker role ID.`
    };
  }

  // If role.members is empty, members may not be cached yet.
  // We do ONE controlled full fetch to warm cache, then rely on role.members.
  if (role.members.size === 0) {
    // avoid spamming gateway opcode 8 (Request Guild Members)
    if (client._lastMemberChunkAt && Date.now() - client._lastMemberChunkAt < 30_000) {
      console.log(
        `[DRAW] Cache warm blocked (cooldown). RoleMembers=${role.members.size} Guild=${guild.id}`
      );
      return {
        winner: null,
        reason: "Member cache warming up. Try again in ~30 seconds."
      };
    }

    client._lastMemberChunkAt = Date.now();
    console.log(`[DRAW] Warming member cache via guild.members.fetch()...`);

    try {
      await guild.members.fetch();
    } catch (e) {
      console.error("Member cache warm (guild.members.fetch) failed:", e);
      return {
        winner: null,
        reason: "Discord rate limited member fetch. Try again in ~30 seconds."
      };
    }
  }

  console.log(
    `[DRAW] Guild=${guild.id} Role=${role.name} RoleMembers=${role.members.size} Date=${winDate}`
  );

  const eligible = [];
  for (const [, member] of role.members) {
    // Prevent same-day duplicates
    if (await hasWonToday(guild.id, member.id, winDate)) continue;

    // Apply all eligibility rules (role, join age, account age, messages, bot check)
    if (await isEligible(member)) eligible.push(member);
  }

  console.log(`[DRAW] EligibleAfterChecks=${eligible.length}`);

  if (eligible.length === 0) {
    return {
      winner: null,
      reason:
        "No eligible members found. If you are sure users qualify: " +
        "1) ensure message counts exist (counts since bot went live), " +
        "2) ensure role members are cached (RoleMembers should be >0), " +
        "3) verify MIN_DAYS_IN_SERVER / MIN_ACCOUNT_AGE_DAYS."
    };
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  // Record winner for today (prevents same-day duplicate)
  await db.query(
    "INSERT INTO daily_winners (guild_id, user_id, win_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDate]
  );

  const channelId = conf.giveaway_channel_id;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;

  if (!channel) {
    return {
      winner,
      reason: "Winner picked, but no giveaway channel is set. Use /setgiveawaychannel."
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
