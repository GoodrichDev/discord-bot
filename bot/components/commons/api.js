const axios = require('axios');
module.exports = {
    postQuery: async (url, query) => {
        const { data } = await axios.post(url, { query });
        return data;
    },
    fetchUUIDFromPlayerDB: async username => {
        const res = await axios.get(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`);
        if (!res.data.success) throw new Error('Minecraft user not found');
        return res.data.data.player.id;
    },
    fetchUsernameFromPlayerDB: async uuid => {
        const res = await axios.get(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(uuid)}`);
        if (!res.data.success) throw new Error('UUID not found');
        return res.data.data.player.username;
    }
};