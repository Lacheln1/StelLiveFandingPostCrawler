import "dotenv/config";
import fs from "fs";
import path from "path";
import { AppDatabase } from "./src/database.js";
import { Scheduler } from "./src/scheduler.js";
import { DiscordNotifier } from "./src/discord.js";
import { createServer } from "./src/server.js";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PORT = parseInt(process.env.PORT) || 3000;

if (!DISCORD_BOT_TOKEN) {
    console.error("DISCORD_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
    process.exit(1);
}

// DB 초기화
const dbPath = path.join(process.cwd(), "data", "bot.db");
const db = new AppDatabase(dbPath);

// guilds.json → DB 마이그레이션
const guildsJsonPath = path.join(process.cwd(), "guilds.json");
const guildsBackupPath = guildsJsonPath + ".bak";

if (fs.existsSync(guildsJsonPath) && !fs.existsSync(guildsBackupPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(guildsJsonPath, "utf-8"));
        let count = 0;
        for (const [guildId, channelId] of Object.entries(data)) {
            db.setChannel(guildId, channelId);
            count++;
        }
        fs.renameSync(guildsJsonPath, guildsBackupPath);
        console.log(`guilds.json 마이그레이션 완료: ${count}개 서버 이관`);
    } catch (error) {
        console.error("guilds.json 마이그레이션 실패:", error.message);
    }
}

const notifier = new DiscordNotifier(DISCORD_BOT_TOKEN, db);
const scheduler = new Scheduler(db);
let apiServer = null;

async function main() {
    console.log("══════════════════════════");
    console.log("StelLive fanding 크롤링 봇 ");
    console.log("══════════════════════════");

    try {
        await notifier.initialize();
        await scheduler.initialize(notifier);
        scheduler.start();

        apiServer = createServer(db, { port: PORT });

        console.log("봇이 정상적으로 실행되었습니다.");
        console.log("중지하려면 ctrl+c를 누르세요");
    } catch (error) {
        console.error("봇 실행 중 오류 발생", error.message);
        process.exit(1);
    }
}

// 종료 시그널 처리
async function shutdown() {
    console.log("\n\n 종료 신호 감지...");
    if (apiServer) apiServer.close();
    await scheduler.cleanup();
    db.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

//에러 핸들링
process.on("unhandledRejection", (error) => {
    console.error("unhandledRejection", error);
});

main();
