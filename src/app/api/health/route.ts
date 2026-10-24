import { connection } from "next/server";
import { configuredServices } from "@/lib/env";

// GET /api/health — quick check that the backend is up and which API keys are set.
// Reports booleans only; never returns the keys themselves.
export async function GET() {
  // Opt out of prerendering so env vars are read at request time, not build time.
  await connection();
  return Response.json({ status: "ok", services: configuredServices() });
}
