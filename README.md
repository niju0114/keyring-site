# 키링 프로필 사이트

QR·NFC 키링이 가리키는 개인 프로필 페이지예요.
키링마다 주소가 `?k=코드` 로 달라지고, 코드별 프로필이 저장돼요.

- **주인이 처음 열면** → 비어있어서 "프로필 만들기"(✏️) → 설정 = 활성화
- **활성화 후 친구가 열면** → 완성된 프로필이 **보기 전용**으로 뜸
- **수정**은 ✏️ 버튼 하나로. 단, **PIN(비밀번호)** 을 알아야 저장됨 → 주인만 수정 가능

저장은 외부 DB 없이 **Netlify Blobs**(Netlify 내장 저장소)를 써서, Netlify 하나로 끝나요.

---

## 폴더 구조
```
keyring-site/
├─ index.html                 # 프로필 화면 + ✏️ 수정 (사이트 본체)
├─ netlify/functions/profile.js  # 프로필 저장/읽기 (PIN 검증)
├─ netlify.toml
└─ package.json
```

## 필요한 것
- Node.js 18 이상
- Netlify 계정 (무료) — https://app.netlify.com

## Claude Code에서 실행 / 배포

1) 의존성 설치
```bash
npm install
```

2) 로컬에서 미리보기 (저장 기능 포함)
```bash
npx netlify dev
```
→ 안내되는 주소(예: http://localhost:8888)로 열기.
- 그냥 열면 `?k=demo` 로 동작해요. 다른 키링을 보려면 `http://localhost:8888/?k=test1` 처럼.

3) 배포 (팀 공유용 진짜 주소 만들기)
```bash
# 로그인(최초 1회)
npx netlify login
# 새 사이트로 배포
npx netlify deploy --prod
```
→ `https://고른이름.netlify.app` 주소가 생겨요. (GitHub에 올려 자동배포해도 됩니다.)
→ **Netlify Blobs는 배포되면 자동 연결**돼서 추가 설정이 필요 없어요.

> 참고: `index.html` 만 파일로 열면 저장이 안 돼요(서버 함수가 안 도니까요). 반드시 `netlify dev` 또는 배포 환경에서 써야 저장됩니다.

## 키링마다 주소 만들기
각 키링 = 메인 주소 + 고유 코드:
```
https://고른이름.netlify.app/?k=ab12
https://고른이름.netlify.app/?k=ab13
...
```
코드(ab12 등)는 키링마다 다르게 아무 문자열이면 돼요(겹치지만 않게).

## NFC / QR에 넣기
- **NFC**: 폰에 **NFC Tools** 앱 → Write → "Add a record" → **URL/URI** → 위 키링 주소 입력 → Write. (태그는 **NTAG215** 권장 — 주소가 길어도 넉넉)
- **QR**: 네이버 QR이나 qr-code-generator.com 등에서 위 주소로 QR 생성 → 인쇄.

## 팀에 공유
배포된 메인 주소(예: `https://고른이름.netlify.app/?k=demo`)를 카톡에 보내면 팀원이 바로 보고 만져볼 수 있어요.

## 나중에 다듬을 것
- 배경 사진은 현재 압축해서 저장해요(용량 줄임). 더 키우려면 이미지 전용 저장소(예: Cloudinary) 연동.
- PIN 분실 대비(복구) 흐름.
- 키링 코드 자동 발급/관리 페이지(관리자용).
