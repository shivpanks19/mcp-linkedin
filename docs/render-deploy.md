# Deploy on Render

Host the LinkedIn Ads MCP server as a **Web Service** with **streamable HTTP** so Cursor (or other MCP clients) can connect remotely — the same pattern as `mcp-google-ads`.

Local stdio (`npm start`) is unchanged. This doc is only for the HTTP process (`npm run start:http`).

## Prerequisites

1. [Render](https://render.com) account (use **Starter**, not free spin-down)
2. This repo on GitHub (Hexa fork — do **not** push secrets or token JSON)
3. LinkedIn Developer App with **Advertising API** (and Community Management if you use organic post tools)
4. A one-time local OAuth so you can paste tokens into Render:
   - `npm run auth` on your laptop
   - `npm run print-tokens` → one-line JSON for `LINKEDIN_TOKENS_JSON`

LinkedIn has no service-account flow. Tokens live in env, not on disk.

## Option A — Render Dashboard

### 1. Create Web Service

1. [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**
2. Connect GitHub → this repo
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `mcp-linkedin` |
| **Region** | Oregon (or nearest) |
| **Branch** | `main` |
| **Runtime** | Node |
| **Node version** | `20` (set env `NODE_VERSION=20` or use `.node-version`) |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node dist/http.js` |
| **Health Check Path** | `/health` |

Do **not** use a static site or the default `node index.js` (that is stdio).

### 2. Environment variables

| Variable | Required | Value |
|----------|----------|--------|
| `NODE_VERSION` | yes | `20` |
| `MCP_URL_AUTH_TOKEN` | yes | Long random secret. Required on `/mcp` |
| `LINKEDIN_CLIENT_ID` | yes | LinkedIn app client ID (token refresh) |
| `LINKEDIN_CLIENT_SECRET` | yes | LinkedIn app client secret |
| `LINKEDIN_TOKENS_JSON` | yes | Entire `tokens.json` on **one line** |
| `LINKEDIN_REDIRECT_URI` | no | Only needed for local `npm run auth` |

**`LINKEDIN_TOKENS_JSON`:** run locally, then paste the stdout as a Render **Secret**:

```bash
npm run print-tokens
```

Mark client secret, tokens JSON, and MCP URL token as **Secret**.

### 3. Deploy

Click **Create Web Service**. First deploy takes a few minutes.

### 4. Verify

```bash
curl https://YOUR-SERVICE.onrender.com/health
# {"status":"ok","service":"linkedin-ads-mcp","linkedin_authenticated":true,...}

curl https://YOUR-SERVICE.onrender.com/
# JSON with mcp_endpoint: /mcp
```

MCP URL for Cursor:

```text
https://YOUR-SERVICE.onrender.com/mcp?token=YOUR_MCP_URL_AUTH_TOKEN
```

If the client strips query strings, use the path-token form:

```text
https://YOUR-SERVICE.onrender.com/YOUR_MCP_URL_AUTH_TOKEN/mcp
```

## Option B — Blueprint (`render.yaml`)

1. **New +** → **Blueprint**
2. Connect repo (includes `render.yaml` at repo root)
3. Fill secret env vars in the dashboard after create

## Cursor remote MCP config

```json
{
  "mcpServers": {
    "linkedin-ads": {
      "url": "https://YOUR-SERVICE.onrender.com/mcp?token=YOUR_MCP_URL_AUTH_TOKEN"
    }
  }
}
```

Header form (token stays out of the URL / logs):

```json
{
  "mcpServers": {
    "linkedin-ads": {
      "url": "https://YOUR-SERVICE.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_URL_AUTH_TOKEN"
      }
    }
  }
}
```

Keep the existing local stdio server if you still want laptop-only access. Do not register both against the same Cursor workspace unless you rename one.

## Security notes

- Set `MCP_URL_AUTH_TOKEN` as a Render **Secret**. `/mcp` rejects requests without it; `/` and `/health` stay public.
- Never commit `.env` or `tokens.json`.
- This URL can list ad accounts and publish org posts. Treat it like Google Ads MCP: only people who should operate Hexa LinkedIn ads get the token.
- Access tokens refresh in memory using `refresh_token` from `LINKEDIN_TOKENS_JSON`. After a restart Render reloads the original JSON; refresh still works as long as the refresh token is valid (~1 year). Re-run `npm run auth` locally and update the env var when LinkedIn invalidates it.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Health `linkedin_authenticated: false` | Paste a current `npm run print-tokens` into `LINKEDIN_TOKENS_JSON`; set client id/secret |
| 401 on `/mcp` | Token missing/wrong. Use `?token=` or `/<token>/mcp` or `Authorization: Bearer` |
| Health check fails | Start command must be `npm run start:http`, health path `/health` |
| Process dies on stdio | You started `npm start` / `node dist/index.js` instead of `start:http` |
| Token expired after months | Local `npm run auth`, then update `LINKEDIN_TOKENS_JSON` |
| Free tier sleeps | First request ~30s; use Starter for always-on (same as Google Ads MCP) |

## Local parity (before deploying)

```bash
cd "/Users/shivpanks/Marketing project/linkedin-mcp"
export PORT=8000
export MCP_URL_AUTH_TOKEN=dev-secret
export LINKEDIN_CLIENT_ID=...
export LINKEDIN_CLIENT_SECRET=...
export LINKEDIN_TOKENS_JSON="$(npm run --silent print-tokens)"
npm run build
npm run start:http
# curl http://127.0.0.1:8000/health
# curl -H 'Authorization: Bearer dev-secret' http://127.0.0.1:8000/
```
