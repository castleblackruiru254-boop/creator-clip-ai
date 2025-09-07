import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

interface PaystackWebhookEvent {
  event: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: Record<string, any>;
    fees: number;
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string;
      metadata: Record<string, any>;
    };
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      card_type: string;
      bank: string;
    };
    plan?: {
      id: number;
      name: string;
      plan_code: string;
      description: string;
      amount: number;
      interval: string;
    };
    subscription?: {
      subscription_code: string;
      email_token: string;
      status: string;
      next_payment_date: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Route to appropriate handler
    if (pathname.includes('/webhook')) {
      return await handleWebhook(req, supabaseClient)
    } else if (pathname.includes('/initialize-payment')) {
      return await handleInitializePayment(req, supabaseClient)
    } else if (pathname.includes('/verify-payment')) {
      return await handleVerifyPayment(req, supabaseClient)
    } else if (pathname.includes('/create-subscription')) {
      return await handleCreateSubscription(req, supabaseClient)
    } else if (pathname.includes('/cancel-subscription')) {
      return await handleCancelSubscription(req, supabaseClient)
    } else if (pathname.includes('/create-plans')) {
      return await handleCreatePlans(req, supabaseClient)
    } else {
      return new Response(
        JSON.stringify({ error: 'Endpoint not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Paystack function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/**
 * Handle Paystack webhook events
 */
async function handleWebhook(req: Request, supabase: any): Promise<Response> {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    // Verify webhook signature
    if (signature && !await verifyWebhookSignature(body, signature, secretKey)) {
      console.error('Invalid webhook signature')
      return new Response('Unauthorized', { status: 401 })
    }

    const event: PaystackWebhookEvent = JSON.parse(body)
    console.log(`Processing webhook: ${event.event}`)

    switch (event.event) {
      case 'charge.success':
        await handlePaymentSuccess(event, supabase)
        break
        
      case 'subscription.create':
        await handleSubscriptionCreated(event, supabase)
        break
        
      case 'subscription.disable':
        await handleSubscriptionCancelled(event, supabase)
        break
        
      case 'subscription.not_renew':
        await handleSubscriptionNotRenew(event, supabase)
        break
        
      case 'invoice.create':
      case 'invoice.update':
      case 'invoice.payment_failed':
        await handleInvoiceEvent(event, supabase)
        break
        
      default:
        console.log(`Unhandled webhook event: ${event.event}`)
    }

    return new Response('Webhook processed successfully', { 
      status: 200,
      headers: corsHeaders 
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response('Webhook processing failed', { 
      status: 500,
      headers: corsHeaders 
    })
  }
}

/**
 * Initialize payment transaction
 */
async function handleInitializePayment(req: Request, supabase: any): Promise<Response> {
  try {
    const { email, amount, plan_code, metadata } = await req.json()
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    // Generate unique reference
    const reference = `viral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const payload = {
      email,
      amount: amount * 100, // Convert to kobo
      reference,
      plan: plan_code,
      callback_url: `${req.headers.get('origin')}/payment/callback`,
      metadata: {
        ...metadata,
        source: 'viralclips_app',
      },
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Payment initialization failed')
    }

    // Store payment intent in database
    await supabase
      .from('payment_intents')
      .insert({
        reference: reference,
        user_id: metadata.user_id,
        amount: amount,
        plan_code: plan_code,
        status: 'pending',
        paystack_data: data.data,
      })

    return new Response(JSON.stringify({
      success: true,
      data: data.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Payment initialization error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}

/**
 * Verify payment transaction
 */
async function handleVerifyPayment(req: Request, supabase: any): Promise<Response> {
  try {
    const { reference } = await req.json()
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Payment verification failed')
    }

    // Update payment intent status
    await supabase
      .from('payment_intents')
      .update({
        status: data.data.status,
        verified_at: new Date().toISOString(),
        paystack_data: data.data,
      })
      .eq('reference', reference)

    return new Response(JSON.stringify({
      success: true,
      transaction: data.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Payment verification error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}

/**
 * Create subscription
 */
async function handleCreateSubscription(req: Request, supabase: any): Promise<Response> {
  try {
    const { customer_code, plan_code, authorization_code } = await req.json()
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    const payload = {
      customer: customer_code,
      plan: plan_code,
      authorization: authorization_code,
    }

    const response = await fetch('https://api.paystack.co/subscription', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Subscription creation failed')
    }

    return new Response(JSON.stringify({
      success: true,
      subscription: data.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Subscription creation error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}

/**
 * Cancel subscription
 */
async function handleCancelSubscription(req: Request, supabase: any): Promise<Response> {
  try {
    const { subscription_code } = await req.json()
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    const payload = {
      code: subscription_code,
      token: generateWebhookToken(),
    }

    const response = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Subscription cancellation failed')
    }

    return new Response(JSON.stringify({
      success: true,
      message: data.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Subscription cancellation error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}

/**
 * Create Paystack plans for the application
 */
async function handleCreatePlans(req: Request, supabase: any): Promise<Response> {
  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    const plans = [
      {
        name: 'ViralClips Starter',
        plan_code: 'viral_starter_monthly',
        description: 'Perfect for content creators getting started',
        amount: 1900, // ₦19 in kobo
        interval: 'monthly',
        currency: 'NGN',
        send_invoices: true,
        send_sms: false,
        hosted_page: false,
        invoice_limit: 0,
      },
      {
        name: 'ViralClips Pro',
        plan_code: 'viral_pro_monthly',
        description: 'Perfect for professional creators and agencies',
        amount: 4900, // ₦49 in kobo
        interval: 'monthly',
        currency: 'NGN',
        send_invoices: true,
        send_sms: false,
        hosted_page: false,
        invoice_limit: 0,
      },
      {
        name: 'ViralClips Enterprise',
        plan_code: 'viral_enterprise_monthly',
        description: 'Custom solutions for large teams and organizations',
        amount: 19900, // ₦199 in kobo
        interval: 'monthly',
        currency: 'NGN',
        send_invoices: true,
        send_sms: false,
        hosted_page: false,
        invoice_limit: 0,
      }
    ]

    const results = []
    
    for (const plan of plans) {
      try {
        const response = await fetch('https://api.paystack.co/plan', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plan),
        })

        const data = await response.json()
        
        if (response.ok) {
          results.push({
            plan_code: plan.plan_code,
            success: true,
            data: data.data,
          })
        } else {
          results.push({
            plan_code: plan.plan_code,
            success: false,
            error: data.message,
          })
        }
      } catch (error) {
        results.push({
          plan_code: plan.plan_code,
          success: false,
          error: error.message,
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Plan creation error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}

/**
 * Verify webhook signature
 */
async function verifyWebhookSignature(
  payload: string, 
  signature: string, 
  secretKey: string
): Promise<boolean> {
  try {
    const hash = await crypto.subtle.digest(
      'SHA-512',
      new TextEncoder().encode(payload + secretKey)
    )
    
    const hashArray = Array.from(new Uint8Array(hash))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return hashHex === signature
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

/**
 * Handle successful payment webhook
 */
async function handlePaymentSuccess(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    
    console.log(`Processing successful payment: ${data.reference}`)

    // Record transaction in database
    const { error: transactionError } = await supabase
      .from('billing_transactions')
      .insert({
        user_id: data.metadata.user_id,
        paystack_transaction_id: data.id.toString(),
        reference: data.reference,
        amount: data.amount / 100, // Convert from kobo to naira
        status: 'completed',
        payment_method: data.channel,
        metadata: data.metadata,
        paid_at: data.paid_at,
      })

    if (transactionError) {
      console.error('Failed to record transaction:', transactionError)
      throw transactionError
    }

    // Handle subscription payment
    if (data.plan) {
      await handleSubscriptionPayment(event, supabase)
    } else if (data.metadata.type === 'credits') {
      // Handle credit purchase
      await handleCreditPurchase(event, supabase)
    }

    console.log(`Payment processed successfully: ${data.reference}`)
  } catch (error) {
    console.error('Payment success handling error:', error)
    throw error
  }
}

/**
 * Handle subscription creation webhook
 */
async function handleSubscriptionCreated(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    
    console.log(`Creating subscription: ${data.subscription?.subscription_code}`)

    const { error } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: data.customer.metadata.user_id,
        paystack_subscription_code: data.subscription?.subscription_code,
        paystack_customer_code: data.customer.customer_code,
        plan_code: data.plan?.plan_code,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: data.subscription?.next_payment_date,
        amount: data.plan?.amount ? data.plan.amount / 100 : 0,
        interval: data.plan?.interval || 'monthly',
      })

    if (error) throw error

    // Update user's subscription tier and reset credits
    const planTier = getPlanTier(data.plan?.plan_code || '')
    const credits = getPlanCredits(planTier)
    
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: planTier,
        paystack_customer_code: data.customer.customer_code,
        credits_remaining: credits,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq('id', data.customer.metadata.user_id)

    if (profileError) throw profileError

    console.log(`Subscription created successfully for user ${data.customer.email}`)
  } catch (error) {
    console.error('Subscription creation handling error:', error)
    throw error
  }
}

/**
 * Handle subscription cancellation webhook
 */
async function handleSubscriptionCancelled(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    
    console.log(`Cancelling subscription: ${data.subscription?.subscription_code}`)

    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('paystack_subscription_code', data.subscription?.subscription_code)

    if (error) throw error

    // Update user's subscription tier to free (but keep remaining credits)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        subscription_updated_at: new Date().toISOString(),
      })
      .eq('paystack_customer_code', data.customer.customer_code)

    if (profileError) throw profileError

    console.log(`Subscription cancelled successfully for user ${data.customer.email}`)
  } catch (error) {
    console.error('Subscription cancellation handling error:', error)
    throw error
  }
}

/**
 * Handle subscription non-renewal webhook
 */
async function handleSubscriptionNotRenew(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'will_not_renew',
        will_not_renew_at: new Date().toISOString(),
      })
      .eq('paystack_subscription_code', data.subscription?.subscription_code)

    if (error) throw error

    console.log(`Subscription set to not renew: ${data.subscription?.subscription_code}`)
  } catch (error) {
    console.error('Subscription non-renewal handling error:', error)
    throw error
  }
}

/**
 * Handle subscription payment (renewal)
 */
async function handleSubscriptionPayment(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    
    // Reset credits for the user based on their plan
    const planTier = getPlanTier(data.plan?.plan_code || '')
    const credits = getPlanCredits(planTier)
    
    const { error } = await supabase
      .from('profiles')
      .update({
        credits_remaining: credits,
        last_billing_date: new Date().toISOString(),
      })
      .eq('paystack_customer_code', data.customer.customer_code)

    if (error) throw error

    console.log(`Credits reset for user ${data.customer.email}: ${credits} credits`)
  } catch (error) {
    console.error('Subscription payment handling error:', error)
    throw error
  }
}

/**
 * Handle credit purchase
 */
async function handleCreditPurchase(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    const { data } = event
    const creditsToAdd = parseInt(data.metadata.credits || '0')
    
    if (creditsToAdd > 0) {
      // Add credits to user account
      const { error } = await supabase.rpc('increment_user_credits', {
        p_user_id: data.metadata.user_id,
        p_credits: creditsToAdd,
      })

      if (error) throw error

      console.log(`Added ${creditsToAdd} credits for user ${data.customer.email}`)
    }
  } catch (error) {
    console.error('Credit purchase handling error:', error)
    throw error
  }
}

/**
 * Handle invoice events
 */
async function handleInvoiceEvent(event: PaystackWebhookEvent, supabase: any): Promise<void> {
  try {
    // Log invoice events for monitoring
    console.log(`Invoice event: ${event.event}`, {
      customer: event.data.customer.email,
      amount: event.data.amount,
    })
  } catch (error) {
    console.error('Invoice event handling error:', error)
    throw error
  }
}

/**
 * Map plan codes to internal tier names
 */
function getPlanTier(planCode: string): 'free' | 'starter' | 'pro' | 'enterprise' {
  const tierMap: Record<string, 'free' | 'starter' | 'pro' | 'enterprise'> = {
    'viral_starter_monthly': 'starter',
    'viral_pro_monthly': 'pro', 
    'viral_enterprise_monthly': 'enterprise',
  }
  
  return tierMap[planCode] || 'free'
}

/**
 * Get credits for plan tier
 */
function getPlanCredits(tier: 'free' | 'starter' | 'pro' | 'enterprise'): number {
  const creditMap: Record<string, number> = {
    free: 5,
    starter: 50,
    pro: 200,
    enterprise: 999999, // "Unlimited" represented as large number
  }
  
  return creditMap[tier] || 5
}

/**
 * Generate webhook token
 */
function generateWebhookToken(): string {
  return Math.random().toString(36).substr(2, 15)
}
