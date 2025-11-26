import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { instagramPlatformService } from '../services/instagram.service';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified: boolean;
  };
}

export const initiateInstagramAuth = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      console.error("❌ No user ID found in request");
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const authUrl = instagramPlatformService.generateAuthUrl(userId);

    console.log("🔗 Instagram Business OAuth URL:", authUrl);

    return res.json({
      success: true,
      authUrl,
    });
  } catch (error) {
    console.error("❌ Instagram auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate Instagram authentication",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const handleInstagramCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { code, state: userId, error, error_reason, error_description } = req.query;

    console.log("📥 Callback received:", {
      hasCode: !!code,
      userId,
      error,
      error_reason,
    });

    if (error) {
      console.error("OAuth error:", error, error_reason, error_description);
      res.redirect(`${process.env.FRONTEND_URL}/integrations?error=${error}`);
      return;
    }

    if (!code || !userId || typeof code !== "string" || typeof userId !== "string") {
      console.error("❌ Missing code or userId in callback");
      res.redirect(`${process.env.FRONTEND_URL}/integrations?error=missing_code`);
      return;
    }

    // Exchange code for tokens
    const tokenData = await instagramPlatformService.exchangeCodeForAccessToken(code);
    
    if (!tokenData.accessToken || !tokenData.instagramUserId) {
      console.error("❌ Invalid token response");
      res.redirect(`${process.env.FRONTEND_URL}/integrations?error=invalid_token_response`);
      return;
    }

    console.log("✅ Token obtained:", {
      instagramUserId: tokenData.instagramUserId,
      expiresAt: tokenData.expiresAt,
    });

    // Fetch profile
    const profile = await instagramPlatformService.getAccountInfo(tokenData.accessToken);

    if (!profile.user_id || !profile.username) {
      console.error("❌ Profile missing required fields");
      res.redirect(`${process.env.FRONTEND_URL}/integrations?error=incomplete_profile`);
      return;
    }

    console.log("✅ Profile fetched:", profile);

    // Save integration
    const integration = await instagramPlatformService.saveIntegration({
      userId,
      profile,
      accessToken: tokenData.accessToken,
      expiresAt: tokenData.expiresAt,
      permissions: tokenData.permissions,
    });

    console.log("✅ Integration saved:", integration.id);

    // Sync media (non-critical)
    try {
      await instagramPlatformService.syncUserMedia(integration.id, tokenData.accessToken);
      console.log("✅ Media synced");
    } catch (syncError) {
      console.error("⚠️ Media sync failed (non-critical):", syncError);
    }

    res.redirect(`${process.env.FRONTEND_URL}/integrations?success=true`);
  } catch (error) {
    console.error("❌ Callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/integrations?error=callback_failed`);
  }
};

export const getIntegrations = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const integrations = await prisma.integration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            automations: true,
            posts: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: integrations,
    });
  } catch (error) {
    console.error('Get integrations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getIntegrationById = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, userId },
      include: {
        posts: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    return res.json({
      success: true,
      data: integration,
    });
  } catch (error) {
    console.error('Get integration by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const syncIntegrationPosts = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, userId },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    if (!integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Integration not properly configured',
      });
    }

    const posts = await instagramPlatformService.syncUserMedia(
      integration.id,
      integration.accessToken
    );

    await prisma.integration.update({
      where: { id },
      data: { lastSynced: new Date() },
    });

    return res.json({
      success: true,
      message: 'Posts synced successfully',
      data: {
        count: posts.length,
        posts,
      },
    });
  } catch (error) {
    console.error('Sync posts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync posts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const deleteIntegration = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            automations: true,
          },
        },
      },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    if (integration._count.automations > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete integration. It has ${integration._count.automations} automation(s) associated with it. Please delete them first.`,
      });
    }

    await prisma.integration.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: 'Integration deleted successfully',
    });
  } catch (error) {
    console.error('Delete integration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete integration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const refreshInstagramToken = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, userId, platform: 'INSTAGRAM' },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    if (!integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Integration missing access token',
      });
    }

    // Check if token is at least 24 hours old
    const lastSyncedDate = integration.lastSynced || new Date(0); // Use epoch if null
    const tokenAge = Date.now() - lastSyncedDate.getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (tokenAge < twentyFourHours) {
      return res.status(400).json({
        success: false,
        message: 'Token must be at least 24 hours old to refresh',
      });
    }

    console.log('🔄 Refreshing long-lived token for:', integration.username);

    // Refresh token using service
    const refreshData = await instagramPlatformService.refreshAccessToken(
      integration.accessToken
    );

    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);

    console.log('✅ Token refreshed:', {
      expires_in_days: Math.floor(refreshData.expires_in / (24 * 60 * 60)),
      new_expires_at: newExpiresAt,
    });

    // Update integration
    await prisma.integration.update({
      where: { id },
      data: {
        accessToken: refreshData.access_token,
        expiresAt: newExpiresAt,
        lastSynced: new Date(),
      },
    });

    return res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        expiresAt: newExpiresAt,
        expiresInDays: Math.floor(refreshData.expires_in / (24 * 60 * 60)),
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};