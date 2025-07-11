// bot/utils/syncRoles.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

// Environment config
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
    const res = await axios.post(process.env.NATIONS_API, { query: [nationUuid] });
    return res.data[0];
}

// Fetch Minecraft UUID by Discord ID
async function fetchDiscordMapping(discordId) {
    const res = await axios.post(process.env.NATIONS_API, { query: [discordId] });
    return res.data.uuid || null;
}

// Fetch player's nation UUID by Minecraft UUID
async function fetchPlayerNationUuid(playerUuid) {
    const res = await axios.post(process.env.PLAYERS_API, { query: [playerUuid] });
    const player = res.data[0] || {};
    return (player.status?.hasNation && player.nation?.uuid) ? player.nation.uuid : null;
}

// Core: sync roles for every guild in config
async function syncRoles(client) {
    const entries = loadAllConfigs();
    console.log(`\n[${new Date().toISOString()}] Syncing roles for ${entries.length} guild(s)...`);

    for (const { guildId, config } of entries) {
        try {
            // Require nation_uuid and at least one role
            const { nation_uuid, role_citizen_id, role_allied_id, role_enemy_id, role_linked_id } = config;
            if (!nation_uuid) continue;
            // 1) fetch nation
            const nation = await fetchNationData(nation_uuid);
            const residentSet = new Set(nation.residents.map(r => normalizeUuid(r.uuid)));
            const alliedSet   = new Set(nation.allies.map(a => normalizeUuid(a.uuid)));
            const enemySet    = new Set(nation.enemies.map(e => normalizeUuid(e.uuid)));

            // 2) fetch guild & members
            const guild = await client.guilds.fetch(guildId);
            await guild.members.fetch();

            // 3) loop members
            for (const member of guild.members.cache.values()) {
                if (member.user.bot) continue;

                const discordUuid = await fetchDiscordMapping(member.id).catch(() => null);
                const playerUuid = normalizeUuid(discordUuid);
                const isLinked = Boolean(playerUuid);

                // linked role
                if (role_linked_id) {
                    if (isLinked) member.roles.add(role_linked_id).catch(()=>{});
                    else          member.roles.remove(role_linked_id).catch(()=>{});
                }
                if (!isLinked) {
                    // remove all nation roles if not linked
                    [role_citizen_id, role_allied_id, role_enemy_id].forEach(r => r && member.roles.remove(r).catch(()=>{}));
                    continue;
                }

                // fetch player nation
                const playerNation = await fetchPlayerNationUuid(playerUuid).catch(() => null);
                const theirNationUuid = normalizeUuid(playerNation);

                // decide roles
                const shouldCitizen = role_citizen_id && residentSet.has(playerUuid);
                const shouldAllied  = role_allied_id   && alliedSet.has(theirNationUuid);
                const shouldEnemy   = role_enemy_id    && enemySet.has(theirNationUuid);

                // sync helper
                const syncOne = async (rid, doAdd) => {
                    if (!rid) return;
                    const has = member.roles.cache.has(rid);
                    if (doAdd && !has) await member.roles.add(rid).catch(()=>{});
                    if (!doAdd && has) await member.roles.remove(rid).catch(()=>{});
                };

                await syncOne(role_citizen_id, shouldCitizen);
                await syncOne(role_allied_id,  shouldAllied);
                await syncOne(role_enemy_id,   shouldEnemy);
            }
        } catch (e) {
            console.error(`Error syncing guild ${guildId}:`, e);
        }
    }
    console.log(`[${new Date().toISOString()}] Role sync complete.`);
}

// Scheduler
function startScheduler(client) {
    // initial runSYNC_INTERVAL_MS
    syncRoles(client);
    // schedule
    setInterval(() => syncRoles(client), SYNC_INTERVAL_MS);
}

module.exports = { startScheduler, syncRoles };
