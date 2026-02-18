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

export class DiscordNotifier {
    constructor(token, db) {
        this.token = token;
        this.client = new Client({
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

        // 기존 서버 동기화: guilds.json에 미등록된 서버 자동 등록
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

        // 추방된 서버 정리: guilds.json에는 있지만 봇의 guild cache에 없는 서버 제거
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
        });
    }

    async sendNotification(post) {
        const channelIds = this.guildConfig.getAllChannelIds();

        if (channelIds.length === 0) {
            console.log("알림을 보낼 서버가 없습니다.");
            return false;
        }

        const embed = new EmbedBuilder()
            .setTitle("StelLive 팬딩 새 글 알림")
            .setDescription(post.title)
            .setColor(0x5865f2)
            .addFields(
                {
                    name: "게시글 링크",
                    value: `[여기를 클릭하세요](${post.link})`,
                    inline: false,
                },
                {
                    name: "작성 시간",
                    value: post.timestamp,
                    inline: true,
                },
            )
            .setFooter({
                text: "fanding.kr/@stellive 비공식 팬메이드 알림 봇",
            });

        if (post.image) {
            embed.setThumbnail(post.image);
        }

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
