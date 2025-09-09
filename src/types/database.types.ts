// Database schema types for Supabase
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      video_processing_jobs: {
        Row: {
          id: string;
          user_id: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          input_url: string;
          output_urls: string[] | null;
          processing_options: {
            applyWatermark: boolean;
            watermarkConfig?: {
              text: string;
              position: string;
              opacity: number;
              fontSize: number;
              fontColor: string;
              backgroundColor?: string;
            };
            maxResolution: '720p' | '1080p' | '4k';
            quality: 'low' | 'medium' | 'high';
            format: 'mp4' | 'webm';
            enableSubjectTracking: boolean;
            trackingOptions?: {
              cropAspectRatio: number;
              confidenceThreshold: number;
              trackingSmoothing: number;
            };
          };
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          error_message: string | null;
          metadata: Json | null;
        };
        Insert: Omit<Database['public']['Tables']['video_processing_jobs']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['video_processing_jobs']['Row'], 'id' | 'created_at'>>;
      };
      user_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_code: string;
          status: 'active' | 'canceled' | 'expired' | 'past_due' | 'paused';
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['user_subscriptions']['Row'], 'id' | 'created_at'>>;
      };
      user_credits: {
        Row: {
          user_id: string;
          balance: number;
          last_updated: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_credits']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['user_credits']['Row'], 'user_id' | 'created_at'>>;
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: 'debit' | 'credit';
          reference_type: string;
          reference_id: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['credit_transactions']['Row'], 'id' | 'created_at'>;
      };
    };
    Views: {
      user_usage_metrics: {
        Row: {
          user_id: string;
          clips_processed_today: number;
          clips_processed_month: number;
          total_credits_used: number;
          last_processed_at: string | null;
        };
      };
    };
    Functions: {
      get_user_active_subscription: {
        Args: { p_user_id: string };
        Returns: Array<{
          id: string;
          user_id: string;
          plan_code: string;
          status: string;
          current_period_end: string;
        }>;
      };
      deduct_user_credits: {
        Args: {
          p_user_id: string;
          p_credits: number;
          p_reason: string;
        };
        Returns: number;
      };
      get_user_credits: {
        Args: { p_user_id: string };
        Returns: number;
      };
      get_user_usage_metrics: {
        Args: { p_user_id: string };
        Returns: Array<Database['public']['Views']['user_usage_metrics']['Row']>;
      };
    };
    Enums: {
      job_status: 'pending' | 'processing' | 'completed' | 'failed';
      subscription_status: 'active' | 'canceled' | 'expired' | 'past_due' | 'paused';
      transaction_type: 'debit' | 'credit';
    };
  };
}

// Re-export commonly used types
export type JobStatus = Database['public']['Enums']['job_status'];
export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];
export type TransactionType = Database['public']['Enums']['transaction_type'];

export type VideoProcessingJob = Database['public']['Tables']['video_processing_jobs']['Row'];
export type UserSubscription = Database['public']['Tables']['user_subscriptions']['Row'];
export type UserCredits = Database['public']['Tables']['user_credits']['Row'];
export type CreditTransaction = Database['public']['Tables']['credit_transactions']['Row'];

// Type guards
export function isJobStatus(status: string): status is JobStatus {
  return ['pending', 'processing', 'completed', 'failed'].includes(status);
}

export function isSubscriptionStatus(status: string): status is SubscriptionStatus {
  return ['active', 'canceled', 'expired', 'past_due', 'paused'].includes(status);
}
