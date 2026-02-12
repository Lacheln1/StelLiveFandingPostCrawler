import cron from "node-cron";
import { FandingCrawler } from "./crawler.js";
import { DiscordNotifier } from "./discord.js";

export class Scheduler {
    constructor() {
        this.crawler = null;
        this.notifier = null;
        this.task = null;
    }

    async initialize(webhookUrl) {
        console.log("스케줄러 초기화 중...");

        this.crawler = new FandingCrawler();
        this.notifier = new DiscordNotifier(webhookUrl);

        await this.crawler.initialize();

        //테스트 메시지 전송
        await this.notifier.sendTestMessage();
        console.log("스케줄러 준비 완료.");
    }

    start() {
        const hour = new Date().getHours();
        //오전 9시 ~ 밤12시 : 5분마다 크롤링
        //밤 12시 ~ 오전9시: 60분마다 크롤링
        const interval = hour >= 9 && hour < 24 ? "*/5 * * * *" : "*/60 * * * *";

        this.task = cron.schedule(interval, async () => {
            console.log("------------");
            console.log("스케줄 실행", new Date().toLocaleString("ko-KR"));

            const newPost = await this.crawler.crawl();

            if (newPost) {
                await this.notifier.sendNotification(newPost);
            }

            console.log("------------");
        });

        console.log("스케줄러 시작: 10분마다 크롤링 실행");

        //즉시 한 번 실행
        this.runImmediately();
    }

    async runImmediately() {
        console.log("------------");
        console.log("수동 실행:", new Date().toLocaleString("ko-KR"));

        const newPost = await this.crawler.crawl();

        if (newPost) {
            await this.notifier.sendNotification(newPost);
        }

        console.log("------------");
    }

    stop() {
        if (this.task) {
            this.task.stop();
            console.log("스케줄러 중지");
        }
    }
    async cleanup() {
        this.stop();
        if (this.crawler) {
            await this.crawler.close();
        }
        console.log("정리 완료");
    }
}
