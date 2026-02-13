// Utility functions
module.exports = {
    log: (...msg) => console.log("[BOT]", ...msg),

    // Placeholder for leveling system
    meetsLevel: (member, minLevel) => true, // replace with your XP logic

    // Count messages (basic version)
    getMessageCount: async (member) => {
        const channels = member.guild.channels.cache.filter(c => c.isTextBased());
        let total = 0;
        for (const [, channel] of channels) {
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                total += messages.filter(m => m.author.id === member.id).size;
            } catch {}
        }
        return total;
    }
};
