# StelLive 팬딩 크롤링 봇 (Node.js 22)

fanding.kr의 StelLive 크리에이터 페이지를 모니터링하고 새 글이 올라오면 Discord로 알림을 보내는 자동화 봇입니다.

## 주요 기능

- **자동 크롤링**: 오전 9시 ~ 밤12시 : 5분, 밤 12시 ~ 오전9시: 60분마다 새 글 확인
- **Discord 봇 알림**: 새 글 발견 시 discord.js 봇을 통해 다중 서버에 알림
- **슬래시 커맨드**: `/setchannel` 명령어로 알림 채널 설정
- **다중 서버 지원**: 여러 Discord 서버에 동시 알림 전송
- **효율적 감지**: 중복 알림 방지 시스템
- **SQLite 영속화**: 게시글·길드 설정·lastPostId를 DB에 저장하여 재시작 시에도 유지
- **REST API**: Express 기반 API 서버로 게시글 조회, 봇 상태 확인 가능

## 기술 스택

- **Node.js 22**: ES Modules 사용
- **discord.js**: Discord 봇 클라이언트
- **Puppeteer**: 웹 크롤링
- **node-cron**: 스케줄링
- **better-sqlite3**: SQLite DB (WAL 모드)
- **Express**: REST API 서버

## 설치 및 실행

### 1단계: 의존성 설치

```bash
npm install
```

### 2단계: 환경변수 설정

`.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일을 열어서 Discord 봇 토큰 입력:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
PORT=3000
```

### 3단계: 페이지 구조 분석
**(현재 crawler.js에는 fanding에 맞게 작성되어있으니 4단계 혹은 5단계로 넘어가셔도 됩니다.)**

**주의 : 실행 시 봇 탐지 및 리다이렉트 방어로 인해 작동이 되지 않을 수 있습니다.**

```bash
npm run analyze
```

이 명령어는:
- fanding.kr 페이지를 자동으로 열고
- HTML 구조를 분석해서
- 올바른 선택자를 추천해줍니다

출력된 선택자를 `src/crawler.js` 파일에 적용하세요. 

### 4단계: 테스트

```bash
npm test
```

### 5단계: 봇 실행

```bash
npm start
```

## 5단계 제한 사항(중요!)
- 백엔드가 별도로 배포되어 있지 않습니다.
- 서버가 로컬 환경에서 실행되므로 IDE 또는 터미널을 계속 켜두어야 합니다.
- IDE 또는 터미널을 종료하면 서버가 중단됩니다.

## Discord 봇 토큰 발급

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 **New Application** 클릭
2. **Bot** 탭에서 **Add Bot** 클릭
3. **Reset Token**으로 토큰 발급 후 `.env` 파일에 붙여넣기
4. **OAuth2 → URL Generator**에서 `bot`, `applications.commands` 스코프 선택
5. Bot Permissions에서 `Send Messages`, `Embed Links` 권한 선택
6. 생성된 URL로 봇을 서버에 초대

## 프로젝트 구조

```
backend/
├── data/
│   └── bot.db           # SQLite DB (gitignore)
├── src/
│   ├── crawler.js       # Puppeteer 크롤링 로직
│   ├── database.js      # SQLite DB 래퍼 (posts, guilds, meta 테이블)
│   ├── discord.js       # Discord 봇 클라이언트 및 알림 전송
│   ├── guildConfig.js   # 길드별 채널 설정 관리 (DB 위임)
│   ├── scheduler.js     # Cron 스케줄러
│   └── server.js        # Express REST API 서버
├── index.js             # 메인 엔트리 포인트
├── test.js              # 테스트 스크립트
├── analyze.js           # 페이지 구조 분석 (디버깅용)
├── package.json         # ES Modules 활성화
└── .env                 # 환경변수 (gitignore)
```

## API 엔드포인트

