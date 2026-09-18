# hams-broadcast

`hams-broadcast`는 사용자의 시스템 언어와 국가에 맞춰 오늘 방영 중인 드라마 상위 5편을 보여 주는 Astro 웹사이트입니다.

## 주요 기능

- TOP 5 horizontal carousel with arrow controls and touch swipe
- Full schedule page grouped and filtered by broadcaster/streaming service

- 브라우저 언어 기반 초기 국가 자동 선택
- 한국어, 영어, 일본어 UI(그 외 언어는 영어로 대체)
- 국가 선택 및 선택값 브라우저 저장
- TVmaze 편성 API를 통한 당일 방영작 조회
- 평점순 상위 5개 작품, 포스터, 채널, 방영 시간 표시
- 10분 자동 갱신 및 수동 새로고침
- API 오류나 빈 편성에 대비한 기본 콘텐츠
- 데스크톱과 모바일 반응형 화면

## 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm install
npm run dev
```

개발 서버는 `http://localhost:3012`에서 실행됩니다.

```sh
npm run build
npm run preview
```

## 데이터 기준

주간 편성은 cron이 매주 월요일 00시에 생성하여 Firestore의 `broadcast/{국가코드_주차}/drama/{자동 ID}` 구조로 저장합니다. 홈과 전체 편성 화면은 `/api/drama`를 통해 현재 국가와 주차의 Firestore 데이터만 조회합니다.

전체 편성 화면의 `수동 생성` 버튼은 `/api/drama/generate`를 호출합니다. 같은 국가·주차의 기존 `drama` 문서를 제거한 뒤 새 데이터를 저장하므로 재실행해도 목록이 중복되지 않습니다.

수동 생성 요청은 `broadcastGenerationHistory/{자동 ID}`에 별도 기록합니다. 국가, 주차, 처리 상태, 호출 prompt, Gemini 원문·파싱 응답, 생성 항목 수와 완료 시각을 저장하며 실패 시 오류 내용도 남깁니다.

지원 국가는 대한민국, 미국, 일본, 영국, 프랑스, 독일, 스페인, 이탈리아입니다. 해당 국가의 당일 편성이 없거나 네트워크 오류가 발생하면 기본 추천작이 표시됩니다.

## 문서

- 변경 이력: `HISTORY.md`
- 에이전트 작업 규칙: `AGENTS.md`
- Claude 작업 안내: `CLAUDE.md`
