const SOURCE_ORIGIN =
  import.meta.env.DRAMA_CATALOG_SOURCE_URL || "https://tvhot2.com";

import type {
  CatalogBroadcast,
  CatalogBroadcastDetail,
} from "./crawlers/types";

export type { CatalogBroadcast, CatalogBroadcastDetail } from "./crawlers/types";

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function text(value = "") {
  return decodeHtml(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export async function fetchDramaCatalog(
  page: number,
  sourceOrigin = SOURCE_ORIGIN,
): Promise<CatalogBroadcast[]> {
  const sourceUrl = new URL("/drama", sourceOrigin);
  if (page > 1) sourceUrl.searchParams.set("page", String(page));

  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`목록 제공 서버 응답 오류 (${response.status})`);

  const html = (await response.text())
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const cards = html.match(/<li\s+class="gallery-card"[\s\S]*?<\/li>/gi) || [];
  const items = cards
    .map((card): CatalogBroadcast | null => {
      const detailPath =
        card.match(
          /onclick="location\.href='https?:\/\/[^/]+(\/drama\/\d+\/\d+)'/i,
        )?.[1] || "";
      const image = card.match(/<img[^>]+src="([^"]+)"[^>]*>/i)?.[1] || "";
      const imageAlt = card.match(/<img[^>]+alt="([^"]*)"[^>]*>/i)?.[1] || "";
      const titleHtml =
        card.match(/<div\s+class="title">([\s\S]*?)<\/div>/i)?.[1] || imageAlt;
      const genreHtml =
        card.match(/<span\s+class="genre">([\s\S]*?)<\/span>/i)?.[1] || "";
      const ratingText = card.match(
        /<span\s+class="rating">[\s\S]*?([0-9]+(?:\.[0-9]+)?)[\s\S]*?<\/span>/i,
      )?.[1];
      const title = text(titleHtml);
      if (!title || !image.startsWith("https://") || !detailPath) return null;
      return {
        detailKey: Buffer.from(detailPath).toString("base64url"),
        title,
        thumbnailUrl: decodeHtml(image),
        genres: text(genreHtml)
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean),
        rating: ratingText ? Number(ratingText) : null,
        isUpdated: /class="ud_new"/i.test(card),
      };
    })
    .filter((item): item is CatalogBroadcast => item !== null);

  if (!items.length) throw new Error("드라마 목록 구조를 읽지 못했습니다.");
  return items;
}

