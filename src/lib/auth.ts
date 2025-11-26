import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    // Add social providers here if needed later
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!, // Your Leapcell backend URL
  trustedOrigins: [process.env.FRONTEND_URL!], // Your Vercel frontend URL
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  
  // Cookie configuration at root level
  cookie: {
    name: 'better-auth.session_token',
    sameSite: 'none', // Required for cross-origin
    secure: true, // Required when sameSite is 'none'
    httpOnly: true,
    path: '/',
    // domain: '.yourdomain.com', // Optional: only if both apps share a parent domain
  },
});
