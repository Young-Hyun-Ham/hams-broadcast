# hams-broadcast 작업 지침

`hams-broadcast`는 Astro 기반 국가별 실시간 드라마 편성 웹사이트입니다.

## 작업 원칙

1. Astro 컴포넌트와 브라우저 표준 기능을 우선 사용합니다.
2. UI 문구는 한국어, 영어, 일본어 번역 누락 여부를 확인합니다.
3. 외부 API의 실패를 고려해 기본 데이터와 오류 안내를 유지합니다.
4. `TOP 5`는 TVmaze 당일 편성작을 평점순으로 정렬한 결과입니다.
5. 국가 선택은 `localStorage`에 보존하며 최초 방문은 브라우저 언어를 사용합니다.
6. 변경 내용을 `HISTORY.md`에 기록하고 `npm run build`로 검증합니다.

## 주요 파일

- `src/pages/index.astro`: 화면, 번역, 국가 설정, 편성 조회
- `src/layouts/Layout.astro`: 공통 문서 구조와 전역 스타일
- `README.md`: 실행 방법과 데이터 정책
- `HISTORY.md`: 변경 이력
