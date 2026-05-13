const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

export function getRefreshToken(user: "a" | "b" | "c"): string {
  const map: Record<string, string | undefined> = {
    a: process.env.STRAVA_REFRESH_TOKEN_A,
    b: process.env.STRAVA_REFRESH_TOKEN_B,
    c: process.env.STRAVA_REFRESH_TOKEN_C,
  };
  const token = map[user];
  if (!token) throw new Error(`STRAVA_REFRESH_TOKEN_${user.toUpperCase()} is not set`);
  return token;
}

export async function getAccessToken(user: "a" | "b" | "c"): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: getRefreshToken(user),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export async function stravaFetch(
  user: "a" | "b",
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const accessToken = await getAccessToken(user);
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error (${res.status}): ${text}`);
  }

  return res.json();
}
