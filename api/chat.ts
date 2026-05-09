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
        generationConfig: { temperature: 0.75, maxOutputTokens: 1024 },
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
    lines.push(`  Distance: ${km}km | Duration: ${formatDuration(a.moving_time)} | Elapsed: ${formatDuration(a.elapsed_time)}`);
    lines.push(`  Avg pace: ${formatPace(a.average_speed)}/km | Max pace: ${formatPace(a.max_speed)}/km`);
    lines.push(`  Avg HR: ${a.average_heartrate ? Math.round(a.average_heartrate) + "bpm" : "—"} | Max HR: ${a.max_heartrate ? Math.round(a.max_heartrate) + "bpm" : "—"}`);
    lines.push(`  Elevation gain: ${Math.round(a.total_elevation_gain)}m`);
    if (a.average_cadence) lines.push(`  Avg cadence: ${Math.round(a.average_cadence * 2)} spm`);
    if (a.average_watts) lines.push(`  Avg power: ${Math.round(a.average_watts)}W | Max: ${a.max_watts}W | Weighted: ${a.weighted_average_watts}W`);
    if (a.kilojoules) lines.push(`  Energy: ${Math.round(a.kilojoules)}kJ | Calories: ${a.calories}`);
    if (a.suffer_score) lines.push(`  Suffer score: ${a.suffer_score}`);
    if (a.perceived_exertion) lines.push(`  Perceived exertion (RPE): ${a.perceived_exertion}/10`);
    if (a.gear?.name) lines.push(`  Gear: ${a.gear.name} (${(a.gear.converted_distance / 1000).toFixed(0)}km total)`);
    if (a.device_name) lines.push(`  Device: ${a.device_name}`);
    if (a.average_temp) lines.push(`  Temperature: ${a.average_temp}°C`);
    if (a.description) lines.push(`  Athlete note: "${a.description}"`);

    if (a.laps?.length) {
      lines.push("  Laps:");
      a.laps.forEach((l: any, i: number) => {
        lines.push(`    Lap ${i+1}: ${(l.distance/1000).toFixed(2)}km | ${formatPace(l.average_speed)}/km | HR ${l.average_heartrate ? Math.round(l.average_heartrate)+"bpm" : "—"} | ${formatDuration(l.moving_time)}`);
      });
    }

    if (a.splits_metric?.length) {
      lines.push("  Km splits (pace | HR | cadence | elev):");
      a.splits_metric.forEach((s: any, i: number) => {
        const cad = s.average_cadence ? `${Math.round(s.average_cadence * 2)}spm` : "—";
        lines.push(`    km${i + 1}: ${formatPace(s.average_speed)}/km | ${s.average_heartrate ? Math.round(s.average_heartrate) + "bpm" : "—"} | ${cad} | ${s.elevation_difference >= 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`);
      });
    }

    if (a.segment_efforts?.length) {
      lines.push("  Segment efforts (top 8):");
      a.segment_efforts.slice(0, 8).forEach((s: any) => {
        const pr = s.pr_rank === 1 ? " 🥇PR" : s.pr_rank === 2 ? " 🥈" : s.pr_rank === 3 ? " 🥉" : "";
        lines.push(`    ${s.name}: ${formatDuration(s.elapsed_time)}${pr}`);
      });
    }

    if (a.best_efforts?.length) {
      lines.push("  Best efforts:");
      a.best_efforts.slice(0, 8).forEach((e: any) => {
        lines.push(`    ${e.name}: ${formatDuration(e.elapsed_time)}${e.pr_rank === 1 ? " (PR)" : ""}`);
      });
    }
    lines.push("");
  }

  if (ctx.latestStreams) {
    const s = ctx.latestStreams;
    const stats: string[] = [];
    if (s.cadence?.data?.length) {
      const cads = s.cadence.data.filter((v: number) => v > 0);
      const avgCad = Math.round(cads.reduce((a: number, b: number) => a + b, 0) / cads.length * 2);
      stats.push(`avg cadence ${avgCad}spm`);
    }
    if (s.altitude?.data?.length) {
      const alts = s.altitude.data;
      const gain = alts.reduce((acc: number, v: number, i: number) => i > 0 && v > alts[i-1] ? acc + (v - alts[i-1]) : acc, 0);
      stats.push(`elevation profile available (${Math.round(gain)}m gain from GPS)`);
    }
    if (s.grade_smooth?.data?.length) {
      const grades = s.grade_smooth.data;
      const maxGrade = Math.max(...grades).toFixed(1);
      const minGrade = Math.min(...grades).toFixed(1);
      stats.push(`grade range ${minGrade}% to ${maxGrade}%`);
    }
    if (s.temp?.data?.length) {
      const temps = s.temp.data;
      const avgTemp = Math.round(temps.reduce((a: number, b: number) => a + b, 0) / temps.length);
      stats.push(`avg temp ${avgTemp}°C`);
    }
    if (s.watts?.data?.length) {
      const watts = s.watts.data.filter((v: number) => v > 0);
      const avgW = Math.round(watts.reduce((a: number, b: number) => a + b, 0) / watts.length);
      stats.push(`avg power ${avgW}W from stream`);
    }
    if (stats.length) {
      lines.push(`STREAM DATA SUMMARY: ${stats.join(", ")}`);
      lines.push("");
    }
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
