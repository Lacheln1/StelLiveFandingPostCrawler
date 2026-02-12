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
                    text: "비공식 팬메이드 fanding.kr StelLive Bot",
                },
                // timestamp 필드 제거 - 현재 시간이 아닌 실제 포스트 작성 시간만 표시
            };

            // 이미지가 있는 경우 추가
            if (post.image) {
                embed.thumbnail = {
                    url: post.image,
                };
            }

            // 디스코드 봇 정보
            const payload = {
                username: "스텔라이브 팬딩 새글 알리미",
                avatar_url:
                    "https://img1.daumcdn.net/thumb/R1280x0/?scode=mtistory2&fname=https%3A%2F%2Fblog.kakaocdn.net%2Fdna%2FdClPpz%2FdJMcadVczDG%2FAAAAAAAAAAAAAAAAAAAAAHwGQVgkg23KKXaaWNxltFxibCZvYCbp7JmJsNSFzP4o%2Fimg.png%3Fcredential%3DyqXZFxpELC7KVnFOS48ylbz2pIh7yKj8%26expires%3D1772290799%26allow_ip%3D%26allow_referer%3D%26signature%3DriidgfwUjK5%252BoOLs1WF9iM0EFBU%253D",
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
            if (response.status === 204) {
                console.log("디스코드 봇 연결 성공");
                return true;
            }
            return false;
        } catch (error) {
            console.error("디스코드 봇 연결 실패", error.message);
            return false;
        }
    }
}
