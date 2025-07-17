const fs   = require('fs');
const path = require('path');

const GUILDS_DIR    = path.resolve(__dirname, '../guilds');
const NOTIFY_WINDOW = 5 * 24 * 60 * 60 * 1000; // 5 days

function getConfigPath(guildId) {
    // ensure directory
    if (!fs.existsSync(GUILDS_DIR)) {
        console.log(`[notifyOwner] Creating guilds directory at ${GUILDS_DIR}`);
        fs.mkdirSync(GUILDS_DIR, { recursive: true });
    }
    const file = path.join(GUILDS_DIR, `${guildId}.json`);
    console.log(`[notifyOwner] Config path for guild ${guildId} is ${file}`);
    return file;
}

function loadConfig(guildId) {
    const file = getConfigPath(guildId);
    if (!fs.existsSync(file)) {
        console.log(`[notifyOwner] No existing config for ${guildId}, returning empty object`);
        return {};
    }
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`[notifyOwner] Loaded config for ${guildId}:`, cfg);
    } catch (err) {
        console.error(`[notifyOwner] Error reading/parsing ${file}:`, err);
        cfg = {};
    }
    return cfg;
}

function saveConfig(guildId, config) {
    const file = getConfigPath(guildId);
    console.log(`[notifyOwner] Writing config for guild ${guildId} to ${file}:`, config);
    try {
        fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
        console.log(`[notifyOwner] Successfully saved config for ${guildId}`);
    } catch (err) {
        console.error(`[notifyOwner] Failed to save config for ${guildId}:`, err);
    }
}

async function notifyOwnerOfError(guild, client, error) {
    const cfg = loadConfig(guild.id);
    const now = Date.now();
    if (cfg.lastFailureNotified && (now - cfg.lastFailureNotified) < NOTIFY_WINDOW) {
        console.log(`[notifyOwner] Skipping notification for ${guild.id}, last sent ${(now - cfg.lastFailureNotified)/1000}s ago`);
        return;
    }

    const coreMsg = error.rawError?.message || error.message || 'Unknown error';
    console.log(`[notifyOwner] Core error: ${coreMsg}`);

    // ... build suggestions as before ...

    try {
        console.log(`[notifyOwner] Fetching owner for guild ${guild.id}`);
        const owner = await guild.fetchOwner();
        console.log(`[notifyOwner] DM’ing ${owner.user.tag}`);
        await owner.send(/* ... your DM content ... */);
        console.log(`[notifyOwner] DM sent to ${owner.user.tag}`);
    } catch (dmErr) {
        console.error(`[notifyOwner] Couldn’t DM owner of ${guild.id}:`, dmErr);
    }

    cfg.lastFailureNotified = now;
    saveConfig(guild.id, cfg);
}

module.exports = { notifyOwnerOfError };
