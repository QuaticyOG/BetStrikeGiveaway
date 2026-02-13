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

async function pickWinner(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) return { winner: null, reason: "Giveaways are stopped." };

  const winDate = todayISODate();
  const members = await guild.members.fetch();

  const eligible = [];
  for (const [, member] of members) {
    if (await hasWonToday(guild.id, member.id, winDate)) continue;
    if (await isEligible(member)) eligible.push(member);
  }

  if (eligible.length === 0) return { winner: null, reason: "No eligible members found." };

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  // record winner (prevents same-day duplicate)
  await db.query(
    "INSERT INTO daily_winners (guild_id, user_id, win_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDate]
  );

  const channelId = conf.giveaway_channel_id;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;

  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(cfg.GIVEAWAY_COLOR)
      .setTitle("🎉 Giveaway Winner 🎉")
      .setDescription(cfg.GIVEAWAY_MESSAGE.replace("{user}", `<@${winner.id}>`))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  return { winner, reason: null };
}

module.exports = {
  getOrCreateConfig,
  setGiveawaysRunning,
  setGiveawayChannel,
  pickWinner
};
