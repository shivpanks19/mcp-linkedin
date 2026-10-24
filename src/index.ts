#!/usr/bin/env node

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { LinkedInApiClient } from './lib/linkedin-api.js';
import { TokenStore } from './auth/token-store.js';
import {
  listAdAccountsTool,
  getAccountDetailsTool,
  handleListAdAccounts,
  handleGetAccountDetails,
} from './tools/accounts.js';
import {
  getCampaignPerformanceTool,
  getCreativePerformanceTool,
  getCampaignGroupsTool,
  handleGetCampaignPerformance,
  handleGetCreativePerformance,
  handleGetCampaignGroups,
} from './tools/performance.js';
import {
  getAudienceDemographicsTool,
  getAudienceReachTool,
  listSavedAudiencesTool,
  handleGetAudienceDemographics,
  handleGetAudienceReach,
  handleListSavedAudiences,
} from './tools/demographics.js';
import {
  getConversionPerformanceTool,
  listConversionsTool,
  getLeadGenPerformanceTool,
  listLeadFormsTool,
  handleGetConversionPerformance,
  handleListConversions,
  handleGetLeadGenPerformance,
  handleListLeadForms,
} from './tools/conversions.js';
import {
  comparePerformanceTool,
  getDailyTrendsTool,
  handleComparePerformance,
  handleGetDailyTrends,
} from './tools/analytics.js';
import {
  createCampaignGroupTool,
  updateCampaignGroupTool,
  deleteCampaignGroupTool,
  createCampaignTool,
  updateCampaignTool,
  deleteCampaignTool,
  updateCreativeStatusTool,
  createCreativeTool,
  handleCreateCampaignGroup,
  handleUpdateCampaignGroup,
  handleDeleteCampaignGroup,
  handleCreateCampaign,
  handleUpdateCampaign,
  handleDeleteCampaign,
  handleUpdateCreativeStatus,
  handleCreateCreative,
  createInlineAdTool,
  handleCreateInlineAd,
  listCampaignsTool,
  handleListCampaigns,
  uploadImageTool,
  handleUploadImage,
} from './tools/campaign-management.js';
import {
  listManagedOrganizationsTool,
  publishOrganizationPostTool,
  handleListManagedOrganizations,
  handlePublishOrganizationPost,
} from './tools/organic-posts.js';

export const SERVER_NAME = 'linkedin-ads-mcp';
export const SERVER_VERSION = '1.2.0';

// All available tools
export const TOOLS: Tool[] = [
  // Account Management
  listAdAccountsTool,
  getAccountDetailsTool,
  // Campaign & Creative Performance
  getCampaignPerformanceTool,
  getCreativePerformanceTool,
  getCampaignGroupsTool,
  // Audience & Demographics
  getAudienceDemographicsTool,
  getAudienceReachTool,
  listSavedAudiencesTool,
  // Conversions & Lead Gen
  getConversionPerformanceTool,
  listConversionsTool,
  getLeadGenPerformanceTool,
  listLeadFormsTool,
  // Advanced Analytics
  comparePerformanceTool,
  getDailyTrendsTool,
  // Campaign Management (Write)
  createCampaignGroupTool,
  updateCampaignGroupTool,
  deleteCampaignGroupTool,
  createCampaignTool,
  updateCampaignTool,
  deleteCampaignTool,
  updateCreativeStatusTool,
  createCreativeTool,
  createInlineAdTool,
  listCampaignsTool,
  uploadImageTool,
  // Organic company page posts (Posts API)
  listManagedOrganizationsTool,
  publishOrganizationPostTool,
];

export class LinkedInAdsMCPServer {
  private server: Server;
  private apiClient: LinkedInApiClient;
  private tokenStore: TokenStore;

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tokenStore = new TokenStore();
    this.apiClient = new LinkedInApiClient(this.tokenStore);

