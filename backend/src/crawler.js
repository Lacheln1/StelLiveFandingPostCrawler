import puppeteer from "puppeteer";

/**
 * FandingCrawler - Puppeteer 헤드리스 브라우저 기반 크롤러
 *
 * fanding.kr의 StelLive 팬딩 게시글 목록을 주기적으로 수집하고,
 * 새 게시글을 감지하여 반환합니다.
 * Self-Healing 패턴으로 브라우저가 비정상 종료되면 자동으로 재시작합니다.
 */
export class FandingCrawler {
    constructor(db) {
        this.browser = null;
        this.db = db;
        this.lastPostId = db.getLastPostId();
    }

    async initialize() {
        console.log("브라우저 초기화 중...");

        // Puppeteer 실행 옵션
        // --no-sandbox, --disable-setuid-sandbox : Docker/Linux 환경에서 sandbox 권한 문제 방지
        // --disable-dev-shm-usage                : /dev/shm 메모리 부족 시 충돌 방지 (컨테이너 환경)
        // --disable-gpu                          : 헤드리스 모드에서 GPU 렌더링 불필요
        // --js-flags=--max-old-space-size=256    : Node.js 힙 메모리 한도를 256MB로 제한하여 메모리 과다 사용 방지
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

    async _fetchAllPosts() {
        // Self-Healing 패턴: 브라우저가 예기치 않게 종료(크래시, OOM 등)됐을 때
        // 다음 크롤링 사이클에서 자동으로 재시작하여 서비스 중단을 방지한다.
        if (!this.browser || !this.browser.isConnected()) {
            console.warn("브라우저가 닫혀있어 재시작합니다...");
            try {
                if (this.browser) await this.browser.close().catch(() => {});
                await this.initialize();
            } catch (e) {
                console.error("브라우저 재시작 실패:", e.message);
                return [];
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

            // 1. 페이지 이동 전략
            try {
                await newPage.goto("https://fanding.kr/@stellive/section/3498/", {
                    // waitUntil: "domcontentloaded" — 이미지/동영상 등 외부 리소스 로드를 기다리지 않고
                    // HTML 파싱 완료 시점에 바로 진행합니다. "load" 이벤트 대비 속도와 안정성이 향상됩니다.
                    waitUntil: "domcontentloaded",
                    timeout: 30000, // 30초면 충분함
                });
                console.log("페이지 접속 완료 (DOM 로드됨)");
            } catch (gotoError) {
                console.error("페이지 접속 실패:", gotoError.message);
                throw gotoError;
            }

            // 2. 선택자 로딩 대기
            try {
                // SPA(Single Page App)에서는 DOM이 JavaScript에 의해 동적으로 생성됩니다.
                // HTML 파싱 완료 후에도 게시글 목록 요소가 즉시 존재하지 않을 수 있으므로
                // 명시적으로 최대 10초 대기합니다.
                await newPage.waitForSelector('a.channel-card[href*="/post/"]', { timeout: 10000 });
            } catch (waitError) {
                console.warn("게시글 요소를 찾는데 시간이 걸리거나 실패했습니다.");
            }

            // 3. 모든 게시글 정보 추출
            // page.evaluate()는 브라우저 컨텍스트(Chromium 내부)에서 JavaScript를 실행합니다.
            // Node.js 환경과 완전히 별도의 스코프이므로, 외부 변수를 직접 참조할 수 없습니다.
            // (외부 변수를 사용하려면 두 번째 인자로 직렬화하여 전달해야 합니다)
            const allPosts = await newPage.evaluate(() => {
                const postLinks = document.querySelectorAll('a.channel-card[href*="/post/"]');
                if (!postLinks.length) return [];

                return Array.from(postLinks).map((postLink) => {
                    const link = postLink.href;

                    // 정규식으로 URL에서 게시글 ID 추출: "/post/12345/" → "12345"
                    // 팬딩 URL 형식: https://fanding.kr/@stellive/section/3498/post/{postId}/
                    const postIdMatch = link.match(/\/post\/(\d+)\//);
                    const postId = postIdMatch ? postIdMatch[1] : null;
                    if (!postId) return null;

                    const titleElement = postLink.querySelector(".channel-card-title");
                    const title = titleElement?.textContent?.trim() || "제목 없음";

                    const imageElement = postLink.querySelector(".channel-card-thumbnail img");
                    const image = imageElement?.src || null;

                    const timeElement = postLink.querySelector(
                        ".channel-card-info-group .channel-card-info",
                    );
                    const timestamp = timeElement?.textContent?.trim();

                    return { postId, title, link, image, timestamp };
                }).filter(Boolean);
            });

            return allPosts;
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
            return [];
        } finally {
            // 페이지 닫기 (반드시 실행)
            if (newPage) {
                try {
                    await newPage.close();
                } catch (e) {
                    console.error("페이지 닫기 실패 (이미 닫힘):", e.message);
                }
            }
        }
    }

    async crawl() {
        const allPosts = await this._fetchAllPosts();
        if (!allPosts.length) {
            console.log("게시글을 찾을 수 없습니다.");
            return [];
        }

        // 최초 실행 분기: lastPostId가 null이면 크롤러가 처음 실행되는 것
        // 현재 최신글을 기준점(lastPostId)으로 설정하고, 1개만 알림으로 전송합니다.
        // (전체 히스토리를 알림으로 보내면 Discord 채널이 도배될 수 있음)
        if (this.lastPostId === null) {
            this.lastPostId = allPosts[0].postId;
            this.db.setLastPostId(this.lastPostId);
            this.db.insertPosts(allPosts);
            console.log("초기 설정 완료. 최신글 ID:", this.lastPostId);

            // 최초 실행 시 현재 최신 글 1개만 반환하여 알림 전송
            return [allPosts[0]];
        }

        // posts 테이블에 없는 게시글 = 새 게시글입니다.
        // ID 크기 비교 대신 DB 존재 여부로 판단하므로,
        // ID가 단조 증가하지 않아도 정확하게 새 글을 감지합니다.
        const newPosts = allPosts
            .filter((post) => !this.db.getPostById(post.postId))
            .sort((a, b) => parseInt(a.postId) - parseInt(b.postId));

        if (newPosts.length === 0) {
            console.log("새 글 없음");
            return [];
        }

        console.log(`새 글 ${newPosts.length}개 발견`);
        for (const post of newPosts) {
            console.log(`  - [${post.title}] (ID: ${post.postId})`);
        }

        // 페이지 최상단 글(가장 최신 글)의 ID를 lastPostId로 저장합니다.
        // 중복 감지는 DB 기반으로 이루어지므로, lastPostId는 최초 실행 여부 판단에만 사용됩니다.
        this.lastPostId = allPosts[0].postId;
        this.db.setLastPostId(this.lastPostId);
        this.db.insertPosts(newPosts);

        return newPosts;
    }

    async crawlLatest(count = 1) {
        const allPosts = await this._fetchAllPosts();
        if (!allPosts.length) return [];

        // 팬딩 페이지는 최신글이 상단에 위치하므로, slice(0, count)는 최신 N개를 의미합니다.
        const selectedPosts = allPosts.slice(0, count);

        this.lastPostId = allPosts[0].postId;
        this.db.setLastPostId(this.lastPostId);
        // INSERT OR IGNORE: 동일한 post_id가 이미 DB에 있으면 무시합니다.
        // /check 명령어가 중복 저장하지 않도록 보호합니다.
        this.db.insertPosts(selectedPosts);

        console.log(`최신글 ${selectedPosts.length}개 로드 (ID: ${this.lastPostId})`);
        return selectedPosts;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log("브라우저 완전 종료");
        }
    }
}
