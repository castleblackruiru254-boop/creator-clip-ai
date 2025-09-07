# Paystack Integration Setup Guide

This guide will help you set up the Paystack payment integration for Creator Clip AI.

## Prerequisites

1. A Paystack account (sign up at [paystack.com](https://paystack.com))
2. Access to your Supabase project dashboard
3. Domain/webhook URL configured for production

## Environment Variables

### Required Paystack Environment Variables

You need to set up the following environment variables in your Supabase Edge Functions:

```bash
# Paystack API Configuration
PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here  # Use sk_live_ for production
PAYSTACK_PUBLIC_KEY=pk_test_your_public_key_here  # Use pk_live_ for production

# Webhook Configuration
PAYSTACK_WEBHOOK_SECRET=your_webhook_secret_here

# Application URLs
NEXT_PUBLIC_APP_URL=https://your-app-domain.com  # Your app's base URL
```

### Setting Up Environment Variables in Supabase

1. **Via Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to "Edge Functions" → "Environment Variables"
   - Add each variable listed above

2. **Via Supabase CLI:**
   ```bash
   # Set up your environment variables
   supabase secrets set PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
   supabase secrets set PAYSTACK_PUBLIC_KEY=pk_test_your_public_key_here
   supabase secrets set PAYSTACK_WEBHOOK_SECRET=your_webhook_secret_here
   supabase secrets set NEXT_PUBLIC_APP_URL=https://your-app-domain.com
   ```

## Getting Your Paystack API Keys

### Test Environment (Development)

1. Log in to your Paystack dashboard
2. Go to "Settings" → "API Keys & Webhooks"
3. Copy your **Test Secret Key** (starts with `sk_test_`)
4. Copy your **Test Public Key** (starts with `pk_test_`)

### Live Environment (Production)

1. Complete Paystack's verification process for your business
2. In "Settings" → "API Keys & Webhooks"
3. Copy your **Live Secret Key** (starts with `sk_live_`)
4. Copy your **Live Public Key** (starts with `pk_live_`)

## Webhook Configuration

### 1. Set Up Webhook URL

In your Paystack dashboard:
1. Go to "Settings" → "API Keys & Webhooks"
2. Under "Webhooks", click "Add Endpoint"
3. Enter your webhook URL: `https://your-supabase-project.supabase.co/functions/v1/paystack-integration/webhook`
4. Select the following events:
   - `charge.success`
   - `subscription.create`
   - `subscription.disable`
   - `subscription.enable`
   - `invoice.create`
   - `invoice.payment_failed`

### 2. Get Webhook Secret

1. After creating the webhook, copy the "Webhook Secret"
2. Add it to your environment variables as `PAYSTACK_WEBHOOK_SECRET`

## Paystack Plans Setup

You need to create subscription plans in your Paystack dashboard that match your application's pricing tiers:

### Required Plans

Create these plans in your Paystack dashboard:

1. **Starter Plan**
   - Plan Code: `viral_starter_monthly`
   - Amount: 2000 (₦20.00 or your currency equivalent)
   - Interval: Monthly

2. **Pro Plan**
   - Plan Code: `viral_pro_monthly`
   - Amount: 5000 (₦50.00 or your currency equivalent)
   - Interval: Monthly

3. **Enterprise Plan**
   - Plan Code: `viral_enterprise_monthly`
   - Amount: 10000 (₦100.00 or your currency equivalent)
   - Interval: Monthly

### Creating Plans via API (Optional)

You can also create plans programmatically using the Paystack API:

```bash
# Example: Create Starter Plan
curl -X POST https://api.paystack.co/plan \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Viral Starter Monthly",
    "plan_code": "viral_starter_monthly",
    "amount": 2000,
    "interval": "monthly",
    "currency": "NGN"
  }'
```

## Database Migration

Ensure you've run the database migration to set up the required tables:

```sql
-- This should already be completed if you followed the previous setup
-- The migration creates tables for:
-- - subscription_plans
-- - user_subscriptions  
-- - billing_transactions
-- - billing_credits
-- - payment_intents
```

## Testing Your Integration

### 1. Test Payment Flow

1. Start your application in development mode
2. Navigate to the pricing page
3. Try subscribing to a plan using test card numbers:
   - **Successful payment:** `4084084084084081`
   - **Failed payment:** `4111111111111112`
   - Use any future expiry date and any 3-digit CVV

### 2. Test Webhook Processing

1. Use Paystack's webhook testing tool in their dashboard
2. Trigger test events for:
   - `charge.success`
   - `subscription.create`
   - `subscription.disable`

### 3. Monitor Logs

Check your Supabase Edge Function logs for any errors:
```bash
supabase functions logs paystack-integration --follow
```

## Security Considerations

### 1. Environment Security
- Never commit API keys to version control
- Use test keys for development
- Only use live keys in production
- Rotate keys periodically

### 2. Webhook Security
- Always verify webhook signatures
- Use HTTPS for webhook endpoints
- Validate all incoming data

### 3. Database Security
- RLS policies are already configured
- User data is isolated by user_id
- Sensitive payment data is minimal

## Production Deployment

### 1. Deploy Edge Function

```bash
# Deploy the Paystack integration function
supabase functions deploy paystack-integration

# Verify deployment
supabase functions list
```

### 2. Update Environment Variables

Switch to live API keys:
```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_your_live_secret_key
supabase secrets set PAYSTACK_PUBLIC_KEY=pk_live_your_live_public_key
supabase secrets set NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

### 3. Update Webhook URL

Update your Paystack webhook URL to point to your production Supabase function:
`https://your-project-ref.supabase.co/functions/v1/paystack-integration/webhook`

## Troubleshooting

### Common Issues

1. **Webhook not receiving events:**
   - Check webhook URL is correct
   - Verify HTTPS is enabled
   - Check Supabase function logs

2. **Payment verification fails:**
   - Ensure secret key is correct
   - Check network connectivity
   - Verify reference format

3. **Subscription not updating:**
   - Check webhook events are enabled
   - Verify webhook secret
   - Review database logs

### Debug Commands

```bash
# Check function logs
supabase functions logs paystack-integration

# Test function locally
supabase functions serve paystack-integration

# Check database
supabase db remote --help
```

## Support

If you encounter issues:

1. Check the Supabase function logs
2. Review Paystack dashboard for failed transactions
3. Test with Paystack's test API first
4. Contact Paystack support for payment-specific issues

## Additional Resources

- [Paystack API Documentation](https://paystack.com/docs/api/)
- [Paystack Test Cards](https://paystack.com/docs/payments/test-payments/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Webhook Best Practices](https://paystack.com/docs/payments/webhooks/)

---

**Note:** This integration handles Nigerian Naira (NGN) by default. To support other currencies, update the currency settings in both your Paystack dashboard and the Edge Function code.
