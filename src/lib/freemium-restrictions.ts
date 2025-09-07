import { supabase } from '@/integrations/supabase/client';

export interface UserSubscription {
  plan_code: string;
  status: string;
  features: Record<string, any>;
  credits_remaining: number;
}

export interface RestrictionLimits {
  maxResolution: '720p' | '1080p' | '4k';
  watermarkEnabled: boolean;
  dailyClipLimit: number;
  monthlyClipLimit: number;
  maxFileSize: number; // in MB
  priorityProcessing: boolean;
  batchProcessing: boolean;
  customBranding: boolean;
  analyticsAccess: boolean;
  apiAccess: boolean;
}

export interface UsageStats {
  clipsCreatedToday: number;
  clipsCreatedThisMonth: number;
  creditsUsedToday: number;
  creditsUsedThisMonth: number;
  storageUsedMB: number;
}

export const DEFAULT_FREE_LIMITS: RestrictionLimits = {
  maxResolution: '720p',
  watermarkEnabled: true,
  dailyClipLimit: 3,
  monthlyClipLimit: 15,
  maxFileSize: 100, // 100MB
  priorityProcessing: false,
  batchProcessing: false,
  customBranding: false,
  analyticsAccess: false,
  apiAccess: false,
};

export const PLAN_LIMITS: Record<string, RestrictionLimits> = {
  'free': DEFAULT_FREE_LIMITS,
  'viral_starter_monthly': {
    maxResolution: '1080p',
    watermarkEnabled: false,
    dailyClipLimit: 10,
    monthlyClipLimit: 100,
    maxFileSize: 250,
    priorityProcessing: false,
    batchProcessing: false,
    customBranding: false,
    analyticsAccess: true,
    apiAccess: false,
  },
  'viral_pro_monthly': {
    maxResolution: '1080p',
    watermarkEnabled: false,
    dailyClipLimit: 50,
    monthlyClipLimit: 500,
    maxFileSize: 500,
    priorityProcessing: true,
    batchProcessing: true,
    customBranding: true,
    analyticsAccess: true,
    apiAccess: true,
  },
  'viral_enterprise_monthly': {
    maxResolution: '4k',
    watermarkEnabled: false,
    dailyClipLimit: -1, // unlimited
    monthlyClipLimit: -1, // unlimited
    maxFileSize: 1000, // 1GB
    priorityProcessing: true,
    batchProcessing: true,
    customBranding: true,
    analyticsAccess: true,
    apiAccess: true,
  },
};

export class FreemiumRestrictionsService {
  private static instance: FreemiumRestrictionsService;
  private cachedUserData: { 
    subscription: UserSubscription | null; 
    limits: RestrictionLimits; 
    usage: UsageStats;
    lastFetch: number;
  } | null = null;

  static getInstance(): FreemiumRestrictionsService {
    if (!FreemiumRestrictionsService.instance) {
      FreemiumRestrictionsService.instance = new FreemiumRestrictionsService();
    }
    return FreemiumRestrictionsService.instance;
  }

  private async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_active_subscription', { p_user_id: userId });

