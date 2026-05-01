import http from "http";

const CLIENT_ID = process.env.OFFICERND_CLIENT_ID;
const CLIENT_SECRET = process.env.OFFICERND_CLIENT_SECRET;
const ORG = process.env.OFFICERND_ORG;
const PORT = process.env.PORT || 3000;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry > now) return cachedToken;

  const body = "grant_type=client_credentials&client_id=" + CLIENT_ID + "&client_secret=" + CLIENT_SECRET;

  const res = await fetch("https://identity.officernd.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Auth failed (" + res.status + "): " + text);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const base = "http://localhost:" + PORT;
  const reqUrl = new URL(req.url, base);
  const endpoint = reqUrl.searchParams.get("endpoint");

  if (!endpoint) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Missing endpoint" }));
    return;
  }

  try {
    const token = await getAccessToken();
    const apiUrl = new URL("https://app.officernd.com/api/v1/organizations/" + ORG + "/" + endpoint);

    reqUrl.searchParams.forEach(function(value, key) {
      if (key !== "endpoint") apiUrl.searchParams.set(key, value);
    });

    const apiRes = await fetch(apiUrl.toString(), {
      headers: { Authorization: "Bearer " + token },
    });

    const responseData = await apiRes.json();
    res.writeHead(apiRes.status);
    res.end(JSON.stringify(responseData));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, function() {
  console.log("StoryLabs proxy running on port " + PORT);
});
