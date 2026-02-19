/**
 * GuildConfig - AppDatabase의 Guild 관련 메서드를 감싸는 Facade 클래스
 *
 * 과거 JSON 파일(guilds.json) 기반 시절의 인터페이스를 유지하면서
 * 내부 구현을 SQLite(AppDatabase)로 위임합니다.
 * discord.js가 DB 구현 세부사항을 알 필요 없이 이 클래스만 참조합니다.
 */
export class GuildConfig {
    constructor(db) {
        this.db = db;
    }

    load() {
        // no-op: 과거 guilds.json 파일을 읽던 메서드입니다.
        // SQLite 전환 후 별도 로드가 필요 없지만, 호출 코드(discord.js)를 수정하지
        // 않아도 되도록 빈 메서드로 유지합니다.
    }

    save() {
        // no-op: 과거 guilds.json 파일에 저장하던 메서드입니다.
        // SQLite는 각 쓰기 시점에 즉시 반영되므로 별도 저장 호출이 불필요합니다.
        // 하위 호환성을 위해 빈 메서드로 유지합니다.
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
