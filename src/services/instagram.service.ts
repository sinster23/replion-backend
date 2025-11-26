import axios from 'axios';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com';

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  media_url: string;
  permalink: string;
  timestamp: string;
  thumbnail_url?: string;
  like_count?: number;
  comments_count?: number;
}

export interface InstagramComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  from: {
    id: string;
    username: string;
  };
  like_count?: number;
  replies?: InstagramComment[];
}

export interface InstagramAccount {
  user_id: string;
  username: string;
  account_type: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
  id?: string;
}

interface TokenData {
  access_token: string;
  user_id: string | number;
  permissions?: string | string[];
}

interface TokenResponse {
  data?: TokenData[];
  access_token?: string;
  user_id?: string | number;
  permissions?: string | string[];
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SaveIntegrationParams {
  userId: string;
  profile: InstagramAccount;
  accessToken: string;
  expiresAt: Date;
  permissions?: string;
}

export class InstagramPlatformService {
  /**
   * Generate Instagram OAuth URL
   */
  generateAuthUrl(userId: string): string {
    if (!process.env.INSTAGRAM_CLIENT_ID) {
      throw new Error('INSTAGRAM_CLIENT_ID not configured');
    }

    if (!process.env.BACKEND_URL) {
      throw new Error('BACKEND_URL not configured');
    }

    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/instagram/callback`;
    const authUrl = new URL('https://www.instagram.com/oauth/authorize');

    authUrl.searchParams.set('force_reauth', 'true');
    authUrl.searchParams.set('client_id', process.env.INSTAGRAM_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
      'instagram_business_manage_insights',
    ].join(',');

    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', userId);

    return authUrl.toString();
  }

  /**
   * Exchange code for access token and get long-lived token
   */
  async exchangeCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    instagramUserId: string;
    expiresAt: Date;
    permissions?: string;
  }> {
    if (!process.env.INSTAGRAM_CLIENT_ID || !process.env.INSTAGRAM_CLIENT_SECRET) {
      throw new Error('Instagram credentials not configured');
    }

    if (!process.env.BACKEND_URL) {
      throw new Error('BACKEND_URL not configured');
    }

    const cleanCode = code.replace(/#_$/, '');
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/instagram/callback`;

    // Step 1: Exchange code for short-lived token
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: cleanCode,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({ error_message: 'Unknown error' })) as { error_message?: string };
      console.error('❌ Token exchange failed:', errorData);
      throw new Error(`Token exchange failed: ${errorData.error_message || 'unknown'}`);
    }

    const rawTokenData = await tokenResponse.json() as TokenResponse;
    console.log('📦 Raw token response:', rawTokenData);

    // Parse token data (handle both array and object formats)
    let shortLivedAccessToken: string | undefined;
    let instagramUserId: string | undefined;
    let grantedPermissions: string | undefined;

    if (rawTokenData.data && Array.isArray(rawTokenData.data) && rawTokenData.data.length > 0) {
      const entry = rawTokenData.data[0];
      shortLivedAccessToken = entry.access_token;
      instagramUserId = String(entry.user_id);
      grantedPermissions = Array.isArray(entry.permissions)
        ? entry.permissions.join(',')
        : entry.permissions;
    } else {
      shortLivedAccessToken = rawTokenData.access_token;
      instagramUserId = rawTokenData.user_id ? String(rawTokenData.user_id) : undefined;
      grantedPermissions = Array.isArray(rawTokenData.permissions)
        ? rawTokenData.permissions.join(',')
        : rawTokenData.permissions;
    }

    if (!shortLivedAccessToken || !instagramUserId) {
      throw new Error('Missing access_token or user_id in token response');
    }

    console.log('📦 Short-lived token parsed:', {
      instagramUserId,
      hasToken: !!shortLivedAccessToken,
      permissions: grantedPermissions,
    });

    // Step 2: Exchange for long-lived token
    console.log('🔄 Exchanging for long-lived token...');

