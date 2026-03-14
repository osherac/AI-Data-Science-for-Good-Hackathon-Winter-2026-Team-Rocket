import { Annotation } from "@langchain/langgraph";

export type ConversationTurn = { role: "agent" | "user"; text: string };

const overwrite = <T,>(_: T, right: T): T => right;

export const ScenarioStateAnnotation = Annotation.Root({
  userInfo: Annotation<Record<string, unknown>>({
    default: () => ({}),
    value: (_, right) => right ?? {},
  }),
  imageBase64: Annotation<string | undefined>({
    default: () => undefined,
    value: overwrite,
  }),
  imageMimeType: Annotation<string | undefined>({
    default: () => undefined,
    value: overwrite,
  }),
  conversationHistory: Annotation<ConversationTurn[]>({
    default: () => [],
    value: (_, right) => right ?? [],
  }),
  scenarioContext: Annotation<string | undefined>({
    default: () => undefined,
    value: overwrite,
  }),
  learnerContext: Annotation<string>({
    default: () => "",
    value: (_, right) => right ?? "",
  }),
  imageDescription: Annotation<string>({
    default: () => "",
    value: (_, right) => right ?? "",
  }),
  orchestratedContext: Annotation<string>({
    default: () => "",
    value: (_, right) => right ?? "",
  }),
  plan: Annotation<string>({
    default: () => "",
    value: (_, right) => right ?? "",
  }),
  voiceAgentLine: Annotation<string>({
    default: () => "",
    value: (_, right) => right ?? "",
  }),
  suggestedUserResponses: Annotation<string[]>({
    default: () => [],
    value: (_, right) => right ?? [],
  }),
});

export type ScenarioState = typeof ScenarioStateAnnotation.State;
