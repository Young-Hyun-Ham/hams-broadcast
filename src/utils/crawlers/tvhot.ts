import {
  fetchCatalogDetail,
  fetchCatalogFromUrl,
  fetchCatalogPageCount,
} from "../tvhotBroadcastCatalog";
import type { CatalogCrawler } from "./types";

/**
 * Crawler for the current TVHot/Gnuboard-shaped source.
 *
 * It remains the fallback while existing crawler settings contain only a URL.
 * A future site crawler can be registered before this one with a narrower
 * `supports` predicate.
 */
export const tvhotCrawler: CatalogCrawler = {
  id: "tvhot",
  supports: () => true,
  fetchPage: fetchCatalogFromUrl,
  fetchPageCount: fetchCatalogPageCount,
  fetchDetail: fetchCatalogDetail,
};
