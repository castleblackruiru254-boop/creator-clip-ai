-- Migration: Paystack Billing and Subscription Management System
-- Creates tables and functions for comprehensive payment handling

-- Create payment intents table for tracking payment initialization
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD', 'GHS', 'ZAR')),
  plan_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'cancelled')),
  paystack_data JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Create billing transactions table for completed payments
CREATE TABLE IF NOT EXISTS billing_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paystack_transaction_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'refunded', 'disputed')),
  payment_method TEXT, -- card, bank, ussd, etc.
  metadata JSONB DEFAULT '{}',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  refund_amount DECIMAL(10,2)
);

-- Create user subscriptions table for tracking active subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paystack_subscription_code TEXT NOT NULL UNIQUE,
  paystack_customer_code TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'attention', 'will_not_renew', 'suspended')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  interval TEXT NOT NULL CHECK (interval IN ('monthly', 'quarterly', 'annually')),
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  will_not_renew_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create billing credits table for credit purchases and usage tracking
CREATE TABLE IF NOT EXISTS billing_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES billing_transactions(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'subscription_reset', 'bonus', 'usage', 'refund')),
  credits INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- For promotional credits with expiration
);

-- Create subscription features table to track what features are available per plan
CREATE TABLE IF NOT EXISTS subscription_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_code TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  feature_value TEXT, -- JSON string for complex values
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(plan_code, feature_name)
);

-- Insert default subscription features
INSERT INTO subscription_features (plan_code, feature_name, feature_value, is_enabled) VALUES
-- Free tier features
('free', 'monthly_clips', '5', true),
('free', 'max_resolution', '720p', true),
('free', 'watermark_enabled', 'true', true),
('free', 'priority_support', 'false', false),
('free', 'batch_processing', 'false', false),
('free', 'custom_branding', 'false', false),
('free', 'analytics', 'basic', true),

-- Starter tier features
('viral_starter_monthly', 'monthly_clips', '50', true),
('viral_starter_monthly', 'max_resolution', '1080p', true),
('viral_starter_monthly', 'watermark_enabled', 'false', true),
('viral_starter_monthly', 'priority_support', 'false', false),
('viral_starter_monthly', 'batch_processing', 'true', true),
('viral_starter_monthly', 'custom_branding', 'false', false),
('viral_starter_monthly', 'analytics', 'advanced', true),

-- Pro tier features
('viral_pro_monthly', 'monthly_clips', '200', true),
('viral_pro_monthly', 'max_resolution', '4K', true),
('viral_pro_monthly', 'watermark_enabled', 'false', true),
('viral_pro_monthly', 'priority_support', 'true', true),
('viral_pro_monthly', 'batch_processing', 'true', true),
('viral_pro_monthly', 'custom_branding', 'true', true),
('viral_pro_monthly', 'analytics', 'advanced', true),
('viral_pro_monthly', 'team_members', '3', true),
('viral_pro_monthly', 'api_access', 'true', true),

-- Enterprise tier features
('viral_enterprise_monthly', 'monthly_clips', 'unlimited', true),
('viral_enterprise_monthly', 'max_resolution', '4K', true),
('viral_enterprise_monthly', 'watermark_enabled', 'false', true),
('viral_enterprise_monthly', 'priority_support', 'true', true),
('viral_enterprise_monthly', 'batch_processing', 'true', true),
('viral_enterprise_monthly', 'custom_branding', 'true', true),
('viral_enterprise_monthly', 'analytics', 'enterprise', true),
('viral_enterprise_monthly', 'team_members', 'unlimited', true),
('viral_enterprise_monthly', 'api_access', 'true', true),
('viral_enterprise_monthly', 'white_label', 'true', true),
('viral_enterprise_monthly', 'sso_auth', 'true', true);

-- Create indexes for billing performance
CREATE INDEX idx_payment_intents_user_id ON payment_intents(user_id);
CREATE INDEX idx_payment_intents_reference ON payment_intents(reference);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_expires_at ON payment_intents(expires_at);

