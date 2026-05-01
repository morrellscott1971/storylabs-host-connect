// Netlify Serverless Function — OfficeRND Proxy
const CLIENT_ID = process.env.OFFICERND_CLIENT_ID;
const CLIENT_SECRET = process.env.OFFICERND_CLIENT_SECRET;
const ORG = process.env.OFFICERND_ORG;

let tokenCache = null;

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "officernd.api.access",
  });

  const res = await fetch("https://identity.officernd.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const params = event.queryStringParameters || {};
  const { endpoint, ...rest } = params;

  if (!endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing endpoint parameter" }) };
  }

  try {
    const token = await getAccessToken();
    const url = new URL(`https://app.officernd.com/api/v1/organizations/${ORG}/${endpoint}`);
    Object.entries(rest).forEach(([k, v]) => url.searchParams.set(k, v));

    const apiRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      return { statusCode: apiRes.status, headers, body: JSON.stringify({ error: text }) };
    }

    const data = await apiRes.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}
