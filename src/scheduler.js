const cfg = require("./config");
const { pickWinner, getOrCreateConfig } = require("./giveaway");
const { randomBetween } = require("./schedulerUtils");

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

// tiny helper to avoid circular deps
// (kept separate so scheduler.js stays clean)
