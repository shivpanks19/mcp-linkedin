# Organic company page posts (local fork)

This fork adds **Posts API** tools on top of the upstream LinkedIn Ads MCP.

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_managed_organizations` | Company pages you can post to (ACL + name) |
| `publish_organization_post` | Live organic post to page **MAIN_FEED** (text, optional link card or image) |

`upload_image` also works for organic images when `organizationId` is the page owner.

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
2. `publish_organization_post` with `commentary`, `confirmPublish: true`, optional `imageFilePath` or `articleUrl` + `articleTitle`.

## Cursor

Add the server to `~/.cursor/mcp.json` (same `node` path as Claude Code) and restart Cursor MCP.
