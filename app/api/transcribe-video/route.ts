import { NextResponse } from "next/server";
import { transcribeVideoReference } from "../../../src/application/useCases/transcribeVideoReference";
import type { VideoTrend } from "../../../src/domain/types";
import { FunAsrTranscriptionClient } from "../../../src/infrastructure/transcription/FunAsrTranscriptionClient";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const video = (await request.json().catch(() => null)) as VideoTrend | null;

  if (!video?.url || !video.title) {
    return NextResponse.json(
      {
        error: "Missing video url or title"
      },
      { status: 400 }
    );
  }

  const transcript = await transcribeVideoReference({
    video,
    transcriber: new FunAsrTranscriptionClient()
  });

  return NextResponse.json(transcript);
}
