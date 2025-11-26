// backend/src/controllers/keyword.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { MatchType } from '@prisma/client';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified: boolean;
  };
}

// Create a new keyword
export const createKeyword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { keyword, matchType, caseSensitive } = req.body;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'Keyword is required',
      });
    }

    const newKeyword = await prisma.keyword.create({
      data: {
        userId,
        keyword,
        matchType: (matchType as MatchType) || 'CONTAINS',
        caseSensitive: caseSensitive || false,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Keyword created successfully',
      data: newKeyword,
    });
  } catch (error) {
    console.error('Create keyword error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create keyword',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get all keywords for user
export const getKeywords = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const keywords = await prisma.keyword.findMany({
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
      data: keywords,
    });
  } catch (error) {
    console.error('Get keywords error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch keywords',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update a keyword
export const updateKeyword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { keyword, matchType, caseSensitive, isActive } = req.body;

    const existing = await prisma.keyword.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Keyword not found',
      });
    }

    const updated = await prisma.keyword.update({
      where: { id },
      data: {
        keyword,
        matchType,
        caseSensitive,
        isActive,
      },
    });

    res.json({
      success: true,
      message: 'Keyword updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update keyword error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update keyword',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Delete a keyword
export const deleteKeyword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const keyword = await prisma.keyword.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            triggers: true,
          },
        },
      },
    });

    if (!keyword) {
      return res.status(404).json({
        success: false,
        message: 'Keyword not found',
      });
    }

    if (keyword._count.triggers > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete keyword. It is used in ${keyword._count.triggers} automation trigger(s).`,
      });
    }

    await prisma.keyword.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Keyword deleted successfully',
    });
  } catch (error) {
    console.error('Delete keyword error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete keyword',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};