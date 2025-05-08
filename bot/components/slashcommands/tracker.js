// bot/components/slashcommands/tracker.js
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { postQuery } = require('../commons/api');


// ─── load blacklist of hidden player names (one per line) ─────────────────
const hiddenPlayers = fs
    .readFileSync(path.join(__dirname, '../../utils/hiddenplayers.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);
const hiddenSet = new Set(hiddenPlayers);


module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Track online players on the live map')
        .addBooleanOption(opt =>
            opt.setName('inwilderness')
                .setDescription('Only show players in wilderness (true) or in towns (false)')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const wantWilderness = interaction.options.getBoolean('inwilderness');

        // 1) fetch live player list
        let players;
        try {
            const res = await axios.get('https://earthpol.com/map/maps/world/live/players.json');
            players = res.data.players;
        } catch (err) {
            console.error('[Tracker] failed fetch live players', err);
            return interaction.editReply('❌ Could not fetch live player data.');
        }

        if (!players?.length) {
            return interaction.editReply('ℹ️ No players visible on the live map right now.');
        }

        // 2) build rounded coords & POST to location API
        const coords = players.map(p => [
            Math.round(p.position.x),
            Math.round(p.position.z)
        ]);

        let locData;
        try {
            locData = await postQuery(process.env.LOCATION_API, coords);
        } catch (err) {
            console.error('[Tracker] failed fetch locations', err);
            return interaction.editReply('❌ Could not resolve player locations.');
        }

        // 3) pair & filter by wilderness + blacklist
        const entries = players
            .map((p, i) => {
                const x   = coords[i][0], z = coords[i][1];
                const rec = locData[i] || {};
                return {
                    name: p.name,
                    x, z,
                    isW: rec.isWilderness,
                    town: rec.town?.name,
                    nation: rec.nation?.name
                };
            })
            .filter(e =>
                // only those in desired zone
                e.isW === wantWilderness &&
                // and NOT in the hidden list
                !hiddenSet.has(e.name.toLowerCase())
            );

        if (!entries.length) {
            return interaction.editReply(
                `🔍 No players ${wantWilderness ? 'in wilderness' : 'in towns'} right now.`
            );
        }

        // 4) build the embed
        const embed = new EmbedBuilder()
            .setTitle(`Players ${wantWilderness ? 'in Wilderness' : 'in Towns'}`)
            .setColor(wantWilderness ? 0xFF4500 : 0x1ABC9C)
            .setTimestamp();

        for (const e of entries) {
            const locLine = wantWilderness
                ? 'Wilderness'
                : `Town: ${e.town ?? '—'}, Nation: ${e.nation ?? '—'}`;
            const mapUrl = `https://earthpol.com/map/#world:${e.x}:65:${e.z}:5:0:0:0:0:perspective`;

            embed.addFields({
                name: e.name,
                value:
                    `X: ${e.x}, Z: ${e.z}\n` +
                    `${locLine}\n` +
                    `[View on Map](${mapUrl})`,
                inline: false
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
