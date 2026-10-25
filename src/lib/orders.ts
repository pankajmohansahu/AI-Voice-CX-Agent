// Mock order database from the assignment brief.
// Shared by the Test Orders panel and (from Phase 1) the order tools.

export type OrderStatus = "Processing" | "Shipped" | "Out for Delivery" | "Delivered";

export interface Order {
  id: string;
  customerName: string;
  product: string;
  amount: number; // INR
  status: OrderStatus;
  courier: string | null;
  trackingId: string | null;
  note: string;
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
  },
];
