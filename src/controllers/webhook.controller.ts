// backend/src/controllers/webhook.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { automationEngine } from '../services/automation-engine.service';
import crypto from 'crypto';
import axios from 'axios';

/**
 * Verify Instagram webhook signature
 */
function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET!)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

/**
 * Match keyword based on match type
 */
function matchKeyword(
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
 * Handle Instagram webhook verification (GET request)
 * Instagram sends this to verify your webhook endpoint
 */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('📞 Webhook verification request:', { 
    mode, 
    token: token ? '***' : undefined,
    challenge: challenge ? '***' : undefined,
  });

  // Verify token matches your configured verify token
  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.error('❌ Webhook verification failed - token mismatch');
    res.sendStatus(403);
  }
};

/**
 * Handle Instagram webhook events (POST request)
 * Receives real-time updates about comments, mentions, messages, etc.
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    // Verify the signature
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    
    if (!signature || !verifySignature(rawBody, signature)) {
      console.error('❌ Invalid webhook signature');
      return res.sendStatus(403);
    }

    // Acknowledge receipt immediately (Instagram requires 200 within 20 seconds)
    res.sendStatus(200);

    // Process webhook events asynchronously
    const { object, entry } = req.body;

    console.log('📩 Received webhook:', { 
      object, 
      entryCount: entry?.length || 0 
    });

    if (object !== 'instagram') {
      console.log('⚠️ Webhook object is not Instagram:', object);
      return;
    }

    // Process each entry
    for (const item of entry) {
      const { id: instagramUserId, time, changes } = item;

      console.log(`\n📍 Processing entry for Instagram user: ${instagramUserId}`);

      // Find the integration for this Instagram user
      const integration = await prisma.integration.findFirst({
        where: {
          platform: 'INSTAGRAM',
          platformId: instagramUserId,
          isActive: true,
        },
      });

      if (!integration) {
        console.log(`⚠️ No active integration found for Instagram user ${instagramUserId}`);
        continue;
      }

      console.log(`✅ Found integration for @${integration.username}`);

      // Process each change/event
      for (const change of changes) {
        const { field, value } = change;

        console.log(`🔔 Processing ${field} event`);

        switch (field) {
          case 'comments':
            await handleCommentEvent(integration, value);
            break;
          case 'mentions':
            await handleMentionEvent(integration, value);
            break;
          case 'messages':
            await handleMessageEvent(integration, value);
            break;
          default:
            console.log(`⚠️ Unhandled webhook field: ${field}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Webhook handling error:', error);
    // Don't send error to Instagram - we already sent 200
  }
};

/**
 * Handle comment events from Instagram
 */
