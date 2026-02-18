export class GuildConfig {
    constructor(db) {
        this.db = db;
    }

    load() {
        // no-op: DB 사용으로 불필요하지만 하위 호환용 유지
    }

    save() {
        // no-op: DB 사용으로 불필요하지만 하위 호환용 유지
    }

    setChannel(guildId, channelId) {
        this.db.setChannel(guildId, channelId);
    }

    removeGuild(guildId) {
        this.db.removeGuild(guildId);
    }

    getChannel(guildId) {
        return this.db.getChannel(guildId);
    }

    getAllChannelIds() {
        return this.db.getAllChannelIds();
    }

    getAllGuildChannels() {
        return this.db.getAllGuildChannels();
    }

    getGuildIdByChannel(channelId) {
        return this.db.getGuildIdByChannel(channelId);
    }
}
