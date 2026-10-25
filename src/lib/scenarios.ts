// Suggested test prompts shown in the Test Orders panel.

export const ORDER_PROMPTS: Record<string, string> = {
  "ORD-101": "Where is my order ORD-101?",
  "ORD-102": "I want to return my order ORD-102",
  "ORD-103": "Please cancel my order ORD-103",
};

export const SCENARIOS = [
  {
    label: "Return an opened product",
    prompt: "I bought a serum 20 days ago and have opened it. Can I return it?",
  },
  { label: "Cancel ORD-101", prompt: "Can you cancel my order ORD-101?" },
  { label: "Book a flight to Goa", prompt: "Can you book me a flight to Goa?" },
  { label: "Track ORD-999 (invalid)", prompt: "Where is my order ORD-999?" },
  { label: "Is shipping free?", prompt: "Is shipping free on a 400 rupee order?" },
  { label: "COD limit", prompt: "Can I pay cash on delivery for a 3000 rupee order?" },
  { label: "Damaged product", prompt: "My face wash arrived damaged yesterday. What should I do?" },
];
