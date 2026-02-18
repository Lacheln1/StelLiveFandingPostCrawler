import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export class AppDatabase {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this._createTables();
        this._prepareStatements();
    }

    _createTables() {
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
        this._stmts = {
            insertPost: this.db.prepare(
                `INSERT OR IGNORE INTO posts (post_id, title, link, image, timestamp) VALUES (?, ?, ?, ?, ?)`,
            ),
            getPostById: this.db.prepare(`SELECT * FROM posts WHERE post_id = ?`),
            getPosts: this.db.prepare(
                `SELECT * FROM posts ORDER BY CAST(post_id AS INTEGER) DESC LIMIT ? OFFSET ?`,
            ),
            countPosts: this.db.prepare(`SELECT COUNT(*) AS count FROM posts`),

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
