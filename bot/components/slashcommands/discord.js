const { SlashCommandBuilder } = require('discord.js');
const { postQuery, fetchUUIDFromPlayerDB, fetchUsernameFromPlayerDB } = require('../commons/api');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('discord')
        .setDescription('Discord ↔ Minecraft linkage commands')
        .addSubcommand(sub =>
            sub.setName('linked')
                .setDescription('Check linked account')
                .addStringOption(opt => opt.setName('minecraft').setDescription('Minecraft username'))
                .addUserOption(opt => opt.setName('user').setDescription('Discord user'))
        )
        .addSubcommand(sub =>
            sub.setName('sync')
                .setDescription('Sync all members: grant Linked role & set nickname')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'linked') {
            console.log(`[Discord Linked] by ${interaction.user.tag}`);
            const mcName = interaction.options.getString('minecraft');
            const discordUser = interaction.options.getUser('user');
            if ((!mcName && !discordUser) || (mcName && discordUser)) {
                return interaction.reply({ content:'❌ Provide exactly one of `minecraft` or `user`.', ephemeral:true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                if (mcName) {
                    const uuid = await fetchUUIDFromPlayerDB(mcName);
                    const link = await postQuery(process.env.DISCORD_LINK_API, [uuid]);
                    if (!link.discord) return interaction.editReply(`🔗 **${mcName}** is not linked.`);
                    console.log(`[Link] ${mcName} → <@${link.discord}>`);
                    return interaction.editReply(`🔗 **${mcName}** is linked to <@${link.discord}>`);
                } else {
                    const id = discordUser.id;
                    const link = await postQuery(process.env.DISCORD_LINK_API, [id]);
                    if (!link.uuid) return interaction.editReply(`🔗 <@${id}> is not linked.`);
                    const uname = await fetchUsernameFromPlayerDB(link.uuid);
                    console.log(`[Link] <@${id}> → ${uname}`);
                    return interaction.editReply(`🔗 <@${id}> is linked to **${uname}**`);
                }
            } catch (err) {
                console.error('[Discord Linked Error]', err);
                return interaction.editReply(`❌ Error: ${err.message}`);
            }
        }

        if (sub === 'sync') {
            console.log(`[Discord Sync] invoked by ${interaction.user.tag}`);
            if (!interaction.guild)
                return interaction.reply({ content:'❌ Only in servers.', ephemeral:true });
            if (interaction.user.id !== interaction.guild.ownerId)
                return interaction.reply({ content:'🚫 Only the server owner may run this.', ephemeral:true });
            await interaction.deferReply({ ephemeral: true });
            const members = await interaction.guild.members.fetch();
            let synced = 0;
            for (const m of members.values()) {
                if (m.user.bot) continue;
                try {
                    const link = await postQuery(process.env.DISCORD_LINK_API, [m.id]);
                    if (!link.uuid) continue;
                    await m.roles.add(process.env.LINKED_ROLE_ID);
                    const uname = await fetchUsernameFromPlayerDB(link.uuid);
                    await m.setNickname(uname);
                    synced++;
                    console.log(`[Sync] ${m.user.tag} → ${uname}`);
                } catch (e) {
                    console.error('[Sync Error]', m.user.tag, e);
                }
            }
            return interaction.editReply(`✅ Synced ${synced} members.`);
        }
    }
};