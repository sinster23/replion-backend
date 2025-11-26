import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  
  // Trust your frontend origin for cross-site requests
  trustedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ],
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL,
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  
  // Cross-site cookie configuration
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none', // Required for cross-site
      secure: true, // Required when sameSite is 'none' (HTTPS only)
      httpOnly: true, // Security best practice
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      domain: undefined, // Critical: Don't set domain for cross-origin cookies
    },
  },
});
