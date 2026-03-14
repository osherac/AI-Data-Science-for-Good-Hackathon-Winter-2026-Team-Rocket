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
  const prompt = `You are a learner profiling assistant.

You will be given a conversation history between an ESL learner and an AI language practice agent.

Your job is to build a character profile of the English learner based only on what you observe in the conversation. Start with the following profile and improve using the conversation history.

Output the following:

- **Name:** [Their name, or "Unknown" if not mentioned]
- **Background:** [Where they may be from, their situation — based only on clues in the conversation]
- **English Level:** [Beginner / Elementary / Intermediate — based on how they spoke]
- **Strengths:** [What they are already good at — vocabulary, politeness, sentence structure, etc.]
- **Weaknesses:** [Where they struggle — grammar, word order, tense, etc.]
- **Personality:** [How they come across — shy, confident, eager, hesitant, etc.]
- **Topics They Know Well:** [Subjects or situations where they seemed comfortable]
- **Topics They Struggle With:** [Situations or vocabulary that confused them]

**Rules:**

- Only use what is visible in the conversation — do not invent details
- Be kind and neutral in tone
- Keep each section brief — 1 to 3 points maximum
- This profile will be used to personalize future practice sessions

${hasRecordings ? `All saved recordings (${recordings.length} total):\n${recordings.map((r, i) => `[${i + 1}] ${r.date ?? ""}: ${(r.transcript ?? "").slice(0, 500)}${(r.transcript?.length ?? 0) > 500 ? "…" : ""}`).join("\n\n")}` : "No recordings yet."}

Learner info (JSON):
${JSON.stringify(state.userInfo ?? {}, null, 2)}
${
  state.conversationHistory?.length
    ? `
Conversation history:
${state.conversationHistory.map((m) => `${m.role}: ${m.text}`).join("\n")}`
    : ""
}`;
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
  const prompt = `You are a scenario builder for an English language learning app.

You will be given:

- **IMAGE DESCRIPTION:** A description of a real-world scene
- **LEARNER PROFILE:** A description of an ESL learner's background, personality, and English level

Your job is to combine these into a structured character and scene setup.

Output ONLY a valid JSON object. No extra text, no markdown, no explanation.

{
  "learner": {
    "name": "string — learner's name or 'Unknown'",
    "background": "string — where they are from and their situation",
    "english_level": "string — Beginner / Elementary / Intermediate",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "personality": "string — shy / confident / eager / hesitant / etc."
  },
  "scene": {
    "location": "string — where the scenario takes place",
    "situation": "string — one sentence describing what is happening",
    "mood": "string — calm / busy / stressful / friendly / etc."
  },
  "conversation_partner": {
    "name": "string — a fitting name for this character",
    "role": "string — e.g. cashier, doctor, neighbour, coworker",
    "personality": "string — how they should behave toward the learner",
    "opening_line": "string — the first thing they say to start the conversation"
  }
}

**Rules:**

- Output ONLY the JSON — no preamble or closing text
- Base the conversation partner entirely on who would realistically be in the scene
- Match complexity to the learner's english level
- Keep all language at or below a Canadian Grade 5 level
- If any detail is unknown, make a reasonable guess based on context

Learner context (from all recordings): ${state.learnerContext}
Image/situation: ${state.imageDescription}
${state.scenarioContext ? `Scenario: ${state.scenarioContext}` : ""}
${state.conversationHistory?.length ? `Conversation so far:\n${state.conversationHistory.map((m: ConversationTurn) => `${m.role}: ${m.text}`).join("\n")}` : ""}`;
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
  const prompt = `You are a conversation partner in an English language practice session.

You will be given:

- LEARNER PROFILE: A description of the ESL learner's background, level, and personality
- CONVERSATION PARTNER: A description of who you are playing in this scenario
- SCENE: A description of where this conversation is taking place
- CONVERSATION HISTORY: Everything said so far

Your job is to reply as the conversation partner — say only the next thing your character would naturally say.

Rules:

- Stay in character at all times
- Keep your response to 1 to 3 sentences maximum
- Use simple, natural language (Grade 5 level or below)
- Match your tone to the scene mood and your character's personality
- If the learner makes a grammar mistake, do NOT correct them — just respond naturally
- If the learner seems confused, gently rephrase or slow down
- Never break character or mention that this is a practice session
- End your line in a way that invites the learner to respond

Plan:
${state.plan}`;
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
  const prompt = `You are a **conversation script reviewer for English language learners**.

Your job is to review a generated conversation and make sure it follows the **scenario and language level rules**.

You will receive:

- A **scenario description**
- A **conversation script between two people**

Your task is to check that the conversation is **simple, correct, and stays within the scenario**.

---

**Rules:**

- All language by PersonB be at or below a **Canadian Grade 5 reading level**
- Sentences should be **short, clear, and simple**
- Avoid complex words, idioms, slang, or technical language
- The conversation must **stay within the scenario**
- Do **not allow new topics or goals** that were not in the scenario
- The characters must behave **in a way that matches the scenario roles**
- The conversation should feel **natural and realistic**

---

**What to Check:**

1. **Language Level**
    - Words should be easy for a **10–11 year old** native english speaker to understand
    - Sentences should not be long or complex
    - Replace difficult words with simpler ones when needed
2. **Scenario Alignment**
    - The conversation follows the **plot summary**
    - The **key talking points appear in the conversation**
    - The speakers stay in the **same setting and situation**
    - The goal of the interaction does not change
3. **Character Consistency**
    - Person A behaves like an **ESL learner**
    - Person B behaves like a **patient, friendly native speaker**
    - Their roles match the **characters defined in the scenario**

---

**Output the following in** a structured json output:

**Review Result:** PASS or FAIL

**Language Issues:**

- List any lines that are too complex for Grade 5 English
- Suggest a **simpler version**

**Scenario Issues:**

- List any places where the conversation **leaves the scenario or adds unrelated content**

**Missing Talking Points:**

- List any **key phrases or ideas from the scenario** that were not used

**Suggestions:**

- Provide short, clear edits that would fix the problems

---

**Important:**

- Do **not rewrite the full conversation**
- Only flag and suggest fixes where needed
- Keep feedback **clear, short, and structured**

Voice agent line: ${state.voiceAgentLine}
Suggested responses: ${JSON.stringify(state.suggestedUserResponses ?? [])}`;
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
