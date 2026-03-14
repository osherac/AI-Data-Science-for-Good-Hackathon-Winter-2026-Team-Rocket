import { Annotation } from "@langchain/langgraph";

export type ConversationTurn = { role: "agent" | "user"; text: string };

export const ScenarioStateAnnotation = Annotation.Root({
  userInfo: Annotation<Record<string, unknown>>({
    default: () => ({}),
  }),
  imageBase64: Annotation<string | undefined>({
    default: () => undefined,
  }),
  imageMimeType: Annotation<string | undefined>({
    default: () => undefined,
  }),
  conversationHistory: Annotation<ConversationTurn[]>({
    default: () => [],
  }),
  scenarioContext: Annotation<string | undefined>({
    default: () => undefined,
  }),
  learnerContext: Annotation<string>({
    default: () => "",
  }),
  imageDescription: Annotation<string>({
    default: () => "",
  }),
  orchestratedContext: Annotation<string>({
    default: () => "",
  }),
  plan: Annotation<string>({
    default: () => "",
  }),
  voiceAgentLine: Annotation<string>({
    default: () => "",
  }),
  suggestedUserResponses: Annotation<string[]>({
    default: () => [],
  }),
});

export type ScenarioState = typeof ScenarioStateAnnotation.State;
