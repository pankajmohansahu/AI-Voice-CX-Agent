// Tools the LLM can call. Policy decisions live here in code, not in the prompt:
// the model can only phrase an outcome, never override it.
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { findOrder, normalizeOrderId, type Order } from "./orders";

export const RETURN_WINDOW_DAYS = 7;
export const DAMAGE_REPORT_HOURS = 48;

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_order_details",
      description:
        "Look up an order by its ID: status, product, amount, courier, tracking and delivery timing. Use whenever the customer asks about a specific order.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID as given by the customer, e.g. ORD-101" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_action_eligibility",
      description:
        "Check whether an order can be cancelled, returned or replaced under Aura Skincare policy, based on its status and delivery date. Call it as soon as the customer asks, before any follow-up questions; any extra conditions (such as the product being unopened) are returned in the result.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID, e.g. ORD-102" },
          action: { type: "string", enum: ["cancel", "return", "replace"], description: "replace = damaged or defective product" },
        },
        required: ["order_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_order",
      description:
        "Cancel an order. Only call after the customer has clearly confirmed they want to cancel. Fails unless the order is still Processing.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order ID, e.g. ORD-103" } },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Raise a ticket for the human support team when the customer's issue cannot be resolved with the available information or policies, or when they ask for a human.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "One-sentence description of the issue" },
          order_id: { type: "string", description: "Related order ID, if any" },
        },
        required: ["reason"],
      },
    },
  },
];

export interface ToolOutcome {
  ok: boolean; // drives the green/red chip in the UI
  display: string; // short label for the UI chip
  result: Record<string, unknown>; // what the LLM sees
}

// Per-request context: orders cancelled earlier in this conversation (the server is stateless).
export interface ToolContext {
  cancelledOrderIds: Set<string>;
}

function resolveOrder(rawId: unknown, ctx: ToolContext): { id: string | null; order: Order | null } {
  const id = typeof rawId === "string" ? normalizeOrderId(rawId) : null;
  const found = id ? findOrder(id) : null;
  if (found && ctx.cancelledOrderIds.has(found.id)) {
    return { id, order: { ...found, status: "Cancelled", note: "Cancelled during this call" } };
  }
  return { id, order: found };
}

function notFound(id: string | null): ToolOutcome {
  return {
    ok: false,
    display: id ? "Not found" : "Missing ID",
    result: id
      ? { found: false, message: `No order exists with ID ${id}. Ask the customer to repeat or verify the ID. Do not guess.` }
      : { found: false, message: "No valid order ID was provided. Ask the customer for their order ID (format ORD-XXX)." },
  };
}

