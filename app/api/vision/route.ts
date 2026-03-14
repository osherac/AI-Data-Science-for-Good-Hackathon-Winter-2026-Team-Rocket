import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  let body: { imageBase64?: string; imageMimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageBase64, imageMimeType } = body;
  if (!imageBase64 || !imageMimeType) {
    return NextResponse.json({ error: "Missing imageBase64 or imageMimeType" }, { status: 400 });
  }

  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const ai = new GoogleGenAI({ apiKey });
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Describe this image in 1–3 short sentences for an ESL conversation scenario. Focus on place, people, and situation (e.g. pharmacy, doctor’s office, school, store, bus).",
            },
            { inlineData: { mimeType: imageMimeType, data } },
          ],
        },
      ],
    });

    const text = (res as { text?: string }).text ?? "";
    return NextResponse.json({ description: text.trim() });
  } catch (e) {
    console.error("vision error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Vision failed" },
      { status: 500 }
    );
  }
}
