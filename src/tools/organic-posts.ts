import { fileURLToPath } from 'node:url';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { LinkedInApiClient } from '../lib/linkedin-api.js';
import {
  ListManagedOrganizationsInput,
  PublishOrganizationPostInput,
} from '../lib/types.js';

const CTA_LABELS = [
  'APPLY',
  'DOWNLOAD',
  'VIEW_QUOTE',
  'LEARN_MORE',
  'SIGN_UP',
  'SUBSCRIBE',
  'REGISTER',
  'JOIN',
  'ATTEND',
  'REQUEST_DEMO',
  'SEE_MORE',
] as const;

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
    'Publishes an organic (free) company-page post to LinkedIn MAIN_FEED. Pass commentary and one media type: imageUrl (JPEG/PNG/GIF), videoUrl (MP4), or pre-uploaded URNs. Server downloads and uploads media. ctaUrl optional (contentLandingPage with image). confirmPublish must be true to go live.',
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
        description:
          'Full social post text from the calling agent: hook, body, and CTA copy. Links in this text are posted as-is.',
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
      imageUrl: {
        type: 'string',
        description:
          'Preferred. Public HTTPS URL of the image supplied by the calling LLM agent. The server downloads JPEG/PNG/GIF, uploads to the organization, and attaches it to the post. file:// URLs are treated as local paths.',
      },
      imageFilePath: {
        type: 'string',
        description:
          'Optional absolute path to a local image if no imageUrl is available. Do not pass both imageUrl and imageFilePath.',
      },
      imageUrn: {
        type: 'string',
        description: 'Optional urn:li:image:… from a prior upload_image call.',
      },
      imageTitle: {
        type: 'string',
        description: 'Optional title for image posts.',
      },
      videoUrl: {
        type: 'string',
        description:
          'Public HTTPS URL of an MP4 (max 500MB). Server uploads via Videos API and waits for processing.',
      },
      videoFilePath: {
        type: 'string',
        description: 'Absolute path to a local .mp4 file.',
      },
      videoUrn: {
        type: 'string',
        description: 'Optional urn:li:video:… from a prior upload_video call.',
      },
      videoTitle: {
        type: 'string',
        description: 'Optional title shown on native video posts.',
      },
      ctaUrl: {
        type: 'string',
        description:
          'CTA / landing-page URL. With image/video may map to contentLandingPage where supported. Without media, used as article card URL when articleTitle is set.',
      },
      ctaLabel: {
        type: 'string',
        enum: [...CTA_LABELS],
        description: 'LinkedIn CTA label used with ctaUrl. Default LEARN_MORE.',
      },
      articleUrl: {
        type: 'string',
        description:
          'Optional URL for a link/article card when no image or video is attached.',
      },
      articleTitle: {
        type: 'string',
        description: 'Required when posting an article card (no image) with articleUrl or ctaUrl.',
      },
      articleDescription: {
        type: 'string',
        description: 'Optional subtitle for the article card.',
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

function resolveImageSource(input: PublishOrganizationPostInput): {
  imageUrn?: string;
  filePath?: string;
  imageUrl?: string;
} {
  let imageUrl = input.imageUrl?.trim();
  let filePath = input.imageFilePath?.trim();
  const imageUrn = input.imageUrn?.trim();

  if (imageUrl?.startsWith('file://')) {
    filePath = fileURLToPath(imageUrl);
    imageUrl = undefined;
  }

  const sources = [imageUrn, filePath, imageUrl].filter(Boolean);
  if (sources.length > 1) {
    throw new Error('Provide only one of imageUrn, imageFilePath, or imageUrl');
  }

  return { imageUrn, filePath, imageUrl };
}

function resolveVideoSource(input: PublishOrganizationPostInput): {
  videoUrn?: string;
  filePath?: string;
  videoUrl?: string;
} {
  let videoUrl = input.videoUrl?.trim();
  let filePath = input.videoFilePath?.trim();
  const videoUrn = input.videoUrn?.trim();

  if (videoUrl?.startsWith('file://')) {
    filePath = fileURLToPath(videoUrl);
    videoUrl = undefined;
  }

  const sources = [videoUrn, filePath, videoUrl].filter(Boolean);
  if (sources.length > 1) {
    throw new Error('Provide only one of videoUrn, videoFilePath, or videoUrl');
  }

  return { videoUrn, filePath, videoUrl };
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

  const { imageUrn: existingImageUrn, filePath: imagePath, imageUrl } = resolveImageSource(input);
  const { videoUrn: existingVideoUrn, filePath: videoPath, videoUrl } = resolveVideoSource(input);

  const hasImageInput = Boolean(existingImageUrn || imagePath || imageUrl);
  const hasVideoInput = Boolean(existingVideoUrn || videoPath || videoUrl);
  if (hasImageInput && hasVideoInput) {
    throw new Error('Provide either image fields or video fields, not both');
  }

  const landingPageUrl = (input.ctaUrl || input.articleUrl || '').trim() || undefined;
  const hasMediaInput = hasImageInput || hasVideoInput;
  const articleSource = !hasMediaInput ? landingPageUrl : undefined;

  if (articleSource && !input.articleTitle) {
    throw new Error('articleTitle is required when posting a link card without an image');
  }

  let imageUrn = existingImageUrn;
  let imageSource: 'urn' | 'file' | 'url' | 'buffer' | undefined = existingImageUrn
    ? 'urn'
    : undefined;

  if (imagePath) {
    const uploaded = await client.uploadImage({
      owner: input.organizationId,
      filePath: imagePath,
    });
    imageUrn = uploaded.imageUrn;
    imageSource = uploaded.source;
  } else if (imageUrl) {
    const uploaded = await client.uploadImage({
      owner: input.organizationId,
      imageUrl,
    });
    imageUrn = uploaded.imageUrn;
    imageSource = uploaded.source;
  }

  let videoUrn = existingVideoUrn;
  let videoSource: 'urn' | 'file' | 'url' | 'buffer' | undefined = existingVideoUrn ? 'urn' : undefined;
  let videoStatus: string | undefined;

  if (videoPath) {
    const uploaded = await client.uploadVideo({
      owner: input.organizationId,
      filePath: videoPath,
    });
    videoUrn = uploaded.videoUrn;
    videoSource = uploaded.source;
    videoStatus = uploaded.status;
  } else if (videoUrl) {
    const uploaded = await client.uploadVideo({
      owner: input.organizationId,
      videoUrl,
    });
    videoUrn = uploaded.videoUrn;
    videoSource = uploaded.source;
    videoStatus = uploaded.status;
  } else if (videoUrn) {
    videoStatus = (await client.getVideo(videoUrn))?.status;
    if (videoStatus !== 'AVAILABLE') {
      await client.ensureVideoAvailable(videoUrn);
      videoStatus = 'AVAILABLE';
    }
  }

  const result = await client.createOrganicOrganizationPost({
    organizationId: input.organizationId,
    commentary: input.commentary,
    visibility: input.visibility ?? 'PUBLIC',
    article:
      !imageUrn && !videoUrn && articleSource && input.articleTitle
        ? {
            source: articleSource,
            title: input.articleTitle,
            description: input.articleDescription,
          }
        : undefined,
    imageUrn,
    videoUrn,
    imageTitle: input.imageTitle || (imageUrn ? input.articleTitle : undefined),
    videoTitle: input.videoTitle,
    contentLandingPage: imageUrn && landingPageUrl ? landingPageUrl : undefined,
    contentCallToActionLabel:
      imageUrn && landingPageUrl ? input.ctaLabel || 'LEARN_MORE' : undefined,
  });

  return {
    success: true,
    postId: result.postId,
    message: 'Organic company page post published to MAIN_FEED.',
    imageUrn: imageUrn ?? undefined,
    imageSource,
    videoUrn: videoUrn ?? undefined,
    videoSource,
    videoStatus,
    ctaUrl: landingPageUrl,
  };
}
