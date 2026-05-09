import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, context } = req.body ?? {};
  if (!messages?.length) return res.status(400).json({ error: "messages required" });

  const systemInstruction = buildSystemPrompt(context);

  try {
    const r = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: messages,
        generationConfig: { temperature: 0.75, maxOutputTokens: 600 },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: `Gemini error: ${text}` });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response";
    return res.status(200).json({ reply: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}

function buildSystemPrompt(ctx: any): string {
  if (!ctx) return "You are an expert endurance coach. Be direct, specific, and actionable.";

  const { athlete, latestActivity, recentActivities, weeklyLoad } = ctx;

  const lines: string[] = [
    "You are an expert personal endurance coach. Be direct, specific, and actionable — speak like a coach, not a chatbot. No bullet lists unless asked.",
    "",
  ];

  if (athlete) {
    lines.push(`ATHLETE: ${athlete.firstname} ${athlete.lastname}, ${athlete.city}, ${athlete.country}`);
    if (athlete.stats) {
      const s = athlete.stats;
      lines.push(`Lifetime: ${(s.all_run_totals?.distance / 1000).toFixed(0)}km running, ${(s.all_ride_totals?.distance / 1000).toFixed(0)}km cycling`);
      lines.push(`YTD running: ${(s.ytd_run_totals?.distance / 1000).toFixed(0)}km over ${s.ytd_run_totals?.count} activities`);
      lines.push(`Recent 4 weeks running: ${(s.recent_run_totals?.distance / 1000).toFixed(0)}km over ${s.recent_run_totals?.count} activities`);
    }
    lines.push("");
  }

  if (weeklyLoad?.length) {
    lines.push("WEEKLY LOAD (last 4 weeks, most recent first):");
    weeklyLoad.forEach((w: any) => {
      lines.push(`  Week of ${w.week}: ${w.km.toFixed(1)}km, ${w.count} runs, ${formatDuration(w.time)}`);
    });
    lines.push("");
  }

  if (recentActivities?.length) {
    lines.push("RECENT 10 ACTIVITIES:");
    recentActivities.forEach((a: any) => {
      const km = (a.distance / 1000).toFixed(1);
      const date = a.start_date_local?.slice(0, 10);
      const pace = a.average_speed ? formatPace(a.average_speed) : "—";
      const hr = a.average_heartrate ? `${Math.round(a.average_heartrate)}bpm` : "—";
      lines.push(`  ${date} | ${a.sport_type} | ${km}km | ${pace}/km | HR ${hr} | ${a.name}`);
    });
    lines.push("");
  }

  if (latestActivity) {
    const a = latestActivity;
    const km = (a.distance / 1000).toFixed(2);
    lines.push("LATEST ACTIVITY (analyze this first):");
    lines.push(`  Name: ${a.name}`);
    lines.push(`  Type: ${a.sport_type} | Date: ${a.start_date_local?.slice(0, 10)}`);
    lines.push(`  Distance: ${km}km | Duration: ${formatDuration(a.moving_time)}`);
    lines.push(`  Avg pace: ${formatPace(a.average_speed)}/km | Avg HR: ${a.average_heartrate ? Math.round(a.average_heartrate) + "bpm" : "—"}`);
    lines.push(`  Elevation: ${Math.round(a.total_elevation_gain)}m`);

    if (a.splits_metric?.length) {
      lines.push("  Km splits (pace | HR | elev):");
      a.splits_metric.forEach((s: any, i: number) => {
        lines.push(`    km${i + 1}: ${formatPace(s.average_speed)}/km | ${s.average_heartrate ? Math.round(s.average_heartrate) + "bpm" : "—"} | ${s.elevation_difference >= 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`);
      });
    }

    if (a.best_efforts?.length) {
      lines.push("  Best efforts:");
      a.best_efforts.slice(0, 5).forEach((e: any) => {
        lines.push(`    ${e.name}: ${formatDuration(e.elapsed_time)}`);
      });
    }
    lines.push("");
  }

  lines.push("Start the conversation with a 2–3 sentence verdict on the latest activity. Then be available for follow-up questions about training, recovery, planning, or anything else the athlete asks.");

  return lines.join("\n");
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatPace(mps: number): string {
  if (!mps) return "—";
  const spk = 1000 / mps, m = Math.floor(spk / 60), s = Math.round(spk % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
