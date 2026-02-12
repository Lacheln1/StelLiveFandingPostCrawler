import "dotenv/config";
import { Scheduler } from "./src/scheduler";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (DISCORD_WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
    process.exit(1);
}

const scheduler = new Scheduler();

// Fly.io 헬스체크용 HTTP 서버
const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Stellive FANDING Bot is running");
    }
});

server.listen(PORT, () => {
    console.log(`HTTP 서버 시작: 포트 ${PORT}`);
});

async function main() {
    console.log("╔═══════════════════════════════════════╗");
    console.log("║   StelLive FANDING 크롤링 봇           ║");
    console.log("╚═══════════════════════════════════════╝\n");

    try {
        await scheduler.initialize(DISCORD_WEBHOOK_URL);
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
