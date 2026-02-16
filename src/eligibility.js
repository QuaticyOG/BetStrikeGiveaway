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

async function getRoleAssignedAt(guildId, userId, roleId) {
  if (!roleId) return null;
  const res = await db.query(
    "SELECT assigned_at FROM role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3",
    [guildId, userId, roleId]
  );
  return res.rows[0]?.assigned_at ? new Date(res.rows[0].assigned_at).getTime() : null;
}

function memberHasRole(member, roleId, roleName) {
  if (roleId) return member.roles.cache.has(roleId);
  const target = (roleName || "").toLowerCase();
  return member.roles.cache.some(r => (r.name || "").toLowerCase() === target);
}

function resolveRoleId(guild, roleId, roleName) {
  if (roleId) return roleId;
  const target = (roleName || "").toLowerCase();
  const role = guild?.roles?.cache?.find(r => (r.name || "").toLowerCase() === target);
  return role?.id || "";
}

async function isEligible(member) {
  if (!member || !member.user) return false;
  if (member.user.bot) return false;

  // Must currently have striker role
  const hasStriker = memberHasRole(member, cfg.STRIKER_ROLE_ID, cfg.STRIKER_ROLE_NAME);
  if (!hasStriker) return false;

  // Must currently have Level 5 role
  const hasLevel5 = memberHasRole(member, cfg.LEVEL5_ROLE_ID, cfg.LEVEL5_ROLE_NAME);
  if (!hasLevel5) return false;

  // Server join age
  const joinedDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
  if (joinedDays < cfg.MIN_DAYS_IN_SERVER) return false;

  // Account age
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < cfg.MIN_ACCOUNT_AGE_DAYS) return false;

  // Striker role age (MOST IMPORTANT)
  // Discord does not expose "when role was granted", so we track it in role_assignments via guildMemberUpdate.
  // If we have no record yet, treat as not eligible until the bot observes the grant event.
  const strikerRoleId = resolveRoleId(member.guild, cfg.STRIKER_ROLE_ID || cfg.ELIGIBLE_ROLE_ID, cfg.STRIKER_ROLE_NAME);
  const assignedAt = await getRoleAssignedAt(member.guild.id, member.id, strikerRoleId);
  if (!assignedAt) return false;
  const strikerDays = (Date.now() - assignedAt) / (1000 * 60 * 60 * 24);
  if (strikerDays < cfg.MIN_DAYS_WITH_STRIKER_ROLE) return false;

  // Messages
  const msgCount = await getMessageCount(member.guild.id, member.id);
  if (Number(msgCount) < cfg.MIN_MESSAGES) return false;

  return true;
}

module.exports = { isEligible, hasWonToday };
