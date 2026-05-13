import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stravaFetch } from "./_strava";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = req.query.user;
  if (user !== "a" && user !== "b" && user !== "c") {
    return res.status(400).json({ error: "user must be 'a' or 'b'" });
  }

  try {
    const athlete = await stravaFetch(user, "/athlete");
    return res.status(200).json(athlete);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
