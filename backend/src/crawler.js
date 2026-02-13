import puppeteer from "puppeteer";

export class FandingCrawler {
    constructor() {
        this.browser = null;
        this.lastPostId = null;
    }

    async initialize() {
        console.log("브라우저 초기화 중...");

        const puppeteerOptions = {
            headless: "shell",
            protocolTimeout: 120000,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-dev-tools",
                "--no-first-run",
                "--no-zygote",
                "--disable-extensions",
                "--disable-background-networking",
                "--mute-audio",
                "--disable-software-rasterizer",
                "--disable-background-timer-throttling",
                "--js-flags=--max-old-space-size=256",
            ],
            timeout: 60000,
        };

        try {
            this.browser = await puppeteer.launch(puppeteerOptions);
            console.log("브라우저 시작 성공");
        } catch (error) {
            console.error("브라우저 시작 실패:", error.message);
            throw error;
        }
    }

    async crawl() {
        // 0. 브라우저 상태 체크 및 재연결 (Self-Healing)
        if (!this.browser || !this.browser.isConnected()) {
            console.warn("브라우저가 닫혀있어 재시작합니다...");
            try {
                if (this.browser) await this.browser.close().catch(() => {});
                await this.initialize();
            } catch (e) {
                console.error("브라우저 재시작 실패:", e.message);
                return null;
            }
        }

        let newPage = null;
        try {
            console.log("크롤링 시작:", new Date().toLocaleString("ko-KR"));

            newPage = await this.browser.newPage();

            // 뷰포트 설정 (모바일/데스크탑 반응형 대응 및 렌더링 안정성 확보)
            await newPage.setViewport({ width: 1280, height: 800 });

            await newPage.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            );

            // 1. 페이지 이동 전략 변경
            try {
                await newPage.goto("https://fanding.kr/@stellive/section/3498/", {
                    waitUntil: "domcontentloaded", // 'load' 대신 HTML만 로드되면 진행 (속도, 안정성 증가)
                    timeout: 30000, // 30초면 충분함
                });
                console.log("페이지 접속 완료 (DOM 로드됨)");
            } catch (gotoError) {
                console.error("페이지 접속 실패:", gotoError.message);
                throw gotoError;
            }

            // 2. 선택자 로딩 대기 (SPA 로딩 대기용)
            try {
                // 게시글 리스트가 뜰 때까지 명시적으로 기다림 (최대 10초)
                await newPage.waitForSelector('a.channel-card[href*="/post/"]', { timeout: 10000 });
            } catch (waitError) {
                console.warn("게시글 요소를 찾는데 시간이 걸리거나 실패했습니다.");
            }

            // 3. 최신 글 정보 추출
            const latestPost = await newPage.evaluate(() => {
                const postLink = document.querySelector('a.channel-card[href*="/post/"]');
                if (!postLink) return null;

                const link = postLink.href;
                const postIdMatch = link.match(/\/post\/(\d+)\//);
                const postId = postIdMatch ? postIdMatch[1] : null; // ID 없으면 null 처리
                if (!postId) return null;

                const titleElement = postLink.querySelector(".channel-card-title");
                const title = titleElement?.textContent?.trim() || "제목 없음";

                const imageElement = postLink.querySelector(".channel-card-thumbnail img");
                const image = imageElement?.src || null;

                // 작성 시간 추출
                const timeElement = postLink.querySelector(
                    ".channel-card-info-group .channel-card-info",
                );
                const timestamp = timeElement?.textContent?.trim();

                return { postId, title, link, image, timestamp };
            });

            if (!latestPost) {
                console.log("게시글을 찾을 수 없습니다.");
                return null;
            }

            // 4. 로직 처리
            if (this.lastPostId === null) {
                this.lastPostId = latestPost.postId;
                console.log("초기 설정 완료. 최신글 ID:", this.lastPostId);

                // 최초 실행 시 현재 최신 글을 반환하여 알림 전송
                return latestPost;
            }

            if (this.lastPostId !== latestPost.postId) {
                console.log(`새 글이 발견되었습니다. [${latestPost.title}]`);
                this.lastPostId = latestPost.postId;

                return latestPost;
            }

            console.log("새 글 없음");
            return null;
        } catch (error) {
            console.error("크롤링 에러 발생:", error.message);

            // 치명적 에러 발생 시 브라우저 인스턴스 초기화 고려
            if (
                error.message.includes("Session closed") ||
                error.message.includes("Target closed")
            ) {
                console.log("브라우저 세션이 종료되었습니다. 다음 실행 시 재시작합니다.");
                this.browser = null;
            }
            return null;
        } finally {
            // 5. 페이지 닫기 (반드시 실행)
            if (newPage) {
                try {
                    await newPage.close();
                } catch (e) {
                    console.error("페이지 닫기 실패 (이미 닫힘):", e.message);
                }
            }
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log("브라우저 완전 종료");
        }
    }
}