    const longLivedResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/access_token` +
        `?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(process.env.INSTAGRAM_CLIENT_SECRET)}` +
        `&access_token=${encodeURIComponent(shortLivedAccessToken)}`,
      { method: 'GET' }
    );

    if (!longLivedResponse.ok) {
      const errorText = await longLivedResponse.text();
      console.error('❌ Long-lived token exchange failed:', errorText);
      throw new Error(`Long-lived token exchange failed: ${errorText}`);
    }

    const longLivedData = await longLivedResponse.json() as LongLivedTokenResponse;
    console.log('📦 Long-lived token response:', longLivedData);

    if (!longLivedData.access_token || !longLivedData.expires_in) {
      throw new Error('Invalid long-lived token response');
    }

    const expiresAt = new Date(Date.now() + longLivedData.expires_in * 1000);

    console.log('✅ Long-lived token obtained:', {
      expires_in_days: Math.floor(longLivedData.expires_in / (24 * 60 * 60)),
      expires_at: expiresAt.toISOString(),
    });

    return {
      accessToken: longLivedData.access_token,
      instagramUserId,
      expiresAt,
      permissions: grantedPermissions,
    };
  }

  /**
   * Get account information
   */
  async getAccountInfo(accessToken: string): Promise<InstagramAccount> {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/me`, {
        params: {
          fields: 'id,username,account_type,media_count',
          access_token: accessToken,
        },
      });

      console.log(`✅ Fetched account info for @${response.data.username}`);
      return {
        user_id: response.data.id,
        id: response.data.id,
        username: response.data.username,
        account_type: response.data.account_type,
        media_count: response.data.media_count,
      };
    } catch (error: any) {
      console.error('❌ Get account info error:', error.response?.data || error.message);
      throw new Error(
        `Failed to get account info: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Save integration to database
   */
  async saveIntegration(params: SaveIntegrationParams) {
    const { userId, profile, accessToken, expiresAt, permissions } = params;

    const metadata: Prisma.JsonObject = {
      accountType: profile.account_type || null,
      mediaCount: profile.media_count || 0,
      tokenType: 'long_lived',
      lastRefreshed: new Date().toISOString(),
      permissions: permissions || null,
    };

    return await prisma.integration.upsert({
      where: {
        userId_platform_platformId: {
          userId,
          platform: 'INSTAGRAM',
          platformId: profile.user_id,
        },
      },
      update: {
        accessToken,
        username: profile.username,
        isActive: true,
        metadata,
        expiresAt,
        lastSynced: new Date(),
      },
      create: {
        userId,
        platform: 'INSTAGRAM',
        platformId: profile.user_id,
        username: profile.username,
        accessToken,
        isActive: true,
        metadata,
        expiresAt,
        lastSynced: new Date(),
      },
    });
  }

  /**
   * Get user's media posts
   */
  async getUserMedia(accessToken: string, limit: number = 25): Promise<InstagramMedia[]> {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/me/media`, {
        params: {
          fields:
            'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,like_count,comments_count',
          access_token: accessToken,
          limit,
        },
      });

      const media = response.data.data || [];
      console.log(`✅ Fetched ${media.length} media posts`);
      return media;
    } catch (error: any) {
      console.error('❌ Get media error:', error.response?.data || error.message);
      throw new Error(`Failed to get media: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get comments on a media post
   */
  async getMediaComments(mediaId: string, accessToken: string): Promise<InstagramComment[]> {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/${mediaId}/comments`, {
        params: {
          fields:
            'id,text,username,timestamp,like_count,from{id,username},replies{id,text,username,timestamp,from{id,username}}',
          access_token: accessToken,
        },
      });

      const comments = response.data.data || [];
      console.log(`✅ Fetched ${comments.length} comments for media ${mediaId}`);

      return comments.map((comment: any) => ({
        id: comment.id,
        text: comment.text,
        username: comment.username,
        timestamp: comment.timestamp,
        from: {
          id: comment.from?.id || comment.id,
          username: comment.username,
        },
        like_count: comment.like_count,
        replies: comment.replies?.data || [],
      }));
    } catch (error: any) {
      console.error('❌ Get comments error:', error.response?.data || error.message);
      throw new Error(
        `Failed to get comments: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId: string, message: string, accessToken: string) {
    try {
      const response = await axios.post(
        `${INSTAGRAM_GRAPH_API}/${commentId}/replies`,
        { message },
        {
          params: { access_token: accessToken },
        }
      );

      console.log(`✅ Replied to comment ${commentId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Reply error:', error.response?.data || error.message);

      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error?.message || '';
        if (errorMsg.includes('rate limit')) {
          throw new Error('Instagram rate limit reached. Please try again later.');
        }
      }

      throw new Error(
        `Failed to reply: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Send direct message
   */
  async sendDirectMessage(recipientUserId: string, message: string, accessToken: string) {
    try {
      const response = await axios.post(
        `${INSTAGRAM_GRAPH_API}/me/messages`,
        {
          recipient: { id: recipientUserId },
          message: { text: message },
        },
        {
          params: { access_token: accessToken },
        }
      );

      console.log(`✅ Sent DM to user ${recipientUserId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Send DM error:', error.response?.data || error.message);

      const errorMsg = error.response?.data?.error?.message || '';

      if (errorMsg.includes('24 hour') || errorMsg.includes('messaging window')) {
        throw new Error('Cannot send DM: 24-hour window expired. User must message you first.');
      }

      if (error.response?.status === 403) {
        throw new Error(
          'Instagram messaging permission not granted. Enable instagram_manage_messages.'
        );
      }

      throw new Error(`Failed to send DM: ${errorMsg || error.message}`);
    }
  }

  /**
   * Get Instagram User ID from comment
   */
  getUserIdFromComment(comment: InstagramComment): string {
    return comment.from.id;
  }

  /**
   * Check if keyword matches based on match type
   */
  matchKeyword(
    text: string,
    keyword: string,
    matchType: string,
    caseSensitive: boolean
  ): boolean {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

    switch (matchType) {
      case 'EXACT':
        return searchText === searchKeyword;
      case 'CONTAINS':
        return searchText.includes(searchKeyword);
      case 'STARTS_WITH':
        return searchText.startsWith(searchKeyword);
      case 'ENDS_WITH':
        return searchText.endsWith(searchKeyword);
      case 'REGEX':
        try {
          const regex = new RegExp(keyword, caseSensitive ? '' : 'i');
          return regex.test(text);
        } catch {
          return false;
        }
      default:
        return searchText.includes(searchKeyword);
    }
  }

  /**
   * Sync user media to database
   */
  async syncUserMedia(integrationId: string, accessToken: string) {
    try {
      const media = await this.getUserMedia(accessToken, 50);

      const posts = await Promise.all(
        media.map(async (item) => {
          return prisma.instagramPost.upsert({
            where: { postId: item.id },
            update: {
              caption: item.caption || null,
              mediaType: item.media_type,
              mediaUrl: item.media_url,
              permalink: item.permalink,
              timestamp: new Date(item.timestamp),
              likesCount: item.like_count || 0,
              commentsCount: item.comments_count || 0,
            },
            create: {
              integrationId,
              postId: item.id,
              caption: item.caption || null,
              mediaType: item.media_type,
              mediaUrl: item.media_url,
              permalink: item.permalink,
              timestamp: new Date(item.timestamp),
              likesCount: item.like_count || 0,
              commentsCount: item.comments_count || 0,
              isMonitored: false,
            },
          });
        })
      );

      await prisma.integration.update({
        where: { id: integrationId },
        data: { lastSynced: new Date() },
      });

      console.log(`✅ Synced ${posts.length} posts for integration ${integrationId}`);
      return posts;
    } catch (error: any) {
      console.error('❌ Sync error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token (tokens expire after 60 days)
   */
  async refreshAccessToken(currentToken: string): Promise<LongLivedTokenResponse> {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/refresh_access_token`, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        },
      });

      console.log('✅ Token refreshed successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Token refresh error:', error.response?.data || error.message);
      throw new Error(
        `Failed to refresh token: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Get long-lived access token (60 days)
   */
  async getLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/access_token`, {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
          access_token: shortLivedToken,
        },
      });

      console.log('✅ Long-lived token obtained');
      return response.data;
    } catch (error: any) {
      console.error('❌ Long-lived token error:', error.response?.data || error.message);
      throw new Error(
        `Failed to get long-lived token: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Debug token - check validity and permissions
   */
  async debugToken(accessToken: string) {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/me`, {
        params: {
          fields: 'id,username,account_type',
          access_token: accessToken,
        },
      });

      console.log('✅ Token is valid');
      return {
        valid: true,
        data: response.data,
      };
    } catch (error: any) {
      console.error('❌ Token validation failed:', error.response?.data || error.message);
      return {
        valid: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Get mentions (for future mention automation)
   */
  async getMentions(accessToken: string) {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/me/mentioned_media`, {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,username',
          access_token: accessToken,
        },
      });

      console.log(`✅ Fetched ${response.data.data?.length || 0} mentions`);
      return response.data.data || [];
    } catch (error: any) {
      console.error('❌ Get mentions error:', error.response?.data || error.message);
      throw new Error(
        `Failed to get mentions: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Get user profile (legacy method name for compatibility)
   */
  async getUserProfile(accessToken: string): Promise<InstagramAccount> {
    return this.getAccountInfo(accessToken);
  }

  /**
   * Get Instagram insights for a media post (analytics)
   */
  async getMediaInsights(mediaId: string, accessToken: string) {
    try {
      const response = await axios.get(`${INSTAGRAM_GRAPH_API}/${mediaId}/insights`, {
        params: {
          metric: 'engagement,impressions,reach,saved',
          access_token: accessToken,
        },
      });

      console.log(`✅ Fetched insights for media ${mediaId}`);
      return response.data.data || [];
    } catch (error: any) {
      console.error('❌ Get insights error:', error.response?.data || error.message);
      throw new Error(
        `Failed to get insights: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }
}

export const instagramPlatformService = new InstagramPlatformService();

// Also export as 'instagramService' for backward compatibility with automation engine
export const instagramService = instagramPlatformService;