require("dotenv").config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const scheduleGiveaways = require("./scheduler");
const { log } = require("./utils");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Configuration
client.config = {
    ELIGIBLE_ROLE_NAME: process.env.ELIGIBLE_ROLE_NAME,
    ELIGIBLE_ROLE_ID: process.env.ELIGIBLE_ROLE_ID,
    MIN_MESSAGES: Number(process.env.MIN_MESSAGES),
    MIN_LEVEL: Number(process.env.MIN_LEVEL),
    MIN_DAYS_IN_SERVER: Number(process.env.MIN_DAYS_IN_SERVER),
    MIN_ACCOUNT_AGE_DAYS: Number(process.env.MIN_ACCOUNT_AGE_DAYS),
    WINNERS_PER_DAY: Number(process.env.WINNERS_PER_DAY),
    GIVEAWAY_CHANNEL_LOG: process.env.GIVEAWAY_CHANNEL_LOG,
    RANDOM_TIME_WINDOWS: JSON.parse(process.env.RANDOM_TIME_WINDOWS),
    GIVEAWAY_MESSAGE: process.env.GIVEAWAY_MESSAGE,
    GIVEAWAY_COLOR: process.env.GIVEAWAY_COLOR || "#9e6bff"
};

// Track winners per day and giveaway state
client.dailyWinners = new Set();
client.giveawaysRunning = true;
client.schedulerTimeouts = [];

// Ready
client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    scheduleGiveaways(client);
    registerCommands();
});

// LOGIN
client.login(process.env.BOT_TOKEN);

// ------------------
// SLASH COMMANDS
// ------------------
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName("stopgiveaways")
            .setDescription("Stop the scheduled giveaways"),
        new SlashCommandBuilder()
            .setName("startgiveaways")
            .setDescription("Start the giveaways again"),
        new SlashCommandBuilder()
            .setName("setgiveawaychannel")
            .setDescription("Set the channel where winners are announced")
            .addChannelOption(option =>
                option.setName("channel")
                    .setDescription("Select the channel")
                    .setRequired(true)
            )
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash commands registered");
}

// ------------------
// INTERACTION HANDLER
// ------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "You need admin permissions!", ephemeral: true });
    }

    const { commandName } = interaction;

    if (commandName === "stopgiveaways") {
        client.giveawaysRunning = false;
        // Clear any pending timeouts
        client.schedulerTimeouts.forEach(t => clearTimeout(t));
        client.schedulerTimeouts = [];
        return interaction.reply("✅ Giveaways stopped!");
    }

    if (commandName === "startgiveaways") {
        if (client.giveawaysRunning) return interaction.reply("Giveaways are already running!");
        client.giveawaysRunning = true;
        require("./scheduler")(client); // restart scheduling
        return interaction.reply("✅ Giveaways started!");
    }

    if (commandName === "setgiveawaychannel") {
        const channel = interaction.options.getChannel("channel");
        client.config.GIVEAWAY_CHANNEL_LOG = channel.id;
        return interaction.reply(`✅ Giveaway channel set to ${channel}`);
    }
});