async function handleCommentEvent(integration: any, value: any) {
  try {
    const { media, id: commentId, text, from } = value;

    console.log(`💬 New comment on post ${media.id}:`);
    console.log(`   By: @${from.username}`);
    console.log(`   Text: "${text}"`);
    console.log("🪶 Raw comment payload:", JSON.stringify(value, null, 2));

    // Get the post from database
    const post = await prisma.instagramPost.findFirst({
      where: {
        postId: media.id,
        integrationId: integration.id,
      },
    });

    if (!post) {
      console.log(`⚠️ Post ${media.id} not found in database. Syncing posts might be needed.`);
      return;
    }

    console.log(`✅ Found post in database: ${post.id}`);

    // DEBUGGING: Check what triggers exist for this post
    const allTriggersForPost = await prisma.automationTrigger.findMany({
      where: {
        postId: post.id,
      },
      include: {
        automation: true,
        keyword: true,
      },
    });

    console.log(`🔍 DEBUG: Found ${allTriggersForPost.length} triggers for this post:`);
    allTriggersForPost.forEach(trigger => {
      console.log(`   - Automation: ${trigger.automation.name}`);
      console.log(`     Status: ${trigger.automation.status}`);
      console.log(`     Type: ${trigger.automation.type}`);
      console.log(`     IsActive: ${trigger.isActive}`);
      console.log(`     Keyword: ${trigger.keyword?.keyword || 'N/A'}`);
      console.log(`     Has Comment Reply: ${!!(trigger.config as any)?.commentReply}`);
    });

    // Find active automations for this post
    // Support both COMMENT_TO_DM and COMMENT_REPLY types
    const automations = await prisma.automation.findMany({
      where: {
        integrationId: integration.id,
        status: 'ACTIVE',
        type: {
          in: ['COMMENT_TO_DM', 'COMMENT_REPLY', 'AUTO_LIKE'],
        },
        triggers: {
          some: {
            postId: post.id,
            isActive: true,
          },
        },
      },
      include: {
        user: true,
        triggers: {
          where: { 
            isActive: true,
            postId: post.id,
          },
          include: {
            keyword: true,
            response: true,
            post: true,
          },
        },
      },
    });

    if (automations.length === 0) {
      console.log(`⚠️ No active automations found for post ${media.id}`);
      console.log(`   Integration ID: ${integration.id}`);
      console.log(`   Post ID in DB: ${post.id}`);
      console.log(`   Post ID from IG: ${media.id}`);
      return;
    }

    console.log(`🤖 Found ${automations.length} active automation(s)`);

    // Process each automation
    for (const automation of automations) {
      try {
        console.log(`\n🔄 Processing automation: ${automation.name} (${automation.type})`);
        console.log(`   Triggers: ${automation.triggers.length}`);
        
        automation.triggers.forEach((trigger, idx) => {
          console.log(`   Trigger ${idx + 1}:`);
          console.log(`     Keyword: ${trigger.keyword?.keyword || 'No keyword'}`);
          console.log(`     Comment Reply Configured: ${!!(trigger.config as any)?.commentReply}`);
          if ((trigger.config as any)?.commentReply) {
            console.log(`     Comment Reply Text: "${(trigger.config as any).commentReply}"`);
          }
        });

        // Check if already processed
        const existingLog = await prisma.automationLog.findFirst({
          where: {
            automationId: automation.id,
            targetId: commentId,
          },
        });

        if (existingLog) {
          console.log(`⏭️ Comment already processed by automation ${automation.id}`);
          continue;
        }

        // Handle AUTO_LIKE separately (keep existing logic)
        if (automation.type === 'AUTO_LIKE') {
          console.log(`👍 Processing AUTO_LIKE automation...`);
          
          let matchedKeyword = false;
          for (const trigger of automation.triggers) {
            if (trigger.keyword) {
              const matches = matchKeyword(
                text,
                trigger.keyword.keyword,
                trigger.keyword.matchType,
                trigger.keyword.caseSensitive
              );
              
              if (matches) {
                matchedKeyword = true;
                console.log(`✅ Keyword matched: "${trigger.keyword.keyword}"`);
                break;
              }
            }
          }

          if (!matchedKeyword) {
            console.log(`⏭️ No keyword match for AUTO_LIKE, skipping`);
            await prisma.automationLog.create({
              data: {
                automationId: automation.id,
                action: 'skipped',
                targetId: commentId,
                targetUsername: from.username,
                targetType: 'comment',
                status: 'SKIPPED',
                message: 'No keyword match',
                metadata: { commentText: text },
              },
            });
            continue;
          }

          // Like the comment
          try {
            await axios.post(
              `https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION || 'v24.0'}/${commentId}/likes`,
              {},
              {
                params: { access_token: integration.accessToken },
              }
            );

            console.log(`✅ Comment liked successfully`);

            await prisma.automationLog.create({
              data: {
                automationId: automation.id,
                action: 'liked_comment',
                targetId: commentId,
                targetUsername: from.username,
                targetType: 'comment',
                status: 'SUCCESS',
                message: 'Comment liked',
                metadata: { commentText: text },
              },
            });

            await prisma.automation.update({
              where: { id: automation.id },
              data: {
                totalExecutions: { increment: 1 },
                successfulExecutions: { increment: 1 },
                lastExecutedAt: new Date(),
              },
            });

          } catch (error) {
            console.error(`❌ Failed to like comment:`, error);
            
            await prisma.automationLog.create({
              data: {
                automationId: automation.id,
                action: 'like_failed',
                targetId: commentId,
                targetUsername: from.username,
                targetType: 'comment',
                status: 'FAILED',
                message: error instanceof Error ? error.message : 'Failed to like',
                metadata: { commentText: text },
              },
            });
          }
          
          continue;
        }

        // For COMMENT_TO_DM and COMMENT_REPLY, use automation engine
        console.log(`🚀 Calling automationEngine.processSingleComment...`);
        console.log(`   This will handle:`);
        console.log(`   - DM (mandatory) via the Response configured`);
        console.log(`   - Comment Reply (optional) if trigger.config.commentReply exists`);

        const result = await automationEngine.processSingleComment(
          automation.id,
          {
            id: commentId,
            text,
            username: from.username,
            timestamp: new Date().toISOString(),
            from: {
              id: from.id,
              username: from.username,
            },
          },
          integration.accessToken
        );

        console.log(`📊 Result from automation engine:`, result);

        if (result.processed) {
          console.log(`✅ Successfully processed comment for automation ${automation.id}`);
          if (result.actions) {
            console.log(`   Actions taken: ${result.actions.join(', ')}`);
          }
          if (result.response) {
            console.log(`   Responses: ${result.response}`);
          }
        } else {
          console.log(`⏭️ Comment skipped: ${result.message}`);
        }

      } catch (error) {
        console.error(`❌ Error in automation ${automation.id}:`, error);
        if (error instanceof Error) {
          console.error(`   Error message: ${error.message}`);
          console.error(`   Stack trace:`, error.stack);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling comment event:', error);
    if (error instanceof Error) {
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
    }
  }
}

/**
 * Handle mention events
 */
async function handleMentionEvent(integration: any, value: any) {
  try {
    const { media, comment_id, text } = value;
    console.log(`📢 Mentioned in post ${media.id}:`);
    console.log(`   Text: "${text}"`);
    
    // TODO: Implement mention handling logic
    // Find automations of type 'MENTION_REPLY' and process
    console.log('⚠️ Mention automation not yet implemented');
  } catch (error) {
    console.error('❌ Error handling mention event:', error);
  }
}

/**
 * Handle direct message events
 */
async function handleMessageEvent(integration: any, value: any) {
  try {
    const { from, message } = value;
    console.log(`📨 New DM from ${from.username}:`);
    console.log(`   Message: "${message.text}"`);
    
    // TODO: Implement DM auto-reply logic
    // Find automations of type 'DM_REPLY' and process
    console.log('⚠️ DM automation not yet implemented');
  } catch (error) {
    console.error('❌ Error handling message event:', error);
  }
}

/**
 * Test webhook endpoint (for development/testing)
 */
export const testWebhook = async (req: Request, res: Response) => {
  try {
    console.log('🧪 Test webhook triggered');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    res.json({
      success: true,
      message: 'Webhook test successful',
      received: req.body,
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get webhook logs for an integration (for debugging)
 */
export const getWebhookLogs = async (req: Request, res: Response) => {
  try {
    const { integrationId } = req.params;
    const { limit = '50' } = req.query;

    const logs = await prisma.automationLog.findMany({
      where: {
        automation: {
          integrationId,
        },
      },
      orderBy: {
        executedAt: 'desc',
      },
      take: parseInt(limit as string),
      include: {
        automation: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Get webhook logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook logs',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const debugAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
      include: {
        integration: {
          select: {
            id: true,
            platform: true,
            username: true,
            platformId: true,
            isActive: true,
          },
        },
        triggers: {
          include: {
            post: true,
            keyword: true,
            response: true,
          },
        },
      },
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    // Check each trigger
    const triggerStatus = await Promise.all(
      automation.triggers.map(async (trigger) => {
        const post = trigger.post;
        
        return {
          triggerId: trigger.id,
          triggerType: trigger.triggerType,
          isActive: trigger.isActive,
          keyword: trigger.keyword?.keyword,
          matchType: trigger.keyword?.matchType,
          post: post ? {
            id: post.id,
            postId: post.postId,
            caption: post.caption,
            isMonitored: post.isMonitored,
          } : null,
          hasResponse: !!trigger.response,
          responseType: trigger.response?.responseType,
        };
      })
    );

    res.json({
      success: true,
      data: {
        automation: {
          id: automation.id,
          name: automation.name,
          type: automation.type,
          status: automation.status,
        },
        integration: automation.integration,
        triggers: triggerStatus,
        isFullyConfigured: automation.triggers.every(
          t => t.isActive && t.keyword && t.response && t.post
        ),
      },
    });
  } catch (error) {
    console.error('Debug automation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};