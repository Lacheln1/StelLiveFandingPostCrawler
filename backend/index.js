/**
 * index.js - 애플리케이션 진입점
 *
 * 전체 컴포넌트(DB, 스케줄러, Discord 봇, API 서버)를 초기화하고 조율합니다.
 * 실행 흐름: 환경변수 검증 → DB 초기화 → 마이그레이션 → 봇/스케줄러 시작 → API 서버 실행
 */
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

// guilds.json → SQLite 마이그레이션 (1회 한정)
// guilds.json이 존재하고 아직 백업(.bak)이 없을 때만 실행된다.
// 마이그레이션 완료 후 guilds.json을 .bak으로 이름을 바꿔 재실행을 방지한다.
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
        // 초기화 순서가 중요합니다.
        // 1. notifier.initialize()      : Discord 봇 로그인 및 슬래시 커맨드 등록
        // 2. scheduler.initialize()     : Puppeteer 브라우저 실행
        // 3. notifier.setCheckCallback(): /check 명령어가 scheduler와 통신할 수 있도록 연결
        // 4. scheduler.start()          : cron 등록 및 첫 크롤링 즉시 실행
        // → notifier가 먼저 준비되어야 scheduler가 알림을 전송할 수 있음
        await notifier.initialize();
        await scheduler.initialize(notifier);

        // /check 슬래시 명령어 핸들러(discord.js)가 실제로 호출할 크롤링 함수를 외부에서 주입합니다.
        // 이 구조를 통해 discord.js가 crawler.js에 직접 의존하지 않습니다. (의존성 역전 원칙)
        notifier.setCheckCallback(() => scheduler.getLatestPost());
        scheduler.start();

        apiServer = createServer(db, { port: PORT });

        console.log("봇이 정상적으로 실행되었습니다.");
        console.log("중지하려면 ctrl+c를 누르세요");
    } catch (error) {
        console.error("봇 실행 중 오류 발생", error.message);
        process.exit(1);
    }
}

// SIGINT  : Ctrl+C 입력 시 터미널에서 발생하는 인터럽트 신호
// SIGTERM : 시스템이 프로세스를 정상 종료할 때 보내는 신호 (예: docker stop, systemctl stop)
// 두 신호 모두 동일한 shutdown() 함수로 처리하여 자원을 안전하게 해제한다.
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
