// backend/src/types/automation.types.ts

// Config types for different automation types
export interface AutoLikeConfig {
  hashtags?: string[];
  targetAccounts?: string[];
  minLikes?: number;
  maxLikes?: number;
  likeDelay?: number; // in seconds
  skipIfAlreadyLiked?: boolean;
}

export interface AutoFollowConfig {
  targetAccounts?: string[];
  hashtags?: string[];
  followersOfAccount?: string;
  minFollowers?: number;
  maxFollowers?: number;
  skipIfAlreadyFollowing?: boolean;
  followDelay?: number; // in seconds
}

export interface AutoCommentConfig {
  hashtags?: string[];
  targetAccounts?: string[];
  comments: string[];
  randomizeComments?: boolean;
  minComments?: number;
  maxComments?: number;
  commentDelay?: number; // in seconds
}

export interface AutoUnfollowConfig {
  unfollowNonFollowers?: boolean;
  unfollowAfterDays?: number;
  keepFollowing?: string[]; // accounts to never unfollow
  unfollowDelay?: number; // in seconds
}

export interface ScheduledPostConfig {
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
  location?: string;
  tags?: string[];
  firstComment?: string;
}

export interface StoryViewConfig {
  targetAccounts: string[];
  viewDelay?: number; // in seconds
}

export interface DMAutomationConfig {
  targetAccounts?: string[];
  message: string;
  sendToNewFollowers?: boolean;
  sendDelay?: number; // in seconds
}

// Schedule types
export interface ScheduleConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  time?: string; // HH:mm format
  days?: number[]; // 0-6 for weekly, 1-31 for monthly
  timezone?: string;
}

// Request body types
export interface CreateAutomationRequest {
  integrationId: string;
  name: string;
  description?: string;
  type: string;
  config: any;
  startDate?: string;
  endDate?: string;
  schedule?: ScheduleConfig;
  dailyLimit?: number;
  hourlyLimit?: number;
}

export interface UpdateAutomationRequest {
  name?: string;
  description?: string;
  config?: any;
  startDate?: string;
  endDate?: string;
  schedule?: ScheduleConfig;
  dailyLimit?: number;
  hourlyLimit?: number;
}

export interface ToggleStatusRequest {
  status: 'ACTIVE' | 'PAUSED';
}