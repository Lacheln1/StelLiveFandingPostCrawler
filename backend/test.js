import "dotenv/config";
import { AppDatabase } from "./src/database.js";
import { FandingCrawler } from "./src/crawler.js";
import { DiscordNotifier } from "./src/discord.js";

async function test() {
    console.log("테스트 시작\n");

    // ─── 공통 의존성 ───
    const db = new AppDatabase("./data/app.db");

    let crawler = null;
    let notifier = null;

    try {
        // ━━━ 1단계: DB + 크롤러 테스트 ━━━
        console.log("1단계: 크롤러 테스트...");
        crawler = new FandingCrawler(db);

        await crawler.initialize();
        const posts = await crawler.crawl();

        if (posts.length > 0) {
            console.log(`크롤링 성공: ${posts.length}개 게시글`);
            for (const post of posts) {
                console.log(`  - [${post.title}] (ID: ${post.postId})`);
            }
        } else {
            console.log("새 글이 없거나 초기 실행입니다.");
        }

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // ━━━ 2단계: Discord 봇 연결 테스트 ━━━
        console.log("2단계: Discord 봇 연결 테스트...");

        if (!process.env.DISCORD_BOT_TOKEN) {
            console.error("DISCORD_BOT_TOKEN이 설정되지 않았습니다.");
            return;
        }

        notifier = new DiscordNotifier(process.env.DISCORD_BOT_TOKEN, db);
        await notifier.initialize();

        const guildCount = notifier.client.guilds.cache.size;
        console.log(`봇 로그인 성공: ${notifier.client.user.tag}`);
        console.log(`등록된 서버 수: ${guildCount}`);

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // ━━━ 3단계: 알림 전송 테스트 ━━━
        console.log("3단계: 알림 전송 테스트...");

        const testPost = {
            title: "[테스트] StelLive 새 글 알림",
            link: "https://fanding.kr/@stellive/",
            timestamp: new Date().toLocaleString("ko-KR"),
            image: null,
        };

        const result = await notifier.sendNotification(testPost);
        console.log(`알림 전송 결과: ${result ? "성공" : "실패 또는 대상 없음"}`);
    } catch (error) {
        console.error("테스트 중 오류 발생:", error.message);
    } finally {
        // ─── 리소스 정리 ───
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        console.log("리소스 정리 중...");

        if (crawler) await crawler.close().catch(() => {});
        if (notifier) await notifier.destroy().catch(() => {});
        db.close();

        console.log("모든 테스트 완료");
    }
}

test();
