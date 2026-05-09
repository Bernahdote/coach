import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { activity, splits, zoneTimes } = req.body ?? {};
  if (!activity) return res.status(400).json({ error: "activity is required" });

  const isRun = activity.sport_type?.includes("Run");
  const km = (activity.distance / 1000).toFixed(2);
  const duration = formatDuration(activity.moving_time);
  const pace = isRun ? formatPace(activity.average_speed) : null;

  const zoneLines = zoneTimes
    ? ["Z1","Z2","Z3","Z4","Z5"].map((z, i) => `${z}: ${formatDuration(zoneTimes[i] ?? 0)}`).join(", ")
    : "no heart rate data";

  const splitLines = splits?.length
    ? splits.map((s: any, i: number) =>
        `km ${i+1}: ${isRun ? formatPace(s.average_speed) : (s.average_speed * 3.6).toFixed(1)} ${isRun ? "min/km" : "km/h"}, HR ${s.average_heartrate ? Math.round(s.average_heartrate) + " bpm" : "—"}, elev ${s.elevation_difference >= 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`
      ).join("\n")
    : "no split data";

  const prompt = `You are an expert endurance coach. Analyze this training session and give concise, actionable coaching feedback in 3–5 sentences. Focus on pacing strategy, heart rate distribution, fatigue patterns, and one concrete recommendation for next time. Be direct and specific — avoid generic advice.

Activity: ${activity.name}
Type: ${activity.sport_type}
Date: ${activity.start_date_local}
Distance: ${km} km
Duration: ${duration}
${pace ? `Average pace: ${pace} min/km` : `Average speed: ${(activity.average_speed * 3.6).toFixed(1)} km/h`}
Average HR: ${activity.average_heartrate ? Math.round(activity.average_heartrate) + " bpm" : "—"}
Elevation gain: ${Math.round(activity.total_elevation_gain)}m
Heart rate zones: ${zoneLines}

Km splits:
${splitLines}`;

  try {
    const r = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: `Gemini error: ${text}` });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response";
    return res.status(200).json({ insight: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}

function formatDuration(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function formatPace(mps: number) {
  if (!mps) return "—";
  const spk = 1000 / mps, m = Math.floor(spk / 60), s = Math.round(spk % 60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
