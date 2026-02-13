const db = require("./db");
const cfg = require("./config");

async function getMessageCount(guildId, userId) {
  const res = await db.query(
    "SELECT count FROM message_counts WHERE guild_id=$1 AND user_id=$2",
    [guildId, userId]
  );
  return res.rows[0]?.count ?? 0;
}

async function hasWonToday(guildId, userId, dateISO) {
  const res = await db.query(
    "SELECT 1 FROM daily_winners WHERE guild_id=$1 AND user_id=$2 AND win_date=$3",
    [guildId, userId, dateISO]
  );
  return res.rowCount > 0;
}

async function isEligible(member) {
  if (!member || !member.user) return false;
  if (member.user.bot) return false;

  // Role requirement
  const hasRole = cfg.ELIGIBLE_ROLE_ID
    ? member.roles.cache.has(cfg.ELIGIBLE_ROLE_ID)
    : member.roles.cache.some(r => r.name === cfg.ELIGIBLE_ROLE_NAME);

  if (!hasRole) return false;

  // Server join age
  const joinedDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
  if (joinedDays < cfg.MIN_DAYS_IN_SERVER) return false;

  // Account age
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < cfg.MIN_ACCOUNT_AGE_DAYS) return false;

  // Messages
  const msgCount = await getMessageCount(member.guild.id, member.id);
  if (Number(msgCount) < cfg.MIN_MESSAGES) return false;

  return true;
}

module.exports = { isEligible, hasWonToday };
