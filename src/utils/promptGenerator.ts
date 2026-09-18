type CountryCode = 'JP' | 'US' | 'KR' | string;

interface PromptOptions {
  countryCode: CountryCode;
}

/**
  국가 코드를 받아 해당 국가의 드라마 방영 정보 수집용 프롬프트를 생성합니다.
 */
export function generateDramaPrompt({ countryCode }: PromptOptions): string {
  const code = countryCode.toUpperCase();
  const requestedAt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 국가별 방송사 및 특이사항 설정
  const countryConfigs: Record<string, { countryName: string; broadcasters: string; notes: string }> = {
    JP: {
      countryName: "일본",
      broadcasters: `
- 지상파 주요 키국: NHK, NTV(니혼TV), TBS, Fuji TV(후지TV), TV Asahi(TV아사히), TV Tokyo(TV도쿄)
- 주요 위성/BS/CS 및 OTT: WOWOW, NHK BS, NHK BS Premium
- OTT: 넷플릭스 (Netflix Japan TOP 10 시리즈)`,
      notes: `
- 분기별(1분기~4분기) 쿨(Cool) 편성 체계 및 분기별 주요 렌도라(연속드라마) 라인업을 반영할 것.
- 드라마 제목은 현지 원어 제목과 필요 시 한국어 번역을 병기할 것.
- 방영 시간은 현지 시간 기준으로 HH:MM 형식으로 표기할 것.
- 넷플릭스 데이터는 마지막에 수집하여 목록에서 후순위로 나오게 한다. 넷플릭스 작품이 방송사 작품과 중복될 경우에도 데이터를 중복 수집한다.
`
    },
    US: {
      countryName: "미국",
      broadcasters: `
- 지상파 네트워크: NBC, CBS, ABC, FOX, The CW
- 주요 프리미엄 케이블 및 OTT: HBO, Showtime, Starz, FX
- OTT: 넷플릭스 (Netflix America TOP 10 시리즈)`,
      notes: `
- 시즌제 방영 특성을 고려하여 시즌 번호(예: Season 1) 정보를 제목이나 슬롯에 함께 반영할 것.
- 드라마 제목은 현지 원어 제목과 필요 시 한국어 번역을 병기할 것.
- 방영 시간은 현지 시간 기준으로 HH:MM 형식으로 표기할 것.
- 넷플릭스 데이터는 마지막에 수집하여 목록에서 후순위로 나오게 한다. 넷플릭스 작품이 방송사 작품과 중복될 경우에도 데이터를 중복 수집한다.
`
    },
    KR: {
      countryName: "대한민국",
      broadcasters: `
- 지상파: KBS, SBS, MBC
- 종편: JTBC, TV CHOSUN, MBN, 채널A
- 주요 케이블: tvN, ENA
- OTT: 넷플릭스 (Netflix Korea TOP 10 시리즈)`,
      notes: `
- 평일/주말 및 시간대별 슬롯(예: 금토드라마, 토일드라마)을 명확히 구분할 것.
- 드라마 제목은 현지 원어 제목과 필요 시 한국어 번역을 병기할 것.
- 방영 시간은 현지 시간 기준으로 HH:MM 형식으로 표기할 것.
- 넷플릭스 데이터는 마지막에 수집하여 목록에서 후순위로 나오게 한다. 넷플릭스 작품이 방송사 작품과 중복될 경우에도 데이터를 중복 수집한다.
`
    }
  };

  // 등록되지 않은 국가 코드 입력 시 기본 템플릿 적용
  const config = countryConfigs[code] || {
    countryName: code,
    broadcasters: `- ${code} 국가의 주요 지상파, 케이블 및 주요 방영 채널 전체`,
    notes: `
- 해당 국가의 주요 드라마 방영 시간대 및 편성 특징을 반영할 것.
- 드라마 제목은 현지 원어 제목과 필요 시 한국어 번역을 병기할 것.
- 방영 시간은 현지 시간 기준으로 HH:MM 형식으로 표기할 것.
- 넷플릭스 데이터는 마지막에 수집하여 목록에서 후순위로 나오게 한다. 넷플릭스 작품이 방송사 작품과 중복될 경우에도 데이터를 중복 수집한다.
`
  };

  return `[기준일]
${requestedAt}

[목표]
현재 시점 기준 ${config.countryName}(${code}) 주요 방송사에서 방영 중인 드라마 목록과 넷플릭스(Netflix) 대한민국 TOP 10 시리즈(드라마) 전체 목록을 수집하여 지정된 JSON 규격으로 출력해줘.

[필수 조사 절차]
1. 각 방송사, 공식 드라마 페이지를 확인 하고 namu.wiki에서 최신 자료를 가져온다. (단, namu.wiki에 없는 경우 공식 방송사 페이지를 우선적으로 확인)
2. 넷플릭스 TOP 10 시리즈(드라마) 목록은 ${code == "KR" ? "https://www.netflix.com/tudum/top10/south-korea/tv" : code == "JP" ? "https://www.netflix.com/tudum/top10/japan/tv" : "https://www.netflix.com/tudum/top10/america/tv"} 사이트에서 반드시 확인한다.
3. 평일·주말·일일·월화·수목·금토·토일 드라마를 모두 확인한다.
4. 방송사별 대표작 한 편만 고르거나 임의로 TOP 목록을 만들지 않는다.
5. 현재 신규 회차를 방영 중인 모든 작품을 포함한다. 종영작과 방영 예정작은 제외한다.
6. 특정 방송사에 한 편만 확인되면 다른 요일 편성까지 다시 검색한 후 실제 한 편인지 검증한다.
7. 정보 일부를 찾지 못해도 작품 자체를 누락하지 말고 해당 필드를 빈 배열 또는 빈 문자열로 둔다.
8. 썸네일/포스터 이미지를 가져올 때 namu.wiki에서 제공하는 포스터 url을 우선적으로 사용. 반드시 드라마인지 확인하고, 공식 방송사 페이지에서 가져올 때는 해당 작품의 공식 포스터/썸네일인지 확인한다.
9. 넷플릭스의 썸네일/포스터 이미지는 
${code == "KR" ? "https://www.netflix.com/tudum/top10/south-korea/tv" : code == "JP" ? "https://www.netflix.com/tudum/top10/japan/tv" : "https://www.netflix.com/tudum/top10/america/tv"} 
사이트에 반드시 있다. "https://[도메인].nflxso.net/dnm/api/v6/[파일명].webp?r=59e" .webp 형태의 url을 그대로 가져온다.

[대상 방송사]
${config.broadcasters}

[필수 수집 데이터]
1. 방송사/채널명 (broadcaster)
2. 드라마 정보:
   - 제목 (title) - 현지 원어 제목 및 필요 시 한국어 번역 병기
   - 편성 정보 (slot) 및 방영 요일 배열 (airDays)
   - 방영 시간 (airTime, HH:MM 형식)
   - 썸네일/포스터 이미지 URL (thumbnailUrl)
   - 연출/감독 배열 (directors)
   - 출연진 배열 (cast): 배우 이름(name), 역할 이름(roleName), 주연 여부(isLead: true/false)
   - 등장인물 상세 배열 (characters): 인물명(name), 담당 배우(actor), 인물 설명(description)

[참고사항]
${config.notes}

[출력 스키마 규칙]
- 설명이나 인사말 없이 오직 유효한 평탄 JSON 배열(Array) 데이터만 출력할 것.
- 배열의 각 원소는 드라마 한 작품이며 broadcaster, title, slot, airDays, airTime, thumbnailUrl, directors, cast, characters 필드를 가져야 한다.
- 방송사별 dramas 중첩 배열을 만들지 않는다.
- cast와 characters 배열에는 주연 배우를 포함해 주요 등장인물 정보를 상세하게 포함할 것.`;
}

// ==========================================
// 사용 예시 (일본 'JP' 전달 시)
// ==========================================
// const japanPrompt = generateDramaPrompt({ countryCode: 'JP' });
// console.log(japanPrompt);
