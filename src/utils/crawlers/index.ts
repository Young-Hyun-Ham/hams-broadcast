import { noooCrawler } from "./nooo";
import { tvhotCrawler } from "./tvhot";
import type {
  CatalogBroadcast,
  CatalogBroadcastDetail,
  CatalogCrawler,
} from "./types";

export type { CatalogBroadcast, CatalogBroadcastDetail, CatalogCrawler };

// Register site-specific crawlers from most specific to most general.
const crawlers: readonly CatalogCrawler[] = [noooCrawler, tvhotCrawler];

export function getCatalogCrawler(sourceUrl: string): CatalogCrawler {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("크롤링 주소가 올바른 URL이 아닙니다.");
  }

  const crawler = crawlers.find((candidate) => candidate.supports(url));
  if (!crawler) {
    throw new Error(`${url.hostname} 사이트를 지원하는 크롤러가 없습니다.`);
  }
  return crawler;
}

export function fetchCatalogFromUrl(
  page: number,
  sourceUrl: string,
): Promise<CatalogBroadcast[]> {
  return getCatalogCrawler(sourceUrl).fetchPage(page, sourceUrl);
}

export function fetchCatalogPageCount(sourceUrl: string): Promise<number> {
  return getCatalogCrawler(sourceUrl).fetchPageCount(sourceUrl);
}

export function fetchCatalogDetail(
  detailKey: string,
  sourceUrl: string,
): Promise<CatalogBroadcastDetail> {
  return getCatalogCrawler(sourceUrl).fetchDetail(detailKey, sourceUrl);
}
