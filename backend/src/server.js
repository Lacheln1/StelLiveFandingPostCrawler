import express from "express";

export function createServer(db, { port = 3000 } = {}) {
    const app = express();
    const startedAt = Date.now();

    app.get("/api/posts", (req, res) => {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        res.json(db.getPosts({ page, limit }));
    });

    app.get("/api/posts/:id", (req, res) => {
        const post = db.getPostById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json(post);
    });

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
