// Scenario tests for the agent brain. Runs each conversation against /api/chat
// and checks which tools were called and what the reply says.
//
// Usage: npm run dev   (in another terminal)
//        node scripts/test-scenarios.mjs [baseUrl] [--verbose] [--only=<name substring>] [--delay=<ms>]
//
// --delay pauses between scenarios (default 15s) to stay under the LLM provider's
// tokens-per-minute limit on free tiers.

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const VERBOSE = args.includes("--verbose");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7).toLowerCase();
const DELAY = Number(args.find((a) => a.startsWith("--delay="))?.slice(8) ?? 15000);

const SCENARIOS = [
  {
    name: "Track ORD-101",
    turns: ["Where is my order ORD-101?"],
    tools: ["get_order_details"],
    expect: [/out for delivery/i, /6\s*(pm|p\.m\.)|six/i],
  },
  {
    name: "Return ORD-102 (outside 7 days)",
    turns: ["I want to return my order ORD-102"],
    tools: ["check_action_eligibility"],
    eligible: false,
    expect: [/7|seven|14|window/i],
    summary: { intent: "RETURN_REQUEST", orderId: "ORD-102", actions: ["RETURN_DENIED"] },
    reject: [/return has been (approved|initiated)|refund (is|has been) (processed|initiated)/i],
  },
  {
    name: "Cancel ORD-103 (allowed)",
    turns: ["Please cancel my order ORD-103"],
    // Sent only if Aria asks for confirmation instead of cancelling straight away.
    followUp: { unless: "cancel_order", text: "Yes, please go ahead and cancel it" },
    tools: ["check_action_eligibility", "cancel_order"],
    expect: [/cancel/i, /CXL-\d{4}/],
    summary: { intent: "CANCELLATION_REQUEST", orderId: "ORD-103", actions: ["ORDER_CANCELLED"] },
  },
  {
    name: "Cancel ORD-101 (not allowed)",
    turns: ["Can you cancel my order ORD-101?"],
    tools: ["check_action_eligibility"],
    eligible: false,
    forbiddenTools: ["cancel_order"],
    expect: [/refuse|doorstep|door/i],
  },
  {
    name: "Invalid ID ORD-999",
    turns: ["Where is my order ORD-999?"],
    tools: ["get_order_details"],
    expect: [/couldn['’]?t (find|locate)|could not (find|locate)|no order|not find|unable to (find|locate)/i],
  },
  {
    name: "Out of scope (flight)",
    turns: ["Can you book me a flight to Goa?"],
    tools: [],
    expect: [/aura|skincare/i],
    reject: [/booked|here are (some )?flights/i],
    summary: { intent: "OUT_OF_SCOPE", orderId: null, actions: [] },
  },
  {
    name: "Opened product, 20 days ago",
    turns: ["I bought a serum 20 days ago and have opened it. Can I return it?"],
    tools: [],
    expect: [/7|seven|unopened|opened/i],
    reject: [/yes,? you can return/i],
  },
  {
    name: "Missing order ID",
    turns: ["Where is my order?"],
    tools: [],
    forbiddenTools: ["get_order_details"],
    expect: [/order (id|number)/i],
  },
  {
    name: "Shipping fee below 499",
    turns: ["Is shipping free on a 400 rupee order?"],
    tools: [],
    expect: [/50/, /499/],
  },
];

async function turn(messages) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const done = events.find((e) => e.type === "done");
  return {
    text: events.filter((e) => e.type === "text").map((e) => e.delta).join(""),
    toolCalls: events.filter((e) => e.type === "tool_call").map((e) => e.name),
    toolResults: events.filter((e) => e.type === "tool_result"),
    newMessages: done?.messages ?? [],
    error: events.find((e) => e.type === "error")?.message,
  };
}

let passed = 0;
const selected = SCENARIOS.filter((s) => !ONLY || s.name.toLowerCase().includes(ONLY));
for (const [index, s] of selected.entries()) {
  if (index > 0 && DELAY > 0) await new Promise((r) => setTimeout(r, DELAY));
  const history = [];
  const toolCalls = [];
  const toolResults = [];
  let lastText = "";
  let allText = "";
  const started = Date.now();
  const problems = [];

  try {
    const turns = [...s.turns];
    for (let i = 0; i < turns.length; i++) {
      const userText = turns[i];
      history.push({ role: "user", content: userText });
      const t = Date.now();
      const r = await turn(history);
      if (VERBOSE) console.log(`      [${Date.now() - t} ms] you: ${userText}\n        tools: ${r.toolCalls.join(", ") || "none"} | aria: ${r.text}`);
      if (r.error) problems.push(`error event: ${r.error}`);
      history.push(...r.newMessages);
      toolCalls.push(...r.toolCalls);
      toolResults.push(...r.toolResults);
      lastText = r.text;
      allText += " " + r.text;
      if (i === turns.length - 1 && s.followUp && !toolCalls.includes(s.followUp.unless) && turns.length === s.turns.length) {
        turns.push(s.followUp.text);
      }
    }
  } catch (err) {
    problems.push(String(err));
  }

  for (const tool of s.tools) if (!toolCalls.includes(tool)) problems.push(`expected tool ${tool}`);
  for (const tool of s.forbiddenTools ?? []) if (toolCalls.includes(tool)) problems.push(`must not call ${tool}`);
  if (s.tools.length === 0 && !s.forbiddenTools && toolCalls.some((t) => t !== "escalate_to_human"))
    problems.push(`unexpected tools: ${toolCalls.join(", ")}`);
  if (s.eligible !== undefined) {
    const verdict = toolResults.find((r) => r.name === "check_action_eligibility");
    if (verdict && verdict.ok !== s.eligible) problems.push(`eligibility was ${verdict.ok}, expected ${s.eligible}`);
  }
  for (const re of s.expect ?? []) if (!re.test(allText)) problems.push(`reply missing ${re}`);
  for (const re of s.reject ?? []) if (re.test(allText)) problems.push(`reply must not match ${re}`);

  // Post-call summary for this conversation.
  if (s.summary) {
    try {
      const res = await fetch(`${BASE}/api/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const { summary } = await res.json();
      if (VERBOSE) console.log(`      summary: ${JSON.stringify(summary)}`);
      if (summary?.customer_intent !== s.summary.intent)
        problems.push(`summary intent ${summary?.customer_intent}, expected ${s.summary.intent}`);
      if (summary?.order_id !== s.summary.orderId)
        problems.push(`summary order_id ${summary?.order_id}, expected ${s.summary.orderId}`);
      for (const a of s.summary.actions)
        if (!summary?.actions_taken?.includes(a)) problems.push(`summary missing action ${a}`);
    } catch (err) {
      problems.push(`summary failed: ${err}`);
    }
  }

  const ok = problems.length === 0;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.name}  (${Date.now() - started} ms)`);
  console.log(`      tools: ${toolCalls.join(" → ") || "none"}`);
  console.log(`      aria:  ${lastText}`);
  for (const p of problems) console.log(`      ✗ ${p}`);
}

console.log(`\n${passed}/${selected.length} scenarios passed`);
process.exit(passed === selected.length ? 0 : 1);
