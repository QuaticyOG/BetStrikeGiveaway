const cfg = require("./config");
const { pickWinner, getOrCreateConfig } = require("./giveaway");

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function msUntil(ts) {
  return Math.max(0, ts - Date.now());
}

function startOfTodayUTC() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function computeDrawTimestampsUTC(timeWindows, winnersPerDay) {
  const base = startOfTodayUTC();

  const windows = timeWindows.map(w => {
    const start = base + Math.max(0, Math.min(23, w.startHour)) * 3600_000;
    const end = base + Math.max(1, Math.min(24, w.endHour)) * 3600_000;
    return { start, end: Math.max(end, start + 60_000) };
  });

  const ts = [];
  for (let i = 0; i < winnersPerDay; i++) {
    const win = windows[Math.floor(Math.random() * windows.length)];
    ts.push(Math.floor(randomBetween(win.start, win.end)));
  }

  ts.sort((a, b) => a - b);
  return ts;
}

async function scheduleToday(client, guild) {
  // clear old timers
  for (const t of client._timers) clearTimeout(t);
  client._timers = [];

  const conf = await getOrCreateConfig(guild.id);
  if (!conf.giveaways_running) return;

  const timestamps = computeDrawTimestampsUTC(cfg.TIME_WINDOWS, cfg.WINNERS_PER_DAY);

  for (const ts of timestamps) {
    if (ts <= Date.now()) continue;

    const t = setTimeout(async () => {
      try {
        await pickWinner(client, guild);
      } catch (e) {
        console.error("Draw failed:", e);
      }
    }, msUntil(ts));

    client._timers.push(t);
  }

  // reschedule just after next UTC midnight
  const nextMidnight = startOfTodayUTC() + 24 * 3600_000 + 5_000;

  const rescheduler = setTimeout(async () => {
    try {
      await scheduleToday(client, guild);
    } catch (e) {
      console.error("Reschedule failed:", e);
    }
  }, msUntil(nextMidnight));

  client._timers.push(rescheduler);
}

async function startScheduler(client) {
  const guild = cfg.GUILD_ID
    ? client.guilds.cache.get(cfg.GUILD_ID)
    : client.guilds.cache.first();

  if (!guild) {
    console.error("No guild found. Set GUILD_ID in .env for reliability.");
    return;
  }

  await scheduleToday(client, guild);
}

module.exports = { startScheduler, scheduleToday };
