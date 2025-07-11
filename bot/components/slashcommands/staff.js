// src/commands/staff.js
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder }        from 'discord.js';
import axios                   from 'axios';
import fs                      from 'fs';
import path                    from 'path';
import { fileURLToPath }       from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const data = new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff-related commands')
    .addSubcommand(sub =>
        sub
            .setName('online')
            .setDescription('Show which staff members are currently online')
    )
    .addSubcommand(sub =>
        sub
            .setName('lastonline')
            .setDescription('List staff sorted by last online')
            .addIntegerOption(opt =>
                opt
                    .setName('count')
                    .setDescription('Number of staff to show')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt
                    .setName('order')
                    .setDescription('Sort order (SQL style)')
                    .setRequired(false)
                    .addChoices(
                        { name: 'ASC',  value: 'ASC' },
                        { name: 'DESC', value: 'DESC' }
                    )
            )
    );

export async function execute(interaction) {
    await interaction.deferReply();

    // Load staff identifiers
    const staffFile = path.join(__dirname, '../../utils/staff.txt');
    let identifiers;
    try {
        identifiers = fs
            .readFileSync(staffFile, 'utf8')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (err) {
        console.error('Failed to read staff.txt:', err);
        return interaction.editReply('❌ Could not load the staff list.');
    }

    // Fetch staff data
    let players = [];
    try {
        const res = await axios.post(
            process.env.PLAYERS_API || 'https://api.earthpol.com/astra/players',
            { query: identifiers }
        );
        players = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('EarthPol API error:', err);
        return interaction.editReply('❌ Failed to fetch staff data.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'online') {
        const online = players.filter(p => p.status?.isOnline);
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Online Staff')
            .setColor(online.length ? 0x00ff00 : 0x888888)
            .setDescription(
                online.length
                    ? online.map(p => `• ${p.name}`).join('\n')
                    : 'No staff online at the moment.'
            )
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    // /staff lastonline
    if (sub === 'lastonline') {
        const count = interaction.options.getInteger('count');
        const order = (interaction.options.getString('order') || 'DESC').toUpperCase();

        // Sort by lastOnline
        const sorted = players
            .slice()
            .sort((a, b) => {
                const aTime = a.timestamps?.lastOnline || 0;
                const bTime = b.timestamps?.lastOnline || 0;
                return order === 'ASC' ? aTime - bTime : bTime - aTime;
            })
            .slice(0, count);

        const description = sorted
            .map(p => {
                const ts = p.timestamps?.lastOnline;
                const date = ts ? new Date(ts).toLocaleString() : 'Unknown';
                return `• ${p.name} — Last: ${date}`;
            })
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`🕒 Staff LastOnline (${order} LIMIT ${count})`)
            .setColor(0x0099ff)
            .setDescription(description || 'No data available.')
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
}
