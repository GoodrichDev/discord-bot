// clear-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🗑️ Clearing GLOBAL commands…');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log('✅ Cleared global commands.');

        console.log('🗑️ Clearing GUILD commands…');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] }
        );
        console.log('✅ Cleared guild commands.');
    } catch (err) {
        console.error('❌ Failed to clear commands:', err);
    }
})();