CREATE INDEX idx_billing_transactions_user_id ON billing_transactions(user_id);
CREATE INDEX idx_billing_transactions_reference ON billing_transactions(reference);
CREATE INDEX idx_billing_transactions_status ON billing_transactions(status);
CREATE INDEX idx_billing_transactions_paid_at ON billing_transactions(paid_at);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_paystack_code ON user_subscriptions(paystack_subscription_code);
CREATE INDEX idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);

CREATE INDEX idx_billing_credits_user_id ON billing_credits(user_id);
CREATE INDEX idx_billing_credits_type ON billing_credits(type);
CREATE INDEX idx_billing_credits_expires_at ON billing_credits(expires_at);

-- Enable RLS on all billing tables
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_features ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment intents
CREATE POLICY "Users can view their own payment intents" ON payment_intents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own payment intents" ON payment_intents
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS policies for billing transactions
CREATE POLICY "Users can view their own transactions" ON billing_transactions
  FOR SELECT USING (user_id = auth.uid());

-- RLS policies for user subscriptions
CREATE POLICY "Users can view their own subscriptions" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- RLS policies for billing credits
CREATE POLICY "Users can view their own credits" ON billing_credits
  FOR SELECT USING (user_id = auth.uid());

-- RLS policies for subscription features (public read)
CREATE POLICY "Anyone can view subscription features" ON subscription_features
  FOR SELECT USING (true);

-- Service role policies (for webhook processing)
CREATE POLICY "Service role can manage payment intents" ON payment_intents
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage transactions" ON billing_transactions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage subscriptions" ON user_subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage credits" ON billing_credits
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to increment user credits
CREATE OR REPLACE FUNCTION increment_user_credits(p_user_id UUID, p_credits INTEGER)
RETURNS void AS $$
BEGIN
  -- Update profile credits
  UPDATE profiles 
  SET credits_remaining = credits_remaining + p_credits,
      updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Record credit transaction
  INSERT INTO billing_credits (user_id, type, credits, description)
  VALUES (p_user_id, 'purchase', p_credits, 'Credits purchased via Paystack');
END;
$$ LANGUAGE plpgsql;

-- Function to use user credits
CREATE OR REPLACE FUNCTION use_user_credits(p_user_id UUID, p_credits INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits
  SELECT credits_remaining INTO current_credits
  FROM profiles
  WHERE id = p_user_id;
  
  -- Check if user has enough credits
  IF current_credits < p_credits THEN
    RETURN false;
  END IF;
  
  -- Deduct credits
  UPDATE profiles 
  SET credits_remaining = credits_remaining - p_credits,
      updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Record credit usage
  INSERT INTO billing_credits (user_id, type, credits, description)
  VALUES (p_user_id, 'usage', -p_credits, 'Credits used for video processing');
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's current subscription
CREATE OR REPLACE FUNCTION get_user_active_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_code TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  amount DECIMAL(10,2),
  features JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.id as subscription_id,
    us.plan_code,
    us.status,
    us.current_period_end,
    us.amount,
    json_object_agg(sf.feature_name, sf.feature_value) as features
  FROM user_subscriptions us
  LEFT JOIN subscription_features sf ON sf.plan_code = us.plan_code AND sf.is_enabled = true
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'will_not_renew')
    AND us.current_period_end > NOW()
  GROUP BY us.id, us.plan_code, us.status, us.current_period_end, us.amount
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's billing summary
CREATE OR REPLACE FUNCTION get_user_billing_summary(p_user_id UUID)
RETURNS TABLE (
  total_spent DECIMAL(10,2),
  total_transactions INTEGER,
  current_subscription JSONB,
  credits_remaining INTEGER,
  credits_used_this_month INTEGER,
  next_billing_date TIMESTAMPTZ
) AS $$
DECLARE
  subscription_info RECORD;
  credits_info RECORD;
