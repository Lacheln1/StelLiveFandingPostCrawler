import fs from "fs";
import path from "path";

export class GuildConfig {
    constructor(filePath) {
        this.filePath = filePath || path.join(process.cwd(), "guilds.json");
        this.guilds = {};
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, "utf-8");
                this.guilds = JSON.parse(data);
                console.log(`길드 설정 로드 완료: ${Object.keys(this.guilds).length}개 서버`);
            }
        } catch (error) {
            console.error("길드 설정 로드 실패:", error.message);
            this.guilds = {};
        }
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.guilds, null, 2), "utf-8");
        } catch (error) {
            console.error("길드 설정 저장 실패:", error.message);
        }
    }

    setChannel(guildId, channelId) {
        this.guilds[guildId] = channelId;
        this.save();
    }

    removeGuild(guildId) {
        delete this.guilds[guildId];
        this.save();
    }

    getChannel(guildId) {
        return this.guilds[guildId] || null;
    }

    getAllChannelIds() {
        return Object.values(this.guilds);
    }

    getAllGuildChannels() {
        return { ...this.guilds };
    }

    getGuildIdByChannel(channelId) {
        return Object.keys(this.guilds).find((guildId) => this.guilds[guildId] === channelId) || null;
    }
}
