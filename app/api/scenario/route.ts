import { NextRequest, NextResponse } from "next/server";
import { buildScenarioGraph } from "@/lib/scenario-graph";

export type ScenarioBody = {
  imageBase64?: string;
  imageMimeType?: string;
  userInfo?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "agent" | "user"; text: string }>;
  scenarioContext?: string;
};

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
    const result = await graph.invoke({
      userInfo,
      imageBase64,
      imageMimeType,
      conversationHistory,
      scenarioContext,
    });

    return NextResponse.json({
      voiceAgentLine: result.voiceAgentLine ?? "",
      suggestedUserResponses: Array.isArray(result.suggestedUserResponses)
        ? result.suggestedUserResponses
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