    this.setupHandlers();
  }

  get mcpServer(): Server {
    return this.server;
  }

  getTokenStore(): TokenStore {
    return this.tokenStore;
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check if authenticated
        const isAuthenticated = await this.tokenStore.hasValidToken();
        if (!isAuthenticated) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Not authenticated',
                  message: 'Please run the authentication flow first: npm run auth',
                }),
              },
            ],
            isError: true,
          };
        }

        let result: unknown;

        switch (name) {
          // Account Management
          case 'list_ad_accounts':
            result = await handleListAdAccounts(this.apiClient, args);
            break;
          case 'get_account_details':
            result = await handleGetAccountDetails(this.apiClient, args);
            break;

          // Campaign & Creative Performance
          case 'get_campaign_performance':
            result = await handleGetCampaignPerformance(this.apiClient, args);
            break;
          case 'get_creative_performance':
            result = await handleGetCreativePerformance(this.apiClient, args);
            break;
          case 'get_campaign_groups':
            result = await handleGetCampaignGroups(this.apiClient, args);
            break;

          // Audience & Demographics
          case 'get_audience_demographics':
            result = await handleGetAudienceDemographics(this.apiClient, args);
            break;
          case 'get_audience_reach':
            result = await handleGetAudienceReach(this.apiClient, args);
            break;
          case 'list_saved_audiences':
            result = await handleListSavedAudiences(this.apiClient, args);
            break;

          // Conversions & Lead Gen
          case 'get_conversion_performance':
            result = await handleGetConversionPerformance(this.apiClient, args);
            break;
          case 'list_conversions':
            result = await handleListConversions(this.apiClient, args);
            break;
          case 'get_lead_gen_performance':
            result = await handleGetLeadGenPerformance(this.apiClient, args);
            break;
          case 'list_lead_forms':
            result = await handleListLeadForms(this.apiClient, args);
            break;

          // Advanced Analytics
          case 'compare_performance':
            result = await handleComparePerformance(this.apiClient, args);
            break;
          case 'get_daily_trends':
            result = await handleGetDailyTrends(this.apiClient, args);
            break;

          // Campaign Management (Write)
          case 'create_campaign_group':
            result = await handleCreateCampaignGroup(this.apiClient, args);
            break;
          case 'update_campaign_group':
            result = await handleUpdateCampaignGroup(this.apiClient, args);
            break;
          case 'delete_campaign_group':
            result = await handleDeleteCampaignGroup(this.apiClient, args);
            break;
          case 'create_campaign':
            result = await handleCreateCampaign(this.apiClient, args);
            break;
          case 'update_campaign':
            result = await handleUpdateCampaign(this.apiClient, args);
            break;
          case 'delete_campaign':
            result = await handleDeleteCampaign(this.apiClient, args);
            break;
          case 'update_creative_status':
            result = await handleUpdateCreativeStatus(this.apiClient, args);
            break;
          case 'create_creative':
            result = await handleCreateCreative(this.apiClient, args);
            break;
          case 'create_inline_ad':
            result = await handleCreateInlineAd(this.apiClient, args);
            break;
          case 'list_campaigns':
            result = await handleListCampaigns(this.apiClient, args);
            break;
          case 'upload_image':
            result = await handleUploadImage(this.apiClient, args);
            break;

          case 'list_managed_organizations':
            result = await handleListManagedOrganizations(this.apiClient, args);
            break;
          case 'publish_organization_post':
            result = await handlePublishOrganizationPost(this.apiClient, args);
            break;

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                },
              ],
              isError: true,
            };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errorMessage }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('LinkedIn Ads MCP server running on stdio');
  }
}

function isMainModule(): boolean {
  const argvPath = process.argv[1] && path.resolve(process.argv[1]);
  return Boolean(argvPath && fileURLToPath(import.meta.url) === argvPath);
}

if (isMainModule()) {
  const server = new LinkedInAdsMCPServer();
  server.run().catch(console.error);
}
