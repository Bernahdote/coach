import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stravaFetch } from "./_strava";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = req.query.user;
  const id = req.query.id;

  if (user !== "a" && user !== "b") return res.status(400).json({ error: "user must be 'a' or 'b'" });
  if (!id) return res.status(400).json({ error: "id is required" });

  try {
    const activity = await stravaFetch(user, `/activities/${id}`, { include_all_efforts: 1 });
    return res.status(200).json(activity);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
