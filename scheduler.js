const pickWinner = require("./giveawayManager");

function scheduleGiveaways(client) {
    const { RANDOM_TIME_WINDOWS, WINNERS_PER_DAY } = client.config;

    function randomTime(start, end) {
        const diff = end - start;
        return start + Math.random() * diff;
    }

    async function scheduleDaily() {
        if (!client.giveawaysRunning) return;

        client.dailyWinners.clear();

        for (let i = 0; i < WINNERS_PER_DAY; i++) {
            for (const window of RANDOM_TIME_WINDOWS) {
                const start = parseInt(window.start);
                const end = parseInt(window.end);
                const delay = randomTime(start, end);

                const timeout = setTimeout(async () => {
                    if (!client.giveawaysRunning) return;
                    await pickWinner(client);
                }, delay);

                client.schedulerTimeouts.push(timeout);
            }
        }
    }

    scheduleDaily();

    // Reset daily schedule every 24 hours
    const dailyInterval = setInterval(scheduleDaily, 24 * 60 * 60 * 1000);
    client.schedulerTimeouts.push(dailyInterval);
}

module.exports = scheduleGiveaways;
