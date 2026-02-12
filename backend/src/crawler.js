import puppeteer from "puppeteer";

export class FandingCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.lastPostId = null;
    }

    async initialize() {
        console.log("브라우저 초기화 중...");

        // Render 배포 환경에서는 시스템 Chromium 사용
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        this.browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0",
            ],
        });

        this.page = await this.browser.newPage();
        console.log("브라우저 준비 완료.");
    }

    async crawl() {
        try {
            console.log("크롤링 시작", new Date().toLocaleString("ko-KR"));
            await this.page.goto("https://fanding.kr/@stellive/section/3498/", {
                waitUntil: "networkidle2",
                timeout: 30000,
            });

            //페이지 로드 대기
            await new Promise((resolve) => setTimeout(resolve, 5000));

            //최신 글 정보 추출
            const latestPost = await this.page.evaluate(() => {
                // 유지보수: fanding의 실제 선택자에 맞게 수정 필요
                // 게시글 링크 찾기 (첫 번재 = 최신글)
                const postLink = document.querySelector('a.channel-card[href*="/post/"]');

                if (!postLink) return null;

                // URL 추출
                const link = postLink.href;

                // 게시글 ID 추출 (URL에서 숫자 부분)
                const postIdMatch = link.match(/\/post\/(\d+)\//);
                const postId = postIdMatch ? postIdMatch[1] : Date.now().toString();

                // 제목 추출
                const titleElement = postLink.querySelector(".channel-card-title");
                const title = titleElement?.textContent?.trim() || "제목 없음";

                // 이미지 추출
                const imageElement = postLink.querySelector(".channel-card-thumbnail img");
                const image = imageElement?.src || null;

                // 작성 시간 추출
                const timeElement = postLink.querySelector(
                    ".channel-card-info-group .channel-card-info",
                );
                const timestamp =
                    timeElement?.textContent?.trim() || new Date().toLocaleString("ko-KR");

                return { postId, title, link, image, timestamp };
            });

            if (!latestPost) {
                console.log("게시글을 찾을 수 없습니다. 선택자를 확인하세요.");
                return null;
            }

            console.log("최신 글:", latestPost.title);

            // 새 글 확인
            if (this.lastPostId === null) {
                // 첫 실행 시 현재 글을 기준으로 설정
                this.lastPostId = latestPost.postId;
                console.log("초기 게시글 id 저장", this.lastPostId);
                return null;
            }

            if (this.lastPostId !== latestPost.postId) {
                console.log("새 글이 감지되었습니다.");
                this.lastPostId = latestPost.postId;
                return latestPost;
            }

            console.log("변경사항 없음");
            return null;
        } catch (error) {
            console.error("크롤링 에러:", error.message);
            return null;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log("브라우저 종료");
        }
    }
}
