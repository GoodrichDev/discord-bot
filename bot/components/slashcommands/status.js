// bot/components/slashcommands/status.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show current server status'),

    async execute(interaction) {
        await interaction.deferReply();
        try {
            // 1) fetch status
            const { data } = await axios.get('https://api.earthpol.com/astra/');
            const { version, moonPhase, time: timeObj, status, stats } = data;
            const {
                newDayTime,
                serverTimeOfDay,
                stormDuration,
                thunderDuration,
                time: tickTime,
                eraDate,
                eraDay
            } = timeObj;

            // 2) helper to format seconds → “Xh Ym Zs”
            const formatDuration = secs => {
                const h = Math.floor(secs / 3600);
                const m = Math.floor((secs % 3600) / 60);
                const s = secs % 60;
                return [h ? `${h}h` : null, m ? `${m}m` : null, `${s}s`]
                    .filter(Boolean)
                    .join(' ');
            };

            // helper to turn ticks into human
            const formatTicks = ticks => {
                const secs = Math.floor(ticks / 20);
                return formatDuration(secs);
            };

            // 3) time until next Towny day (in seconds)
            const nextDaySecs = newDayTime - serverTimeOfDay;

            // 4) classify part of day by elapsed ticks
            let timeOfDay;
            if (tickTime < 6000) {
                timeOfDay = 'Morning';
            } else if (tickTime < 12000) {
                timeOfDay = 'Noon';
            } else if (tickTime < 18000) {
                timeOfDay = 'Afternoon';
            } else {
                timeOfDay = 'Night';
            }

            // 5) weather icon & duration (ticks)
            let weatherLabel, weatherIcon, weatherDurTicks;
            if (status.isThundering) {
                weatherLabel    = 'Thunderstorm';
                weatherIcon     = 'thunderstorm.png';
                weatherDurTicks = thunderDuration;
            } else if (status.hasStorm) {
                weatherLabel    = 'Storm';
                weatherIcon     = 'rain.png';
                weatherDurTicks = stormDuration;
            } else {
                weatherLabel    = 'Clear';
                weatherIcon     = 'sun.png';
                weatherDurTicks = null;
            }

            // 6) icon URLs
            const moonUrl    = `https://goodrich.dev/bot/img/moon_phase/${moonPhase}.png`;
            const weatherUrl = `https://goodrich.dev/bot/img/weather/${weatherIcon}`;

            // 7) build embed
            const embed = new EmbedBuilder()
                .setTitle('🌐 Server Status')
                .setColor(0x1ABC9C)
                .setThumbnail(moonUrl)
                .addFields(
                    { name: 'Version',               value: version,                                            inline: true },
                    {
                        name: 'Time of Day',
                        value: `${timeOfDay} (${formatTicks(24000 - tickTime)})`,
                        inline: true
                    },
                    { name: 'Era Time',              value: `${eraDate} (Day ${eraDay})`,                        inline: true },
                    { name: 'Towny Day In',     value: formatDuration(nextDaySecs),                          inline: true },
                    { name: 'Players Online',        value: `${stats.numOnlinePlayers}/${stats.maxPlayers}`,      inline: true },
                    { name: 'Residents',             value: `${stats.numResidents}`,                               inline: true },
                    { name: 'Towns',                 value: `${stats.numTowns}`,                                   inline: true },
                    { name: 'Nations',               value: `${stats.numNations}`,                                 inline: true },
                    { name: 'Mob Spawning',          value: status.mobSpawning ? 'On' : 'Off',                     inline: true }
                );

            // 8) storm/thunder duration if any
            if (weatherDurTicks != null) {
                embed.addFields(
                    {
                        name: `${weatherLabel} Duration`,
                        value: formatTicks(weatherDurTicks),
                        inline: true
                    }
                );
            }

            // 9) footer with weather icon
            embed.setFooter({
                text: weatherLabel,
                iconURL: weatherUrl
            }).setTimestamp();

            // 10) reply
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('[Status] fetch error', err);
            await interaction.editReply('❌ Could not fetch server status right now.');
        }
    }
};
