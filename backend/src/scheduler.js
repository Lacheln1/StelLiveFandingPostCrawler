import cron from "node-cron";
import { FandingCrawler } from "./crawler.js";

/**
 * Scheduler - 크롤링 스케줄 관리자
 *
 * FandingCrawler와 DiscordNotifier를 cron으로 조율합니다.
 * 활동 시간대(9~23시)에는 5분마다, 새벽(0~8시)에는 1시간마다 크롤링을 실행합니다.
 * 동시성 방지(isRunning)와 자동 알림 전송을 담당합니다.
 */
export class Scheduler {
    constructor(db) {
        this.db = db;
        this.crawler = null;
        this.notifier = null;
        this.task = null;
        // 동시성 방지 플래그: true이면 크롤링이 진행 중임을 의미합니다.
        // cron 주기가 도달해도 이전 크롤링이 완료되지 않으면 새 크롤링을 실행하지 않습니다.
        this.isRunning = false;
    }

    async initialize(notifier) {
        console.log("스케줄러 초기화 중...");

        this.crawler = new FandingCrawler(this.db);
        this.notifier = notifier;

        await this.crawler.initialize();

        // Puppeteer 브라우저는 launch() 후 내부 초기화를 완료하는 데 시간이 필요합니다.
        // 3초 버퍼를 두어 첫 번째 크롤링이 브라우저가 준비되기 전에 실행되는 것을 방지합니다.
        await new Promise((resolve) => setTimeout(resolve, 3000));

        console.log("스케줄러 준비 완료.");
    }

    async executeCrawl(label) {
        // 이전 크롤링이 아직 실행 중이면(isRunning === true) 새 크롤링을 건너뜁니다.
        // 크롤링이 cron 주기(5분)보다 오래 걸릴 경우 작업이 무한히 누적되는 것을 방지합니다.
        if (this.isRunning) {
            console.log(`[${label}] 이전 크롤링이 아직 실행 중입니다. 건너뜁니다.`);
            return;
        }
        this.isRunning = true;
        try {
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`[${label}] 스케줄 실행:`, new Date().toLocaleString("ko-KR"));
            const newPosts = await this.crawler.crawl();
            for (const post of newPosts) {
                await this.notifier.sendNotification(post);
                if (newPosts.length > 1) {
                    // 복수의 신규 게시글이 발견된 경우 Discord에 연속으로 전송합니다.
                    // 100ms 간격을 두어 메시지 순서를 보장하고 Discord rate limit 초과를 방지합니다.
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        } finally {
            this.isRunning = false;
        }
    }

    start() {
        // 시간대별 차등 크롤링 (cron 방식)

        // cron 표현식: "*/5 9-23 * * *"
        // ┌── 분: */5  = 5분마다 (0, 5, 10, ... 55)
        // ├── 시: 9-23 = 9시 0분 ~ 23시 55분
        // └── 일/월/요일: * = 매일
        const activeHoursTask = cron.schedule("*/5 9-23 * * *", () => {
            this.executeCrawl("활동 시간대");
        });

        // cron 표현식: "0 0-8 * * *"
        // ┌── 분: 0   = 정시에만 (0분)
        // ├── 시: 0-8 = 0시 0분 ~ 8시 0분
        // └── 일/월/요일: * = 매일 (새벽 시간대 서버 자원 절약)
        const inactiveHoursTask = cron.schedule("0 0-8 * * *", () => {
            this.executeCrawl("비활동 시간대");
        });

        this.task = { active: activeHoursTask, inactive: inactiveHoursTask };

        console.log("스케줄러 시작: 시간대별 차등 크롤링");
        console.log("활동 시간대 (09:00~23:59): 5분마다");
        console.log("비활동 시간대 (00:00~08:59): 1시간마다\n");

        // 봇 시작 직후 즉시 1회 크롤링을 실행합니다.
        // 봇이 꺼진 동안 업로드된 새 게시글을 다음 cron 주기를 기다리지 않고 즉시 감지합니다.
        this.executeCrawl("수동 실행");
    }

    async getLatestPost() {
        return await this.crawler.crawlLatest(1);
    }

    stop() {
        if (this.task) {
            if (this.task.active) this.task.active.stop();
            if (this.task.inactive) this.task.inactive.stop();
            console.log("스케줄러 중지");
        }
    }
    async cleanup() {
        this.stop();
        if (this.crawler) {
            await this.crawler.close();
        }
        if (this.notifier) {
            await this.notifier.destroy();
        }
        console.log("정리 완료");
    }
}
