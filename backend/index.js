import "dotenv/config";
import { Scheduler } from "./src/scheduler.js";
import { DiscordNotifier } from "./src/discord.js";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
    console.error("DISCORD_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
    process.exit(1);
}

const notifier = new DiscordNotifier(DISCORD_BOT_TOKEN);
const scheduler = new Scheduler();

async function main() {
    console.log("══════════════════════════");
    console.log("StelLive fanding 크롤링 봇 ");
    console.log("══════════════════════════");

    try {
        await notifier.initialize();
        await scheduler.initialize(notifier);
        scheduler.start();

        console.log("봇이 정상적으로 실행되었습니다.");
        console.log("중지하려면 ctrl+c를 누르세요");
    } catch (error) {
        console.error("봇 실행 중 오류 발생", error.message);
        process.exit(1);
    }
}

// 종료 시그널 처리
process.on("SIGINT", async () => {
    console.log("\n\n 종료 신호 감지...");
    await scheduler.cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\n\n 종료 신호 감지...");
    await scheduler.cleanup();
    process.exit(0);
});

//에러 핸들링
process.on("unhandledRejection", (error) => {
    console.error("unhandledRejection", error);
});

main();
