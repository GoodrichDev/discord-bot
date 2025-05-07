require('dotenv').config();
const {
    Client,
    Collection,
    GatewayIntentBits,
    REST,
    Routes
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// build the client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
// extend with collections
client.commands = new Collection();

const monitor = require('./bot/utils/monitor');
monitor.setClient(client);

// helper to read directory
function dirSync(dir) {
    return fs.readdirSync(dir);
}

// load slash commands
const slashPath = path.join(__dirname, 'bot/components/slashcommands');
for (const file of dirSync(slashPath).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(slashPath, file));
    client.commands.set(cmd.data.name, cmd);
}

// load events
const eventsPath = path.join(__dirname, 'bot/events');
for (const file of dirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const evt = require(path.join(eventsPath, file));
    if (evt.once) {
        client.once(evt.name, (...args) => evt.execute(...args, client));
    } else {
        client.on(evt.name, (...args) => evt.execute(...args, client));
    }
}

// register slash commands on ready (guild for instant testing)
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    const data = client.commands.map(cmd => cmd.data.toJSON());
    try {
        console.log('🚀 Registering slash commands to guild...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: data }
        );
        console.log('✅ Slash commands registered to guild.');
    } catch (err) {
        console.error('❌ Error registering slash commands:', err);
    }

    await monitor.seedShops();
    console.log(`Seeded shop cache with ${monitor.getCacheSize()} entries.`);
    setInterval(monitor.checkShops, 5 * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);