/**
 * server.js - 외부 모니터링용 REST API 서버
 *
 * Express 기반으로 크롤링 데이터와 봇 상태를 조회하는 엔드포인트를 제공합니다.
 * 엔드포인트:
 *   GET /api/posts       - 크롤링된 게시글 목록 (페이지네이션)
 *   GET /api/posts/:id   - 특정 게시글 상세 조회
 *   GET /api/status      - 봇 운영 상태 헬스체크
 */
import express from "express";

export function createServer(db, { port = 3000 } = {}) {
    const app = express();
    const startedAt = Date.now();

    app.get("/api/posts", (req, res) => {
        // Math.max/min으로 비정상 요청을 자동 보정합니다.
        // page: 1 미만 → 1로 고정 / limit: 100 초과 → 100으로 제한, 1 미만 → 1로 고정
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        res.json(db.getPosts({ page, limit }));
    });

    app.get("/api/posts/:id", (req, res) => {
        const post = db.getPostById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json(post);
    });

    // 헬스체크 엔드포인트: 봇 운영 상태를 한눈에 확인합니다.
    // - uptime    : 서버 가동 시간 (초)
    // - posts     : 누적 크롤링 게시글 수
    // - guilds    : 봇이 연결된 Discord 서버 수
    // - lastPostId: 마지막으로 감지한 게시글 ID
    app.get("/api/status", (req, res) => {
        const { total } = db.getPosts({ page: 1, limit: 1 });
        res.json({
            uptime: Math.floor((Date.now() - startedAt) / 1000),
            posts: total,
            guilds: db.getGuildCount(),
            lastPostId: db.getLastPostId(),
        });
    });

    const server = app.listen(port, () => {
        console.log(`API 서버 시작: http://localhost:${port}`);
    });

    return server;
}
