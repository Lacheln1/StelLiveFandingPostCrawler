import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActivityType,
} from "discord.js";
import { GuildConfig } from "./guildConfig.js";

/**
 * DiscordNotifier - Discord 봇 클라이언트 및 알림 시스템
 *
 * Discord 봇 연결, 슬래시 커맨드(/setchannel, /check) 처리,
 * 팬딩 새 글 알림 전송을 담당합니다.
 */

export class DiscordNotifier {
    constructor(token, db) {
        this.token = token;
        this.client = new Client({
            // GatewayIntentBits.Guilds만 선언하여 서버 기본 정보만 수신합니다.
            // 메시지 내용 읽기(MessageContent) 등 불필요한 권한을 제외하는 최소 권한 원칙을 따릅니다.
            intents: [GatewayIntentBits.Guilds],
        });
        this.guildConfig = new GuildConfig(db);
    }

    async initialize() {
        this.guildConfig.load();
        await this.registerSlashCommands();
        this.setupEventHandlers();

        await this.client.login(this.token);

        // ready 이벤트 대기
        await new Promise((resolve) => {
            if (this.client.isReady()) return resolve();
            this.client.once("ready", resolve);
        });

        // 봇이 오프라인 상태일 때 새 서버에 추가된 경우를 처리합니다.
        // ready 이벤트 후 Discord 캐시에 있는 서버 목록과 DB를 비교하여
        // DB에 미등록된 서버를 자동으로 등록합니다.
        for (const guild of this.client.guilds.cache.values()) {
            if (!this.guildConfig.getChannel(guild.id)) {
                let targetChannel = guild.systemChannel;
                if (!targetChannel) {
                    targetChannel = guild.channels.cache.find(
                        (ch) =>
                            ch.type === ChannelType.GuildText &&
                            ch.permissionsFor(guild.members.me)?.has("SendMessages"),
                    );
                }
                if (targetChannel) {
                    this.guildConfig.setChannel(guild.id, targetChannel.id);
                    console.log(`기존 서버 등록: ${guild.name} → #${targetChannel.name}`);
                }
            }
        }

        // DB에 등록되어 있지만 봇의 guild 캐시에 없는 서버 = 오프라인 중 추방됨
        // 자동으로 DB에서 제거하여 이후 해당 서버로 알림을 시도하는 낭비를 방지합니다.
        const guildChannels = this.guildConfig.getAllGuildChannels();
        for (const guildId of Object.keys(guildChannels)) {
            if (!this.client.guilds.cache.has(guildId)) {
                console.log(`추방된 서버 제거: ${guildId}`);
                this.guildConfig.removeGuild(guildId);
            }
        }

        //디스코드 봇 상태메시지 관리
        this.client.user.setPresence({
            activities: [
                {
                    name: "fanding 모니터링 중 | /setchannel",
                    type: ActivityType.Custom,
                },
            ],
        });

        console.log(`Discord 봇 로그인 완료: ${this.client.user.tag}`);
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName("setchannel")
                .setDescription("알림을 받을 채널을 설정합니다.")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("알림을 받을 텍스트 채널")
                        .setRequired(true),
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
            new SlashCommandBuilder()
                .setName("check")
                .setDescription("지금 즉시 최신 팬딩 게시글을 확인합니다."),
        ].map((cmd) => cmd.toJSON());

        const rest = new REST({ version: "10" }).setToken(this.token);

