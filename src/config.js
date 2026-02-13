function mustGet(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getTimeWindows() {
  const raw = mustGet("TIME_WINDOWS_JSON");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TIME_WINDOWS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("TIME_WINDOWS_JSON must be a non-empty array");
  }
  // Normalize + basic validation
  return parsed.map(w => ({
    startHour: Number(w.startHour),
    endHour: Number(w.endHour)
  }));
}

module.exports = {
  BOT_TOKEN: mustGet("BOT_TOKEN"),
  DATABASE_URL: mustGet("DATABASE_URL"),

  ELIGIBLE_ROLE_ID: process.env.ELIGIBLE_ROLE_ID || "",
  ELIGIBLE_ROLE_NAME: process.env.ELIGIBLE_ROLE_NAME || "striker",

  WIN_COOLDOWN_DAYS: Number(process.env.WIN_COOLDOWN_DAYS ?? 4),

  
  MIN_MESSAGES: Number(process.env.MIN_MESSAGES ?? 0),
  MIN_DAYS_IN_SERVER: Number(process.env.MIN_DAYS_IN_SERVER ?? 7),
  MIN_ACCOUNT_AGE_DAYS: Number(process.env.MIN_ACCOUNT_AGE_DAYS ?? 60),

  WINNERS_PER_DAY: Number(process.env.WINNERS_PER_DAY ?? 1),
  TIME_WINDOWS: getTimeWindows(),

  GIVEAWAY_MESSAGE: process.env.GIVEAWAY_MESSAGE || "🎉 Congratulations {user}!",
  GIVEAWAY_COLOR: process.env.GIVEAWAY_COLOR || "#9e6bff",

  GUILD_ID: process.env.GUILD_ID || ""
};
