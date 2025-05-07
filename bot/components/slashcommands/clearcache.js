const { SlashCommandBuilder } = require('discord.js');
const monitor = require('../../utils/monitor');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearcache')
        .setDescription('Clears the shop monitor cache (guild owner only)'),
    async execute(interaction) {
        if (!interaction.guild)
            return interaction.reply({ content: '❌ Only in servers.', ephemeral: true });
        if (interaction.user.id !== interaction.guild.ownerId)
            return interaction.reply({ content: '🚫 Only the server owner may run this.', ephemeral: true });

        // clear so all shops appear as new
        monitor.clearCache();
        console.log(`[ClearCache] Triggered by ${interaction.user.tag}`);

        // immediately post all as new
        await monitor.checkShops();
        return interaction.reply({ content: '✅ Cache cleared & all shops reposted.', ephemeral: true });
    }
};
