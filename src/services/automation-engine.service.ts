// backend/src/services/automation-engine.service.ts
import { prisma } from '../lib/prisma';
import { instagramPlatformService, InstagramComment } from './instagram.service';
import { aiService } from './ai.service';

export class AutomationEngine {
  /**
   * Process comment-to-DM automation for a specific post
   * Monitors comments and sends DMs when keywords match
   */
  async processCommentToDMAutomation(
    automationId: string,
    postId: string,
    accessToken: string
  ) {
    try {
      const automation = await prisma.automation.findUnique({
        where: { id: automationId },
        include: {
          user: true,
          integration: true,
          triggers: {
            where: { isActive: true },
            include: {
              keyword: true,
              response: true,
            },
          },
        },
      });

      if (!automation || automation.status !== 'ACTIVE') {
        return { processed: 0, message: 'Automation not active' };
      }

      // Check daily/hourly limits
      if (!(await this.checkLimits(automation))) {
        return { processed: 0, message: 'Rate limit reached' };
      }

      // Fetch comments from Instagram using NEW Platform API
      const comments = await instagramPlatformService.getMediaComments(postId, accessToken);

      let processed = 0;
      let successful = 0;
      let failed = 0;

      for (const comment of comments) {
        try {
          // Check if already processed
          const existingLog = await prisma.automationLog.findFirst({
            where: {
              automationId,
              targetId: comment.id,
            },
          });

          if (existingLog) {
            console.log(`⏭️ Comment ${comment.id} already processed, skipping`);
            continue;
          }

          // Check keyword match
          const matchedTrigger = this.findMatchingTrigger(
            comment.text,
            automation.triggers
          );

          if (!matchedTrigger) {
            // Log as skipped - no keyword match
            await this.createLog(
              automationId,
              comment,
              'SKIPPED',
              null,
              'No keyword match'
            );
            console.log(`⏭️ No keyword match for comment: "${comment.text}"`);
            continue;
          }

          console.log(`✅ Keyword matched! Trigger: ${matchedTrigger.keyword?.keyword}`);

          // Generate response message
          const responseText = await this.generateResponse(
            matchedTrigger,
            comment,
            automation.user.plan,
            accessToken
          );

          // Get user ID from comment to send DM
          const recipientUserId = instagramPlatformService.getUserIdFromComment(comment);

          console.log(`📤 Sending DM to @${comment.username} (ID: ${recipientUserId})`);

          // Send DM to the commenter using NEW Platform API
          await instagramPlatformService.sendDirectMessage(
            recipientUserId,
            responseText,
            accessToken
          );

          // Log success
          await this.createLog(
            automationId,
            comment,
            'SUCCESS',
            responseText,
            `DM sent to @${comment.username}`
          );

          console.log(`✅ DM sent successfully to @${comment.username}`);

          successful++;
          processed++;

          // Update automation stats
          await this.updateAutomationStats(automationId, true);

        } catch (error) {
          console.error(`❌ Error processing comment ${comment.id}:`, error);
          failed++;
          await this.createLog(
            automationId,
            comment,
            'FAILED',
            null,
            error instanceof Error ? error.message : 'Unknown error'
          );
          await this.updateAutomationStats(automationId, false);
        }
      }

      return {
        processed,
        successful,
        failed,
        message: `Processed ${processed} comments, sent ${successful} DMs`,
      };
    } catch (error) {
      console.error('❌ Comment-to-DM automation error:', error);
      throw error;
    }
  }

