import type {
  CatalogBroadcast,
  CatalogBroadcastDetail,
  CatalogCrawler,
} from "./types";

const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function text(value = "") {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function absoluteUrl(value: string, base: URL) {
  try {
    return new URL(decodeHtml(value), base).href;
  } catch {
    return "";
  }
}

async function fetchHtml(url: URL) {
  const response = await fetch(url, {
    headers: { ...REQUEST_HEADERS, Referer: url.origin },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`누누티비 서버 응답 오류 (${response.status})`);
  return response.text();
}

export function parseNoooCatalog(html: string, sourceUrl: URL): CatalogBroadcast[] {
  const listHtml = html.match(/<ul\s+class=["']movie-list["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const cards = listHtml.match(/<li\b[\s\S]*?<\/li>/gi) || [];
  return cards
    .map((card): CatalogBroadcast | null => {
      const href = card.match(/<a[^>]+href=["']([^"']*program_view\.php\?[^"']*id=\d+[^"']*)["']/i)?.[1] || "";
      const image = card.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
      const title = text(card.match(/<div\s+class=["']title["'][^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)?.[1]);
      if (!href || !title || !image) return null;

      const detailUrl = new URL(decodeHtml(href), sourceUrl);
      const detailPath = `${detailUrl.pathname}${detailUrl.search}`;
      const thumbnailUrl = absoluteUrl(image, sourceUrl);
      if (!thumbnailUrl) return null;
      return {
        detailKey: Buffer.from(detailPath).toString("base64url"),
        title,
        thumbnailUrl,
        genres: [],
        rating: null,
        isUpdated: false,
      };
    })
    .filter((item): item is CatalogBroadcast => item !== null);
}

export function parseNoooDetail(html: string, detailUrl: URL): CatalogBroadcastDetail {
  const synopsis = text(
    html.match(/<div\s+class=["']overview["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
  );
  const posterSource =
    html.match(/<ul\s+class=["']movie-episode-list["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    html.match(/<div\s+class=["']poster["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    "";
  const information: Record<string, string> = {};
  const infoBlock = html.match(/<div\s+class=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  for (const match of infoBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)) {
    const value = text(match[1]);
    const registered = value.match(/^등록된 날짜\s+(.+)$/);
    const views = value.match(/^조회수\s+(.+)$/);
    if (registered) information["등록된 날짜"] = registered[1];
    if (views) information["조회수"] = views[1];
  }
  return {
    synopsis,
    posterUrl: absoluteUrl(posterSource, detailUrl),
    genres: [],
    information,
    cast: [],
  };
}

async function fetchPage(page: number, sourceUrl: string) {
  const url = new URL(sourceUrl);
  if (page > 1) url.searchParams.set("page", String(page));
  else url.searchParams.delete("page");
  const items = parseNoooCatalog(await fetchHtml(url), url);
  if (!items.length) throw new Error("누누티비 목록 구조를 읽지 못했습니다.");
  return items;
}

async function fetchPageCount(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const html = await fetchHtml(url);
  const paging = html.match(/<div\s+class=["']paging["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html;
  const pages = [...paging.matchAll(/[?&](?:amp;)?page=(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return Math.max(1, ...pages);
}

async function fetchDetail(detailKey: string, sourceUrl: string) {
  let detailPath = "";
  try {
    detailPath = Buffer.from(detailKey, "base64url").toString("utf8");
  } catch {
    // Validated below.
  }
  if (!/^\/nnnn\/program_view\.php\?id=\d+(?:&.*)?$/.test(detailPath)) {
    throw new Error("잘못된 누누티비 작품 식별자입니다.");
  }
  const detailUrl = new URL(detailPath, new URL(sourceUrl).origin);
  return parseNoooDetail(await fetchHtml(detailUrl), detailUrl);
}

export const noooCrawler: CatalogCrawler = {
  id: "nooo",
  supports: (url) => /^nooo\d*\.tv$/i.test(url.hostname) && /\/program_list\.php$/i.test(url.pathname),
  fetchPage,
  fetchPageCount,
  fetchDetail,
};
