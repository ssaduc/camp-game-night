# 우리가족 캠핑게임

폰 하나로 즐기는 가족 게임 6종: 스피드 퀴즈, 10초 맞추기, 초성 퀴즈, 몸으로 말해요, 랜덤 폭탄, 포스터 퀴즈.
포스터 퀴즈는 TMDB(The Movie Database) API로 영화·드라마 이미지를 불러옵니다.

## 폴더 구성

```
camp-game-night/
├─ index.html      앱 화면 (게임 6종 전부)
├─ api/tmdb.js     TMDB 중계 서버 함수 (API 키를 숨겨줌)
├─ package.json
└─ README.md
```

## 1. TMDB API 키 발급 (무료, 약 10분, PC 브라우저 권장)

1. https://www.themoviedb.org/signup 에서 회원가입 → 받은 메일의 인증 링크 클릭 → 로그인
2. 오른쪽 위 프로필 동그라미 → **설정(Settings)** → 왼쪽 메뉴 **API** (바로가기: https://www.themoviedb.org/settings/api)
3. "Request an API Key" 아래 링크 클릭 → 유형은 **Developer** 선택 → 이용약관 동의(Accept)
4. 신청서 작성 (영어로 입력)
   - Type of Use: Personal (개인)
   - Application Name: `Family Camp Game`
   - Application URL: Vercel 주소가 아직 없으면 `https://example.com` 등 임시 주소 입력 가능
   - Application Summary: `A non-commercial family party game that shows movie posters for a guessing quiz.`
   - 이름·이메일·전화·주소 등 개인 정보 칸이 있으면 채움
5. 제출하면 같은 API 화면에 두 값이 나타남
   - **API Key** (32자리)
   - **API Read Access Token** (eyJ로 시작하는 긴 값) ← 이걸 복사해서 사용

> 토큰은 비밀번호처럼 다루세요. GitHub 코드나 index.html에 넣지 말고 Vercel 환경 변수에만 넣습니다.
> 출처 표시: TMDB는 앱에 TMDB 로고와 안내 문구를 넣도록 요구합니다. 문구는 포스터 퀴즈 첫 화면에 이미 들어 있습니다. 로고는 https://www.themoviedb.org/about/logos-attribution 에서 내려받아 넣을 수 있습니다.

## 2. Vercel 배포

### 방법 A: GitHub 연결 (추천)
1. GitHub에 새 저장소를 만들고 이 폴더 내용을 그대로 올림
2. https://vercel.com/new 에서 그 저장소를 Import
3. Framework Preset은 **Other** 그대로 두고, Build 설정은 비워둠
4. **Environment Variables**에 추가
   - Name: `TMDB_TOKEN`
   - Value: 1단계에서 복사한 API Read Access Token
5. Deploy

### 방법 B: Vercel CLI
```bash
npm i -g vercel
cd camp-game-night
vercel            # 처음 한 번 프로젝트 연결
vercel env add TMDB_TOKEN production   # 토큰 붙여넣기
vercel --prod
```

> 환경 변수를 나중에 추가하거나 바꿨다면 **Redeploy** 해야 반영됩니다.

## 3. 확인

- 배포 주소 접속 → 홈 화면 맨 아래에 **"포스터 보고 제목 맞히기"** 타일이 보이면 정상
- `https://<배포주소>/api/tmdb?ping=1` → `{"ok":true,"configured":true}` 이면 키 설정 완료
- 타일이 안 보이면 `/api/tmdb?ping=1` 응답부터 확인

## 4. 폰에서 앱처럼 쓰기

- iPhone(Safari): 공유 버튼 → "홈 화면에 추가"
- Android(Chrome): 메뉴 → "홈 화면에 추가"

## 참고

- 포스터 퀴즈 종류: 한국 영화 / 한국 드라마 / 애니메이션 / 해외 영화 / 다 섞기 / 어린이 만화
- "아이와 함께"를 켜면 영화는 한국 12세·미국 PG 이하 등급 위주로 고릅니다. TMDB 등급 정보가 없는 작품이 많아 결과가 부족하면 자동으로 범위를 넓힙니다. 드라마는 등급 필터가 없습니다.
- "명장면" 모드는 글자가 거의 없는 장면 이미지를 써서 난이도가 높습니다.
- TMDB 이용 조건에 따라 앱 안에 출처 문구를 표시하고 있습니다. 비상업적 개인 용도로만 사용하세요.
- 점수와 이름은 각 폰의 브라우저에만 저장됩니다.