  /**
   * Process comment reply automation (replies directly to comments)
   */
  async processCommentReplyAutomation(
    automationId: string,
    postId: string,
    accessToken: string
  ) {
    try {
      const automation = await prisma.automation.findUnique({
        where: { id: automationId },
        include: {
          user: true,
          integration: true,
          triggers: {
            where: { isActive: true },
            include: {
              keyword: true,
              response: true,
            },
          },
        },
      });

      if (!automation || automation.status !== 'ACTIVE') {
        return { processed: 0, message: 'Automation not active' };
      }

      if (!(await this.checkLimits(automation))) {
        return { processed: 0, message: 'Rate limit reached' };
      }

      // Fetch comments using NEW Platform API
      const comments = await instagramPlatformService.getMediaComments(postId, accessToken);

      let processed = 0;
      let successful = 0;
      let failed = 0;

      for (const comment of comments) {
        try {
          const existingLog = await prisma.automationLog.findFirst({
            where: {
              automationId,
              targetId: comment.id,
            },
          });

          if (existingLog) {
            console.log(`⏭️ Comment ${comment.id} already processed, skipping`);
            continue;
          }

          const matchedTrigger = this.findMatchingTrigger(
            comment.text,
            automation.triggers
          );

          if (!matchedTrigger) {
            await this.createLog(
              automationId,
              comment,
              'SKIPPED',
              null,
              'No keyword match'
            );
            console.log(`⏭️ No keyword match for comment: "${comment.text}"`);
            continue;
          }

          console.log(`✅ Keyword matched! Trigger: ${matchedTrigger.keyword?.keyword}`);

          const responseText = await this.generateResponse(
            matchedTrigger,
            comment,
            automation.user.plan,
            accessToken
          );

          console.log(`💬 Replying to comment by @${comment.username}`);

          // Reply to comment directly using NEW Platform API
          await instagramPlatformService.replyToComment(
            comment.id,
            responseText,
            accessToken
          );

          await this.createLog(
            automationId,
            comment,
            'SUCCESS',
            responseText,
            'Comment replied successfully'
          );

          console.log(`✅ Replied successfully to @${comment.username}`);

          successful++;
          processed++;
          await this.updateAutomationStats(automationId, true);

        } catch (error) {
          console.error(`❌ Error replying to comment ${comment.id}:`, error);
          failed++;
          await this.createLog(
            automationId,
            comment,
            'FAILED',
            null,
            error instanceof Error ? error.message : 'Unknown error'
          );
          await this.updateAutomationStats(automationId, false);
        }
      }

      return {
        processed,
        successful,
        failed,
        message: `Processed ${processed} comments, replied to ${successful}`,
      };
    } catch (error) {
      console.error('❌ Comment reply automation error:', error);
      throw error;
    }
  }

  /**
   * Find matching trigger based on keywords
   */
  private findMatchingTrigger(commentText: string, triggers: any[]) {
    for (const trigger of triggers) {
      if (trigger.keyword) {
        const matches = instagramPlatformService.matchKeyword(
          commentText,
          trigger.keyword.keyword,
          trigger.keyword.matchType,
          trigger.keyword.caseSensitive
        );

        if (matches) {
          return trigger;
        }
      }
    }
    return null;
  }

  /**
   * Generate response based on trigger settings
   */
  private async generateResponse(
    trigger: any,
    comment: InstagramComment,
    userPlan: string,
    accessToken: string
  ): Promise<string> {
    const response = trigger.response;

    if (!response) {
      throw new Error('No response configured for trigger');
    }

    // Custom message
    if (response.responseType === 'CUSTOM' && response.customMessage) {
      return this.personalizeMessage(response.customMessage, comment);
    }

    // AI-generated response
    if (response.responseType === 'AI_GENERATED') {
      if (!aiService.isAIEnabled(userPlan)) {
        throw new Error('AI responses require PRO plan');
      }

      console.log('🤖 Generating AI response...');

      return await aiService.generateCommentReply({
        commentText: comment.text,
        userName: comment.username,
        userPrompt: response.aiPrompt || undefined,
      });
    }

    throw new Error('Invalid response type');
  }

  /**
   * Personalize message with variables
   */
  private personalizeMessage(template: string, comment: InstagramComment): string {
    return template
      .replace(/{username}/g, comment.username)
      .replace(/{comment}/g, comment.text)
      .replace(/{time}/g, new Date().toLocaleTimeString());
  }

