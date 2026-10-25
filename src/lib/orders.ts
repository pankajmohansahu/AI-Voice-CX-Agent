// Mock order database from the assignment brief.
// Shared by the Test Orders panel and the order tools.

export type OrderStatus = "Processing" | "Shipped" | "Out for Delivery" | "Delivered" | "Cancelled";

export interface Order {
  id: string;
  customerName: string;
  product: string;
  amount: number; // INR
  status: OrderStatus;
  courier: string | null;
  trackingId: string | null;
  note: string;
  // Relative timing, so "delivered 14 days ago" stays true whenever the demo runs.
  placedHoursAgo: number | null;
  deliveredDaysAgo: number | null;
  expectedDelivery: string | null;
}

export const ORDERS: Order[] = [
  {
    id: "ORD-101",
    customerName: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    amount: 699,
    status: "Out for Delivery",
    courier: "BlueDart",
    trackingId: "BD-982103",
    note: "Expected by 6 PM today",
    placedHoursAgo: null,
    deliveredDaysAgo: null,
    expectedDelivery: "by 6 PM today",
  },
  {
    id: "ORD-102",
    customerName: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    amount: 499,
    status: "Delivered",
    courier: "Delhivery",
    trackingId: "DL-441029",
    note: "Delivered 14 days ago",
    placedHoursAgo: null,
    deliveredDaysAgo: 14,
    expectedDelivery: null,
  },
  {
    id: "ORD-103",
    customerName: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    amount: 850,
    status: "Processing",
    courier: null,
    trackingId: null,
    note: "Ordered 3 hours ago · eligible for cancellation",
    placedHoursAgo: 3,
    deliveredDaysAgo: null,
    expectedDelivery: null,
  },
];

const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// Speech-to-text mangles IDs, so accept "ORD-101", "ord 101", "order 101",
// "101" or "o r d one zero one" and normalise to "ORD-101".
// Returns null when the input contains no order number.
export function normalizeOrderId(raw: string): string | null {
  const text = raw
    .toLowerCase()
    .replace(/\b(order|ord|o\s*r\s*d)\b/g, " ")
    .split(/[\s\-_.#:]+/)
    .map((word) => SPOKEN_DIGITS[word] ?? word)
    .join("");
  const digits = text.match(/\d+/)?.[0];
  return digits ? `ORD-${digits}` : null;
}

export function findOrder(id: string): Order | null {
  return ORDERS.find((o) => o.id === id) ?? null;
}
