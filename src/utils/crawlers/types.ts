export type CatalogBroadcast = {
  detailKey: string;
  title: string;
  thumbnailUrl: string;
  genres: string[];
  rating: number | null;
  isUpdated: boolean;
};

export type CatalogBroadcastDetail = {
  synopsis: string;
  posterUrl: string;
  genres: string[];
  information: Record<string, string>;
  cast: Array<{ name: string; imageUrl: string }>;
};

/** A site-specific catalog crawler implementation. */
export interface CatalogCrawler {
  readonly id: string;
  supports(sourceUrl: URL): boolean;
  fetchPage(page: number, sourceUrl: string): Promise<CatalogBroadcast[]>;
  fetchPageCount(sourceUrl: string): Promise<number>;
  fetchDetail(
    detailKey: string,
    sourceUrl: string,
  ): Promise<CatalogBroadcastDetail>;
}
