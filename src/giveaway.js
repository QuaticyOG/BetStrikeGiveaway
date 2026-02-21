// src/giveaway.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const db = require("./db");
const cfg = require("./config");
const { isEligible } = require("./eligibility");

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------ */
/*                    PRIZE RNG                     */
/* ------------------------------------------------ */

function pickWeightedPrize(prizes = []) {
  if (!Array.isArray(prizes) || prizes.length === 0) {
    throw new Error("PRIZES config is missing or empty");
  }

  const total = prizes.reduce((sum, p) => sum + (p.weight || 0), 0);
  let roll = Math.random() * total;

  for (const prize of prizes) {
    const w = prize.weight || 0;
    if (roll < w) return prize;
    roll -= w;
  }
  return prizes[0];
}

/* ------------------------------------------------ */
/*                 DATE AND TIME LOG                */
/* ------------------------------------------------ */

function nowOsloTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

/* ------------------------------------------------ */
/*                 PREMIUM REEL HELPERS             */
/* ------------------------------------------------ */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function asBlockquote(text) {
  return text
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n");
}

function buildReelStrip(emojis, length = 40) {
  return Array.from({ length }, () =>
    emojis[Math.floor(Math.random() * emojis.length)]
  );
}

function getWindow(strip, start, size = 7) {
  return strip.slice(start, start + size).join(" ");
}

// Lower = arrows move LEFT, higher = RIGHT
const ARROW_PAD_PER_SLOT = 3;
// Fine-tune by 0..6 without changing slot scaling
const ARROW_PAD_OFFSET = 0;

function buildSpinner(row) {
  const parts = row.split(" ");
  const centerIndex = Math.floor(parts.length / 2); // 7 slots => 3 (4th emoji)

  const padCount = centerIndex * ARROW_PAD_PER_SLOT + ARROW_PAD_OFFSET;
  const arrowPad = "\u2800".repeat(Math.max(0, padCount));

  const frameSide = 10;
  const topBorder = "━".repeat(frameSide) + "⊱⋆⊰" + "━".repeat(frameSide);
  const bottomBorder = "━".repeat(frameSide * 2 + 3);

  return [topBorder, arrowPad + "▼", row, arrowPad + "▲", bottomBorder].join(
    "\n"
  );
}

function glowCenter(row) {
  const parts = row.split(" ");
  const mid = Math.floor(parts.length / 2);
  parts[mid] = `【${parts[mid]}】`;
  return parts.join(" ");
}

/* ------------------------------------------------ */
/*                 CASE ANIMATION                   */
/* ------------------------------------------------ */

async function runCaseAnimation(channel, winner, prize) {
  const spinEmojis = cfg.PRIZES.map(p => p.emoji);
  const replayId = `replay_${winner.id}_${Date.now()}`;

  // anyone can replay, but prevent each user from multi-click spamming
  const activeReplays = new Set();

  // customize these if you change case emoji / thumbnail
  const CASE_EMOJI = "<:case:1474816589659504701>";
  const CASE_THUMB = "https://cdn.discordapp.com/emojis/1474816589659504701.png";

  const msg = await channel.send({
    content: `${CASE_EMOJI} Surprise Betstrike Case...`
  });

  let sharedFinalRowGlowed = null;

  // ---------- PUBLIC PREMIUM SPIN ----------
  async function playPublicAnimation() {
    const strip = buildReelStrip(spinEmojis, 60);
    const winIndex = Math.floor(strip.length * 0.75);
    strip[winIndex] = prize.emoji;

    let position = 0;
    const speeds = [60, 70, 80, 95, 110, 130, 160, 200, 260, 320];

    for (const delay of speeds) {
      const windowRow = getWindow(strip, position);

      const spinEmbed = new EmbedBuilder()
        .setTitle(`${CASE_EMOJI} Surprise Betstrike Case...`)
        .setDescription(asBlockquote(buildSpinner(windowRow)))
        .setThumbnail(CASE_THUMB);

      await msg.edit({
        content: null,
        embeds: [spinEmbed],
        components: []
      });

      position++;
      await sleep(delay);
    }

    // ✅ FINAL ROW GENERATED ONCE (shared with replay)
    const finalArray = Array.from({ length: 7 }, () =>
      spinEmojis[Math.floor(Math.random() * spinEmojis.length)]
    );
    finalArray[3] = prize.emoji;

    const finalRowPlain = finalArray.join(" ");
    sharedFinalRowGlowed = glowCenter(finalRowPlain);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(replayId)
        .setLabel("Replay")
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setColor("#A26BFF")
      .setTitle("Betstrike Case")
      .setDescription(
        `<@${winner.id}> just got rewarded ${prize.emoji} **${prize.name}** for rocking the Betstrike tag 🔥\n\n` +
          asBlockquote(buildSpinner(sharedFinalRowGlowed)) +
          `\n\nStay active. Keep the tag. Win anytime.`
      )
      .setThumbnail(CASE_THUMB);

    await msg.edit({
      content: null, // clears any old spinner text
      embeds: [embed],
      components: [row]
    });
  }

  await playPublicAnimation();

  /* ------------------------------------------------ */
  /*                  REPLAY HANDLER                  */
  /* ------------------------------------------------ */

  const collector = msg.createMessageComponentCollector({
    time: 5 * 60 * 1000
  });

  collector.on("collect", async interaction => {
    if (interaction.customId !== replayId) return;

    // 🚀 acknowledge immediately
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // anti-spam per user
    if (activeReplays.has(interaction.user.id)) {
      return interaction.editReply({ content: "Your replay is already running." });
    }
    activeReplays.add(interaction.user.id);

    try {
      const strip = buildReelStrip(spinEmojis, 60);
      const winIndex = Math.floor(strip.length * 0.75);
      strip[winIndex] = prize.emoji;

      let position = 0;
      const speeds = [70, 85, 100, 130, 170, 230, 300];

      for (const delay of speeds) {
        const windowRow = getWindow(strip, position);

        const replaySpinEmbed = new EmbedBuilder()
          .setTitle(`${CASE_EMOJI} Replaying case...`)
          .setDescription(asBlockquote(buildSpinner(windowRow)))
          .setThumbnail(CASE_THUMB);

        await interaction.editReply({
          content: null,
          embeds: [replaySpinEmbed]
        });

        position++;
        await sleep(delay);
      }

      const replayFinalEmbed = new EmbedBuilder()
        .setTitle(`${CASE_EMOJI} Replay Result`)
        .setDescription(
          asBlockquote(buildSpinner(sharedFinalRowGlowed || ""))
            + `\n\n🏆 Case reward: ${prize.emoji} **${prize.name}**`
        )
        .setThumbnail(CASE_THUMB);

      await interaction.editReply({
        content: null,
        embeds: [replayFinalEmbed]
      });
    } finally {
      activeReplays.delete(interaction.user.id);
    }
  });

  collector.on("end", async () => {
    try {
      await msg.edit({ components: [] });
    } catch {}
  });

  return msg;
}

