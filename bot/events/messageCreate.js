module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;
        // Example prefix command
        if (message.content === '!ping') {
            await message.reply('Pong!');
            console.log(`[Event] Responded to ping from ${message.author.tag}`);
        }
    }
};