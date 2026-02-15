import cron from "node-cron";
import { FandingCrawler } from "./crawler.js";

export class Scheduler {
    constructor() {
        this.crawler = null;
        this.notifier = null;
        this.task = null;
        this.isRunning = false;
    }

    async initialize(notifier) {
        console.log("스케줄러 초기화 중...");

        this.crawler = new FandingCrawler();
        this.notifier = notifier;

        await this.crawler.initialize();

        // 브라우저가 완전히 준비될 때까지 추가 대기
        await new Promise((resolve) => setTimeout(resolve, 3000));

        console.log("스케줄러 준비 완료.");
    }

    async executeCrawl(label) {
        if (this.isRunning) {
            console.log(`[${label}] 이전 크롤링이 아직 실행 중입니다. 건너뜁니다.`);
            return;
        }
        this.isRunning = true;
        try {
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`[${label}] 스케줄 실행:`, new Date().toLocaleString("ko-KR"));
            const newPost = await this.crawler.crawl();
            if (newPost) {
                await this.notifier.sendNotification(newPost);
            }
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        } finally {
            this.isRunning = false;
        }
    }

    start() {
        // 시간대별 차등 크롤링 (cron 방식)
        // 활동 시간대 (9시~23시): 5분마다
        const activeHoursTask = cron.schedule("*/5 9-23 * * *", () => {
            this.executeCrawl("활동 시간대");
        });

        // 비활동 시간대 (0시~8시): 1시간마다
        const inactiveHoursTask = cron.schedule("0 0-8 * * *", () => {
            this.executeCrawl("비활동 시간대");
        });

        this.task = { active: activeHoursTask, inactive: inactiveHoursTask };

        console.log("스케줄러 시작: 시간대별 차등 크롤링");
        console.log("활동 시간대 (09:00~23:59): 5분마다");
        console.log("비활동 시간대 (00:00~08:59): 1시간마다\n");

        // 즉시 한 번 실행
        this.executeCrawl("수동 실행");
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
