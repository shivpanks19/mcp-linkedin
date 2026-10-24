#!/usr/bin/env node
/**
 * HTTP MCP entrypoint for PaaS (Render, Railway, etc.).
 *
 * Streamable HTTP so Cursor can POST to /mcp (same shape as mcp-google-ads/main.py).
 * Set MCP_URL_AUTH_TOKEN to require /mcp?token=... or /<token>/mcp.
 *
 * Local stdio:  npm start
 * Local HTTP:   npm run start:http  → http://127.0.0.1:8000/mcp
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { LinkedInAdsMCPServer, SERVER_NAME, SERVER_VERSION, TOOLS } from './index.js';
import {
  TOKEN_ENV_VAR,
  configuredToken,
  pathTokenRewrite,
  urlTokenAuth,
} from './url-token-auth.js';

type ActiveTransport = StreamableHTTPServerTransport;

const transports: Record<string, ActiveTransport> = {};

function listenHostPort(): { host: string; port: number } {
  if (process.env.PORT) {
    return { host: '0.0.0.0', port: Number(process.env.PORT) };
  }
  const host = process.env.FASTMCP_HOST || process.env.HOST || '127.0.0.1';
  const port = Number(process.env.FASTMCP_PORT || process.env.HTTP_PORT || '8000');
  return { host, port: Number.isFinite(port) ? port : 8000 };
}

function jsonError(res: express.Response, status: number, message: string): void {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32603, message },
    id: null,
  });
}

async function handleMcpPost(req: express.Request, res: express.Response): Promise<void> {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  try {
    let transport: ActiveTransport | undefined;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
          console.error(`MCP HTTP session initialized: ${sid}`);
        },
      });

      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
          console.error(`MCP HTTP session closed: ${sid}`);
        }
      };

      const server = new LinkedInAdsMCPServer();
      await server.mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else if (!sessionId) {
      // Stateless fallback: one server+transport per request (Render / Cursor cloud).
      const server = new LinkedInAdsMCPServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP HTTP POST error', error);
    jsonError(res, 500, 'Internal server error');
  }
}

async function handleMcpSession(req: express.Request, res: express.Response): Promise<void> {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error(`MCP HTTP ${req.method} error`, error);
    if (!res.headersSent) {
      res.status(500).send('Error processing MCP request');
    }
  }
}

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(pathTokenRewrite);
  app.use(express.json({ limit: '4mb' }));
  app.use(urlTokenAuth);

  app.get('/health', async (_req, res) => {
    const mcp = new LinkedInAdsMCPServer();
    const store = mcp.getTokenStore();
    let authenticated = false;
    try {
      authenticated = await store.hasValidToken();
    } catch (error) {
      console.error('Health token check failed', error);
    }

    res.json({
      status: 'ok',
      service: SERVER_NAME,
      version: SERVER_VERSION,
      transport: 'streamable-http',
      auth_type: configuredToken() ? 'url_token' : 'none',
      linkedin_token_source: store.getTokenSource(),
      linkedin_authenticated: authenticated,
      mcp_tool_count: TOOLS.length,
      active_sessions: Object.keys(transports).length,
      git_commit:
        process.env.RENDER_GIT_COMMIT ||
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.SOURCE_VERSION ||
        '',
    });
  });

  app.get('/', (_req, res) => {
    const authEnabled = Boolean(configuredToken());
    res.json({
      service: SERVER_NAME,
      version: SERVER_VERSION,
      mcp_endpoint: '/mcp',
      auth: {
        enabled: authEnabled,
        token_env_var: TOKEN_ENV_VAR,
        url_formats: authEnabled ? ['/mcp?token=...', '/<token>/mcp'] : [],
      },
      health: '/health',
      docs: 'docs/render-deploy.md',
    });
  });

  app.post('/mcp', handleMcpPost);
  app.get('/mcp', handleMcpSession);
  app.delete('/mcp', handleMcpSession);

  return app;
}

export async function startHttpServer(): Promise<void> {
  const { host, port } = listenHostPort();
  const app = buildApp();
  const authEnabled = Boolean(configuredToken());

  if (!authEnabled) {
    console.error(
      `Warning: ${TOKEN_ENV_VAR} is not set. /mcp is public. Set it before hosting on Render.`
    );
  }

  const store = new LinkedInAdsMCPServer().getTokenStore();
  const authenticated = await store.hasValidToken();
  if (!authenticated) {
    console.error(
      'Warning: no valid LinkedIn token. Set LINKEDIN_TOKENS_JSON (Render) or run npm run auth locally.'
    );
  }

  app.listen(port, host, () => {
    console.error(`${SERVER_NAME} HTTP v${SERVER_VERSION} listening on http://${host}:${port}/mcp`);
    console.error(`Health: http://${host}:${port}/health`);
    console.error(`Tools: ${TOOLS.length}`);
    console.error(authEnabled ? `${TOKEN_ENV_VAR} required on /mcp` : `${TOKEN_ENV_VAR} disabled`);
  });
}

export { buildApp, listenHostPort };

function isMainModule(): boolean {
  const argvPath = process.argv[1] && path.resolve(process.argv[1]);
  return Boolean(argvPath && fileURLToPath(import.meta.url) === argvPath);
}

if (isMainModule()) {
  startHttpServer().catch((error) => {
    console.error('Fatal error starting HTTP MCP server', error);
    process.exit(1);
  });
}
