// bot/components/slashcommands/toolkit.js
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder }        from 'discord.js';
import fs                      from 'fs';
import path                    from 'path';
import axios                   from 'axios';
import { fileURLToPath }       from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const GUILDS_DIR = path.join(__dirname, '../../guilds');

// Helpers to load/save per-guild config
function getConfigPath(guildId) {
    if (!fs.existsSync(GUILDS_DIR)) fs.mkdirSync(GUILDS_DIR, { recursive: true });
    return path.join(GUILDS_DIR, `${guildId}.json`);
}

function loadConfig(guildId) {
    const file = getConfigPath(guildId);
    if (!fs.existsSync(file)) {
        return {
            nation_uuid: null,
            role_citizen_id: null,
            role_allied_id: null,
            role_enemy_id: null,
            role_linked_id: null,
            toolkit_admins: { roles: [], users: [] }
        };
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveConfig(guildId, config) {
    fs.writeFileSync(getConfigPath(guildId), JSON.stringify(config, null, 2));
}

function extractId(input) {
    const match = input.match(/^(?:<@&)?(\d+)>?$/);
    return match ? match[1] : input;
}

// Slash command definition
export const data = new SlashCommandBuilder()
    .setName('toolkit')
    .setDescription('Configure guild-specific settings')
    // /toolkit set nation|role ...
    .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(opt => opt
            .setName('key')
            .setDescription('What to set')
            .setRequired(true)
            .addChoices(
                { name: 'Nation',            value: 'nation'       },
                { name: 'Role: Citizen',     value: 'role_citizen' },
                { name: 'Role: Allied',      value: 'role_allied'  },
                { name: 'Role: Enemy',       value: 'role_enemy'   },
                { name: 'Role: Linked',      value: 'role_linked'  }
            ))
        .addStringOption(opt => opt
            .setName('value')
            .setDescription('Nation name or Role ID')
            .setRequired(true)))
    // /toolkit admin add|remove role|user <id>
    .addSubcommandGroup(group => group
        .setName('admin')
        .setDescription('Manage toolkit administrators')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a toolkit admin (role or user)')
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Role or User')
                .setRequired(true)
                .addChoices({ name: 'Role', value: 'role' }, { name: 'User', value: 'user' }))
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Role ID or User ID')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a toolkit admin')
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Role or User')
                .setRequired(true)
                .addChoices({ name: 'Role', value: 'role' }, { name: 'User', value: 'user' }))
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Role ID or User ID')
                .setRequired(true))))
;

// Command execution
export async function execute(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: '❌ This command must be used in a server.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const config  = loadConfig(guildId);

    // Permission check: server owner or toolkit_admins
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = config.toolkit_admins.users.includes(interaction.user.id)
        || member.roles.cache.some(r => config.toolkit_admins.roles.includes(r.id));
    if (!isOwner && !isAdmin) {
        return interaction.editReply('❌ You do not have permission to use this command.');
    }

    const sub   = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    // /toolkit set
    if (sub === 'set') {
        const key   = interaction.options.getString('key');
        const value = interaction.options.getString('value');

        if (key === 'nation') {
            // fetch all nations to match
            let allNations;
            try {
                const res = await axios.get(process.env.NATIONS_API);
                allNations = res.data;
            } catch (err) {
                console.error('Failed to fetch nation list:', err);
                return interaction.editReply('❌ Could not retrieve list of nations.');
            }
            // try exact or uuid match
            let nation = allNations.find(n => n.name.toLowerCase() === value.toLowerCase());
            if (!nation) nation = allNations.find(n => n.uuid.toLowerCase() === value.toLowerCase());
            if (!nation) {
                // suggest containing matches
                const suggestions = allNations
                    .filter(n => n.name.toLowerCase().includes(value.toLowerCase()))
                    .map(n => n.name);
                const sugText = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '';
                return interaction.editReply(`❌ Could not find nation "${value}".${sugText}`);
            }
            config.nation_uuid = nation.uuid;
            saveConfig(guildId, config);
            return interaction.editReply(`✅ Nation set to **${nation.name}** (${nation.uuid}).`);
        }

        // role settings
        const mapping = {
            role_citizen: 'role_citizen_id',
            role_allied : 'role_allied_id',
            role_enemy  : 'role_enemy_id',
            role_linked : 'role_linked_id'
        };
        if (mapping[key]) {
            const id = extractId(value);
            config[mapping[key]] = id;
            saveConfig(guildId, config);
            return interaction.editReply(`✅ **${key}** set to <@&${id}>.`);
        }
    }

    // /toolkit admin add/remove
    if (group === 'admin') {
        const act  = sub; // 'add' or 'remove'
        const type = interaction.options.getString('type');
        let   id   = interaction.options.getString('id');
        id = extractId(id);
        const list = config.toolkit_admins[type === 'role' ? 'roles' : 'users'];

        if (act === 'add') {
            if (!list.includes(id)) list.push(id);
            saveConfig(guildId, config);
            return interaction.editReply(`✅ Added ${type} \`${id}\` to toolkit admins.`);
        } else {
            config.toolkit_admins[type === 'role' ? 'roles' : 'users'] = list.filter(x => x !== id);
            saveConfig(guildId, config);
            return interaction.editReply(`✅ Removed ${type} \`${id}\` from toolkit admins.`);
        }
    }

    return interaction.editReply('❌ Unknown subcommand.');
}
