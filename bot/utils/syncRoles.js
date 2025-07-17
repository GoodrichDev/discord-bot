// bot/utils/syncRoles.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { notifyOwnerOfError } = require('../utils/notifyOwner');

// Environment config
const NATIONS_API      = process.env.NATIONS_API;
const DISCORD_API      = process.env.DISCORD_LINK_API;
const PLAYERS_API      = process.env.PLAYERS_API;
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 10 * 60 * 1000;

// Helper: normalize a 32‑char hex to dashed UUID
function normalizeUuid(id) {
    if (typeof id !== 'string') return id;
    if (id.includes('-')) return id;
    const m = id.match(
        /^([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})$/
    );
    return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : id;
}

// Read all guild config files under bot/guilds → always returns an array
function loadAllConfigs() {
    const dir = path.join(__dirname, '../guilds');
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const guildId = f.replace(/\.json$/, '');
            const cfg     = JSON.parse(
                fs.readFileSync(path.join(dir, f), 'utf8')
            );
            return { guildId, config: cfg };
        });
}

async function fetchNationData(uuid) {
    const res = await axios.post(NATIONS_API, { query: [uuid] });
    return res.data[0];
}

async function fetchDiscordMapping(dId) {
    const res = await axios.post(DISCORD_API, { query: [dId] });
    return res.data.uuid || null;
}

async function fetchPlayerNationUuid(mUuid) {
    const res = await axios.post(PLAYERS_API, { query: [mUuid] });
    const p   = res.data[0] || {};
    return p.status?.hasNation ? p.nation?.uuid : null;
}

async function syncRoles(client) {
    const entries = loadAllConfigs();
    console.log(
        `\n[${new Date().toISOString()}] Syncing roles for ${
            entries.length
        } guild(s)…`
    );

    for (const { guildId, config } of entries) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            console.warn(`• Skipping ${guildId}: guild not found in cache`);
            continue;
        }

        console.log(`→ Guild ${guildId} config:`, config);

        if (!config.nation_uuid) {
            console.log(`  • Skipping: no nation_uuid set.`);
            continue;
        }

        let nation;
        try {
            nation = await fetchNationData(config.nation_uuid);
        } catch (err) {
            console.error(`  • Failed to fetch nation for ${guildId}:`, err);
            await notifyOwnerOfError(guild, client, err, { step: 'fetchNation' });
            continue;
        }

        const residentSet = new Set(nation.residents.map((r) => normalizeUuid(r.uuid)));
        const alliedSet   = new Set(nation.allies    .map((a) => normalizeUuid(a.uuid)));
        const enemySet    = new Set(nation.enemies  .map((e) => normalizeUuid(e.uuid)));

        await guild.members.fetch();

        // granular sync + owner notification on *each* role failure
        async function syncOne(member, roleId, shouldHave, label) {
            if (!roleId) return;
            const has = member.roles.cache.has(roleId);
            if (has === shouldHave) return;
            try {
                if (shouldHave) {
                    console.log(`    ↳ Adding ${label} to ${member.user.tag}`);
                    await member.roles.add(roleId);
                } else {
                    console.log(`    ↳ Removing ${label} from ${member.user.tag}`);
                    await member.roles.remove(roleId);
                }
            } catch (err) {
                console.error(
                    `❌ [${guildId}] Role sync error (${label}) for ${member.user.tag}:`,
                    err
                );
                await notifyOwnerOfError(
                    guild,
                    client,
                    err,
                    { action: `${shouldHave ? 'add' : 'remove'} ${label}`, member: member.user.tag, roleId }
                );
            }
        }

        // loop members
        for (const member of guild.members.cache.values()) {
            if (member.user.bot) continue;

            // fetch link & determine linked state
            const rawUuid   = await fetchDiscordMapping(member.id).catch(() => null);
            const mUuid     = normalizeUuid(rawUuid);
            const isLinked  = Boolean(mUuid);

            await syncOne(member, config.role_linked_id, isLinked, 'Linked');
            if (!isLinked) {
                // strip nation roles
                for (const rid of [
                    config.role_citizen_id,
                    config.role_allied_id,
                    config.role_enemy_id
                ]) {
                    await syncOne(member, rid, false, 'NationRole');
                }
                continue;
            }

            // fetch player's nation
            const theirUuid = normalizeUuid(
                await fetchPlayerNationUuid(mUuid).catch(() => null)
            );

            // decide
            const shouldCitizen = config.role_citizen_id && residentSet.has(mUuid);
            const shouldAllied  = config.role_allied_id   && alliedSet.has(theirUuid);
            const shouldEnemy   = config.role_enemy_id    && enemySet.has(theirUuid);

            await syncOne(member, config.role_citizen_id, shouldCitizen, 'Citizen');
            await syncOne(member, config.role_allied_id,  shouldAllied,  'Allied');
            await syncOne(member, config.role_enemy_id,   shouldEnemy,   'Enemy');
        }
    }

    console.log(`[${new Date().toISOString()}] Role sync complete.`);
}

function startScheduler(client) {
    syncRoles(client);
    setInterval(() => syncRoles(client), SYNC_INTERVAL_MS);
}

module.exports = { startScheduler, syncRoles };