봇 실행 시 Express API 서버가 함께 시작됩니다 (기본 포트: 3000).

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/posts` | 게시글 목록 (`?page=1&limit=20`) |
| GET | `/api/posts/:id` | 게시글 상세 |
| GET | `/api/status` | 봇 상태 (uptime, posts, guilds, lastPostId) |

## 크롤링 주기 변경

**현재 설정 (기본값 - 권장)**
**시간대별 차등 크롤링** - 효율적이고 안전

- **활동 시간대 (09:00~23:59)**: 5분마다
- **비활동 시간대 (00:00~08:59)**: 1시간마다
- **하루 총 접속**: 약 189회 (매우 안전)

---

**설정 변경 방법**

`src/scheduler.js` 파일을 수정하세요.

#### 옵션 1: 시간대별 차등 크롤링 (현재 설정 - 권장)

```javascript
start() {
  // 활동 시간대 (9시~23시): 5분마다
  const activeHoursTask = cron.schedule('*/5 9-23 * * *', async () => {
    // 크롤링 로직
  });

  // 비활동 시간대 (0시~8시): 1시간마다
  const inactiveHoursTask = cron.schedule('0 0-8 * * *', async () => {
    // 크롤링 로직
  });
}
```

**시간대 커스터마이징:**
```javascript
// 활동 시간: 오전 8시 ~ 자정까지 3분마다
'*/3 8-23 * * *'

// 활동 시간: 오전 10시 ~ 밤 11시까지 10분마다
'*/10 10-22 * * *'

// 비활동 시간: 자정 ~ 오전 7시까지 2시간마다
'0 0-7/2 * * *'
```

---

#### 옵션 2: 고정 주기 크롤링

모든 시간대에 동일한 주기로 크롤링하려면:

```javascript
start() {
  // 5분마다 (하루 288회 - 안전)
  this.task = cron.schedule('*/5 * * * *', async () => {
    // 크롤링 로직
  });
}
```

**다른 주기 예시:**
```javascript
// 10분마다 (하루 144회 - 매우 안전, 기본 권장)
this.task = cron.schedule('*/10 * * * *', async () => {

// 15분마다 (하루 96회 - 안전)
this.task = cron.schedule('*/15 * * * *', async () => {

// 30분마다 (하루 48회 - 매우 안전)
this.task = cron.schedule('*/30 * * * *', async () => {

// 1시간마다 (하루 24회 - 극도로 안전)
this.task = cron.schedule('0 * * * *', async () => {
```

---

### 주의사항

**너무 짧은 주기는 권장하지 않습니다!**

| 주기 | 하루 접속 | 상태 | 권장 여부 |
|------|-----------|------|-----------|
| 1분 | 1,440회 | **위험** | IP 차단 위험 |
| 3분 | 480회 | 주의 | 단기만 사용 |
| 5분 | 288회 | 안전 | 권장 |
| 10분 | 144회 | 매우 안전 | 기본 권장 |
| 시간대별 (5분/1시간) | 189회 | 안전 | **최고 권장** |

**과도한 크롤링의 위험:**
- IP 주소 차단
- 법적/윤리적 문제 가능성
- 서비스 방해로 간주될 수 있음

**권장사항:**
- 5분 이상 주기 사용
- 시간대별 차등 크롤링 (최적)
- 장기 운영 시 10분 이상

---

### Cron 표현식 가이드

```
*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    └─ 요일 (0-7, 0과 7은 일요일)
│    │    │    └────── 월 (1-12)
│    │    └─────────── 일 (1-31)
│    └──────────────── 시 (0-23)
└───────────────────── 분 (0-59)
```

**예시:**
- `*/5 * * * *` - 5분마다
- `0 * * * *` - 매시 정각
- `*/10 9-18 * * *` - 오전 9시~오후 6시, 10분마다
- `0 9-17/2 * * *` - 오전 9시~오후 5시, 2시간마다 (9시, 11시, 1시, 3시, 5시)



## 문제 해결

### 페이지 구조 찾기

```bash
npm run analyze
```

이 명령어로 fanding.kr의 실제 HTML 구조를 확인할 수 있습니다.

### Discord 알림이 오지 않을 때

1. `.env` 파일의 봇 토큰 확인
2. 봇이 서버에 초대되어 있는지 확인
3. `/setchannel` 명령어로 알림 채널이 설정되어 있는지 확인
4. 봇에 해당 채널의 메시지 전송 권한이 있는지 확인

## 라이선스

MIT License

## 면책 고지

본 프로젝트는 팬 메이드 프로젝트이며 공식 단체와 아무 관련이 없습니다. 본 프로젝트 사용으로 인해 발생하는 모든 책임은 사용자 본인에게 있습니다.

