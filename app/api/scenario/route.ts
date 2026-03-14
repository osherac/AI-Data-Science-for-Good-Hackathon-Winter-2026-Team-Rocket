import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    voiceAgentLine: { type: "string", description: "Next line for the voice agent to speak." },
    suggestedUserResponses: {
      type: "array",
      items: { type: "string" },
      description: "2–4 short phrases the learner can say.",
    },
  },
  required: ["voiceAgentLine", "suggestedUserResponses"],
};

export type ScenarioBody = {
  imageBase64?: string;
  imageMimeType?: string;
  userInfo?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "agent" | "user"; text: string }>;
  scenarioContext?: string;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  let body: ScenarioBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageBase64, imageMimeType, userInfo, conversationHistory = [], scenarioContext } = body;

  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: [
        "You are an ESL scenario pipeline: Orchestrator + Planner + Task Generator.",
        "1. Use the image (if provided) and learner context to understand the situation.",
        "2. Plan the next conversational turn (one voice agent line + suggestions for the learner).",
        "3. Output exactly the next thing the voice agent should say and 2–4 short suggested replies for the learner.",
        "",
        "Learner context (from app):",
        JSON.stringify(userInfo ?? {}, null, 2),
        scenarioContext ? `Scenario: ${scenarioContext}` : "",
        conversationHistory.length
          ? "Recent conversation:\n" +
            conversationHistory
              .map((m) => `${m.role}: ${m.text}`)
              .join("\n")
          : "",
        "",
        "Respond with JSON only: voiceAgentLine (string), suggestedUserResponses (array of 2–4 strings).",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  if (imageBase64 && imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      },
    });
  }

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: SCRIPT_SCHEMA,
      },
    });

    const raw = (res as { text?: string }).text ?? "";
    const parsed = JSON.parse(raw) as {
      voiceAgentLine: string;
      suggestedUserResponses: string[];
    };

    return NextResponse.json({
      voiceAgentLine: parsed.voiceAgentLine ?? "",
      suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses)
        ? parsed.suggestedUserResponses
        : [],
    });
  } catch (e) {
    console.error("scenario API error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 }
    );
  }
}
