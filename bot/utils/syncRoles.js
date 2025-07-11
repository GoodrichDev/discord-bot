// bot/utils/syncRoles.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

// Environment config
const NATIONS_API     = process.env.NATIONS_API;
const DISCORD_API     = process.env.DISCORD_LINK_API;
const PLAYERS_API     = process.env.PLAYERS_API;
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS, 10) || 10 * 60 * 1000;

// Helper: normalize 32-char hex to dashed UUID
function normalizeUuid(id) {
    if (typeof id !== 'string') return id;
    if (id.includes('-')) return id;
    const m = id.match(/^([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : id;
}

// Read all guild config files under bot/guilds
function loadAllConfigs() {
    const dir = path.join(__dirname, '../guilds');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const guildId = f.replace(/\.json$/, '');
            const cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            return { guildId, config: cfg };
        });
}

// Fetch full nation data by UUID
async function fetchNationData(nationUuid) {
    const res = await axios.post(NATIONS_API, { query: [nationUuid] });
    return res.data[0];
}

// Fetch Minecraft UUID by Discord ID
async function fetchDiscordMapping(discordId) {
    const res = await axios.post(DISCORD_API,  { query: [discordId] });
    return res.data.uuid || null;
}

// Fetch player's nation UUID by Minecraft UUID
async function fetchPlayerNationUuid(playerUuid) {
    const res = await axios.post(PLAYERS_API, { query: [playerUuid] });
    const player = res.data[0] || {};
    return (player.status?.hasNation && player.nation?.uuid) ? player.nation.uuid : null;
}

// Core: sync roles for every guild in config
async function syncRoles(client) {
    const entries = loadAllConfigs();
    console.log(`\n[${new Date().toISOString()}] Syncing roles for ${entries.length} guild(s)...`);

    for (const { guildId, config } of entries) {
        try {
            console.log(`→ Guild ${guildId} config:`, config);
            const { nation_uuid, role_citizen_id, role_allied_id, role_enemy_id, role_linked_id } = config;
            if (!nation_uuid) {
                console.log(`  • Skipping ${guildId}: no nation_uuid set.`);
                continue;
            }
            // 1) fetch nation data
            const nation = await fetchNationData(nation_uuid);
            const residentSet = new Set(nation.residents.map(r => normalizeUuid(r.uuid)));
            const alliedSet   = new Set(nation.allies.map(a => normalizeUuid(a.uuid)));
            const enemySet    = new Set(nation.enemies.map(e => normalizeUuid(e.uuid)));

            // 2) fetch guild & members
            const guild = await client.guilds.fetch(guildId);
            await guild.members.fetch();
            console.log(`  • Fetched ${guild.memberCount} members`);

            // 3) loop members
            for (const member of guild.members.cache.values()) {
                if (member.user.bot) continue;

                // lookup link
                const discordUuid = await fetchDiscordMapping(member.id).catch(() => null);
                const playerUuid  = normalizeUuid(discordUuid);
                const isLinked    = Boolean(playerUuid);

                // linked role sync
                if (role_linked_id) {
                    const hasLinked = member.roles.cache.has(role_linked_id);
                    if (isLinked && !hasLinked) {
                        console.log(`    → Adding Linked role to ${member.user.tag}`);
                        await member.roles.add(role_linked_id).catch(console.error);
                    } else if (!isLinked && hasLinked) {
                        console.log(`    → Removing Linked role from ${member.user.tag}`);
                        await member.roles.remove(role_linked_id).catch(console.error);
                    }
                }

                if (!isLinked) {
                    // if unlinked, remove all nation roles
                    [role_citizen_id, role_allied_id, role_enemy_id].forEach(async r => {
                        if (r && member.roles.cache.has(r)) {
                            console.log(`    → Removing ${r} from ${member.user.tag}`);
                            await member.roles.remove(r).catch(console.error);
                        }
                    });
                    continue;
                }

                // fetch player nation
                const playerNation = await fetchPlayerNationUuid(playerUuid).catch(() => null);
                const theirUuid     = normalizeUuid(playerNation);

                // decide which roles they should have
                const shouldCitizen = role_citizen_id && residentSet.has(playerUuid);
                const shouldAllied  = role_allied_id   && alliedSet.has(theirUuid);
                const shouldEnemy   = role_enemy_id    && enemySet.has(theirUuid);

                // sync a given role
                async function syncOne(roleId, shouldHave, label) {
                    if (!roleId) return;
                    const has = member.roles.cache.has(roleId);
                    if (shouldHave && !has) {
                        console.log(`    → Adding ${label} to ${member.user.tag}`);
                        await member.roles.add(roleId).catch(console.error);
                    } else if (!shouldHave && has) {
                        console.log(`    → Removing ${label} from ${member.user.tag}`);
                        await member.roles.remove(roleId).catch(console.error);
                    }
                }

                await syncOne(role_citizen_id, shouldCitizen, 'Citizen');
                await syncOne(role_allied_id,  shouldAllied,  'Allied');
                await syncOne(role_enemy_id,   shouldEnemy,   'Enemy');
            }
        } catch (e) {
            console.error(`Error syncing guild ${guildId}:`, e);
        }
    }
    console.log(`[${new Date().toISOString()}] Role sync complete.`);
}

// Scheduler
function startScheduler(client) {
    // initial run
    syncRoles(client);
    // schedule
    setInterval(() => syncRoles(client), SYNC_INTERVAL_MS);
}

module.exports = { startScheduler, syncRoles };
