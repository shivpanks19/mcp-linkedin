# Organic company page posts (local fork)

This fork adds **Posts API** tools on top of the upstream LinkedIn Ads MCP.

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_managed_organizations` | Company pages you can post to (ACL + name) |
| `publish_organization_post` | Live organic post to page **MAIN_FEED** (text + optional image or **native MP4 video** + CTA link) |
| `upload_video` | Upload MP4 (multipart), wait for processing, returns `urn:li:video:…` |

`upload_image` also works for organic images when `organizationId` is the page owner. Prefer `imageUrl` / `videoUrl` over a local `filePath`.

## What the calling agent must pass

Whenever an LLM agent publishes, it should send:

| Field | Role |
|------|------|
| `commentary` | Full post text (hook, body, CTA copy). Links in this text are posted as-is. |
| `imageUrl` | Public HTTPS URL of the image (JPEG/PNG/GIF). |
| `videoUrl` | Public HTTPS URL of an **MP4** (max 500MB). Server uploads and waits for LinkedIn processing. |
| `ctaUrl` | Destination URL for the CTA. With an image this becomes LinkedIn `contentLandingPage` (clickable image). |
| `ctaLabel` | Optional. Default `LEARN_MORE`. |
| `confirmPublish` | Must be `true` to go live. |

Do **not** pass more than one of `imageUrl`, `imageFilePath`, or `imageUrn`. Do **not** combine image and video fields on one post.

Video must be **MP4**, 3 seconds–30 minutes, 75KB–500MB (LinkedIn Videos API).

`file://` image URLs are treated as local paths. `imageFilePath` remains for files already on disk.

Image + CTA takes precedence over an article card. LinkedIn allows one content type; the CTA URL is attached as `contentLandingPage`, not a second card.

## LinkedIn app requirements

1. **Products** (Developer Portal): enable access that includes **Community Management** / **Share on LinkedIn** (Posts API), in addition to **Advertising API** if you use ads tools.
2. **OAuth scopes** (re-run `npm run auth` after changing scopes):
   - `w_organization_social` — publish
   - `r_organization_social` — read posts / images
   - `r_organization_admin` — list pages via `organizationAcls`
   - Existing ads scopes unchanged

## Page role

The authenticated member must have **ADMINISTRATOR**, **CONTENT_ADMIN**, **DIRECT_SPONSORED_CONTENT_POSTER**, or **RECRUITING_POSTER** on the page (state `APPROVED`).

## Safety

`publish_organization_post` requires `confirmPublish: true` so agents cannot post by accident.

## Example (Claude / Cursor)

1. `list_managed_organizations` → pick `organizationId` for Swayam AI Labs.
2. `publish_organization_post` with:
   - `commentary` — the post body
   - `imageUrl` — HTTPS URL of the generated/hosted image
   - `ctaUrl` — landing page / CTA link
   - `confirmPublish: true`

CLI equivalent:

```bash
node scripts/publish-organization-post.mjs \
  --org 145373966 \
  --text "Post body…" \
  --image-url "https://cdn.example.com/linkedin-card.jpg" \
  --cta-url "https://swayamapp.com" \
  --confirm
```

## Cursor

Add the server to `~/.cursor/mcp.json` (same `node` path as Claude Code) and restart Cursor MCP so it reloads `dist/index.js` after `npm run build`.
