export class DiscordNotifier {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
    }

    async sendNotification(post) {
        if (!this.webhookUrl) {
            console.error("discord webhook url이 설정되지 않았습니다.");
            return false;
        }

        try {
            const embed = {
                title: "StelLive 새 글 알림",
                description: post.title,
                url: post.link,
                color: 0x5865f2,
                fields: [
                    {
                        name: "링크",
                        value: `[여기를 클릭하세요](${post.link})`,
                        inline: false,
                    },
                    {
                        name: "작성 시간",
                        value: post.timestamp,
                        inline: true,
                    },
                ],
                footer: {
                    text: "FANDING.KR StelLive Bot",
                },
                timestamp: new Date().toISOString(),
            };

            // 이미지가 있는 경우 추가
            if (post.image) {
                embed.thumbnail = {
                    url: post.image,
                };
            }

            // 디스코드 봇 정보
            const payload = {
                username: "StelLive Bot",
                avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
                embeds: [embed],
            };

            const response = await fetch(this.webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.status === 204) {
                console.log("discord 봇 알림 전송 성공");
                return true;
            }

            return false;
        } catch (error) {
            console.error("discord 알림 전송 실패", error.message);
            return false;
        }
    }

    async sendTestMessage() {
        try {
            const payload = {
                username: "StelLive Bot",
                content: "봇이 정상적으로 작동 중입니다.(테스트 메시지임)",
            };

            const response = await fetch(this.webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.status === 204) {
                console.log("테스트 메시지 전송 완료");
                return true;
            }
            return false;
        } catch (error) {
            console.error("테스트 메시지 전송 실패", error.message);
            return false;
        }
    }
}
