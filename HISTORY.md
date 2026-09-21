# hams-broadcast 변경 이력

## 2026-09-17

### Added

- Week-based JSON schedule snapshots stored under `data/`
- Weekly Monday 00:00 refresh model and snapshot-backed UI

### Removed

- Ten-minute automatic portal refresh
- Korean Netflix title, synopsis, and official artwork enrichment for country TOP 10
- Retry handling for temporary Netflix official-data failures
- Server-side Netflix official country TV TOP 10 proxy with six-hour memory cache
- KBS2 drama schedule collection through Naver portal search
- Naver portal schedule/search adapter for MBC, SBS, and tvN drama discovery

### Removed

- TVmaze schedule requests from the main and full-schedule pages
- Drama detail dialog with current episode, synopsis, airtime, network, and official link
- Episode-level TVmaze schedule data and preserved MBC/tvN episode labels

### Changed

- 수동 생성 요청의 prompt, Gemini 응답 데이터, 처리 결과를 `broadcastGenerationHistory` 컬렉션에 기록
- Gemini 응답의 평탄 배열과 방송사별 `dramas` 중첩 배열을 모두 Firestore 서브컬렉션 문서로 저장
- Gemini Google Search grounding으로 방송사별 최신 편성을 개별 조사하고 대표작이 아닌 방영 중 전체 목록을 요청
- 검색 도구 사용 시 빈 텍스트 응답을 재시도하고 종료 사유를 오류 이력에 기록하도록 보강
- 전체 편성의 방송사별 섹션을 하나의 카드 목록으로 통합하고 각 제목 위에 방송사명을 굵게 표시
- 방송사 필터 버튼을 줄바꿈 표시하고 Netflix 필터를 마지막에 고정
- 홈과 전체 편성 목록을 Firestore `broadcast/{country_week}/drama` 데이터 조회 방식으로 전환
- 전체 편성 화면에 주간 데이터를 다시 저장하는 수동 생성 버튼 추가
- 기존 방송사·포털·Netflix 직접 조회 API와 로컬 JSON 스냅샷 생성 로직 제거
- 프로젝트 이름과 관련 Markdown 문서를 `hams-broadcast` 명칭에 맞게 정리
- Deduplicated repeated weekly broadcasts by normalized drama title
- Fixed desktop schedule thumbnails at 300 × 400 px with uncropped images and titles below
- Simplified full-schedule cards to thumbnail and drama title only
- Weekly all/Monday-Sunday schedule filters with localized day labels
- Netflix TOP 10 filter pinned to the final broadcaster position
- Local server API adapters for official MBC JSON and tvN schedule data
- Astro Node standalone server mode for broadcaster-side schedule fetching
- Official weekly Netflix country TV TOP 10 section
- Explicit MBC, SBS, and tvN channel entries for the Korean schedule
- Separated the saved header locale/default country from the schedule viewing-country filter
- Country-driven UI language switching for all eight supported countries
- Country button list above the broadcaster schedule filters
- Strong active-state styling for dynamically generated broadcaster buttons
- Removed the duplicate custom arrow from the shared country selector
- Shared `Header.astro` component applied to every page
- Main TOP 5 horizontal carousel with arrow controls and touch swipe
- Full schedule page grouped by broadcaster and streaming service
- Broadcaster filters with country-aware live schedule refresh

- 시스템 언어 기반 초기 국가 및 UI 언어 선택
- 한국어, 영어, 일본어 UI 번역
- 국가 선택 메뉴와 브라우저 저장
- TVmaze 당일 편성 조회, 중복 제거, 평점 기준 상위 5개 정렬
- 포스터, 방송사, 방영 시간, 평점을 제공하는 드라마 카드
- 10분 자동 갱신과 수동 새로고침
- API 오류 및 빈 편성을 위한 기본 추천 콘텐츠
- 반응형 편집 매거진 스타일의 첫 화면
- 프로젝트 운영 문서 `README.md`, `AGENTS.md`, `CLAUDE.md`
# 2026-09-18

- 메인 화면의 포스터 카드가 긴 콘텐츠 때문에 그리드 열 너비를 벗어나 서로 겹치지 않도록 카드 최소 너비와 오버플로를 제한했습니다.
- 원본 이미지 크기가 포스터 프레임 높이를 늘리지 않도록 이미지를 2:3 프레임 내부에 절대 배치해 카드가 서로 겹쳐 보이는 현상을 수정했습니다.
- `innerHTML`로 동적 생성된 TOP 5 카드에도 Astro 스타일이 적용되도록 카드 내부 선택자를 전역 처리했습니다.

# 2026-09-21

- 대한민국 드라마 수집 프롬프트의 기준일을 `YYYY년 MM월 DD일` 형식으로 표시하도록 변경했습니다.
