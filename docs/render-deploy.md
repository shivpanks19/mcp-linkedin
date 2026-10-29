# Deploy on Render

Host the LinkedIn Ads MCP server as a **Web Service** with **streamable HTTP** so Cursor can connect remotely.

**Tokens are managed on Render only** — the server refreshes LinkedIn access tokens itself and persists them back to Render env. You do **not** copy `tokens.json` from your laptop.

Local stdio (`npm run start:stdio`) is for laptop-only use.

## Prerequisites

1. [Render](https://render.com) account (**Starter**, not free spin-down)
2. This repo on GitHub
3. LinkedIn Developer App with **Advertising API** + Community Management (organic posts)
4. On the LinkedIn app, add redirect URL:  
   `https://YOUR-SERVICE.onrender.com/auth/linkedin/callback`

## Environment variables (Render dashboard)

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_VERSION` | yes | `20` |
| `MCP_URL_AUTH_TOKEN` | yes | Secret — protects `/mcp` and `/auth/linkedin` |
| `LINKEDIN_CLIENT_ID` | yes | Same app as redirect URI |
| `LINKEDIN_CLIENT_SECRET` | yes | Secret |
| `LINKEDIN_REDIRECT_URI` | yes | `https://YOUR-SERVICE.onrender.com/auth/linkedin/callback` |
| `TOKEN_STORAGE_PATH` | yes | `/tmp/linkedin-ads-mcp-tokens.json` |
| `RENDER_API_KEY` | yes | Render API key with permission to update **this** service’s env vars |
| `LINKEDIN_TOKENS_JSON` | no | Filled automatically after hosted OAuth + after each refresh |

Render injects `RENDER=true`, `RENDER_SERVICE_ID`, and `RENDER_EXTERNAL_URL` — you do not set those.

### How tokens work on Render (no laptop)

1. **First connect:** open  
   `https://YOUR-SERVICE.onrender.com/auth/linkedin?token=YOUR_MCP_URL_AUTH_TOKEN`  
   Sign in with LinkedIn. Tokens are saved to `/tmp` and written to `LINKEDIN_TOKENS_JSON` via Render API.
2. **Routine refresh:** before access tokens expire, the server calls LinkedIn’s refresh endpoint (same as local MCP), updates `/tmp`, and pushes the new JSON to `LINKEDIN_TOKENS_JSON` on Render (no redeploy).
3. **If refresh fails** (revoked session): `/health` returns `linkedin_reauth_url` — open that link again. No local `npm run auth` required.

A background job runs every 30 minutes on Render to refresh early and log the re-auth URL if needed.

## Create Web Service

| Field | Value |
|-------|--------|
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node dist/http.js` |
| **Health Check Path** | `/health` |

## Verify

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

After OAuth: `"linkedin_authenticated": true`. Before OAuth: `"linkedin_authenticated": false` and `"linkedin_reauth_url": "https://…/auth/linkedin?token=…"`.

## Cursor config

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

## Security

- Never commit `.env` or token JSON.
- `RENDER_API_KEY` on the service only updates env vars for that service (used for self-persist after refresh).
- Treat the MCP URL like production ads access.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `upload_image` 401 / token revoked | Open `linkedin_reauth_url` from `/health` (hosted OAuth again) |
| `linkedin_authenticated: false` | Same — one-time browser connect on Render |
| Render self token persist failed | Check `RENDER_API_KEY` scope; logs show Render API errors |
| 401 on `/mcp` | Wrong `MCP_URL_AUTH_TOKEN` on client |

## Local laptop (optional)

`npm run auth` only updates `~/.linkedin-ads-mcp/tokens.json` for **local** stdio MCP. It does not push to Render. Use hosted OAuth for the remote server.

Emergency manual env update (rare): `npm run sync-tokens-to-render` with `RENDER_API_KEY` + `RENDER_SERVICE_ID` in **local** `.env` only.
