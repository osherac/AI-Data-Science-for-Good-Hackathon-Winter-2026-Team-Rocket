import { GoogleGenAI } from "@google/genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import type { ScenarioState, ConversationTurn } from "./scenario-state";
import { ScenarioStateAnnotation } from "./scenario-state";

function createModel() {
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.3,
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  });
}

function logAgentStart(name: string, state: Partial<ScenarioState>, extra?: string) {
  const preview: Record<string, string> = {};
  if (state.userInfo != null) preview.userInfoKeys = Object.keys(state.userInfo).join(", ");
  if (state.learnerContext) preview.learnerContext = state.learnerContext.slice(0, 80) + (state.learnerContext.length > 80 ? "…" : "");
  if (state.imageDescription) preview.imageDescription = state.imageDescription.slice(0, 80) + (state.imageDescription.length > 80 ? "…" : "");
  if (state.orchestratedContext) preview.orchestratedContext = state.orchestratedContext.slice(0, 80) + "…";
  if (state.plan) preview.planLength = String(state.plan.length);
  if (state.conversationHistory?.length) preview.turnCount = String(state.conversationHistory.length);
  console.log(`[scenario:${name}] Starting.`, extra ?? "", JSON.stringify(preview));
}

function logAgentEnd(name: string, output: Partial<ScenarioState>) {
  const preview: Record<string, string> = {};
  if (output.learnerContext) preview.learnerContext = output.learnerContext.slice(0, 100) + (output.learnerContext.length > 100 ? "…" : "");
  if (output.imageDescription) preview.imageDescription = output.imageDescription.slice(0, 80) + "…";
  if (output.orchestratedContext) preview.orchestratedContext = output.orchestratedContext.slice(0, 100) + "…";
  if (output.voiceAgentLine) preview.voiceAgentLine = output.voiceAgentLine.slice(0, 60) + "…";
  if (output.suggestedUserResponses?.length) preview.suggestionsCount = String(output.suggestedUserResponses.length);
  console.log(`[scenario:${name}] Done.`, JSON.stringify(preview));
}

async function learnerAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("learner", state, "(reading all recordings and userInfo)");
  const userInfo = state.userInfo ?? {};
  const recordings = (userInfo.recordings as Array<{ id?: string; transcript?: string; date?: string }>) ?? [];
  const hasRecordings = Array.isArray(recordings) && recordings.length > 0;

  const llm = createModel();
  const prompt = `You are the Learner agent. You receive ALL saved recordings from the app (transcribed audio) plus any other learner info.

Your job: read every recording and produce a short, structured summary (2-5 sentences) for the Orchestrator. Include: what the learner has practiced, level, recurring topics or gaps, and any constraints. Use this so the Orchestrator can personalize the next conversation.

${hasRecordings ? `All saved recordings (${recordings.length} total):\n${recordings.map((r, i) => `[${i + 1}] ${r.date ?? ""}: ${(r.transcript ?? "").slice(0, 500)}${(r.transcript?.length ?? 0) > 500 ? "…" : ""}`).join("\n\n")}` : "No recordings yet."}

Other learner info (JSON): ${JSON.stringify({ ...userInfo, recordings: undefined }, null, 2)}

Output only the summary text, no JSON.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const text = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  const learnerContext = text.trim();
  logAgentEnd("learner", { learnerContext });
  return { learnerContext };
}

async function imageUnderstandingAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("image_understanding", state);
  if (!state.imageBase64 || !state.imageMimeType) {
    console.log("[scenario:image_understanding] Done. No image provided.");
    return { imageDescription: "No image provided." };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[scenario:image_understanding] Done. No API key.");
    return { imageDescription: "No image provided." };
  }
  const data = state.imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Describe this image in 1-3 short sentences for an ESL conversation scenario. Focus on: place, people, and situation (e.g. pharmacy, doctor's office, school, store, bus). Output only the description.",
          },
          { inlineData: { mimeType: state.imageMimeType, data } },
        ],
      },
    ],
  });
  const text = (res as { text?: string }).text ?? "";
  const imageDescription = text.trim() || "No description.";
  logAgentEnd("image_understanding", { imageDescription });
  return { imageDescription };
}

async function orchestratorAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("orchestrator", state);
  const llm = createModel();
  const prompt = `You are the Orchestrator agent. You receive:
1) Learner context (from the Learner agent)—a summary derived from ALL the learner's saved recordings (transcripts and dates). Use this to personalize the conversation.
2) A description of the current image/situation (from Image Understanding)
3) Optional scenario context (e.g. "doctor", "store")
4) The conversation so far (if any)

