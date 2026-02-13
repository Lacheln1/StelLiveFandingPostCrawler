import puppeteer from "puppeteer";
import { writeFile } from "fs/promises";

async function analyzePage() {
    console.log("FANDING.KR 페이지 구조 분석 중...\n");

    const browser = await puppeteer.launch({
        headless: false, // 브라우저 창 보이게
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0",
        ],
    });

    const page = await browser.newPage();

    console.log("페이지 로딩 중...");
    await page.goto("https://fanding.kr/@stellive/section/3498/", {
        waitUntil: "networkidle2",
        timeout: 30000,
    });

    await new Promise((r) => setTimeout(r, 3000));

    console.log("페이지 로드 완료\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 1. 페이지 전체 HTML 저장
    const fullHTML = await page.content();
    await writeFile("fanding_full_page.html", fullHTML, "utf-8");
    console.log("전체 HTML 저장: fanding_full_page.html\n");

    // 2. 게시글 영역 찾기
    console.log("게시글 영역 탐색 중...\n");

    const possibleSelectors = [
        "article",
        '[class*="post"]',
        '[class*="card"]',
        '[class*="item"]',
        '[class*="feed"]',
        '[class*="content"]',
        "main > div",
        '[data-testid*="post"]',
        ".container > div",
        "#__next > div",
    ];

    for (const selector of possibleSelectors) {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
            console.log(`발견: "${selector}" → ${elements.length}개 요소`);

            // 첫 번째 요소의 구조 출력
            const firstElement = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;

                return {
                    tagName: el.tagName,
                    className: el.className,
                    id: el.id,
                    innerHTML: el.innerHTML.substring(0, 500),
                };
            }, selector);

            if (firstElement) {
                console.log(`   태그: <${firstElement.tagName.toLowerCase()}>`);
                console.log(`   클래스: ${firstElement.className}`);
                if (firstElement.id) console.log(`   ID: ${firstElement.id}`);
                console.log(
                    `   내용 미리보기:\n   ${firstElement.innerHTML.substring(0, 200)}...\n`,
                );
            }
        }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 3. 제목/링크 패턴 찾기
    console.log("제목 요소 탐색 중...\n");

    const titleSelectors = [
        "h1",
        "h2",
        "h3",
        "h4",
        '[class*="title"]',
        '[class*="subject"]',
        '[class*="heading"]',
        "a > span",
        "a > div",
    ];

    for (const selector of titleSelectors) {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
            console.log(`발견: "${selector}" → ${elements.length}개 요소`);

            const texts = await page.evaluate((sel) => {
                const els = document.querySelectorAll(sel);
                return Array.from(els)
                    .slice(0, 3)
                    .map((el) => ({
                        text: el.textContent.trim().substring(0, 100),
                        hasLink: !!el.closest("a"),
                    }));
            }, selector);

            texts.forEach((item, i) => {
                if (item.text) {
                    console.log(`   [${i + 1}] ${item.text}`);
                    if (item.hasLink) console.log(`       → 링크 포함 ✓`);
                }
            });
            console.log();
        }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 4. 링크 패턴 분석
    console.log("링크 패턴 분석 중...\n");

    const links = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll("a[href]"));
        return allLinks
            .map((a) => ({
                href: a.href,
                text: a.textContent.trim().substring(0, 50),
            }))
            .filter((link) => link.href.includes("fanding.kr"))
            .slice(0, 10);
    });

    links.forEach((link, i) => {
        console.log(`[${i + 1}] ${link.text}`);
        console.log(`    ${link.href}\n`);
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 5. 추천 선택자 출력
    console.log("추천 선택자:\n");

    const recommendation = await page.evaluate(() => {
        const possiblePosts = document.querySelectorAll(
            'article, [class*="post"], [class*="card"]',
        );

        if (possiblePosts.length === 0) return null;

        const firstPost = possiblePosts[0];

        return {
            postSelector:
                firstPost.tagName.toLowerCase() +
                (firstPost.className ? "." + firstPost.className.split(" ")[0] : ""),
            titleSelector: firstPost
                .querySelector('h1, h2, h3, [class*="title"]')
                ?.tagName.toLowerCase(),
            linkSelector: firstPost.querySelector("a[href]")?.tagName.toLowerCase() + "[href]",
        };
    });

    if (recommendation) {
        console.log(`게시글: document.querySelector('${recommendation.postSelector}')`);
        console.log(`제목: postElement.querySelector('${recommendation.titleSelector}')`);
        console.log(`링크: postElement.querySelector('${recommendation.linkSelector}')`);
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("분석 완료! 브라우저 창을 확인하고, fanding_full_page.html 파일을 열어보세요.\n");
    console.log("브라우저를 닫으려면 Ctrl+C를 누르세요.\n");

    // 브라우저를 열어둔 상태로 대기
    await new Promise(() => {});
}

analyzePage().catch(console.error);