export async function fetchCatalogFromUrl(
  page: number,
  sourceUrl: string,
): Promise<CatalogBroadcast[]> {
  const url = new URL(sourceUrl);
  const board = url.pathname.split("/").filter(Boolean)[0] || "";
  if (board) {
    const ajaxUrl = new URL("/bbs/ajax.list_sort.php", url.origin);
    ajaxUrl.searchParams.set("bo_table", board);
    ajaxUrl.searchParams.set("sst", "wr_num, wr_reply");
    ajaxUrl.searchParams.set("page", String(page));
    ajaxUrl.searchParams.set("wr_1", "");
    const ajaxResponse = await fetch(ajaxUrl, {
      headers: {
        Accept: "application/json",
        Referer: url.href,
        "User-Agent":
          "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!ajaxResponse.ok)
      throw new Error(`목록 API 응답 오류 (${ajaxResponse.status})`);
    const data = (await ajaxResponse.json()) as {
      list?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (data.error) throw new Error(String(data.error));
    const list = Array.isArray(data.list) ? data.list : [];
    if (!list.length) throw new Error("목록의 마지막 페이지입니다.");
    return list
      .map((value): CatalogBroadcast | null => {
        const title = String(value.subject || "").trim();
        const thumbnailUrl = String(value.img || "").trim();
        const href = String(value.href || "");
        let detailPath = "";
        try {
          detailPath = new URL(href, url).pathname;
        } catch {
          /* invalid detail URL */
        }
        if (
          !title ||
          !thumbnailUrl ||
          !detailPath ||
          /item\.|\$\{|['"]\s*\+|\+\s*['"]/.test(title)
        )
          return null;
        return {
          detailKey: Buffer.from(detailPath).toString("base64url"),
          title,
          thumbnailUrl,
          genres: String(value.genre || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          rating: Number(value.rating) > 0 ? Number(value.rating) : null,
          isUpdated: Boolean(value.is_new),
        };
      })
      .filter((item): item is CatalogBroadcast => item !== null);
  }
  if (page > 1) url.searchParams.set("page", String(page));
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`목록 서버 응답 오류 (${response.status})`);
  const html = await response.text();
  const cards = html.match(/<li\s+class="gallery-card"[\s\S]*?<\/li>/gi) || [];
  const items = cards
    .map((card): CatalogBroadcast | null => {
      const absoluteDetail =
        card.match(/onclick="location\.href='(https?:\/\/[^']+)'/i)?.[1] ||
        card.match(/href="(https?:\/\/[^\"]+)"/i)?.[1] ||
        "";
      let detailPath = "";
      try {
        detailPath = new URL(absoluteDetail, url).pathname;
      } catch {
        /* invalid detail URL */
      }
      const image = card.match(/<img[^>]+src="([^"]+)"[^>]*>/i)?.[1] || "";
      const imageAlt = card.match(/<img[^>]+alt="([^"]*)"[^>]*>/i)?.[1] || "";
      const title = text(
        card.match(/<div\s+class="title">([\s\S]*?)<\/div>/i)?.[1] || imageAlt,
      );
      const genreHtml =
        card.match(/<span\s+class="genre">([\s\S]*?)<\/span>/i)?.[1] || "";
      const ratingText = card.match(
        /<span\s+class="rating">[\s\S]*?([0-9]+(?:\.[0-9]+)?)[\s\S]*?<\/span>/i,
      )?.[1];
      let thumbnailUrl = "";
      try {
        thumbnailUrl = new URL(decodeHtml(image), url).href;
      } catch {
        /* invalid image URL */
      }
      if (
        !title ||
        !thumbnailUrl ||
        !detailPath ||
        /item\.|\$\{|['"]\s*\+|\+\s*['"]/.test(title)
      )
        return null;
      return {
        detailKey: Buffer.from(detailPath).toString("base64url"),
        title,
        thumbnailUrl,
        genres: text(genreHtml)
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean),
        rating: ratingText ? Number(ratingText) : null,
        isUpdated: /class="ud_new"/i.test(card),
      };
    })
    .filter((item): item is CatalogBroadcast => item !== null);
  if (!items.length) throw new Error("목록 구조를 읽지 못했습니다.");
  return items;
}

export async function fetchCatalogPageCount(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`페이지 정보 응답 오류 (${response.status})`);
  const html = await response.text();
  const pages = [...html.matchAll(/[?&]page=(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return Math.max(1, ...pages);
}

export async function fetchDramaDetail(
  detailKey: string,
  sourceOrigin = SOURCE_ORIGIN,
): Promise<CatalogBroadcastDetail> {
  let detailPath = "";
  try {
    detailPath = Buffer.from(detailKey, "base64url").toString("utf8");
  } catch {
    /* invalid key */
  }
  if (!/^\/drama\/\d+\/\d+$/.test(detailPath))
    throw new Error("잘못된 작품 식별자입니다.");

  const response = await fetch(new URL(detailPath, sourceOrigin), {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`상세정보 제공 서버 응답 오류 (${response.status})`);
  const html = await response.text();
  const synopsis = text(
    html.match(/<div\s+class="tmdb-overview">([\s\S]*?)<\/div>/i)?.[1],
  );
  const posterUrl = decodeHtml(
    html.match(
      /<div\s+class="poster-area">[\s\S]*?<img[^>]+src="([^"]+)"/i,
    )?.[1] || "",
  );
  const information = Object.fromEntries(
    [
      ...html.matchAll(
        /<div\s+class="item">[\s\S]*?<span\s+class="lbl">([\s\S]*?)<\/span>[\s\S]*?<span\s+class="val">([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi,
      ),
    ]
      .map((match) => [text(match[1]), text(match[2])])
      .filter(([label]) => Boolean(label)),
  );
  const genreBlock =
    html.match(/<div\s+class="tmdb-genres">([\s\S]*?)<\/div>/i)?.[1] || "";
  const genres = [...genreBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean);
  const castBlock =
    html.match(/<div\s+class="cast-list">([\s\S]*?)<\/div>/i)?.[1] || "";
  const cast = [
    ...castBlock.matchAll(
      /<span\s+class="cast-item">[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<span\s+class="name">([\s\S]*?)<\/span>[\s\S]*?<\/span>/gi,
    ),
  ]
    .map((match) => ({
      name: text(match[2]),
      imageUrl: decodeHtml(match[1] || ""),
    }))
    .filter((person) => person.name);
  return { synopsis, posterUrl, genres, information, cast };
}

export async function fetchCatalogDetail(
  detailKey: string,
  sourceUrl: string,
): Promise<CatalogBroadcastDetail> {
  let detailPath = "";
  try {
    detailPath = Buffer.from(detailKey, "base64url").toString("utf8");
  } catch {
    /* invalid key */
  }
  if (
    !detailPath.startsWith("/") ||
    detailPath.startsWith("//") ||
    detailPath.includes("..")
  )
    throw new Error("잘못된 작품 식별자입니다.");
  const origin = new URL(sourceUrl).origin;
  const response = await fetch(new URL(detailPath, origin), {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; HamsBroadcast/1.0; metadata catalog)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`상세정보 서버 응답 오류 (${response.status})`);
  const html = await response.text();
  const synopsis = text(
    html.match(/<div\s+class="tmdb-overview">([\s\S]*?)<\/div>/i)?.[1],
  );
  const posterUrl = decodeHtml(
    html.match(
      /<div\s+class="poster-area">[\s\S]*?<img[^>]+src="([^"]+)"/i,
    )?.[1] || "",
  );
  const information = Object.fromEntries(
    [
      ...html.matchAll(
        /<div\s+class="item">[\s\S]*?<span\s+class="lbl">([\s\S]*?)<\/span>[\s\S]*?<span\s+class="val">([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi,
      ),
    ]
      .map((match) => [text(match[1]), text(match[2])])
      .filter(([label]) => Boolean(label)),
  );
  const genreBlock =
    html.match(/<div\s+class="tmdb-genres">([\s\S]*?)<\/div>/i)?.[1] || "";
  const genres = [...genreBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean);
  const castBlock =
    html.match(/<div\s+class="cast-list">([\s\S]*?)<\/div>/i)?.[1] || "";
  const cast = [
    ...castBlock.matchAll(
      /<span\s+class="cast-item">[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<span\s+class="name">([\s\S]*?)<\/span>[\s\S]*?<\/span>/gi,
    ),
  ]
    .map((match) => ({
      name: text(match[2]),
      imageUrl: decodeHtml(match[1] || ""),
    }))
    .filter((person) => person.name);
  return { synopsis, posterUrl, genres, information, cast };
}