        try {
            await rest.put(Routes.applicationCommands(await this.getApplicationId()), {
                body: commands,
            });
            console.log("슬래시 커맨드 등록 완료");
        } catch (error) {
            console.error("슬래시 커맨드 등록 실패:", error.message);
        }
    }

    async getApplicationId() {
        const rest = new REST({ version: "10" }).setToken(this.token);
        const app = await rest.get(Routes.currentApplication());
        return app.id;
    }

    setupEventHandlers() {
        // 봇이 새 서버에 초대됨
        this.client.on("guildCreate", async (guild) => {
            console.log(`새 서버 참가: ${guild.name} (${guild.id})`);

            // 시스템 채널 또는 첫 번째 텍스트 채널 찾기
            let targetChannel = guild.systemChannel;

            if (!targetChannel) {
                targetChannel = guild.channels.cache.find(
                    (ch) =>
                        ch.type === ChannelType.GuildText &&
                        ch.permissionsFor(guild.members.me)?.has("SendMessages"),
                );
            }

            if (targetChannel) {
                this.guildConfig.setChannel(guild.id, targetChannel.id);

                try {
                    await targetChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("StelLive 팬딩 새 글 알림 봇")
                                .setDescription(
                                    `알림이 이 채널(<#${targetChannel.id}>)로 전송됩니다.\n` +
                                        "`/setchannel` 명령어로 다른 채널로 변경할 수 있습니다.",
                                )
                                .setColor(0x5865f2),
                        ],
                    });
                } catch (error) {
                    console.error(`환영 메시지 전송 실패 (${guild.name}):`, error.message);
                }
            } else {
                console.warn(`${guild.name}: 메시지를 보낼 수 있는 채널을 찾을 수 없습니다.`);
            }
        });

        // 서버에서 봇 제거됨
        this.client.on("guildDelete", (guild) => {
            console.log(`서버에서 제거됨: ${guild.name} (${guild.id})`);
            this.guildConfig.removeGuild(guild.id);
        });

        // 슬래시 커맨드 처리
        this.client.on("interactionCreate", async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            if (interaction.commandName === "setchannel") {
                const channel = interaction.options.getChannel("channel");

                // 음성 채널(VoiceChannel), 카테고리, 스레드 등에는 일반 메시지를 전송할 수 없습니다.
                // GuildText 타입만 허용하여 전송 오류를 사전에 차단합니다.
                if (channel.type !== ChannelType.GuildText) {
                    await interaction.reply({
                        content: "텍스트 채널만 선택할 수 있습니다.",
                        ephemeral: true,
                    });
                    return;
                }

                this.guildConfig.setChannel(interaction.guildId, channel.id);

                await interaction.reply({
                    content: `알림 채널이 <#${channel.id}>(으)로 변경되었습니다.`,
                    ephemeral: true,
                });

                console.log(`채널 변경: ${interaction.guild.name} → #${channel.name}`);
            }

            if (interaction.commandName === "check") {
                // 쿨타임 5분: 동일 서버에서 /check 남용 방지
                // 타임아웃 5분: Puppeteer 크롤링이 응답 없이 무한 대기하는 경우 강제 중단
                const COOLDOWN_MS = 5 * 60 * 1000;
                const TIMEOUT_MS = 5 * 60 * 1000;

                // guildCheckTimes Map으로 서버(guild)별 독립적인 쿨타임을 관리합니다.
                // A 서버의 쿨타임이 B 서버에 영향을 주지 않습니다.
                const guildId = interaction.guildId;
                const lastCheckTime = this.guildCheckTimes?.get(guildId);
                if (lastCheckTime) {
                    const elapsed = Date.now() - lastCheckTime;
                    if (elapsed < COOLDOWN_MS) {
                        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
                        const minutes = Math.floor(remaining / 60);
                        const seconds = remaining % 60;
                        await interaction.reply({
                            content: `쿨타임 중입니다. ${minutes}분 ${seconds}초 후에 다시 사용할 수 있습니다.`,
                            ephemeral: true,
                        });
                        return;
                    }
                }

                if (!this.checkCallback) {
                    await interaction.reply({
                        content: "봇이 아직 초기화 중입니다.",
                        ephemeral: true,
                    });
                    return;
                }

                // 쿨타임 시작 (크롤링 시작 시점 기록)
                this.guildCheckTimes.set(guildId, Date.now());

                // Discord API는 슬래시 명령어에 대해 3초 이내 응답을 요구합니다.
                // 크롤링은 수 초~수십 초가 소요되므로 deferReply()로 응답 시간을 최대 15분까지 연장합니다.
                await interaction.deferReply();

                try {
                    // Promise.race(): 두 Promise 중 먼저 완료되는 쪽의 결과를 사용합니다.
                    // 크롤링이 TIMEOUT_MS(5분)를 초과하면 TIMEOUT 에러가 발생하여 크롤링을 포기합니다.
                    const posts = await Promise.race([
                        this.checkCallback(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS),
                        ),
                    ]);

                    if (!posts || posts.length === 0) {
                        await interaction.editReply({
                            content: "최신 게시글을 가져오지 못했습니다.",
                        });
                        return;
                    }

                    await interaction.editReply({ embeds: [this._buildPostEmbed(posts[0])] });
                    console.log(`/check 실행 완료: ${interaction.guild.name}`);
                } catch (error) {
                    if (error.message === "TIMEOUT") {
                        await interaction.editReply({
                            content: "크롤링이 5분을 초과하여 중단되었습니다.",
                        });
                    } else {
                        await interaction.editReply({ content: "크롤링 중 오류가 발생했습니다." });
                        console.error("/check 오류:", error.message);
                    }
                }
            }
        });
    }

    // /check 명령어 핸들러가 실제로 호출할 크롤링 함수(fn)를 외부에서 주입받습니다.
    // 이 구조를 통해 discord.js가 crawler.js에 직접 의존하지 않습니다. (의존성 역전 원칙)
    // index.js에서 notifier.setCheckCallback(() => scheduler.getLatestPost())로 연결됩니다.
    setCheckCallback(fn) {
        this.checkCallback = fn;
        this.guildCheckTimes = new Map(); // guildId → lastCheckTime
    }

    _buildPostEmbed(post) {
        const embed = new EmbedBuilder()
            .setTitle("StelLive 팬딩 최신글")
            .setDescription(post.title)
            .setColor(0x5865f2)
            .addFields(
                { name: "게시글 링크", value: `[여기를 클릭하세요](${post.link})`, inline: false },
                { name: "작성 시간", value: post.timestamp, inline: true },
                {
                    name: "스텔라이브 팬딩 바로가기",
                    value: `https://fanding.kr/@stellive/`,
                    inline: true,
                },
                {
                    name: "스텔라이브 스토어 페이지 바로가기",
                    value: `https://fanding.kr/@stellive/shop`,
                    inline: true,
                },
            )
            .setFooter({ text: "비공식 팬 메이드 스텔라이브 팬딩 알림 봇" });

        if (post.image) embed.setThumbnail(post.image);
        return embed;
    }

    async sendNotification(post) {
        const channelIds = this.guildConfig.getAllChannelIds();

        if (channelIds.length === 0) {
            console.log("알림을 보낼 서버가 없습니다.");
            return false;
        }

        const embed = this._buildPostEmbed(post).setTitle("StelLive 팬딩 새 글 알림");

        let successCount = 0;
        let removedCount = 0;

        for (const channelId of channelIds) {
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                    successCount++;
                }
            } catch (error) {
                // 채널 fetch 실패 = 채널이 삭제됐거나 봇이 서버에서 추방됐을 가능성
                // guild 캐시에도 없으면 추방된 것으로 판단하여 DB에서 자동 제거합니다.
                // 이후 해당 서버로 불필요한 알림 전송을 시도하지 않습니다.
                const guildId = this.guildConfig.getGuildIdByChannel(channelId);
                if (guildId && !this.client.guilds.cache.has(guildId)) {
                    console.log(`추방된 서버 제거: ${guildId}`);
                    this.guildConfig.removeGuild(guildId);
                    removedCount++;
                } else {
                    console.error(`채널 ${channelId} 알림 전송 실패:`, error.message);
                }
            }
        }

        const activeCount = channelIds.length - removedCount;
        console.log(`Discord 알림 전송: ${successCount}/${activeCount}개 채널 성공`);
        return successCount > 0;
    }

    async destroy() {
        this.client.destroy();
        console.log("Discord 봇 연결 종료");
    }
}
