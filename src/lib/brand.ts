// Aura Skincare brand knowledge from the assignment brief.

export const BRAND = {
  name: "Aura Skincare",
  agentName: "Aria",
  overview:
    "Aura Skincare is a premium organic Indian skincare brand focused on simple, effective skincare products made with thoughtfully selected ingredients.",
};

export const POLICIES = [
  {
    key: "shipping",
    title: "Shipping",
    text: "Free delivery on orders above ₹499. Orders below ₹499 have a ₹50 shipping fee. Standard delivery takes 3–5 business days.",
  },
  {
    key: "returns",
    title: "Returns & refunds",
    text: "Returns are accepted within 7 days of delivery for unopened, unused products in original packaging. Damaged or defective products must be reported within 48 hours of delivery with photos for a replacement.",
  },
  {
    key: "cancellation",
    title: "Cancellation",
    text: "Orders can be cancelled only while their status is Processing. Once an order is Shipped or Out for Delivery it cannot be cancelled, but the customer may refuse delivery at the doorstep.",
  },
  {
    key: "cod",
    title: "Cash on delivery",
    text: "COD is available for orders up to ₹2,500. Customers can pay by cash or UPI at the doorstep.",
  },
] as const;
