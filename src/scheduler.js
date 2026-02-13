const cfg = require("./config");
const { pickWinner, getOrCreateConfig } = require("./giveaway");

/**
 * Get a Date representing "now" in Europe/Oslo timezone.
 */
function nowInOslo() {
  return new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Oslo",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date())
  );
}

/**
 * Convert an Oslo-local time (hour range today) → real UTC Date.
 */
function randomUtcFromOsloWindow(startHour, endHour) {
  const osloNow = nowInOslo();

  const start = new Date(osloNow);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(osloNow);
  end.setHours(endHour, 0, 0, 0);

  const diff = end.getTime() - start.getTime();
  const offset = Math.floor(Math.random() * diff);

  const osloRandom = new Date(start.getTime() + offset);

  // Convert that Oslo-local time back to real UTC timestamp
  return new Date(
    new Date(osloRandom).toLocaleString("en-US", { timeZone: "UTC" })
  );
}

/**
 * Schedule exactly ONE draw per configured Oslo window.
 */
async function scheduleToday(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) {
    console.log("[SCHEDULER] Giveaways disabled.");
    return;
  }

  const windows = cfg.TIME_WINDOWS;

  console.log(`[SCHEDULER] Scheduling ${windows.length} winners for today (Europe/Oslo)...`);

  for (const window of windows) {
    const drawTimeUtc = randomUtcFromOsloWindow(window.startHour, window.endHour);
    const delay = drawTimeUtc.getTime() - Date.now();

    if (delay <= 0) {
      console.log(`[SCHEDULER] Skipping past draw ${drawTimeUtc.toISOString()}`);
      continue;
    }

    console.log(`[SCHEDULER] Next draw at ${drawTimeUtc.toISOString()} (UTC)`);

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
 * Start daily scheduler loop (reschedules every midnight Oslo time).
 */
async function startScheduler(client) {
  const guild = client.guilds.cache.get(cfg.GUILD_ID);
  if (!guild) {
    console.log("[SCHEDULER] Guild not found.");
    return;
  }

  await scheduleToday(client, guild);

  // Calculate next midnight in Oslo timezone
  const osloNow = nowInOslo();
  const nextMidnightOslo = new Date(osloNow);
  nextMidnightOslo.setDate(nextMidnightOslo.getDate() + 1);
  nextMidnightOslo.setHours(0, 0, 0, 0);

  const nextMidnightUtc = new Date(
    nextMidnightOslo.toLocaleString("en-US", { timeZone: "UTC" })
  );

  const msUntilNext = nextMidnightUtc.getTime() - Date.now();

  console.log(
    `[SCHEDULER] Rescheduling in ${(msUntilNext / 1000 / 60).toFixed(2)} minutes (next Oslo midnight)`
  );

  setTimeout(() => startScheduler(client), msUntilNext);
}

module.exports = {
  startScheduler,
  scheduleToday
};
