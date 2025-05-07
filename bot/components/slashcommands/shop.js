const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const axios = require('axios');
const { postQuery } = require('../commons/api');

// ─── preload owner names once on startup ─────────────────────────────────────
let ownerNames = [];
let ownerUUIDs = [];
(async () => {
    try {
        const { data: shops } = await axios.get(process.env.SHOP_API);
        ownerUUIDs = Array.from(new Set(shops.map(s => s.owner)));
        const players = await postQuery(process.env.PLAYERS_API, ownerUUIDs);
        ownerNames = players.map(p => p.name);
        console.log(`[Shop] Loaded ${ownerNames.length} owner names`);
    } catch (err) {
        console.error('[Shop] Failed to preload owners:', err);
    }
})();

// ─── command definition ──────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Shop-related commands')
        // FIND
        .addSubcommand(sub =>
            sub
                .setName('find')
                .setDescription('Find shops selling an item')
                .addStringOption(opt =>
                    opt
                        .setName('item')
                        .setDescription('Item to search for')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        // LIST
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List all shops, 3 per page')
        )
        // OWNER
        .addSubcommand(sub =>
            sub
                .setName('owner')
                .setDescription('List shops by owner')
                .addStringOption(opt =>
                    opt
                        .setName('owner')
                        .setDescription('Owner name')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // ─── FIND ───────────────────────────────
        if (sub === 'find') {
            const query = interaction.options.getString('item', true).toUpperCase();
            console.log(`[Shop Find] ${interaction.user.tag} → ${query}`);
            await interaction.deferReply();

            try {
                const { data: all } = await axios.get(process.env.SHOP_API);
                const matched = all
                    .filter(s => s.item.toUpperCase().includes(query))
                    .sort((a, b) => b.price - a.price);

                if (!matched.length) {
                    return interaction.editReply(`🔍 No shops found for \`${query}\`.`);
                }

                const ids       = matched.map(s => s.id);
                const details   = await postQuery(process.env.SHOP_API, ids.map(String));
                const coords    = details.map(d => [
                    Math.floor(d.location.x),
                    Math.floor(d.location.z)
                ]);
                const locations = await postQuery(process.env.LOCATION_API, coords);
                const owners    = await postQuery(process.env.PLAYERS_API, details.map(d => d.owner));

                const embed = new EmbedBuilder()
                    .setTitle(`Shops selling \`${query}\``)
                    .setColor(0x1ABC9C);

                for (const d of details) {
                    const itemDisplay = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                    const priceG      = `${d.price}G`;
                    const locRec      = locations.find(l =>
                        l.location.x === Math.floor(d.location.x) &&
                        l.location.z === Math.floor(d.location.z)
                    ) || {};

                    const detailParts = [];
                    if (locRec.town?.name)   detailParts.push(`Town: ${locRec.town.name}`);
                    if (locRec.nation?.name) detailParts.push(`Nation: ${locRec.nation.name}`);
                    const ownerName = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                    detailParts.push(`Owner: ${ownerName}`);

                    const x = Math.floor(d.location.x);
                    const z = Math.floor(d.location.z);

                    embed.addFields(
                        { name: `Shop #${d.id}`, value: `**${itemDisplay}**`,     inline: true },
                        { name: 'Price',         value: `**${priceG}**`,         inline: true },
                        { name: 'Details',       value: detailParts.join(', '),  inline: false },
                        { name: 'Location',      value: `X: ${x}, Z: ${z}`,      inline: false },
                        { name: '\u200b',        value: '─────────────',           inline: false }
                    );
                }

                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('[Shop Find Error]', err);
                return interaction.editReply(`❌ Error: ${err.message}`);
            }
        }

        // ─── LIST ───────────────────────────────
        if (sub === 'list') {
            await interaction.deferReply();
            const { data: shops } = await axios.get(process.env.SHOP_API);
            shops.sort((a, b) => b.price - a.price);

            const pageSize = 3;
            const page     = 0;
            const slice    = shops.slice(page * pageSize, page * pageSize + pageSize);
            const ids      = slice.map(s => s.id);

            // details, locations, owners for this page
            const details   = await postQuery(process.env.SHOP_API,     ids.map(String));
            const coords    = details.map(d => [ Math.floor(d.location.x), Math.floor(d.location.z) ]);
            const locations = await postQuery(process.env.LOCATION_API, coords);
            const owners    = await postQuery(process.env.PLAYERS_API,   details.map(d => d.owner));

            const embed = new EmbedBuilder()
                .setTitle(`Shop List (page ${page + 1})`)
                .setColor(0x1ABC9C);

            for (const d of details) {
                const itemDisplay = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const priceG      = `${d.price}G`;
                const locRec      = locations.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};

                const detailParts = [];
                if (locRec.town?.name)   detailParts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation?.name) detailParts.push(`Nation: ${locRec.nation.name}`);
                const ownerName = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                detailParts.push(`Owner: ${ownerName}`);

                const x = Math.floor(d.location.x);
                const z = Math.floor(d.location.z);

                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${itemDisplay}**`,     inline: true },
                    { name: 'Price',         value: `**${priceG}**`,         inline: true },
                    { name: 'Details',       value: detailParts.join(', '),  inline: false },
                    { name: 'Location',      value: `X: ${x}, Z: ${z}`,      inline: false },
                    { name: '\u200b',        value: '─────────────',           inline: false }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_list_prev_${page}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_list_next_${page}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(shops.length <= (page + 1) * pageSize)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        // ─── OWNER ──────────────────────────────
        if (sub === 'owner') {
            await interaction.deferReply();
            const ownerName = interaction.options.getString('owner', true);
            console.log(`[Shop Owner] ${interaction.user.tag} → ${ownerName}`);

            // fetch all shops, filter by owner UUID
            const { data: shops } = await axios.get(process.env.SHOP_API);
            const uuid = ownerUUIDs[ownerNames.indexOf(ownerName)];
            if (!uuid) {
                return interaction.editReply(`🔍 No owner named **${ownerName}**.`);
            }

            const filtered = shops
                .filter(s => s.owner === uuid)
                .sort((a, b) => b.price - a.price);

            if (!filtered.length) {
                return interaction.editReply(`🔍 **${ownerName}** has no shops.`);
            }

            // page 0
            const pageSize = 3;
            const page     = 0;
            const slice    = filtered.slice(page * pageSize, page * pageSize + pageSize);
            const ids      = slice.map(s => s.id);

            const details   = await postQuery(process.env.SHOP_API,     ids.map(String));
            const coords    = details.map(d => [ Math.floor(d.location.x), Math.floor(d.location.z) ]);
            const locations = await postQuery(process.env.LOCATION_API, coords);
            const owners    = await postQuery(process.env.PLAYERS_API,   details.map(d => d.owner));

            const embed = new EmbedBuilder()
                .setTitle(`Shops by ${ownerName} (page ${page + 1})`)
                .setColor(0x1ABC9C);

            for (const d of details) {
                const itemDisplay = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const priceG      = `${d.price}G`;
                const locRec      = locations.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};

                const detailParts = [];
                if (locRec.town?.name)   detailParts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation?.name) detailParts.push(`Nation: ${locRec.nation.name}`);
                detailParts.push(`Owner: ${ownerName}`);

                const x = Math.floor(d.location.x);
                const z = Math.floor(d.location.z);

                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${itemDisplay}**`,     inline: true },
                    { name: 'Price',         value: `**${priceG}**`,         inline: true },
                    { name: 'Details',       value: detailParts.join(', '),  inline: false },
                    { name: 'Location',      value: `X: ${x}, Z: ${z}`,      inline: false },
                    { name: '\u200b',        value: '─────────────',           inline: false }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_owner_prev_${uuid}_${page}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_owner_next_${uuid}_${page}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(filtered.length <= (page + 1) * pageSize)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        }
    },

    async autocomplete(interaction) {
        const sub = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused();

        if (sub === 'find') {
            // … your existing item autocomplete …
            return;
        }

        if (sub === 'owner') {
            const list = ownerNames
                .filter(name => name.toLowerCase().startsWith(focused.toLowerCase()))
                .slice(0, 25)
                .map(name => ({ name, value: name }));
            console.log(`[Autocomplete Owner] "${focused}" →`, list.map(x=>x.name));
            return interaction.respond(list);
        }
    }
};
