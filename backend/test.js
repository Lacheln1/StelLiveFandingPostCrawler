import "dotenv/config";
import { FandingCrawler } from "./src/crawler.js";
import { DiscordNotifier } from "./src/discord.js";

async function test() {
    console.log("🧪 테스트 시작\n");

    // 1. 크롤러 테스트
    console.log("1️⃣  크롤러 테스트...");
    const crawler = new FandingCrawler();

    try {
        await crawler.initialize();
        const post = await crawler.crawl();

        if (post) {
            console.log("✅ 크롤링 성공!");
            console.log("게시글 정보:", JSON.stringify(post, null, 2));
        } else {
            console.log("ℹ️  새 글이 없거나 초기 실행입니다.");
        }

        await crawler.close();
    } catch (error) {
        console.error("❌ 크롤러 테스트 실패:", error.message);
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 2. Discord 알림 테스트
    console.log("2️⃣  Discord 알림 테스트...");

    if (!process.env.DISCORD_WEBHOOK_URL) {
        console.error("❌ DISCORD_WEBHOOK_URL이 설정되지 않았습니다.");
        return;
    }

    const notifier = new DiscordNotifier(process.env.DISCORD_WEBHOOK_URL);

    try {
        // 테스트 메시지
        await notifier.sendTestMessage();

        // 테스트 게시글 알림
        const testPost = {
            title: "[테스트] Stellive 새 글 알림",
            link: "https://fanding.kr/@stellive/",
            timestamp: new Date().toLocaleString("ko-KR"),
            image: null,
        };

        await notifier.sendNotification(testPost);
        console.log("✅ Discord 알림 테스트 완료!");
    } catch (error) {
        console.error("❌ Discord 알림 테스트 실패:", error.message);
    }

    console.log("\n🎉 모든 테스트 완료!");
}

test();
