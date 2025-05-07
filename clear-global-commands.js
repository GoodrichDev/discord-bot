require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🗑️ Clearing all global commands…');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }  // empty = delete all
        );
        console.log('✅ Cleared global commands.');
    } catch (err) {
        console.error('❌ Failed to clear global commands:', err);
    }
})();