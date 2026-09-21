export const catalogCategories = {
  drama: { title: "드라마", sourceKey: "drama", collection: "drama" },
  "korean-movie": { title: "한국영화", sourceKey: "koreanMovie", collection: "koreanMovie" },
  "foreign-movie": { title: "해외영화", sourceKey: "foreignMovie", collection: "foreignMovie" },
  "foreign-drama": { title: "해외드라마", sourceKey: "worldDrama", collection: "worldDrama" },
  entertainment: { title: "예능", sourceKey: "entertainment", collection: "entertainment" },
  anime: { title: "일반애니", sourceKey: "generalAnime", collection: "generalAnime" },
  "anime-movie": { title: "극장판 애니", sourceKey: "animatedMovie", collection: "animatedMovie" },
  "old-drama": { title: "추억의 드라마", sourceKey: "oldDrama", collection: "oldDrama" },
  documentary: { title: "시사/다큐", sourceKey: "currentAffairs", collection: "currentAffairs" },
  "old-entertainment": { title: "추억의 예능", sourceKey: "oldEntertainment", collection: "oldEntertainment" },
  "foreign-entertainment": { title: "해외(예능/다큐)", sourceKey: "overseasEntertainment", collection: "overseasEntertainment" },
} as const;

export type CatalogCategory = keyof typeof catalogCategories;

export function getCatalogCategory(value: string) {
  return value in catalogCategories ? catalogCategories[value as CatalogCategory] : null;
}
