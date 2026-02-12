# StelLive 팬딩 크롤링 봇 (Node.js 22)

fanding.kr의 StelLive 크리에이터 페이지를 모니터링하고 새 글이 올라오면 Discord로 알림을 보내는 자동화 봇입니다.

## 주요 기능

- **자동 크롤링**: 오전 9시 ~ 밤12시 : 5분, 밤 12시 ~ 오전9시: 60분마다 새 글 확인
- **Discord 알림**: 새 글 발견 시 즉시 Discord Webhook으로 알림
- **24시간 무료 배포**: Railway에서 무료로 호스팅 가능
- **효율적 감지**: 중복 알림 방지 시스템

## 기술 스택

- **Node.js 22**: ES Modules 사용
- **Puppeteer**: 웹 크롤링
- **node-cron**: 스케줄링
- **Native Fetch API**: HTTP 요청 (Discord Webhook)

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

`.env` 파일을 열어서 Discord Webhook URL 입력:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

### 3단계: 페이지 구조 분석 (필수!)
**(현재 crawler.js에는 fanding에 맞게 작성되어있으니 안하셔도 됩니다)**

**주의 : "봇 탐지(Bot Detection)" 및 "리다이렉트 방어로 인해 작동이 되지 않을 수 있습니다.**

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

## Discord Webhook URL 생성

1. Discord 서버에서 **서버 설정** 열기
2. **연동** → **웹후크** 클릭
3. **새 웹후크** 생성
4. 웹후크 이름 설정 (예: "Stellive Bot")
5. 알림을 받을 채널 선택
6. **웹후크 URL 복사** 버튼 클릭
7. `.env` 파일에 붙여넣기

## 프로젝트 구조

```
backend/
├── src/
│   ├── crawler.js       # Puppeteer 크롤링 로직
│   ├── discord.js       # Discord Webhook 전송
│   └── scheduler.js     # Cron 스케줄러
├── index.js             # 메인 엔트리 포인트
├── test.js              # 테스트 스크립트
├── analyze.js           # 페이지 구조 분석 (디버깅용)
├── package.json         # ES Modules 활성화
└── .env                 # 환경변수 (gitignore)
```

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

1. `.env` 파일의 Webhook URL 확인
2. `npm test` 실행해서 테스트 메시지 전송
3. Discord 채널 권한 확인

## 라이선스

MIT License

---