BEGIN
  -- Get spending totals
  SELECT 
    COALESCE(SUM(amount), 0) as total_spent,
    COUNT(*) as total_transactions
  INTO total_spent, total_transactions
  FROM billing_transactions
  WHERE user_id = p_user_id AND status = 'completed';
  
  -- Get current subscription info
  SELECT * FROM get_user_active_subscription(p_user_id) 
  INTO subscription_info
  LIMIT 1;
  
  -- Get credits info
  SELECT 
    credits_remaining,
    COALESCE(SUM(CASE WHEN bc.type = 'usage' AND bc.created_at >= date_trunc('month', NOW()) THEN ABS(bc.credits) ELSE 0 END), 0) as used_this_month
  INTO credits_info
  FROM profiles p
  LEFT JOIN billing_credits bc ON bc.user_id = p.id
  WHERE p.id = p_user_id
  GROUP BY p.credits_remaining;
  
  -- Return summary
  RETURN QUERY SELECT 
    get_user_billing_summary.total_spent,
    get_user_billing_summary.total_transactions,
    CASE 
      WHEN subscription_info.subscription_id IS NOT NULL THEN
        json_build_object(
          'plan_code', subscription_info.plan_code,
          'status', subscription_info.status,
          'amount', subscription_info.amount,
          'period_end', subscription_info.current_period_end
        )
      ELSE NULL
    END as current_subscription,
    credits_info.credits_remaining,
    credits_info.used_this_month,
    subscription_info.current_period_end as next_billing_date;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can perform action based on plan limits
CREATE OR REPLACE FUNCTION check_user_plan_limits(
  p_user_id UUID,
  p_action TEXT, -- 'create_clip', 'download_hd', 'batch_process', etc.
  p_count INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  user_profile RECORD;
  subscription_info RECORD;
  feature_limits JSONB;
  usage_this_month INTEGER;
  result JSONB;
BEGIN
  -- Get user profile
  SELECT * FROM profiles WHERE id = p_user_id INTO user_profile;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'User not found'
    );
  END IF;
  
  -- Get active subscription
  SELECT * FROM get_user_active_subscription(p_user_id) INTO subscription_info LIMIT 1;
  
  -- Use free tier if no active subscription
  IF subscription_info IS NULL THEN
    subscription_info.plan_code := 'free';
  END IF;
  
  -- Get feature limits for the plan
  SELECT json_object_agg(feature_name, feature_value) INTO feature_limits
  FROM subscription_features 
  WHERE plan_code = subscription_info.plan_code AND is_enabled = true;
  
  -- Check action-specific limits
  CASE p_action
    WHEN 'create_clip' THEN
      -- Check monthly clip limit
      SELECT COUNT(*) INTO usage_this_month
      FROM projects p
      JOIN clips c ON c.project_id = p.id
      WHERE p.user_id = p_user_id 
        AND c.created_at >= date_trunc('month', NOW())
        AND c.status = 'completed';
        
      IF feature_limits->>'monthly_clips' = 'unlimited' OR 
         usage_this_month + p_count <= (feature_limits->>'monthly_clips')::INTEGER THEN
        result := json_build_object(
          'allowed', true,
          'remaining', CASE 
            WHEN feature_limits->>'monthly_clips' = 'unlimited' THEN 999999
            ELSE (feature_limits->>'monthly_clips')::INTEGER - usage_this_month
          END
        );
      ELSE
        result := json_build_object(
          'allowed', false,
          'reason', 'Monthly clip limit exceeded',
          'limit', feature_limits->>'monthly_clips',
          'used', usage_this_month
        );
      END IF;
      
    WHEN 'download_hd' THEN
      -- Check if HD downloads are allowed
      IF feature_limits->>'max_resolution' IN ('1080p', '4K') THEN
        result := json_build_object('allowed', true);
      ELSE
        result := json_build_object(
          'allowed', false,
          'reason', 'HD downloads not available in current plan'
        );
      END IF;
      
    WHEN 'remove_watermark' THEN
      -- Check if watermark removal is allowed
      IF feature_limits->>'watermark_enabled' = 'false' THEN
        result := json_build_object('allowed', true);
      ELSE
        result := json_build_object(
          'allowed', false,
          'reason', 'Watermark removal not available in current plan'
        );
      END IF;
      
    ELSE
      result := json_build_object(
        'allowed', true,
        'message', 'Action not specifically limited'
      );
  END CASE;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired payment intents
CREATE OR REPLACE FUNCTION cleanup_expired_payment_intents()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM payment_intents 
  WHERE status = 'pending' 
    AND expires_at < NOW();
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to handle subscription renewals
CREATE OR REPLACE FUNCTION process_subscription_renewal(
  p_subscription_code TEXT,
  p_transaction_reference TEXT
)
RETURNS void AS $$
DECLARE
  subscription_record RECORD;
  plan_credits INTEGER;
