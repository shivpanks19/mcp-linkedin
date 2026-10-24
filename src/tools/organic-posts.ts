import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { LinkedInApiClient } from '../lib/linkedin-api.js';
import {
  ListManagedOrganizationsInput,
  PublishOrganizationPostInput,
} from '../lib/types.js';

export const listManagedOrganizationsTool: Tool = {
  name: 'list_managed_organizations',
  description:
    'Lists LinkedIn company pages the authenticated member can post to (organization ACLs with post-capable roles). Use organizationId from here for publish_organization_post. Requires r_organization_admin on the OAuth token — re-run npm run auth after upgrading the MCP if this fails.',
  inputSchema: {
    type: 'object',
    properties: {
      roles: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'ADMINISTRATOR',
            'CONTENT_ADMIN',
            'DIRECT_SPONSORED_CONTENT_POSTER',
            'RECRUITING_POSTER',
          ],
        },
        description:
          'Filter by company page roles. Default: all roles that can publish organic posts.',
      },
    },
  },
};

export const publishOrganizationPostTool: Tool = {
  name: 'publish_organization_post',
  description:
    'Publishes an organic (free) post to a LinkedIn company page main feed via the Posts API. Not an ad — does not use Campaign Manager. Requires w_organization_social and a post-capable page role (ADMINISTRATOR, CONTENT_ADMIN, etc.). Set confirmPublish to true to go live.',
  inputSchema: {
    type: 'object',
    properties: {
      organizationId: {
        type: 'string',
        description:
          'Numeric organization ID or urn:li:organization:{id}. Use list_managed_organizations or the company page URL.',
      },
      commentary: {
        type: 'string',
        description: 'Post text (commentary). LinkedIn supports lightweight markup; keep within typical feed length.',
      },
      confirmPublish: {
        type: 'boolean',
        description: 'Must be true to publish. Safety gate against accidental live posts.',
      },
      visibility: {
        type: 'string',
        enum: ['PUBLIC'],
        description: 'Default PUBLIC for company pages.',
      },
      articleUrl: {
        type: 'string',
        description: 'Optional URL for a link/article card attachment.',
      },
      articleTitle: {
        type: 'string',
        description: 'Required when articleUrl is set.',
      },
      articleDescription: {
        type: 'string',
        description: 'Optional subtitle for the article card.',
      },
      imageUrn: {
        type: 'string',
        description: 'Optional urn:li:image:… from upload_image.',
      },
      imageFilePath: {
        type: 'string',
        description:
          'Optional absolute path to an image file; uploads to the organization then attaches to the post.',
      },
      imageTitle: {
        type: 'string',
        description: 'Optional title for image posts.',
      },
    },
    required: ['organizationId', 'commentary', 'confirmPublish'],
  },
};

export async function handleListManagedOrganizations(
  client: LinkedInApiClient,
  args: unknown
): Promise<unknown> {
  const input = args as ListManagedOrganizationsInput;
  const organizations = await client.listManagedOrganizations({
    roles: input.roles,
  });

  return {
    count: organizations.length,
    organizations,
    hint:
      'Use organizationId with publish_organization_post. If empty, ensure Community Management / Share APIs are enabled on your LinkedIn app and re-run npm run auth for r_organization_admin.',
  };
}

export async function handlePublishOrganizationPost(
  client: LinkedInApiClient,
  args: unknown
): Promise<unknown> {
  const input = args as PublishOrganizationPostInput;

  if (!input.organizationId) throw new Error('organizationId is required');
  if (!input.commentary?.trim()) throw new Error('commentary is required');
  if (input.confirmPublish !== true) {
    throw new Error(
      'confirmPublish must be true to publish a live company page post. Review commentary and organizationId first.'
    );
  }

  if (input.articleUrl && !input.articleTitle) {
    throw new Error('articleTitle is required when articleUrl is set');
  }

  if (input.imageUrn && input.imageFilePath) {
    throw new Error('Provide only one of imageUrn or imageFilePath');
  }

  let imageUrn = input.imageUrn;
  if (input.imageFilePath) {
    const uploaded = await client.uploadImage({
      owner: input.organizationId,
      filePath: input.imageFilePath,
    });
    imageUrn = uploaded.imageUrn;
  }

  const result = await client.createOrganicOrganizationPost({
    organizationId: input.organizationId,
    commentary: input.commentary,
    visibility: input.visibility ?? 'PUBLIC',
    article: input.articleUrl
      ? {
          source: input.articleUrl,
          title: input.articleTitle!,
          description: input.articleDescription,
        }
      : undefined,
    imageUrn,
    imageTitle: input.imageTitle,
  });

  return {
    success: true,
    postId: result.postId,
    message: 'Organic company page post published to MAIN_FEED.',
    imageUrn: imageUrn ?? undefined,
  };
}
