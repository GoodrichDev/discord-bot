// bot/components/slashcommands/shop.js
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { postQuery } = require('../commons/api');

const materials = fs
    .readFileSync(path.join(__dirname, '../../utils/materials.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(line => {
        const m = line.trim().match(/^"(.+?)",?$/);
        return m ? m[1].toUpperCase() : null;
    })
    .filter(Boolean);

// ----- preload owner lists -----
let ownerNames = [], ownerUUIDs = [];
(async () => {
    try {
        const { data: shops } = await axios.get(process.env.SHOP_API);
        ownerUUIDs = Array.from(new Set(shops.map(s => s.owner)));
        const players = await postQuery(process.env.PLAYERS_API, ownerUUIDs);
        ownerNames   = players.map(p => p.name);
        console.log(`[Shop] Loaded ${ownerNames.length} owners`);
    } catch (err) {
        console.error('[Shop] Failed to preload owners:', err);
    }
})();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Shop-related commands')
        .addSubcommand(sub =>
            sub.setName('find')
                .setDescription('Find shops selling an item')
                .addStringOption(opt =>
                    opt.setName('item')
                        .setDescription('Item to search for')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all shops, 3 per page')
        )
        .addSubcommand(sub =>
            sub.setName('owner')
                .setDescription('List shops by owner')
                .addStringOption(opt =>
                    opt.setName('owner')
                        .setDescription('Owner name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    // ─── When the user runs /shop … ────────────────────────────────────────────
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        const fetchAll = async () => (await axios.get(process.env.SHOP_API)).data;
        const buildEmbed = (pageslice, pageTitle) => {
            const e = new EmbedBuilder().setTitle(pageTitle).setColor(0x1ABC9C);
            for (const d of pageslice) {
                const item = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const price = `${d.price}G`;
                e.addFields(
                    { name: `Shop #${d.id}`, value: `**${item}**`, inline: true },
                    { name: 'Price',         value: `**${price}**`, inline: true },
                    { name: '\u200B',        value: '─────────────',   inline: false }
                );
            }
            return e;
        };

        // ─── /shop find ─────────────────────────────────────────────────────────
        if (sub === 'find') {
            const query = interaction.options.getString('item', true).toUpperCase();
            const all   = await fetchAll();
            const matched = all
                .filter(s => s.item.toUpperCase().includes(query))
                .sort((a, b) => b.price - a.price);

            if (!matched.length) {
                return interaction.editReply(`🔍 No shops found for \`${query}\`.`);
            }

            const ids     = matched.map(s => s.id);
            const details = await postQuery(process.env.SHOP_API,    ids.map(String));
            const coords  = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs    = await postQuery(process.env.LOCATION_API, coords);
            const owners  = await postQuery(process.env.PLAYERS_API,   details.map(d => d.owner));

            const embed = new EmbedBuilder()
                .setTitle(`Shops selling \`${query}\``)
                .setColor(0x1ABC9C)
                .setFooter({ text: process.env.TOOLKIT_FOOTER || '' });

            for (const d of details) {
                const item   = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const price  = `${d.price}G`;
                const locRec = locs.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};
                const parts  = [];
                if (locRec.town )   parts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation)  parts.push(`Nation: ${locRec.nation.name}`);
                const owner = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                parts.push(`Owner: ${owner}`);

                embed.addFields(
                    { name: `Shop #${d.id}`,  value: `**${item}**`,                inline: true },
                    { name: 'Price',          value: `**${price}**`,               inline: true },
                    { name: 'Details',        value: parts.join(', '),             inline: false },
                    { name: 'Location',       value: `X:${Math.floor(d.location.x)}, Z:${Math.floor(d.location.z)}`, inline:false },
                    { name: '\u200B',         value: '─────────────',                inline: false }
                );
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // ─── /shop list ─────────────────────────────────────────────────────────
        if (sub === 'list') {
            const all = await fetchAll();
            all.sort((a, b) => b.price - a.price);
            const pageSize = 3, page = 0;
            const slice = all.slice(page * pageSize, page * pageSize + pageSize);

            const embed = buildEmbed(slice, `Shop List (page ${page+1})`);
            const row   = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_list_prev_${page}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_list_next_${page}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(all.length <= (page+1)*pageSize)
            );

            return interaction.editReply({ embeds:[embed], components:[row] });
        }

        // ─── /shop owner ────────────────────────────────────────────────────────
        if (sub === 'owner') {
            const name = interaction.options.getString('owner', true);
            const idx  = ownerNames.indexOf(name);
            if (idx < 0) {
                return interaction.editReply(`🔍 No owner named **${name}**.`);
            }

            const uuid     = ownerUUIDs[idx];
            const all      = await fetchAll();
            const filtered = all.filter(s => s.owner === uuid).sort((a,b)=>b.price-a.price);

            if (!filtered.length) {
                return interaction.editReply(`🔍 **${name}** has no shops.`);
            }

            const pageSize = 3, page = 0;
            const slice    = filtered.slice(page * pageSize, page * pageSize + pageSize);
            const embed    = buildEmbed(slice, `Shops by ${name} (page ${page+1})`);
            const row      = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_owner_prev_${uuid}_${page}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_owner_next_${uuid}_${page}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(filtered.length <= (page+1)*pageSize)
            );

            return interaction.editReply({ embeds:[embed], components:[row] });
        }
    },

    // ─── Autocomplete handler ────────────────────────────────────────────────
    async autocomplete(interaction) {
        const sub     = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toUpperCase();

        if (sub === 'find') {
            const choices = materials
                .filter(i => i.startsWith(focused))
                .slice(0, 25)
                .map(i => ({ name: i, value: i }));
            return interaction.respond(choices);
        }

        if (sub === 'owner') {
            const choices = ownerNames
                .filter(n => n.toUpperCase().startsWith(focused))
                .slice(0, 25)
                .map(n => ({ name: n, value: n }));
            return interaction.respond(choices);
        }
    }
};

// ─── EXPORT the two arrays so other modules can require them ───
module.exports.ownerNames  = ownerNames;
module.exports.ownerUUIDs  = ownerUUIDs;
