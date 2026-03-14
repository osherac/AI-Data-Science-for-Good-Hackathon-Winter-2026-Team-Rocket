export const savedScenarios = [
  {
    label: "School office",
    icon: "school",
    detail: "Ask for room help and check in for class.",
  },
  {
    label: "Pharmacy",
    icon: "pharmacy",
    detail: "Find medicine and answer basic questions.",
  },
  {
    label: "Grocery store",
    icon: "grocery",
    detail: "Find food and ask simple price questions.",
  },
  {
    label: "Clinic",
    icon: "clinic",
    detail: "Confirm an appointment and ask for help.",
  },
] as const;

export const generatedPhrases = [
  {
    title: "Suggested phrases",
    items: [
      "Hello, I am here for class.",
      "Please say that again slowly.",
      "Can you help me find the room?",
    ],
  },
  {
    title: "Tap to hear",
    items: [
      "Where should I go?",
      "Thank you for helping me.",
      "I do not understand.",
    ],
  },
] as const;
