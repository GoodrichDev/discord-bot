const fs   = require('fs');
const path = require('path');

/**
 * DM the guild owner about an error, but no more often than every 5 days.
 */
async function notifyOwnerOfError(guild, client, error, context = {}) {
    const DATA_DIR = path.join(__dirname, '../.notify');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    const file = path.join(DATA_DIR, `${guild.id}.json`);
    let state = { lastNotified: 0 };
    if (fs.existsSync(file)) {
        try { state = JSON.parse(fs.readFileSync(file,'utf8')); }
        catch {}
    }

    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - state.lastNotified < FIVE_DAYS) return;

    const ownerId = guild.ownerId;
    let owner;
    try {
        owner = await client.users.fetch(ownerId);
    } catch {
        console.warn(`⚠️ Cannot fetch owner ${ownerId} of guild ${guild.id}`);
        return;
    }

    const header = `🚨 **Toolkit Sync Error** in **${guild.name}**`;
    const body = [
        header,
        `\`\`\`js\n${error.message || error}\n\`\`\``,
        `Step: ${context.step || context.action || 'unknown'}`,
        context.member ? `Member: ${context.member}` : null,
        context.roleId ? `Role ID: ${context.roleId}` : null,
        `Time: <t:${Math.floor(now/1000)}:F>`
    ]
        .filter(Boolean)
        .join('\n');

    try {
        await owner.send(body);
        state.lastNotified = now;
        fs.writeFileSync(file, JSON.stringify(state, null, 2));
        console.log(`✉️  Notified owner of ${guild.id} about error.`);
    } catch (dmErr) {
        console.error(`❌ Failed to DM owner ${ownerId}:`, dmErr);
    }
}

module.exports = { notifyOwnerOfError };
