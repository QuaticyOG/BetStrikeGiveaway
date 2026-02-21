// src/giveaway.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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

  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;

  for (const prize of prizes) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return prizes[0];
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

// build long strip
function buildReelStrip(emojis, length = 40) {
  return Array.from({ length }, () =>
    emojis[Math.floor(Math.random() * emojis.length)]
  );
}

// take visible window
function getWindow(strip, start, size = 7) {
  return strip.slice(start, start + size).join(" ");
}

// framed premium spinner
function buildSpinner(row) {
  const parts = row.split(" ");
  const centerIndex = Math.floor(parts.length / 2);

  const arrowPad = "\u2800".repeat(centerIndex * 2);

  const rowWidth = row.length;
  const side = Math.max(8, Math.floor(rowWidth / 2) - 2);

  const topBorder = "━".repeat(side) + "⊱⋆⊰" + "━".repeat(side);
  const bottomBorder = "━".repeat(side * 2 + 3);

  return [
    topBorder,
    arrowPad + "▼",
    row,
    arrowPad + "▲",
    bottomBorder
  ].join("\n");
}

// glow the center slot
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
  const activeReplays = new Set();

  const msg = await channel.send({
    content: "🎰 Surprise Betstrike Case..."
  });

  // ---------- PUBLIC PREMIUM SPIN ----------
  async function playPublicAnimation() {
    const strip = buildReelStrip(spinEmojis, 60);

    // force near-miss setup
    const winIndex = Math.floor(strip.length * 0.75);
    strip[winIndex] = prize.emoji;

    let position = 0;

    // easing slowdown frames
    const speeds = [
      60, 70, 80, 95, 110, 130, 160, 200, 260, 320
    ];

    for (const delay of speeds) {
      const windowRow = getWindow(strip, position);
      await msg.edit(
        `🎰 Surprise Betstrike Case...\n\n${buildSpinner(windowRow)}`
      );
      position++;
      await sleep(delay);
    }

    // final aligned row
    const finalArray = Array.from({ length: 7 }, () =>
      spinEmojis[Math.floor(Math.random() * spinEmojis.length)]
    );
    finalArray[3] = prize.emoji;

    const finalRow = glowCenter(finalArray.join(" "));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(replayId)
        .setLabel("Replay")
        .setStyle(ButtonStyle.Secondary)
    );

    await msg.edit({
      content: `
<@${winner.id}> just got rewarded ${prize.emoji} **${prize.name}** for rocking the Betstrike tag 🔥

${asBlockquote(
  `🎰 **Betstrike Case**\n\n${buildSpinner(finalRow)}`
)}

Stay active. Keep the tag. Win anytime. <a:emoji_name:1473066768749822004>
`,
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

    // anti-spam per user
    if (activeReplays.has(interaction.user.id)) {
      return interaction.reply({
        content: "Your replay is already running.",
        ephemeral: true
      });
    }

    activeReplays.add(interaction.user.id);

    try {
      await interaction.reply({
        content: "🎰 Replaying your case...",
        ephemeral: true
      });

      const strip = buildReelStrip(spinEmojis, 60);
      const winIndex = Math.floor(strip.length * 0.75);
      strip[winIndex] = prize.emoji;

      let position = 0;
      const speeds = [70, 85, 100, 130, 170, 230, 300];

      for (const delay of speeds) {
        const windowRow = getWindow(strip, position);

        await interaction.editReply(
          `🎰 Replaying your case...\n\n${buildSpinner(windowRow)}`
        );

        position++;
        await sleep(delay);
      }

      const finalArray = Array.from({ length: 7 }, () =>
        spinEmojis[Math.floor(Math.random() * spinEmojis.length)]
      );
      finalArray[3] = prize.emoji;

      const finalRow = glowCenter(finalArray.join(" "));

      await interaction.editReply(
        `🎰 **Replay Result**\n\n${asBlockquote(
          buildSpinner(finalRow)
        )}\n\n🏆 Case reward: ${prize.emoji} **${prize.name}**`
      );
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
  const res = await db.query(
    "SELECT * FROM bot_config WHERE guild_id=$1",
    [guildId]
  );
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
  if (cfg.ELIGIBLE_ROLE_ID)
    return guild.roles.cache.get(cfg.ELIGIBLE_ROLE_ID) || null;

  return guild.roles.cache.find(
    r => r.name === cfg.ELIGIBLE_ROLE_NAME
  ) || null;
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
    const res = await db.query(
      "DELETE FROM daily_winners WHERE guild_id=$1",
      [guildId]
    );
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
  if (!conf.giveaways_running)
    return { winner: null, reason: "Giveaways are stopped." };

  const winDateUTC = todayISODateUTC();
  const role = findEligibleRole(guild);
  if (!role)
    return { winner: null, reason: "Eligible role not found." };

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
    if (
      await hasWonWithinCooldown(
        guild.id,
        member.id,
        cfg.WIN_COOLDOWN_DAYS
      )
    )
      continue;
    if (await isEligible(member)) eligible.push(member);
  }

  if (eligible.length === 0)
    return { winner: null, reason: "No eligible members found." };

  const winner =
    eligible[Math.floor(Math.random() * eligible.length)];

  await db.query(
    "INSERT INTO daily_winners (guild_id,user_id,win_date) VALUES ($1,$2,$3::date) ON CONFLICT DO NOTHING",
    [guild.id, winner.id, winDateUTC]
  );

  const publicChannelId = conf.giveaway_channel_id;
  const publicChannel = publicChannelId
    ? guild.channels.cache.get(publicChannelId)
    : null;

  if (publicChannel) {
    const prize = pickWeightedPrize(cfg.PRIZES);
    await runCaseAnimation(publicChannel, winner, prize);
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
