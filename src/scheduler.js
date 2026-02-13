const cfg = require("./config");
const { pickWinner, getOrCreateConfig } = require("./giveaway");

/**
 * Pick a random timestamp inside a UTC hour window for TODAY.
 */
function randomTimeInWindow(startHour, endHour) {
  const now = new Date();

  const start = new Date(now);
  start.setUTCHours(startHour, 0, 0, 0);

  const end = new Date(now);
  end.setUTCHours(endHour, 0, 0, 0);

  const diff = end.getTime() - start.getTime();
  const offset = Math.floor(Math.random() * diff);

  return new Date(start.getTime() + offset);
}

/**
 * Schedule today's draws — exactly ONE per window.
 */
async function scheduleToday(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) {
    console.log("[SCHEDULER] Giveaways disabled.");
    return;
  }

  const windows = cfg.TIME_WINDOWS;

  console.log(`[SCHEDULER] Scheduling ${windows.length} winners for today...`);

  for (const window of windows) {
    const drawTime = randomTimeInWindow(window.startHour, window.endHour);
    const delay = drawTime.getTime() - Date.now();

    // Skip past times (e.g., bot restarted late)
    if (delay <= 0) {
      console.log(`[SCHEDULER] Skipping past window draw at ${drawTime.toISOString()}`);
      continue;
    }

    console.log(`[SCHEDULER] Next draw scheduled at ${drawTime.toISOString()}`);

    const timer = setTimeout(async () => {
      try {
        console.log("[SCHEDULER] Running scheduled draw...");
        await pickWinner(client, guild);
      } catch (err) {
        console.error("Scheduled draw error:", err);
      }
    }, delay);

    client._timers.push(timer);
  }
}

/**
 * Start daily scheduler loop.
 * Re-schedules every 24h at midnight UTC.
 */
async function startScheduler(client) {
  const guild = client.guilds.cache.get(cfg.GUILD_ID);
  if (!guild) {
    console.log("[SCHEDULER] Guild not found.");
    return;
  }

  // Schedule immediately for today
  await scheduleToday(client, guild);

  // Calculate ms until next midnight UTC
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);

  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`[SCHEDULER] Rescheduling in ${(msUntilMidnight / 1000 / 60).toFixed(2)} minutes`);

  setTimeout(async () => {
    await startScheduler(client); // loop daily
  }, msUntilMidnight);
}

module.exports = {
  startScheduler,
  scheduleToday
};
