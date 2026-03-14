import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }

  const file = formData.get("audio") as File | null;
  if (!file || !(file instanceof Blob)) {
    console.error("[transcribe] Missing or invalid file. formData keys:", [...formData.keys()]);
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const fileSize = file.size;
  const fileType = file.type || "(none)";
  console.log("[transcribe] Received file:", { size: fileSize, type: fileType });

  try {
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      console.error("[transcribe] File arrayBuffer is empty");
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    const body = new FormData();
    const blob = new Blob([arrayBuffer], { type: file.type || "audio/webm" });
    body.set("file", blob, "audio.webm");
    body.set("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

    const errText = await res.text();
    if (!res.ok) {
      console.error("[transcribe] OpenAI error:", res.status, errText);
      return NextResponse.json(
        { error: errText || "Transcription failed" },
        { status: res.status }
      );
    }

    const data = JSON.parse(errText) as { text?: string };
    console.log("[transcribe] Success, text length:", data.text?.length ?? 0);
    return NextResponse.json({ transcript: data.text ?? "" });
  } catch (e) {
    console.error("[transcribe] Exception:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
