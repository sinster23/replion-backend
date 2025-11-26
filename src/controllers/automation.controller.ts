// backend/src/controllers/automation.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AutomationType, AutomationStatus } from '@prisma/client';
import { automationEngine } from '../services/automation-engine.service';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified: boolean;
    plan?: string;
  };
}

// Create a new automation with triggers
export const createAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const {
      integrationId,
      name,
      description,
      config,
      startDate,
      endDate,
      schedule,
      dailyLimit,
      hourlyLimit,
      triggers,
    } = req.body;

    if (!integrationId || !name || !config) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: integrationId, name, config',
      });
    }

    // Verify integration belongs to user
    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId,
        userId,
      },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found or does not belong to user',
      });
    }

    // Determine automation type based on configuration
    // If triggerType is 'comment', we use COMMENT_TO_DM as the primary type
    // (DM is mandatory, comment reply is optional)
    const automationType = config.triggerType === 'comment' 
      ? 'COMMENT_TO_DM'  // DM is the primary action
      : 'COMMENT_REPLY';  // For DM triggers, just reply

    // Create automation with triggers
    const automation = await prisma.automation.create({
      data: {
        userId,
        integrationId,
        name,
        description: description || `Auto-respond to ${config.triggerType === 'comment' ? 'comments' : 'DMs'} with keywords: ${config.keywords}`,
        type: automationType as AutomationType,
        status: 'PAUSED',
        config,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        schedule,
        dailyLimit,
        hourlyLimit,
        triggers: {
          create: triggers?.map((trigger: any) => ({
            triggerType: trigger.triggerType || 'POST_COMMENT',
            postId: trigger.postId,
            keywordId: trigger.keywordId,
            responseId: trigger.responseId,
            config: {
              ...trigger.config,
              // Include comment reply text if provided
              commentReply: config.commentReply || trigger.config?.commentReply || null,
            },
            isActive: true,
          })) || [],
        },
      },
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
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

    res.status(201).json({
      success: true,
      message: 'Automation created successfully',
      data: automation,
    });
  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update the updateAutomation function similarly

export const updateAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const {
      name,
      description,
      config,
      startDate,
      endDate,
      schedule,
      dailyLimit,
      hourlyLimit,
      triggers,
    } = req.body;

    const existing = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    // Update automation type based on config if provided
    const updateData: any = {
      name,
      description,
      config,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      schedule,
      dailyLimit,
      hourlyLimit,
    };

    // Update type if config indicates it should change
    if (config?.triggerType) {
      updateData.type = config.triggerType === 'comment' 
        ? 'COMMENT_TO_DM' 
        : 'COMMENT_REPLY';
    }

    // Update automation
    const automation = await prisma.automation.update({
      where: { id },
      data: updateData,
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
          },
        },
        triggers: true,
      },
    });

    // Update triggers if provided
    if (triggers) {
      // Delete existing triggers
      await prisma.automationTrigger.deleteMany({
        where: { automationId: id },
      });

      // Create new triggers
      await prisma.automationTrigger.createMany({
        data: triggers.map((trigger: any) => ({
          automationId: id,
          triggerType: trigger.triggerType || 'POST_COMMENT',
          postId: trigger.postId,
          keywordId: trigger.keywordId,
          responseId: trigger.responseId,
          config: {
            ...trigger.config,
            // Include comment reply text if provided
            commentReply: config?.commentReply || trigger.config?.commentReply || null,
          },
          isActive: true,
        })),
      });
    }

    // Fetch updated automation with all relationships
    const updatedAutomation = await prisma.automation.findUnique({
      where: { id },
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
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

    res.json({
      success: true,
      message: 'Automation updated successfully',
      data: updatedAutomation,
    });
  } catch (error) {
    console.error('Update automation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get all automations for the authenticated user
export const getAutomations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { status, type, integrationId } = req.query;

    const where: any = { userId };
    
    if (status) {
      where.status = status as AutomationStatus;
    }
    
    if (type) {
      where.type = type as AutomationType;
    }
    
    if (integrationId) {
      where.integrationId = integrationId as string;
    }

    const automations = await prisma.automation.findMany({
      where,
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
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
        _count: {
          select: {
            logs: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: automations,
      count: automations.length,
    });
  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automations',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get a single automation by ID
export const getAutomationById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const automation = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
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
        logs: {
          take: 20,
          orderBy: {
            executedAt: 'desc',
          },
        },
        _count: {
          select: {
            logs: true,
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

    res.json({
      success: true,
      data: automation,
    });
  } catch (error) {
    console.error('Get automation by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Delete an automation
export const deleteAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const automation = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    await prisma.automation.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Automation deleted successfully',
    });
  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Toggle automation status
export const toggleAutomationStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be ACTIVE or PAUSED',
      });
    }

    const automation = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        integration: true,
      },
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    if (status === 'ACTIVE' && !automation.integration.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate automation. Integration is not active.',
      });
    }

    const updated = await prisma.automation.update({
      where: { id },
      data: {
        status: status as AutomationStatus,
      },
      include: {
        integration: {
          select: {
            platform: true,
            username: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: `Automation ${status.toLowerCase()} successfully`,
      data: updated,
    });
  } catch (error) {
    console.error('Toggle automation status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle automation status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Manually trigger automation execution
export const triggerAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { postId } = req.body;

    const automation = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        integration: true,
      },
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    if (!automation.integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Integration not properly configured',
      });
    }

    if (!postId) {
      return res.status(400).json({
        success: false,
        message: 'postId is required',
      });
    }

    // Run automation
    const result = automation.type === 'COMMENT_TO_DM'
      ? await automationEngine.processCommentToDMAutomation(
          automation.id,
          postId,
          automation.integration.accessToken
        )
      : await automationEngine.processCommentReplyAutomation(
          automation.id,
          postId,
          automation.integration.accessToken
        );

    res.json({
      success: true,
      message: 'Automation triggered successfully',
      data: result,
    });
  } catch (error) {
    console.error('Trigger automation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get automation logs
export const getAutomationLogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { limit = '50', status } = req.query;

    const automation = await prisma.automation.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    const where: any = { automationId: id };
    if (status) {
      where.status = status;
    }

    const logs = await prisma.automationLog.findMany({
      where,
      take: parseInt(limit as string),
      orderBy: {
        executedAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Get automation logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation logs',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get automation statistics
export const getAutomationStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const [
      totalAutomations,
      activeAutomations,
      totalExecutions,
      recentLogs,
    ] = await Promise.all([
      prisma.automation.count({ where: { userId } }),
      prisma.automation.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.automation.aggregate({
        where: { userId },
        _sum: { totalExecutions: true },
      }),
      prisma.automationLog.findMany({
        where: {
          automation: { userId },
        },
        take: 10,
        orderBy: { executedAt: 'desc' },
        include: {
          automation: {
            select: {
              name: true,
              type: true,
            },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalAutomations,
        activeAutomations,
        pausedAutomations: totalAutomations - activeAutomations,
        totalExecutions: totalExecutions._sum.totalExecutions || 0,
        recentLogs,
      },
    });
  } catch (error) {
    console.error('Get automation stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation statistics',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { limit = '20' } = req.query;

    const recentLogs = await prisma.automationLog.findMany({
      where: {
        automation: { userId },
      },
      take: parseInt(limit as string),
      orderBy: { executedAt: 'desc' },
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

    // Transform logs to activity format
    const activities = recentLogs.map(log => {
      // Extract details from metadata or construct default message
      let details: string;
      
      if (log.metadata && typeof log.metadata === 'object' && 'details' in log.metadata) {
        details = String((log.metadata as any).details);
      } else {
        details = getDefaultDetails(log.automation.type, log.status);
      }

      return {
        id: log.id,
        automationId: log.automation.id,
        automationName: log.automation.name,
        type: log.automation.type,
        status: log.status,
        timestamp: log.executedAt.toISOString(),
        details,
      };
    });

    res.json({
      success: true,
      data: activities,
      count: activities.length,
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Helper function to generate default details
function getDefaultDetails(type: string, status: string): string {
  const action = type.replace(/_/g, ' ').toLowerCase();
  return status === 'SUCCESS' 
    ? `Successfully executed ${action}`
    : `Failed to execute ${action}`;
}