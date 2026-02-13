const cfg = require("./config");
const { pickWinner, getOrCreateConfig } = require("./giveaway");

const TZ = "Europe/Oslo";

function getOsloYMD(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return { y, m, d };
}

/**
 * Returns the timezone offset (minutes) between UTC and TZ at a given UTC instant.
 * Positive means TZ is ahead of UTC (Oslo is +60 or +120 depending on DST).
 */
function tzOffsetMinutesAt(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(utcDate);

  const get = (t) => parts.find(p => p.type === t).value;

  // This is the "same instant" rendered in the target timezone, but we interpret it as UTC
  const asIfUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  );

  return (asIfUtc - utcDate.getTime()) / 60000;
}

/**
 * Build a real UTC Date for a given Oslo-local date+time.
 */
function utcFromOsloLocal(y, m, d, hour, minute, second = 0) {
  // Start with a guess assuming the local time is UTC (we'll correct using the offset)
  const guessUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hour, minute, second));

  // Determine Oslo offset at that instant
  const offsetMin = tzOffsetMinutesAt(guessUtc, TZ);

  // If Oslo is ahead of UTC by +60, then local 09:00 happens at 08:00 UTC (subtract 60 minutes)
  return new Date(guessUtc.getTime() - offsetMin * 60000);
}

function randomUtcInOsloWindow(startHour, endHour) {
  const { y, m, d } = getOsloYMD(new Date());

  // pick random minute/second inside window
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  const r = Math.floor(Math.random() * (endMin - startMin));
  const totalMin = startMin + r;

  const hour = Math.floor(totalMin / 60);
  const minute = totalMin % 60;
  const second = Math.floor(Math.random() * 60);

  return utcFromOsloLocal(y, m, d, hour, minute, second);
}

async function scheduleToday(client, guild) {
  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) {
    console.log("[SCHEDULER] Giveaways disabled.");
    return;
  }

  const windows = cfg.TIME_WINDOWS; // you will set these in Oslo-local hours: 9-12 and 19-23

  console.log(`[SCHEDULER] Scheduling ${windows.length} winners for today (${TZ})...`);

  for (const w of windows) {
    const drawTimeUtc = randomUtcInOsloWindow(w.startHour, w.endHour);
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

function nextOsloMidnightUtc() {
  const now = new Date();
  const { y, m, d } = getOsloYMD(now);

  // Build Oslo-local "tomorrow 00:00"
  // To get tomorrow, we can take "today 00:00 Oslo" then add 24h in Oslo terms by creating UTC from local
  // simpler: create UTC from Oslo local for today 00:00, then add 24h
  const todayMidnightUtc = utcFromOsloLocal(y, m, d, 0, 0, 0);
  return new Date(todayMidnightUtc.getTime() + 24 * 60 * 60 * 1000);
}

async function startScheduler(client) {
  const guild = client.guilds.cache.get(cfg.GUILD_ID);
  if (!guild) {
    console.log("[SCHEDULER] Guild not found.");
    return;
  }

  await scheduleToday(client, guild);

  const nextMidnightUtc = nextOsloMidnightUtc();
  const ms = nextMidnightUtc.getTime() - Date.now();

  console.log(
    `[SCHEDULER] Rescheduling in ${(ms / 1000 / 60).toFixed(2)} minutes (next Oslo midnight)`
  );

  setTimeout(() => startScheduler(client), ms);
}

module.exports = { startScheduler, scheduleToday };
