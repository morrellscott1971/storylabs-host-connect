import http from "http";
import { URL } from "url";

const CLIENT_ID = process.env.OFFICERND_CLIENT_ID;
const CLIENT_SECRET = process.env.OFFICERND_CLIENT_SECRET;
const ORG = process.env.OFFICERND_ORG;
const PORT = process.env.PORT || 3000;

let tokenCache = null;

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
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
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.token;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const endpoint = reqUrl.searchParams.get("endpoint");
  if (!endpoint) { res.writeHead(400); res.end(JSON.stringify({ error: "Missing endpoint" })); return; }
  try {
    const token = await getAccessToken();
    const apiUrl = new URL(`https://app.officernd.com/api/v1/organizations/${ORG}/${endpoint}`);
    reqUrl.searchParams.forEach((value, key) => { if (key !== "endpoint") apiUrl.searchParams.set(key, value); });
    const apiRes = await fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data = await apiRes.json();
    res.writeHead(apiRes.status);
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log(`StoryLabs proxy running on port ${PORT}`));