BEGIN
  -- Get subscription details
  SELECT * FROM user_subscriptions 
  WHERE paystack_subscription_code = p_subscription_code 
  INTO subscription_record;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found: %', p_subscription_code;
  END IF;
  
  -- Update subscription period
  UPDATE user_subscriptions 
  SET current_period_start = current_period_end,
      current_period_end = current_period_end + INTERVAL '1 month',
      updated_at = NOW()
  WHERE paystack_subscription_code = p_subscription_code;
  
  -- Reset user credits based on plan
  SELECT credits INTO plan_credits
  FROM (
    SELECT 
      CASE subscription_record.plan_code
        WHEN 'viral_starter_monthly' THEN 50
        WHEN 'viral_pro_monthly' THEN 200
        WHEN 'viral_enterprise_monthly' THEN 999999
        ELSE 5
      END as credits
  ) plan_credits_subquery;
  
  UPDATE profiles 
  SET credits_remaining = plan_credits,
      last_billing_date = NOW(),
      updated_at = NOW()
  WHERE id = subscription_record.user_id;
  
  -- Record credit reset
  INSERT INTO billing_credits (user_id, type, credits, description)
  VALUES (subscription_record.user_id, 'subscription_reset', plan_credits, 
          'Monthly credits reset for ' || subscription_record.plan_code);
          
  -- Log renewal
  INSERT INTO billing_transactions (
    user_id, 
    paystack_transaction_id, 
    reference, 
    amount, 
    status, 
    payment_method,
    metadata,
    paid_at
  )
  SELECT 
    subscription_record.user_id,
    'renewal_' || p_subscription_code,
    p_transaction_reference,
    subscription_record.amount,
    'completed',
    'subscription',
    json_build_object('type', 'subscription_renewal', 'plan_code', subscription_record.plan_code),
    NOW();
END;
$$ LANGUAGE plpgsql;

-- Add billing fields to profiles table if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_billing_date TIMESTAMPTZ;

-- Create trigger to update subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscription_timestamp_trigger ON user_subscriptions;
CREATE TRIGGER update_subscription_timestamp_trigger
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_timestamp();

-- Schedule cleanup of expired payment intents (every hour)
SELECT cron.schedule(
  'cleanup-expired-payments',
  '0 * * * *',
  'SELECT cleanup_expired_payment_intents();'
);

-- Grant permissions
GRANT ALL ON payment_intents TO authenticated, service_role;
GRANT ALL ON billing_transactions TO authenticated, service_role;
GRANT ALL ON user_subscriptions TO authenticated, service_role;
GRANT ALL ON billing_credits TO authenticated, service_role;
GRANT SELECT ON subscription_features TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION increment_user_credits(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION use_user_credits(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_active_subscription(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_billing_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_user_plan_limits(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_payment_intents() TO service_role;
GRANT EXECUTE ON FUNCTION process_subscription_renewal(TEXT, TEXT) TO service_role;

-- Create view for billing dashboard
CREATE OR REPLACE VIEW user_billing_dashboard AS
SELECT 
  p.id as user_id,
  p.email,
  p.credits_remaining,
  p.subscription_tier,
  p.paystack_customer_code,
  us.plan_code,
  us.status as subscription_status,
  us.current_period_end,
  us.amount as monthly_amount,
  COUNT(bt.id) as total_transactions,
  COALESCE(SUM(bt.amount), 0) as total_spent,
  MAX(bt.paid_at) as last_payment_date
FROM profiles p
LEFT JOIN user_subscriptions us ON us.user_id = p.id AND us.status IN ('active', 'will_not_renew')
LEFT JOIN billing_transactions bt ON bt.user_id = p.id AND bt.status = 'completed'
GROUP BY p.id, p.email, p.credits_remaining, p.subscription_tier, p.paystack_customer_code,
         us.plan_code, us.status, us.current_period_end, us.amount;

-- Grant access to billing dashboard view
GRANT SELECT ON user_billing_dashboard TO authenticated;
