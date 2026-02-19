import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * AppDatabase - SQLite 데이터베이스 래퍼
 *
 * better-sqlite3를 사용하여 3개의 테이블을 관리합니다:
 *   - posts  : 크롤링한 팬딩 게시글 이력
 *   - guilds : Discord 서버별 알림 채널 설정
 *   - meta   : lastPostId 등 봇 상태 정보
 */
export class AppDatabase {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        // WAL(Write-Ahead Log) 모드: 읽기와 쓰기를 동시에 허용하는 SQLite 저널 모드입니다.
        // 기본 DELETE 모드에 비해 동시성이 향상되며, API 서버와 크롤러가 동시에 DB를 사용할 때 안전합니다.
        this.db.pragma("journal_mode = WAL");
        this._createTables();
        this._prepareStatements();
    }

    _createTables() {
        // 봇이 사용하는 3개의 테이블을 생성합니다 (이미 존재하면 건너뜁니다).
        // - posts  : 크롤링한 게시글(post_id, title, link, image, timestamp, crawled_at)
        // - guilds : 서버별 알림 채널(guild_id → channel_id)
        // - meta   : 봇 상태 키-값 저장소(lastPostId 등)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS posts (
                post_id    TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                link       TEXT NOT NULL,
                image      TEXT,
                timestamp  TEXT,
                crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS guilds (
                guild_id   TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        `);
    }

    _prepareStatements() {
        // Prepared Statement: SQL을 미리 파싱·컴파일해 두어
        // 반복 실행 시 성능이 향상되고 SQL 인젝션을 방지합니다.
        this._stmts = {
            // INSERT OR IGNORE: post_id(PRIMARY KEY)가 이미 존재하면 오류 없이 무시합니다.
            // 크롤링이 중복 실행되어도 동일한 게시글이 이중으로 저장되지 않습니다.
            insertPost: this.db.prepare(
                `INSERT OR IGNORE INTO posts (post_id, title, link, image, timestamp) VALUES (?, ?, ?, ?, ?)`,
            ),
            getPostById: this.db.prepare(`SELECT * FROM posts WHERE post_id = ?`),
            getPosts: this.db.prepare(
                `SELECT * FROM posts ORDER BY CAST(post_id AS INTEGER) DESC LIMIT ? OFFSET ?`,
            ),
            countPosts: this.db.prepare(`SELECT COUNT(*) AS count FROM posts`),

            // INSERT OR REPLACE: guild_id가 이미 존재하면 기존 행을 삭제 후 새 행으로 교체합니다.
            // /setchannel 명령어로 알림 채널을 변경할 때 사용됩니다.
            setChannel: this.db.prepare(
                `INSERT OR REPLACE INTO guilds (guild_id, channel_id) VALUES (?, ?)`,
            ),
            removeGuild: this.db.prepare(`DELETE FROM guilds WHERE guild_id = ?`),
            getChannel: this.db.prepare(`SELECT channel_id FROM guilds WHERE guild_id = ?`),
            getAllGuilds: this.db.prepare(`SELECT guild_id, channel_id FROM guilds`),
            getGuildByChannel: this.db.prepare(`SELECT guild_id FROM guilds WHERE channel_id = ?`),

            getMeta: this.db.prepare(`SELECT value FROM meta WHERE key = ?`),
            setMeta: this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`),
        };
    }

    // ─── Posts ───

    insertPost(post) {
        this._stmts.insertPost.run(post.postId, post.title, post.link, post.image, post.timestamp);
    }

    insertPosts(posts) {
        // 여러 게시글을 하나의 트랜잭션으로 묶어 원자성(Atomicity)을 보장합니다.
        // 도중에 오류가 발생하면 전체가 롤백되어 일부만 저장되는 상황을 방지합니다.
        const tx = this.db.transaction((items) => {
            for (const post of items) {
                this.insertPost(post);
            }
        });
        tx(posts);
    }

    getPostById(postId) {
        return this._stmts.getPostById.get(postId) || null;
    }

    getPosts({ page = 1, limit = 20 } = {}) {
        const offset = (page - 1) * limit;
        const rows = this._stmts.getPosts.all(limit, offset);
        const { count: total } = this._stmts.countPosts.get();
        return { posts: rows, total, page, limit };
    }

    // ─── Guilds ───

    setChannel(guildId, channelId) {
        this._stmts.setChannel.run(guildId, channelId);
    }

    removeGuild(guildId) {
        this._stmts.removeGuild.run(guildId);
    }

    getChannel(guildId) {
        const row = this._stmts.getChannel.get(guildId);
        return row ? row.channel_id : null;
    }

    getAllChannelIds() {
        return this._stmts.getAllGuilds.all().map((r) => r.channel_id);
    }

    getAllGuildChannels() {
        const result = {};
        for (const row of this._stmts.getAllGuilds.all()) {
            result[row.guild_id] = row.channel_id;
        }
        return result;
    }

    getGuildIdByChannel(channelId) {
        const row = this._stmts.getGuildByChannel.get(channelId);
        return row ? row.guild_id : null;
    }

    getGuildCount() {
        const row = this.db.prepare(`SELECT COUNT(*) AS count FROM guilds`).get();
        return row.count;
    }

    // ─── Meta ───

    getLastPostId() {
        const row = this._stmts.getMeta.get("lastPostId");
        return row ? row.value : null;
    }

    setLastPostId(postId) {
        this._stmts.setMeta.run("lastPostId", postId);
    }

    // ─── Lifecycle ───

    close() {
        this.db.close();
    }
}
