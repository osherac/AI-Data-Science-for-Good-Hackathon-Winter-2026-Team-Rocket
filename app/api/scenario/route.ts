import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildScenarioGraph } from "@/lib/scenario-graph";

export type ScenarioBody = {
  imageBase64?: string;
  imageMimeType?: string;
  userInfo?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "agent" | "user"; text: string }>;
  scenarioContext?: string;
};

const SCRIPT_SCHEMA = {
  type: "object" as const,
  properties: {
    voiceAgentLine: { type: "string", description: "Next line for the voice agent." },
    suggestedUserResponses: {
      type: "array",
      items: { type: "string" },
      description: "2–4 short phrases the learner can say.",
    },
  },
  required: ["voiceAgentLine", "suggestedUserResponses"],
};

async function fallbackSingleCall(
  body: ScenarioBody
): Promise<{ voiceAgentLine: string; suggestedUserResponses: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const { imageBase64, imageMimeType, userInfo = {}, conversationHistory = [], scenarioContext } = body;
  const ai = new GoogleGenAI({ apiKey });
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: [
        "You are an ESL scenario generator. Output the next voice agent line and 2–4 suggested user responses.",
        "Learner context:",
        JSON.stringify(userInfo, null, 2),
        scenarioContext ? `Scenario: ${scenarioContext}` : "",
        conversationHistory.length
          ? "Conversation:\n" + conversationHistory.map((m) => `${m.role}: ${m.text}`).join("\n")
          : "",
        "Respond with JSON only: voiceAgentLine (string), suggestedUserResponses (array of strings).",
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
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", responseSchema: SCRIPT_SCHEMA },
  });
  const raw = (res as { text?: string }).text ?? "";
  const parsed = JSON.parse(raw || "{}") as { voiceAgentLine?: string; suggestedUserResponses?: string[] };
  return {
    voiceAgentLine: parsed.voiceAgentLine ?? "",
    suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses) ? parsed.suggestedUserResponses : [],
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  let body: ScenarioBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    imageBase64,
    imageMimeType,
    userInfo = {},
    conversationHistory = [],
    scenarioContext,
  } = body;

  try {
    const graph = buildScenarioGraph();
    const input = {
      userInfo,
      imageBase64,
      imageMimeType,
      conversationHistory,
      scenarioContext,
    };
    // LangGraph 1.x state expects OverwriteValue wrappers; cast to satisfy invoke() input type
    const result = await graph.invoke(input as unknown as Parameters<typeof graph.invoke>[0]);

    return NextResponse.json({
      voiceAgentLine: result.voiceAgentLine ?? "",
      suggestedUserResponses: Array.isArray(result.suggestedUserResponses)
        ? result.suggestedUserResponses
        : [],
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Generation failed";
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined;
    const full = cause ? `${message}: ${cause}` : message;
    console.error("scenario API error", e);
    if (e instanceof Error && e.stack) console.error(e.stack);

    const isFilesystemError =
      typeof message === "string" &&
      (message.includes("filesystem") || message.includes("illegal path"));
    if (isFilesystemError) {
      try {
        const fallback = await fallbackSingleCall(body);
        return NextResponse.json(fallback);
      } catch (fallbackErr) {
        console.error("scenario fallback error", fallbackErr);
        return NextResponse.json(
          { error: fallbackErr instanceof Error ? fallbackErr.message : "Generation failed" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: full || "Generation failed" },
      { status: 500 }
    );
  }
}
