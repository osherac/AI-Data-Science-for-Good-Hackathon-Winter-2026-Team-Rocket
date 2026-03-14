import { GoogleGenAI } from "@google/genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import type { ScenarioState } from "./scenario-state";
import { ScenarioStateAnnotation } from "./scenario-state";

function createModel() {
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.3,
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  });
}

async function learnerAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  const llm = createModel();
  const prompt = `You are the Learner agent. Your only job is to summarize the learner's context for an ESL conversation scenario.

Given the following raw learner info from the app (e.g. from localStorage: past scripts, preferences, level), output a short, structured summary (2-4 sentences) that will help other agents personalize the conversation. Focus on: level, relevant past experience, and any constraints.

Learner info (JSON):
${JSON.stringify(state.userInfo ?? {}, null, 2)}

Output only the summary text, no JSON.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const text = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  return { learnerContext: text.trim() };
}

async function imageUnderstandingAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  if (!state.imageBase64 || !state.imageMimeType) {
    return { imageDescription: "No image provided." };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { imageDescription: "No image provided." };
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
  return { imageDescription: text.trim() || "No description." };
}

async function orchestratorAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
  const llm = createModel();
  const prompt = `You are the Orchestrator agent. You receive:
1) A summary of the learner (from the Learner agent)
2) A description of the current image/situation (from Image Understanding)
3) Optional scenario context (e.g. "doctor", "store")
4) The conversation so far (if any)

Synthesize these into a single, clear "orchestrated context" (one short paragraph) that the Planner will use to decide the next turn. Do not generate dialogue yet—only summarize the situation and what should happen next from the conversation's perspective.

Learner context: ${state.learnerContext}
Image/situation: ${state.imageDescription}
${state.scenarioContext ? `Scenario: ${state.scenarioContext}` : ""}
${state.conversationHistory?.length ? `Conversation so far:\n${state.conversationHistory.map((m) => `${m.role}: ${m.text}`).join("\n")}` : ""}

Output only the orchestrated context paragraph.`;
  const res = await llm.invoke([new HumanMessage(prompt)]);
  const text = typeof res.content === "string" ? res.content : String((res.content as unknown[])?.[0] ?? "");
  return { orchestratedContext: text.trim() };
}

async function plannerAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
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
  return {
    plan: raw,
    voiceAgentLine: parsed.agentLine ?? "",
    suggestedUserResponses: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}

async function taskGeneratorAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
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
  return {
    voiceAgentLine: parsed.voiceAgentLine ?? state.voiceAgentLine ?? "",
    suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses)
      ? parsed.suggestedUserResponses
      : state.suggestedUserResponses ?? [],
  };
}

async function feedbackAgent(state: ScenarioState): Promise<Partial<ScenarioState>> {
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
      return {
        voiceAgentLine: parsed.voiceAgentLine ?? state.voiceAgentLine ?? "",
        suggestedUserResponses: Array.isArray(parsed.suggestedUserResponses)
          ? parsed.suggestedUserResponses
          : state.suggestedUserResponses ?? [],
      };
    }
  } catch {
    /* use state as-is */
  }
  return {};
}

export function buildScenarioGraph() {
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
