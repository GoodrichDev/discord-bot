const { postQuery, fetchUsernameFromPlayerDB } = require('../components/commons/api');
module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        if (member.user.bot) return;
        try {
            const link = await postQuery(process.env.DISCORD_LINK_API, [member.id]);
            if (!link.uuid) return;
            await member.roles.add(process.env.LINKED_ROLE_ID);
            const username = await fetchUsernameFromPlayerDB(link.uuid);
            await member.setNickname(username);
            console.log(`[Event] Auto-linked ${member.user.tag} as ${username}`);
        } catch (err) {
            console.error(`[Event] guildMemberAdd error for ${member.user.tag}:`, err);
        }
    }
};