function shortRef(prefix: string) {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getOrderDetails(args: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const { id, order } = resolveOrder(args.order_id, ctx);
  if (!order) return notFound(id);
  return {
    ok: true,
    display: order.status,
    result: {
      found: true,
      order_id: order.id,
      customer_name: order.customerName,
      product: order.product,
      amount_inr: order.amount,
      status: order.status,
      courier: order.courier,
      tracking_id: order.trackingId,
      expected_delivery: order.expectedDelivery,
      delivered_days_ago: order.deliveredDaysAgo,
      placed_hours_ago: order.placedHoursAgo,
      notes: order.note,
    },
  };
}

type Eligibility = { eligible: boolean; reason: string; alternative?: string; conditions?: string };

export function evaluateEligibility(order: Order, action: string): Eligibility {
  if (action === "cancel") {
    if (order.status === "Processing") return { eligible: true, reason: "The order is still Processing, so it can be cancelled." };
    if (order.status === "Cancelled") return { eligible: false, reason: "The order is already cancelled." };
    if (order.status === "Delivered") {
      return {
        eligible: false,
        reason: "The order has already been delivered, so it cannot be cancelled.",
        alternative: `A return may be possible within ${RETURN_WINDOW_DAYS} days of delivery if the product is unopened.`,
      };
    }
    return {
      eligible: false,
      reason: `The order is ${order.status}. Orders can only be cancelled while Processing.`,
      alternative: "The customer can refuse the delivery at the doorstep.",
    };
  }

  if (action === "return") {
    if (order.status !== "Delivered" || order.deliveredDaysAgo === null) {
      return {
        eligible: false,
        reason: `The order is ${order.status} and has not been delivered yet, so a return is not applicable.`,
        alternative:
          order.status === "Processing"
            ? "It can still be cancelled because it is Processing."
            : "The customer can refuse the delivery at the doorstep.",
      };
    }
    if (order.deliveredDaysAgo > RETURN_WINDOW_DAYS) {
      return {
        eligible: false,
        reason: `It was delivered ${order.deliveredDaysAgo} days ago, outside the ${RETURN_WINDOW_DAYS}-day return window.`,
      };
    }
    return {
      eligible: true,
      reason: `Delivered ${order.deliveredDaysAgo} days ago, within the ${RETURN_WINDOW_DAYS}-day return window.`,
      conditions:
        "Only if the product is unopened, unused and in its original packaging. Confirm this with the customer; if it has been opened, the return is not possible.",
    };
  }

  if (action === "replace") {
    if (order.status !== "Delivered" || order.deliveredDaysAgo === null) {
      return { eligible: false, reason: `The order is ${order.status} and has not been delivered yet.` };
    }
    if (order.deliveredDaysAgo * 24 > DAMAGE_REPORT_HOURS) {
      return {
        eligible: false,
        reason: `Damaged or defective products must be reported within ${DAMAGE_REPORT_HOURS} hours of delivery; this order was delivered ${order.deliveredDaysAgo} days ago.`,
      };
    }
    return {
      eligible: true,
      reason: `Reported within ${DAMAGE_REPORT_HOURS} hours of delivery.`,
      conditions: "The customer must share photos of the damage for a replacement.",
    };
  }

  return { eligible: false, reason: `Unknown action "${action}".` };
}

function checkActionEligibility(args: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const { id, order } = resolveOrder(args.order_id, ctx);
  if (!order) return notFound(id);
  const action = String(args.action ?? "");
  const verdict = evaluateEligibility(order, action);
  return {
    ok: verdict.eligible,
    display: verdict.eligible ? "Eligible" : "Not eligible",
    result: { order_id: order.id, action, status: order.status, ...verdict },
  };
}

function cancelOrder(args: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const { id, order } = resolveOrder(args.order_id, ctx);
  if (!order) return notFound(id);
  // Re-check policy: the model cannot cancel an ineligible order even if it tries.
  const verdict = evaluateEligibility(order, "cancel");
  if (!verdict.eligible) {
    return { ok: false, display: "Not cancelled", result: { success: false, order_id: order.id, ...verdict } };
  }
  ctx.cancelledOrderIds.add(order.id);
  const ref = shortRef("CXL");
  return {
    ok: true,
    display: `Cancelled · ${ref}`,
    result: { success: true, order_id: order.id, cancellation_reference: ref, new_status: "Cancelled" },
  };
}

function escalateToHuman(args: Record<string, unknown>): ToolOutcome {
  const ticket = shortRef("TKT");
  return {
    ok: true,
    display: `Ticket ${ticket}`,
    result: {
      ticket_id: ticket,
      reason: args.reason ?? null,
      order_id: args.order_id ?? null,
      message: "Ticket created. A human support specialist will follow up with the customer.",
    },
  };
}

export function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  switch (name) {
    case "get_order_details":
      return getOrderDetails(args, ctx);
    case "check_action_eligibility":
      return checkActionEligibility(args, ctx);
    case "cancel_order":
      return cancelOrder(args, ctx);
    case "escalate_to_human":
      return escalateToHuman(args);
    default:
      return { ok: false, display: "Unknown tool", result: { error: `Unknown tool ${name}` } };
  }
}
