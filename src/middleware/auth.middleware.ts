import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        emailVerified: boolean;
      };
      session?: {
        token: string;
        expiresAt: Date;
      };
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header or cookies
    const token = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.['better-auth.session_token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No token provided',
      });
    }

    // Verify session using Better Auth
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session || !session.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid or expired token',
      });
    }

    // Attach user to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || undefined,
      emailVerified: session.user.emailVerified,
    };

    req.session = {
      token: session.session.token,
      expiresAt: new Date(session.session.expiresAt),
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized - Authentication failed',
    });
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.['better-auth.session_token'];

    if (token) {
      const session = await auth.api.getSession({
        headers: req.headers as any,
      });

      if (session?.user) {
        req.user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || undefined,
          emailVerified: session.user.emailVerified,
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};