  /**
   * Check if automation is within limits
   */
  private async checkLimits(automation: any): Promise<boolean> {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfHour = new Date(now.setMinutes(0, 0, 0));

    // Check daily limit
    if (automation.dailyLimit) {
      const todayCount = await prisma.automationLog.count({
        where: {
          automationId: automation.id,
          status: 'SUCCESS',
          executedAt: { gte: startOfDay },
        },
      });

      if (todayCount >= automation.dailyLimit) {
        console.log(`⚠️ Daily limit reached for automation ${automation.id}: ${todayCount}/${automation.dailyLimit}`);
        return false;
      }
    }

    // Check hourly limit
    if (automation.hourlyLimit) {
      const hourCount = await prisma.automationLog.count({
        where: {
          automationId: automation.id,
          status: 'SUCCESS',
          executedAt: { gte: startOfHour },
        },
      });

      if (hourCount >= automation.hourlyLimit) {
        console.log(`⚠️ Hourly limit reached for automation ${automation.id}: ${hourCount}/${automation.hourlyLimit}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Create automation log
   */
  private async createLog(
    automationId: string,
    comment: InstagramComment,
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
    responseText: string | null,
    message: string
  ) {
    const action = status === 'SUCCESS' 
      ? (responseText?.includes('DM') ? 'sent_dm' : 'replied_comment')
      : 'skipped_comment';

    await prisma.automationLog.create({
      data: {
        automationId,
        action,
        targetId: comment.id,
        targetUsername: comment.username,
        targetType: 'comment',
        status,
        message,
        responseText,
        metadata: {
          commentText: comment.text,
          timestamp: comment.timestamp,
          userId: comment.from.id,
        },
      },
    });
  }

  /**
   * Update automation statistics
   */
  private async updateAutomationStats(automationId: string, success: boolean) {
    await prisma.automation.update({
      where: { id: automationId },
      data: {
        totalExecutions: { increment: 1 },
        successfulExecutions: success ? { increment: 1 } : undefined,
        failedExecutions: !success ? { increment: 1 } : undefined,
        lastExecutedAt: new Date(),
      },
    });
  }

  /**
   * Run all active automations (called by cron job)
   * This is the main entry point for scheduled automation runs
   */
  async runActiveAutomations() {
    try {
      console.log('🔄 Starting automation run...');

      const activeAutomations = await prisma.automation.findMany({
        where: {
          status: 'ACTIVE',
          type: {
            in: ['COMMENT_TO_DM', 'COMMENT_REPLY'],
          },
        },
        include: {
          integration: true,
          triggers: {
            where: { isActive: true },
            include: {
              post: true,
              keyword: true,
              response: true,
            },
          },
        },
      });

      console.log(`📊 Found ${activeAutomations.length} active automation(s)`);

      let totalProcessed = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      for (const automation of activeAutomations) {
        if (!automation.integration.accessToken) {
          console.log(`⚠️ Skipping automation ${automation.id}: No access token`);
          continue;
        }

        console.log(`\n🤖 Processing automation: ${automation.name} (${automation.type})`);

        // Get monitored posts
        const monitoredPosts = automation.triggers
          .filter(t => t.post)
          .map(t => t.post!);

        console.log(`📝 Found ${monitoredPosts.length} monitored post(s)`);

        for (const post of monitoredPosts) {
          try {
            console.log(`\n📍 Processing post: ${post.postId}`);
            
            let result;

            if (automation.type === 'COMMENT_TO_DM') {
              result = await this.processCommentToDMAutomation(
                automation.id,
                post.postId,
                automation.integration.accessToken
              );
            } else if (automation.type === 'COMMENT_REPLY') {
              result = await this.processCommentReplyAutomation(
                automation.id,
                post.postId,
                automation.integration.accessToken
              );
            }

            if (result) {
              totalProcessed += result.processed;
              totalSuccessful += result.successful ?? 0;
              totalFailed += result.failed ?? 0;

              console.log(`✅ ${result.message}`);
            }

          } catch (error) {
            console.error(`❌ Error processing post ${post.postId}:`, error);
            totalFailed++;
          }
        }
      }

      console.log('\n📊 Automation Run Summary:');
      console.log(`   Total Processed: ${totalProcessed}`);
      console.log(`   Successful: ${totalSuccessful}`);
      console.log(`   Failed: ${totalFailed}`);

      return { 
        success: true, 
        processed: activeAutomations.length,
        totalProcessed,
        totalSuccessful,
        totalFailed,
      };
    } catch (error) {
      console.error('❌ Error running active automations:', error);
      throw error;
    }
  }

  /**
   * Test automation with a specific post
   * Used for testing before activating automation
   */
  async testAutomation(automationId: string, postId: string) {
    try {
      const automation = await prisma.automation.findUnique({
        where: { id: automationId },
        include: {
          integration: true,
          triggers: {
            where: { isActive: true },
            include: {
              keyword: true,
              response: true,
            },
          },
        },
      });

      if (!automation) {
        throw new Error('Automation not found');
      }

      if (!automation.integration.accessToken) {
        throw new Error('Integration not configured properly');
      }

      // Fetch comments
      const comments = await instagramPlatformService.getMediaComments(
        postId,
        automation.integration.accessToken
      );

      // Test keyword matching without actually sending messages
      const matchedComments = comments.filter(comment => {
        return this.findMatchingTrigger(comment.text, automation.triggers) !== null;
      });

      return {
        success: true,
        totalComments: comments.length,
        matchedComments: matchedComments.length,
        matches: matchedComments.map(c => ({
          username: c.username,
          text: c.text,
          timestamp: c.timestamp,
        })),
      };
    } catch (error) {
      console.error('Test automation error:', error);
      throw error;
    }
  }

  /**
   * Process a single comment manually (for webhook handling)
   */
  async processSingleComment(
    automationId: string,
    commentData: {
      id: string;
      text: string;
      username: string;
      timestamp: string;
      from: { id: string; username: string };
    },
    accessToken: string
  ) {
    try {
      const automation = await prisma.automation.findUnique({
        where: { id: automationId },
        include: {
          user: true,
          triggers: {
            where: { isActive: true },
            include: {
              keyword: true,
              response: true,
            },
          },
        },
      });

      if (!automation || automation.status !== 'ACTIVE') {
        return { processed: false, message: 'Automation not active' };
      }

      // Check if already processed
      const existingLog = await prisma.automationLog.findFirst({
        where: {
          automationId,
          targetId: commentData.id,
        },
      });

      if (existingLog) {
        return { processed: false, message: 'Already processed' };
      }

      // Check keyword match
      const matchedTrigger = this.findMatchingTrigger(
        commentData.text,
        automation.triggers
      );

      if (!matchedTrigger) {
        await this.createLog(
          automationId,
          commentData as InstagramComment,
          'SKIPPED',
          null,
          'No keyword match'
        );
        return { processed: false, message: 'No keyword match' };
      }

      console.log(`✅ Keyword matched: "${matchedTrigger.keyword?.keyword}"`);

      // Check limits
      if (!(await this.checkLimits(automation))) {
        return { processed: false, message: 'Rate limit reached' };
      }

      // ========================================
      // DUAL ACTION PROCESSING
      // ========================================
      
      const actions: string[] = [];
      const responses: string[] = [];
      let hasError = false;
      let errorMessage = '';

      // ACTION 1: Send DM (MANDATORY)
      try {
        console.log('📤 Processing DM action (mandatory)...');
        
        // Generate DM response
        const dmResponse = await this.generateResponse(
          matchedTrigger,
          commentData as InstagramComment,
          automation.user.plan,
          accessToken
        );

        console.log(`📬 Sending DM to @${commentData.username} (ID: ${commentData.from.id})`);

        // Send DM to the commenter
        await instagramPlatformService.sendDirectMessage(
          commentData.from.id,
          dmResponse,
          accessToken
        );

        console.log(`✅ DM sent successfully to @${commentData.username}`);
        actions.push('sent_dm');
        responses.push(`DM: ${dmResponse}`);

      } catch (dmError) {
        console.error(`❌ Failed to send DM:`, dmError);
        hasError = true;
        errorMessage = dmError instanceof Error ? dmError.message : 'Failed to send DM';
        
        // Log DM failure
        await this.createLog(
          automationId,
          commentData as InstagramComment,
          'FAILED',
          null,
          `DM failed: ${errorMessage}`
        );
      }

      // ACTION 2: Reply to Comment (OPTIONAL)
      // Check if trigger config has commentReply field
      const commentReplyText = (matchedTrigger.config as any)?.commentReply;
      
      if (commentReplyText && commentReplyText.trim()) {
        try {
          console.log('💬 Processing Comment Reply action (optional)...');
          console.log(`💬 Replying to comment by @${commentData.username}`);

          // Personalize the comment reply
          const personalizedReply = this.personalizeMessage(
            commentReplyText,
            commentData as InstagramComment
          );

          // Reply to comment directly
          await instagramPlatformService.replyToComment(
            commentData.id,
            personalizedReply,
            accessToken
          );

          console.log(`✅ Comment reply sent successfully to @${commentData.username}`);
          actions.push('replied_comment');
          responses.push(`Comment: ${personalizedReply}`);

        } catch (replyError) {
          console.error(`❌ Failed to reply to comment:`, replyError);
          // Don't mark as complete failure if DM succeeded
          const replyErrorMsg = replyError instanceof Error ? replyError.message : 'Failed to reply to comment';
          
          await this.createLog(
            automationId,
            commentData as InstagramComment,
            actions.length > 0 ? 'SUCCESS' : 'FAILED',
            responses.join(' | '),
            `Comment reply failed: ${replyErrorMsg}${actions.length > 0 ? ' (DM sent successfully)' : ''}`
          );
        }
      } else {
        console.log('⏭️ Comment reply skipped (not configured)');
      }

      // ========================================
      // FINAL RESULT
      // ========================================

      if (actions.length === 0) {
        // Both actions failed
        await this.updateAutomationStats(automationId, false);
        
        return {
          processed: false,
          message: `Failed: ${errorMessage}`,
        };
      }

      // At least one action succeeded
      await this.createLog(
        automationId,
        commentData as InstagramComment,
        'SUCCESS',
        responses.join(' | '),
        `Actions completed: ${actions.join(', ')}`
      );

      await this.updateAutomationStats(automationId, true);

      return {
        processed: true,
        message: `Success: ${actions.join(' + ')}`,
        response: responses.join(' | '),
        actions,
      };

    } catch (error) {
      console.error('Process single comment error:', error);

      await this.createLog(
        automationId,
        commentData as InstagramComment,
        'FAILED',
        null,
        error instanceof Error ? error.message : 'Unknown error'
      );

      await this.updateAutomationStats(automationId, false);

      throw error;
    }
  }

  /**
   * Get automation statistics
   */
  async getAutomationStats(automationId: string, days: number = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const logs = await prisma.automationLog.findMany({
        where: {
          automationId,
          executedAt: { gte: startDate },
        },
        orderBy: { executedAt: 'desc' },
      });

      const stats = {
        total: logs.length,
        successful: logs.filter(l => l.status === 'SUCCESS').length,
        failed: logs.filter(l => l.status === 'FAILED').length,
        skipped: logs.filter(l => l.status === 'SKIPPED').length,
        byDay: {} as Record<string, { success: number; failed: number; skipped: number }>,
      };

      // Group by day
      logs.forEach(log => {
        const day = log.executedAt.toISOString().split('T')[0];
        if (!stats.byDay[day]) {
          stats.byDay[day] = { success: 0, failed: 0, skipped: 0 };
        }
        
        if (log.status === 'SUCCESS') stats.byDay[day].success++;
        else if (log.status === 'FAILED') stats.byDay[day].failed++;
        else stats.byDay[day].skipped++;
      });

      return stats;
    } catch (error) {
      console.error('Get automation stats error:', error);
      throw error;
    }
  }
}

export const automationEngine = new AutomationEngine();