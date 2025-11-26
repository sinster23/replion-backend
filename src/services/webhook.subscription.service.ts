// backend/src/services/webhook-subscription.service.ts
import axios from 'axios';
import { prisma } from '../lib/prisma';

/**
 * Service to manage Instagram webhook subscriptions
 */
export class WebhookSubscriptionService {
  /**
   * Subscribe to Instagram webhooks for a specific page/account
   * This enables real-time updates for comments, mentions, etc.
   */
  async subscribeToWebhooks(integrationId: string) {
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });

      if (!integration || !integration.accessToken) {
        throw new Error('Integration not found or missing access token');
      }

      // Subscribe to webhook fields
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${integration.platformId}/subscribed_apps`,
        null,
        {
          params: {
            subscribed_fields: 'comments,mentions,messages,messaging_postbacks',
            access_token: integration.accessToken,
          },
        }
      );

      console.log(`Webhook subscription created for integration ${integrationId}`);

      // Update integration metadata
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          metadata: {
            ...((integration.metadata as any) || {}),
            webhookSubscribed: true,
            webhookSubscribedAt: new Date().toISOString(),
          },
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error subscribing to webhooks:', error.response?.data || error.message);
      throw new Error(`Failed to subscribe to webhooks: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Unsubscribe from webhooks
   */
  async unsubscribeFromWebhooks(integrationId: string) {
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });

      if (!integration || !integration.accessToken) {
        throw new Error('Integration not found or missing access token');
      }

      const response = await axios.delete(
        `https://graph.facebook.com/v18.0/${integration.platformId}/subscribed_apps`,
        {
          params: {
            access_token: integration.accessToken,
          },
        }
      );

      // Update integration metadata
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          metadata: {
            ...((integration.metadata as any) || {}),
            webhookSubscribed: false,
            webhookUnsubscribedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`Webhook unsubscribed for integration ${integrationId}`);

      return response.data;
    } catch (error: any) {
      console.error('Error unsubscribing from webhooks:', error.response?.data || error.message);
      throw new Error(`Failed to unsubscribe from webhooks: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Check webhook subscription status
   */
  async checkSubscriptionStatus(integrationId: string) {
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });

      if (!integration || !integration.accessToken) {
        throw new Error('Integration not found or missing access token');
      }

      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${integration.platformId}/subscribed_apps`,
        {
          params: {
            access_token: integration.accessToken,
          },
        }
      );

      const isSubscribed = response.data.data?.length > 0;

      return {
        subscribed: isSubscribed,
        fields: response.data.data || [],
      };
    } catch (error: any) {
      console.error('Error checking subscription status:', error.response?.data || error.message);
      return {
        subscribed: false,
        fields: [],
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Enable webhook monitoring for specific posts
   */
  async enablePostMonitoring(postId: string) {
    try {
      await prisma.instagramPost.update({
        where: { id: postId },
        data: { isMonitored: true },
      });

      console.log(`Post monitoring enabled for ${postId}`);
    } catch (error) {
      console.error('Error enabling post monitoring:', error);
      throw error;
    }
  }

  /**
   * Disable webhook monitoring for specific posts
   */
  async disablePostMonitoring(postId: string) {
    try {
      await prisma.instagramPost.update({
        where: { id: postId },
        data: { isMonitored: false },
      });

      console.log(`Post monitoring disabled for ${postId}`);
    } catch (error) {
      console.error('Error disabling post monitoring:', error);
      throw error;
    }
  }

  /**
   * Bulk enable monitoring for all posts in an integration
   */
  async enableAllPostMonitoring(integrationId: string) {
    try {
      const result = await prisma.instagramPost.updateMany({
        where: { integrationId },
        data: { isMonitored: true },
      });

      console.log(`Enabled monitoring for ${result.count} posts`);
      return result;
    } catch (error) {
      console.error('Error enabling all post monitoring:', error);
      throw error;
    }
  }
}

export const webhookSubscriptionService = new WebhookSubscriptionService();