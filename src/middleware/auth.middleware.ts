import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { auth } from '../lib/auth';

// Extend Express Request type to include user
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name?: string | null;
    emailVerified: boolean;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

// Custom error class
export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

// Async handler wrapper
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Main authentication middleware
export const requireAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new ApiError(401, 'Authentication required');
    }

    // Attach user and session to request
    (req as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    };

    (req as AuthenticatedRequest).session = {
      token: session.session.token,
      expiresAt: new Date(session.session.expiresAt),
    };

    next();
  }
);

// Optional authentication middleware
export const optionalAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session?.user) {
      (req as AuthenticatedRequest).user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
      };

      (req as AuthenticatedRequest).session = {
        token: session.session.token,
        expiresAt: new Date(session.session.expiresAt),
      };
    }

    next();
  }
);
