const { isEligible } = require("./eligibility");
const { EmbedBuilder } = require("discord.js");

async function pickWinner(client) {
    const guild = client.guilds.cache.first();
    if (!guild) return null;

    const members = await guild.members.fetch();
    const eligible = [];

    for (const [, member] of members) {
        if (await isEligible(member, client.config)) {
            if (!client.dailyWinners.has(member.id)) {
                eligible.push(member);
            }
        }
    }

    if (eligible.length === 0) return null;

    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    client.dailyWinners.add(winner.id);

    const logChannel = guild.channels.cache.get(client.config.GIVEAWAY_CHANNEL_LOG);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setColor(client.config.GIVEAWAY_COLOR)
            .setTitle("🎉 Giveaway Winner 🎉")
            .setDescription(client.config.GIVEAWAY_MESSAGE.replace("{user}", `<@${winner.id}>`))
            .setTimestamp();

        logChannel.send({ embeds: [embed] });
    }

    return winner;
}

module.exports = pickWinner;