/* ------------------------------------------------ */
/*                   CONFIG DB                      */
/* ------------------------------------------------ */

async function getOrCreateConfig(guildId) {
  await db.query(
    "INSERT INTO bot_config (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
    [guildId]
  );
  const res = await db.query("SELECT * FROM bot_config WHERE guild_id=$1", [
    guildId
  ]);
  return res.rows[0];
}

async function setGiveawaysRunning(guildId, running) {
  await db.query(
    "INSERT INTO bot_config (guild_id, giveaways_running) VALUES ($1,$2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET giveaways_running=EXCLUDED.giveaways_running, updated_at=NOW()",
    [guildId, running]
  );
}

async function setGiveawayChannel(guildId, channelId) {
  await db.query(
    "INSERT INTO bot_config (guild_id, giveaway_channel_id) VALUES ($1,$2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET giveaway_channel_id=EXCLUDED.giveaway_channel_id, updated_at=NOW()",
    [guildId, channelId]
  );
}

async function setWinnersLogChannel(guildId, channelId) {
  await db.query(
    "INSERT INTO bot_config (guild_id, log_channel_id) VALUES ($1,$2) " +
      "ON CONFLICT (guild_id) DO UPDATE SET log_channel_id=EXCLUDED.log_channel_id, updated_at=NOW()",
    [guildId, channelId]
  );
}

function findEligibleRole(guild) {
  if (cfg.ELIGIBLE_ROLE_ID) return guild.roles.cache.get(cfg.ELIGIBLE_ROLE_ID) || null;
  return guild.roles.cache.find(r => r.name === cfg.ELIGIBLE_ROLE_NAME) || null;
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
    `SELECT 1 FROM daily_winners
     WHERE guild_id=$1
       AND user_id=$2
       AND win_date >= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))
     LIMIT 1`,
    [guildId, userId, cooldownDays]
  );

  return res.rowCount > 0;
}

async function resetWinners(guildId, scope = "today") {
  if (scope === "all") {
    const res = await db.query("DELETE FROM daily_winners WHERE guild_id=$1", [
      guildId
    ]);
    return { deleted: "all", rows: res.rowCount };
  }

  const winDateUTC = todayISODateUTC();
  const res = await db.query(
    "DELETE FROM daily_winners WHERE guild_id=$1 AND win_date=$2::date",
    [guildId, winDateUTC]
  );
  return { deleted: "today", rows: res.rowCount, winDateUTC };
}

/* ------------------------------------------------ */
/*                   PICK WINNER                    */
/* ------------------------------------------------ */

async function pickWinner(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) {
    return { winner: null, reason: "Giveaways are stopped." };
  }

  const winDateUTC = todayISODateUTC();
  const role = findEligibleRole(guild);
  if (!role) {
    return { winner: null, reason: "Eligible role not found." };
  }

  if (role.members.size === 0) {
    try {
      await guild.members.fetch();
    } catch (e) {
      console.error("Member cache warm failed:", e);
      return { winner: null, reason: "Member cache warming." };
    }
  }

  const eligible = [];
  for (const [, member] of role.members) {
    if (await hasWonToday(guild.id, member.id, winDateUTC)) continue;
    if (await hasWonWithinCooldown(guild.id, member.id, cfg.WIN_COOLDOWN_DAYS)) continue;
    if (await isEligible(member)) eligible.push(member);
  }

  if (eligible.length === 0) {
    return { winner: null, reason: "No eligible members found." };
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  await db.query(
    "INSERT INTO daily_winners (guild_id,user_id,win_date) VALUES ($1,$2,$3::date) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDateUTC]
  );

  // 🎁 Pick prize
  const prize = pickWeightedPrize(cfg.PRIZES);

  // 🎰 Public animation
  const publicChannelId = conf.giveaway_channel_id;
  const publicChannel = publicChannelId
    ? guild.channels.cache.get(publicChannelId)
    : null;

  if (publicChannel) {
    await runCaseAnimation(publicChannel, winner, prize);
  }

  // 🧾 Winner log
  const logChannelId = conf.log_channel_id;
  const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

  if (logChannel) {
    try {
      await logChannel.send({
        content:
          `🏆 **Winner Drawn**\n` +
          `User: <@${winner.id}>\n` +
          `Prize: ${prize.emoji} **${prize.name}**\n` +
          `Date: ${winDateUTC}\n` +
          `Time: ${nowOsloTime()} UTC+1`
      });
    } catch (err) {
      console.error("Failed to send winner log:", err);
    }
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