Synthesize these into a single, clear "orchestrated context" (one short paragraph) that the Planner will use to decide the next turn. Do not generate dialogue yet—only summarize the situation and what should happen next from the conversation's perspective.

Learner context (from all recordings): ${state.learnerContext}
Image/situation: ${state.imageDescription}
${state.scenarioContext ? `Scenario: ${state.scenarioContext}` : ""}
${state.conversationHistory?.length ? `Conversation so far:\n${state.conversationHistory.map((m: ConversationTurn) => `${m.role}: ${m.text}`).join("\n")}` : ""}

Output only the orchestrated context paragraph.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const text = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  const orchestratedContext = text.trim();
  logAgentEnd("orchestrator", { orchestratedContext });
  return { orchestratedContext };
}

async function plannerAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("planner", state);
  const llm = createModel();
  const prompt = `You are the Planner agent. Given the orchestrated context, decide the next conversational turn:

1) What the voice agent (e.g. clerk, doctor, driver) should say next—one natural line.
2) What short phrases (2-4) to suggest for the learner to reply.

Output valid JSON only, no markdown:
{"agentLine":"...", "suggestions":["...", "..."]}`;
  const res = await llm.invoke([
    new HumanMessage(`Orchestrated context:\n${state.orchestratedContext}\n\n${prompt}`),
  ]);
  const raw = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  const parsed = (() => {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      return m ? (JSON.parse(m[0]) as { agentLine?: string; suggestions?: string[] }) : {};
    } catch {
      return {};
    }
  })();
  const out = {
    plan: raw,
    voiceAgentLine: parsed.agentLine ?? "",
    suggestedUserResponses: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
  logAgentEnd("planner", out);
  return out;
}

async function taskGeneratorAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("task_generator", state);
  const llm = createModel();
  const prompt = `You are the Task Generator agent. The Planner produced a plan. Turn it into the final script:

Plan:
${state.plan}

Output valid JSON only:
{"voiceAgentLine":"<exact line for the voice agent to speak>", "suggestedUserResponses":["<phrase 1>", "<phrase 2>", ...]}

Give 2-4 suggested user responses. Keep the voice agent line natural and one sentence.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const raw = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  const parsed = (() => {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      return m ? (JSON.parse(m[0]) as { voiceAgentLine?: string; suggestedUserResponses?: string[] }) : {};
    } catch {
      return {};
    }
  })();
  const out = {
    voiceAgentLine: parsed.voiceAgentLine ?? state.voiceAgentLine ?? "",
    suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses)
      ? parsed.suggestedUserResponses
      : state.suggestedUserResponses ?? [],
  };
  logAgentEnd("task_generator", out);
  return out;
}

async function feedbackAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  logAgentStart("feedback", state);
  const llm = createModel();
  const prompt = `You are the Feedback agent. Review the generated turn and ensure it's ready for the learner.

Voice agent line: ${state.voiceAgentLine}
Suggested responses: ${JSON.stringify(state.suggestedUserResponses ?? [])}

If anything is unclear or inappropriate for ESL, fix it. Output valid JSON only:
{"voiceAgentLine":"...", "suggestedUserResponses":[...]}

Otherwise output the same content.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const raw = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { voiceAgentLine?: string; suggestedUserResponses?: string[] };
      const out = {
        voiceAgentLine: parsed.voiceAgentLine ?? state.voiceAgentLine ?? "",
        suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses)
          ? parsed.suggestedUserResponses
          : state.suggestedUserResponses ?? [],
      };
      logAgentEnd("feedback", out);
      return out;
    }
  } catch {
    /* use state as-is */
  }
  logAgentEnd("feedback", { voiceAgentLine: state.voiceAgentLine, suggestedUserResponses: state.suggestedUserResponses });
  return {};
}

export function buildScenarioGraph() {
  console.log("[scenario] Building graph (learner → image_understanding → orchestrator → planner → task_generator → feedback).");
  const graph = new StateGraph(ScenarioStateAnnotation)
    .addNode("learner", learnerAgent)
    .addNode("image_understanding", imageUnderstandingAgent)
    .addNode("orchestrator", orchestratorAgent)
    .addNode("planner", plannerAgent)
    .addNode("task_generator", taskGeneratorAgent)
    .addNode("feedback", feedbackAgent)
    .addEdge(START, "learner")
    .addEdge(START, "image_understanding")
    .addEdge(["learner", "image_understanding"], "orchestrator")
    .addEdge("orchestrator", "planner")
    .addEdge("planner", "task_generator")
    .addEdge("task_generator", "feedback")
    .addEdge("feedback", END);

  return graph.compile();
}

export type ScenarioGraph = ReturnType<typeof buildScenarioGraph>;
