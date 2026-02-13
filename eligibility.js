const { getMessageCount, meetsLevel } = require("./utils");

async function isEligible(member, config) {
    if (member.user.bot) return false;

    // Role check
    const hasRole = config.ELIGIBLE_ROLE_ID
        ? member.roles.cache.has(config.ELIGIBLE_ROLE_ID)
        : member.roles.cache.some(r => r.name === config.ELIGIBLE_ROLE_NAME);
    if (!hasRole) return false;

    // Server join age
    const joinedDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
    if (joinedDays < config.MIN_DAYS_IN_SERVER) return false;

    // Account age
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < config.MIN_ACCOUNT_AGE_DAYS) return false;

    // Messages sent
    const messages = await getMessageCount(member);
    if (messages < config.MIN_MESSAGES) return false;

    // Level
    if (!meetsLevel(member, config.MIN_LEVEL)) return false;

    return true;
}

module.exports = { isEligible };
