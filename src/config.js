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

  // Base pool role
  ELIGIBLE_ROLE_ID: process.env.ELIGIBLE_ROLE_ID || "",
  ELIGIBLE_ROLE_NAME: process.env.ELIGIBLE_ROLE_NAME || "striker",

  // Requirements
  STRIKER_ROLE_ID: process.env.STRIKER_ROLE_ID || process.env.ELIGIBLE_ROLE_ID || "",
  STRIKER_ROLE_NAME: process.env.STRIKER_ROLE_NAME || process.env.ELIGIBLE_ROLE_NAME || "striker",
  LEVEL5_ROLE_ID: process.env.LEVEL5_ROLE_ID || "",
  LEVEL5_ROLE_NAME: process.env.LEVEL5_ROLE_NAME || "level 5",

  WIN_COOLDOWN_DAYS: Number(process.env.WIN_COOLDOWN_DAYS ?? 4),

  MIN_MESSAGES: Number(process.env.MIN_MESSAGES ?? 0),
  MIN_DAYS_IN_SERVER: Number(process.env.MIN_DAYS_IN_SERVER ?? 7),
  MIN_ACCOUNT_AGE_DAYS: Number(process.env.MIN_ACCOUNT_AGE_DAYS ?? 60),
  MIN_DAYS_WITH_STRIKER_ROLE: Number(process.env.MIN_DAYS_WITH_STRIKER_ROLE ?? 7),

  WINNERS_PER_DAY: Number(process.env.WINNERS_PER_DAY ?? 1),
  TIME_WINDOWS: getTimeWindows(),

  GIVEAWAY_MESSAGE: process.env.GIVEAWAY_MESSAGE || "🎉 Congratulations {user}!",
  GIVEAWAY_COLOR: process.env.GIVEAWAY_COLOR || "#9e6bff",

  // ✅ ADD IT HERE
  PRIZES: [
    { name: "5$ Prize", emoji: "<:bitcoingreen:1423384535529291816>", weight: 25 },
    { name: "5$ Prize", emoji: "<:moneypurple:1423384445599350935>", weight: 25 },
    { name: "5$ Prize", emoji: "<:moneygreen:1423384508539076762>", weight: 25 },
    { name: "5$ Prize", emoji: "<:bitcoinpurple:1423384473655054356>", weight: 25 }
  ],

  GUILD_ID: process.env.GUILD_ID || ""
};