      if (error) throw error;

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Failed to get user subscription:', error);
      return null;
    }
  }

  private async getUserUsageStats(userId: string): Promise<UsageStats> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Get daily stats
      const { data: dailyStats, error: dailyError } = await supabase
        .from('user_clips')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${today}T23:59:59`);

      if (dailyError) throw dailyError;

      // Get monthly stats
      const { data: monthlyStats, error: monthlyError } = await supabase
        .from('user_clips')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth);

      if (monthlyError) throw monthlyError;

      // Get credits usage
      const { data: creditsData, error: creditsError } = await supabase
        .rpc('get_user_billing_summary', { p_user_id: userId });

      if (creditsError) throw creditsError;

      // Get storage usage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('user-videos')
        .list(userId, { limit: 1000 });

      if (storageError) throw storageError;

      const storageUsedMB = (storageData || []).reduce((total, file) => {
        return total + (file.metadata?.size || 0);
      }, 0) / (1024 * 1024);

      return {
        clipsCreatedToday: dailyStats?.length || 0,
        clipsCreatedThisMonth: monthlyStats?.length || 0,
        creditsUsedToday: 0, // TODO: Implement daily credits tracking
        creditsUsedThisMonth: creditsData?.[0]?.credits_used_this_month || 0,
        storageUsedMB: Math.round(storageUsedMB * 100) / 100,
      };

    } catch (error) {
      console.error('Failed to get usage stats:', error);
      return {
        clipsCreatedToday: 0,
        clipsCreatedThisMonth: 0,
        creditsUsedToday: 0,
        creditsUsedThisMonth: 0,
        storageUsedMB: 0,
      };
    }
  }

  public async getUserLimitsAndUsage(userId: string, forceRefresh = false): Promise<{
    subscription: UserSubscription | null;
    limits: RestrictionLimits;
    usage: UsageStats;
  }> {
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000; // 5 minutes

    // Return cached data if valid
    if (!forceRefresh && this.cachedUserData && (now - this.cachedUserData.lastFetch) < cacheExpiry) {
      return {
        subscription: this.cachedUserData.subscription,
        limits: this.cachedUserData.limits,
        usage: this.cachedUserData.usage,
      };
    }

    // Fetch fresh data
    const subscription = await this.getUserSubscription(userId);
    const usage = await this.getUserUsageStats(userId);
    
    const planCode = subscription?.plan_code || 'free';
    const limits = PLAN_LIMITS[planCode] || DEFAULT_FREE_LIMITS;

    // Cache the data
    this.cachedUserData = {
      subscription,
      limits,
      usage,
      lastFetch: now,
    };

    return { subscription, limits, usage };
  }

  public async checkCanCreateClip(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    upgrade?: boolean;
  }> {
    const { limits, usage } = await this.getUserLimitsAndUsage(userId);

    // Check daily limit
    if (limits.dailyClipLimit !== -1 && usage.clipsCreatedToday >= limits.dailyClipLimit) {
      return {
        allowed: false,
        reason: `Daily limit reached (${limits.dailyClipLimit} clips). Try again tomorrow or upgrade your plan.`,
        upgrade: true,
      };
    }

    // Check monthly limit
    if (limits.monthlyClipLimit !== -1 && usage.clipsCreatedThisMonth >= limits.monthlyClipLimit) {
      return {
        allowed: false,
        reason: `Monthly limit reached (${limits.monthlyClipLimit} clips). Upgrade your plan for more clips.`,
        upgrade: true,
      };
    }

    return { allowed: true };
  }

  public async checkCanUploadFile(userId: string, fileSizeMB: number): Promise<{
    allowed: boolean;
    reason?: string;
    upgrade?: boolean;
  }> {
    const { limits } = await this.getUserLimitsAndUsage(userId);

    // Check file size limit
    if (fileSizeMB > limits.maxFileSize) {
      return {
        allowed: false,
        reason: `File size (${fileSizeMB.toFixed(1)}MB) exceeds limit (${limits.maxFileSize}MB). Upgrade for larger file support.`,
        upgrade: true,
      };
    }

    return { allowed: true };
  }

  public async getUserLimits(userId: string): Promise<RestrictionLimits> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    return limits;
  }

  public async getUserUsage(userId: string): Promise<UsageStats> {
    const { usage } = await this.getUserLimitsAndUsage(userId);
    return usage;
  }

  public async shouldApplyWatermark(userId: string): Promise<boolean> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    return limits.watermarkEnabled;
  }

  public async getMaxResolution(userId: string): Promise<'720p' | '1080p' | '4k'> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    return limits.maxResolution;
  }

  public async canUseBatchProcessing(userId: string): Promise<boolean> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    return limits.batchProcessing;
  }

  public async hasPriorityProcessing(userId: string): Promise<boolean> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    return limits.priorityProcessing;
  }

  public async recordClipCreation(userId: string, creditsUsed: number = 1): Promise<void> {
    try {
      // Record the clip creation
      await supabase
        .from('user_clips')
        .insert({
          user_id: userId,
          created_at: new Date().toISOString(),
          credits_used: creditsUsed,
        });

      // Deduct credits if needed
      if (creditsUsed > 0) {
        await supabase.rpc('deduct_user_credits', {
          p_user_id: userId,
          p_credits: creditsUsed,
          p_reason: 'clip_creation',
        });
      }

      // Invalidate cache
      this.cachedUserData = null;

    } catch (error) {
      console.error('Failed to record clip creation:', error);
      throw error;
    }
  }

  public getLimitWarnings(limits: RestrictionLimits, usage: UsageStats): string[] {
    const warnings: string[] = [];

    // Daily limit warnings
    if (limits.dailyClipLimit !== -1) {
      const dailyUsagePercent = (usage.clipsCreatedToday / limits.dailyClipLimit) * 100;
      if (dailyUsagePercent >= 80) {
        warnings.push(`You've used ${usage.clipsCreatedToday}/${limits.dailyClipLimit} daily clips (${Math.round(dailyUsagePercent)}%)`);
      }
    }

    // Monthly limit warnings
    if (limits.monthlyClipLimit !== -1) {
      const monthlyUsagePercent = (usage.clipsCreatedThisMonth / limits.monthlyClipLimit) * 100;
      if (monthlyUsagePercent >= 80) {
        warnings.push(`You've used ${usage.clipsCreatedThisMonth}/${limits.monthlyClipLimit} monthly clips (${Math.round(monthlyUsagePercent)}%)`);
      }
    }

    // Storage warnings
    const storageLimit = limits.maxFileSize * 10; // Assume 10x file size as storage limit
    if (usage.storageUsedMB > storageLimit * 0.8) {
      warnings.push(`Storage usage: ${usage.storageUsedMB.toFixed(1)}MB of ${storageLimit}MB limit`);
    }

    return warnings;
  }

  public async checkSubscriptionAccess(userId: string, feature: keyof RestrictionLimits): Promise<boolean> {
    const { limits } = await this.getUserLimitsAndUsage(userId);
    
    switch (feature) {
      case 'watermarkEnabled':
        return !limits.watermarkEnabled; // Return true if watermark is disabled (premium feature)
      case 'priorityProcessing':
      case 'batchProcessing':
      case 'customBranding':
      case 'analyticsAccess':
      case 'apiAccess':
        return limits[feature] as boolean;
      default:
        return false;
    }
  }

  public clearCache(): void {
    this.cachedUserData = null;
  }
}

// Export singleton instance
export const restrictionsService = FreemiumRestrictionsService.getInstance();
