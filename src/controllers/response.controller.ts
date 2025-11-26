
// backend/src/controllers/response.controller.ts
import { ResponseType } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified: boolean;
  };
}

// Create a new auto response
export const createResponse = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { name, responseType, customMessage, aiPrompt } = req.body;

    if (!name || !responseType) {
      return res.status(400).json({
        success: false,
        message: 'Name and responseType are required',
      });
    }

    // Validate response type requirements
    if (responseType === 'CUSTOM' && !customMessage) {
      return res.status(400).json({
        success: false,
        message: 'customMessage is required for CUSTOM response type',
      });
    }

    const response = await prisma.autoResponse.create({
      data: {
        userId,
        name,
        responseType: responseType as ResponseType,
        customMessage,
        aiPrompt,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Response created successfully',
      data: response,
    });
  } catch (error) {
    console.error('Create response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create response',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get all responses for user
export const getResponses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const responses = await prisma.autoResponse.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            triggers: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    console.error('Get responses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch responses',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get a single response by ID
export const getResponseById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const response = await prisma.autoResponse.findFirst({
      where: { id, userId },
      include: {
        triggers: {
          include: {
            automation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found',
      });
    }

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get response by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch response',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update a response
export const updateResponse = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { name, customMessage, aiPrompt, isActive } = req.body;

    const existing = await prisma.autoResponse.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Response not found',
      });
    }

    const updated = await prisma.autoResponse.update({
      where: { id },
      data: {
        name,
        customMessage,
        aiPrompt,
        isActive,
      },
    });

    res.json({
      success: true,
      message: 'Response updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update response',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Delete a response
export const deleteResponse = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const response = await prisma.autoResponse.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            triggers: true,
          },
        },
      },
    });

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found',
      });
    }

    if (response._count.triggers > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete response. It is used in ${response._count.triggers} automation trigger(s).`,
      });
    }

    await prisma.autoResponse.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Response deleted successfully',
    });
  } catch (error) {
    console.error('Delete response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete response',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};