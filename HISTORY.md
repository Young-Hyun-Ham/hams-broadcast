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

- 공개 콘텐츠 목록의 검색을 현재 페이지 클라이언트 필터 방식에서 최신 카탈로그 전체의 제목·장르를 조회하는 서버 검색과 검색 결과 페이지네이션 방식으로 변경했습니다.

- 모든 카테고리의 수동 생성 이력을 공통 `catalogHistory` 컬렉션에 실행별로 기록하고, 전체·성공·실패 건수와 단계·페이지·작품·오류 정보가 포함된 실패 상세 배열을 저장하도록 통합했습니다.
- 카탈로그 작품 저장을 개별 결과 추적이 가능한 Firestore BulkWriter 방식으로 변경하여 한 작품의 저장 실패가 나머지 작품 저장을 중단하지 않도록 개선했습니다.
- 카탈로그 수동 생성이 Firestore 쓰기 제한으로 중단되면 부모 문서를 실패 상태로 기록하고, 다음 실행에서 저장된 항목 수 이후부터 이어서 저장하도록 개선했습니다.

- 대한민국 드라마 수집 프롬프트의 기준일을 `YYYY년 MM월 DD일` 형식으로 표시하도록 변경했습니다.
- 편성표 목록 썸네일의 원본 크기를 판별해 세로 포스터는 채워 표시하고, 가로·정사각 이미지는 흐린 배경 위에 전체 이미지가 보이도록 개선했습니다.
- 공통 헤더에 드라마 메뉴를 추가하고, 외부 공개 목록의 제목·장르·평점·썸네일을 별도 API로 읽는 드라마 컬렉션 페이지를 추가했습니다.
- 드라마 컬렉션의 데스크톱 목록을 한 줄에 6개씩 표시하도록 조정했습니다.
- 드라마 카드 선택 시 줄거리, 첫 방영일, 국가, 언어, 장르 및 배우 사진을 포함한 출연진을 상세 모달에서 지연 로딩하도록 추가했습니다.
- 크롤링한 목록을 Firebase `drama` 컬렉션의 `YYYYMMDD-순번` 문서로 저장하고 최신 페이지 데이터를 조회하도록 변경했습니다.
- 상세정보는 등장인물 데이터가 없는 문서만 다시 수집한 뒤 해당 Firebase 문서에 저장하도록 변경했습니다.
- Firebase `drama` 문서 하나의 `items` 배열에 31페이지 전체 작품을 저장하도록 구조를 변경하고, 목록/상세 크롤링 작업마다 `dramaHistory` 이력을 기록하도록 추가했습니다.
- `drama/{날짜-순번}/items/{제목-문서키}` 구조로 작품별 서브컬렉션 문서를 저장하도록 변경했습니다.
- 드라마 페이지의 페이지 번호를 10개씩 표시하고 태블릿 6열, 모바일 3열로 반응형 목록을 조정했습니다.
- 상세 페이지 출연진의 중첩 마크업을 올바르게 파싱해 등장인물 데이터 저장과 모달 표시가 누락되던 문제를 수정했습니다.
- 상세 모달의 포스터를 `contain` 방식으로 표시해 원본 이미지가 잘리지 않도록 수정했습니다.
- 데스크톱 상세 모달 높이를 포스터 영역인 510px에 맞추고 긴 상세 내용은 우측 영역에서 스크롤되도록 변경했습니다.
- 상세 모달 내부 높이 전달을 보완해 우측 스크롤을 복원하고 포스터는 최대 크기 제한으로 전체가 보이도록 수정했습니다.
- 관리자 페이지를 대시보드·드라마·애니·전체 편성표 탭으로 개편하고 크롤링 주소 검증/저장, 드라마 수동 생성 및 CRUD 기능을 추가했습니다.
- 관리자 크롤링 주소에 추억의 드라마, 예능, 시사/다큐, 추억의 예능, 해외드라마, 해외 예능/다큐를 추가하고 애니를 일반·극장판으로 분리했습니다.
- 관리자 크롤링 주소 저장 상태를 버튼 아래에 표시하고 3초 후 자동으로 사라지도록 변경했습니다.
- 크롤링 주소 저장 상태를 절대 배치해 메시지 변화와 관계없이 설정 저장 버튼 위치가 고정되도록 수정했습니다.
- 관리자 드라마 목록에 제목 부분 일치 검색과 검색 결과 페이지 처리를 추가했습니다.
- 관리자 드라마 추가/수정 폼에서 등장인물(극중 인물명, 배우명, 이미지 URL)을 직접 편집하고 저장할 수 있도록 개선
- 관리자 드라마 등장인물 편집을 구분자 텍스트 방식에서 개별 입력 행 추가·삭제 방식으로 변경
- 관리자 드라마 등장인물 입력란의 이름·배우 이름을 한 행에 배치하고 라벨과 입력창을 가로 정렬
- 관리자 드라마 등장인물 삭제 버튼을 입력란 아래로 이동하고 편집·목록 영역에 독립 스크롤 적용
- 관리자 드라마 등장인물 삭제 버튼을 이미지 URL 입력창 우측에 배치
- 관리자 국가 선택 UI가 없을 때에도 기본 국가 코드 `KR`로 편성 데이터를 불러오도록 보완
- 관리자 드라마 목록을 페이지당 10개로 조정하고 페이지 번호를 최대 15개까지 표시
- 관리자 드라마 목록에 등장인물 보유 여부를 표시하고 미수집 작품은 상세 크롤링으로 즉시 업데이트하는 기능 추가
- 관리자 드라마 목록에서 등장인물이 없는 전체 작품을 일괄 크롤링해 저장하고 작품별 이력을 남기는 기능 추가
- WEBP 드라마 썸네일을 원본 URL과 별도의 Base64 필드로 Firestore에 보관하고 전용 이미지 API로 표시하는 기능 추가
- 썸네일 데이터 저장 대상을 WEBP뿐 아니라 JPG, JPEG, PNG, GIF, AVIF 이미지까지 확대
- 드라마 수동 생성 시 목록 크롤링 완료 후 썸네일 이미지 데이터 필드를 자동 생성하도록 연동
- 관리자 첫 번째 탭과 기본 진입 화면으로 대시보드를 복구
- 카테고리별 수동 생성 버튼이 대시보드의 해당 크롤링 주소를 사용해 독립 Firestore 컬렉션을 생성하도록 연결
- 카테고리 수동 생성에서 등장인물·썸네일 데이터 수집을 분리하고 생성된 최신 목록 조회를 연결
- 영화 크롤러가 스크립트 템플릿의 `item.subject`를 작품으로 오인하지 않도록 제외하고 중복 없는 마지막 페이지까지 최대 100페이지 수집
- 한국영화 등 대용량 카탈로그는 사이트 AJAX 목록 API와 실제 마지막 페이지를 사용해 전체 페이지를 병렬 수집
- 카탈로그 수동 생성 시 재시도 후 실패한 페이지는 이력에 기록하고 건너뛴 뒤 다음 페이지 수집을 계속하도록 변경
- 공통 카테고리 목록에서 등장인물이 없는 작품에 UPDATE 버튼을 표시하고 상세 크롤링·저장을 연결
- 모든 카테고리 목록 페이지네이션을 드라마와 동일한 이전·최대 15개 페이지 번호·다음 구성으로 통일
- 롤백 후 공통 카테고리 페이지네이션의 이전·최대 15개 페이지 번호·다음 구성을 재적용
- 관리자 공통 전체편성 UI와 API의 Drama 명칭을 Broadcast로 리팩터링하고 공통 카탈로그 유틸리티 파일명도 Broadcast 기준으로 변경
- 등장인물과 썸네일 관리자 API를 category 기반 공통 라우터로 통합하고 드라마 포함 모든 카테고리 버튼을 연결
- 공통 헤더 드라마 메뉴를 11개 카테고리 드롭다운으로 확장하고 공통 목록·상세·썸네일 API 페이지를 연결
- 공개 공통 카탈로그 페이지를 broadcasts.astro로 변경하고 api/catalog의 드라마 전용 중복 라우터를 제거
- Header activePage와 공개 카탈로그 화면의 공통 명칭을 broadcasts/Broadcast로 변경하고 기존 /dramas는 리다이렉트로 유지
