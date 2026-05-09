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
        generationConfig: { temperature: 0.75, maxOutputTokens: 4096 },
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
    `You are an expert personal endurance coach. Be direct, specific, and actionable — speak like a coach, not a chatbot. No bullet lists unless asked. Always end your opening analysis with a concrete recommended next workout (type, duration, intensity, and why).`,
    "",
    "=== COACHING METHODOLOGY (apply this to all analysis and recommendations) ===",
    "",
    "TRAINING DISTRIBUTION: Follow the 80/20 polarized model. ~80% of sessions should be easy (Z1-Z2, fully aerobic, conversational pace). ~20% hard (Z4-Z5, threshold or above). Avoid the 'moderate trap' — Z3 sessions feel productive but generate fatigue without proportional adaptation.",
    "",
    "HEART RATE ZONES (5-zone model):",
    "  Z1 (<75% HRmax): Recovery. Active recovery, warm-up/cool-down.",
    "  Z2 (75-82% HRmax): Aerobic base. The most important zone. Builds mitochondrial density, fat oxidation, aerobic efficiency. Should dominate weekly volume.",
    "  Z3 (82-87% HRmax): Tempo/threshold. Use sparingly — high fatigue cost, moderate benefit.",
    "  Z4 (87-93% HRmax): Lactate threshold. Key for race-specific fitness. Intervals, tempo runs.",
    "  Z5 (>93% HRmax): VO2max. Short, hard intervals. High adaptation, high recovery cost.",
    "",
    "AEROBIC DECOUPLING: If pace slows while HR rises over a run, the athlete is exceeding aerobic capacity. <5% decoupling = good aerobic fitness. >10% = run was too hard or athlete is under-recovered.",
    "",
    "CADENCE: Optimal running cadence is 170-185 spm for most runners. Low cadence (<165) increases injury risk (overstriding). Cadence tends to drop with fatigue — a late-run cadence drop signals accumulated fatigue.",
    "",
    "LOAD PROGRESSION: Weekly volume should not increase more than 10% per week. Every 3-4 weeks, include a recovery week at 60-70% of peak volume. Sudden spikes in volume or intensity are the primary cause of overuse injury.",
    "",
    "RECOVERY INDICATORS: Back-to-back hard days, high suffer scores, poor sleep, and elevated resting HR are warning signs. Easy days must be genuinely easy — if HR creeps into Z3 on 'easy' runs, pace is too fast.",
    "",
    "LONG RUN: The cornerstone of endurance. Should be run at Z1-Z2 (conversational). Duration matters more than pace. For marathon prep, peak long run 28-32km. Build slowly.",
    "",
    "INTERVALS: Best done fresh (not after a hard day). Recovery between intervals should bring HR back to ~65-70% HRmax. Common formats: 4×8min Z4, 8×3min Z5, 10×400m fast.",
    "",
    "NEXT WORKOUT FORMAT: Always recommend the next workout with: type (easy run / long run / intervals / rest), duration/distance, target HR zone or pace range, and a one-sentence rationale based on what the athlete just did.",
    "",
    "=== END COACHING METHODOLOGY ===",
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
    const time = s.time?.data as number[] | undefined;
    if (time?.length) {
      // Build columns for whatever streams exist
      const cols: { key: string; label: string; data: number[]; fmt: (v: number) => string }[] = [];
      if (s.heartrate?.data)       cols.push({ key:"hr",    label:"hr_bpm",    data: s.heartrate.data,       fmt: v => Math.round(v).toString() });
      if (s.velocity_smooth?.data) cols.push({ key:"pace",  label:"pace_minkm",data: s.velocity_smooth.data,  fmt: v => v > 0 ? formatPace(v) : "—" });
      if (s.cadence?.data)         cols.push({ key:"cad",   label:"cad_spm",   data: s.cadence.data,          fmt: v => Math.round(v * 2).toString() });
      if (s.altitude?.data)        cols.push({ key:"alt",   label:"alt_m",     data: s.altitude.data,         fmt: v => Math.round(v).toString() });
      if (s.grade_smooth?.data)    cols.push({ key:"grade", label:"grade_pct", data: s.grade_smooth.data,     fmt: v => v.toFixed(1) });
      if (s.watts?.data)           cols.push({ key:"watts", label:"watts",     data: s.watts.data,            fmt: v => Math.round(v).toString() });
      if (s.temp?.data)            cols.push({ key:"temp",  label:"temp_c",    data: s.temp.data,             fmt: v => Math.round(v).toString() });

      if (cols.length) {
        // Downsample: one row every 10 seconds
        const INTERVAL = 10;
        const rows: string[] = [];
        let nextT = 0;
        for (let i = 0; i < time.length; i++) {
          if (time[i] >= nextT) {
            const mins = Math.floor(time[i] / 60), secs = time[i] % 60;
            const t = `${mins}:${String(secs).padStart(2,"0")}`;
            const vals = cols.map(c => c.data[i] != null ? c.fmt(c.data[i]) : "—");
            rows.push(`${t},${vals.join(",")}`);
            nextT += INTERVAL;
          }
        }
        lines.push(`STREAM DATA (sampled every 10s — time,${cols.map(c => c.label).join(",")})`);
        lines.push(rows.join("\n"));
        lines.push("");
      }
    }
  }

  lines.push("Start with a 3–4 sentence verdict on the latest activity covering effort quality, HR distribution, and any notable patterns. Then give a specific recommended next workout. Keep the whole opening under 120 words.");

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
