import { NextResponse } from "next/server";
import { getHotVideos } from "../../../src/application/useCases/getHotVideos";
import { isCategory } from "../../../src/domain/categories";
import { isPlatform } from "../../../src/domain/platforms";
import type { Category, Platform, TrendFetchResult } from "../../../src/domain/types";
import { createLiveTrendSource } from "../../../src/infrastructure/trends/createTrendSource";
import { FallbackTrendSource } from "../../../src/infrastructure/trends/FallbackTrendSource";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedCategory = url.searchParams.get("category");
  const requestedPlatform = url.searchParams.get("platform");
  const category: Category = isCategory(requestedCategory) ? requestedCategory : "AI科技";
  const platform: Platform = isPlatform(requestedPlatform) ? requestedPlatform : "bilibili";

  const result = await getHotVideos({
    category,
    platform,
    liveSource: createLiveTrendSource(platform),
    fallbackSource: new FallbackTrendSource()
  });

  return NextResponse.json(result satisfies TrendFetchResult);
}
