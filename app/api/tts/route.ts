import { NextRequest, NextResponse } from "next/server";

const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";
const VOICE_ID = "e07c00bc-4134-4eae-9ea4-1a55fb45746b";

export async function POST(req: NextRequest) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "CARTESIA_API_KEY not set" }, { status: 500 });
  }

  let body: { transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript = body.transcript ?? "";
  if (!transcript.trim()) {
    return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
  }

  try {
    const res = await fetch(CARTESIA_URL, {
      method: "POST",
      headers: {
        "Cartesia-Version": "2025-04-16",
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript,
        voice: { mode: "id", id: VOICE_ID },
        output_format: {
          container: "wav",
          encoding: "pcm_f32le",
          sample_rate: 44100,
        },
        speed: "normal",
        generation_config: { speed: 1, volume: 1 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err || "TTS failed" }, { status: res.status });
    }

    const bytes = await res.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return NextResponse.json({ audioBase64: base64, mimeType: "audio/wav" });
  } catch (e) {
    console.error("tts error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TTS failed" },
      { status: 500 }
    );
  }
}
