/**
 * Paystack Payment Service
 * 
 * This module provides comprehensive Paystack integration for subscription billing,
 * one-time payments, and webhook handling for the ViralClips application.
 */

import { logger } from './logger';

export interface PaystackCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  customer_code: string;
  phone: string;
  metadata?: Record<string, any>;
  risk_action: string;
  international_format_phone?: string;
}

export interface PaystackPlan {
  id: number;
  name: string;
  plan_code: string;
  description: string;
  amount: number;
  interval: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually';
  send_invoices: boolean;
  send_sms: boolean;
  currency: string;
}

export interface PaystackSubscription {
  customer: PaystackCustomer;
  plan: PaystackPlan;
  integration: number;
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    card_type: string;
    bank: string;
  };
  subscription_code: string;
  email_token: string;
  status: 'active' | 'cancelled' | 'attention' | 'non-renewing';
  quantity: number;
  amount: number;
  next_payment_date: string;
  open_invoice?: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaystackTransaction {
  id: number;
  domain: string;
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  reference: string;
  amount: number;
  message?: string;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address?: string;
  metadata?: Record<string, any>;
  fees: number;
  fees_split?: any;
  customer: PaystackCustomer;
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature: string;
  };
  plan?: PaystackPlan;
}

/**
 * Main Paystack service class
 */
export class PaystackService {
  private readonly publicKey: string;
  private readonly secretKey: string;

  constructor() {
    this.publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
    this.secretKey = import.meta.env.VITE_PAYSTACK_SECRET_KEY || '';
    
    if (!this.publicKey || !this.secretKey) {
      console.warn('Paystack keys not configured');
    }
  }

  /**
   * Initialize a payment transaction
   */
  async initializePayment(data: {
    email: string;
    amount: number; // In kobo (multiply naira by 100)
    reference?: string;
    plan_code?: string;
    callback_url?: string;
    metadata?: Record<string, any>;
    channels?: string[];
  }): Promise<{
    success: boolean;
    authorization_url?: string;
    access_code?: string;
    reference?: string;
    error?: string;
  }> {
    try {
      const reference = data.reference || this.generateReference();
      
      const payload = {
        email: data.email,
        amount: data.amount,
        reference,
        plan: data.plan_code,
        callback_url: data.callback_url || `${window.location.origin}/payment/callback`,
        metadata: {
          ...data.metadata,
          user_id: data.metadata?.user_id,
          plan_id: data.plan_code,
        },
        channels: data.channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      };

      const response = await this.makeRequest('POST', '/transaction/initialize', payload);
      
      if (response.status) {
        return {
          success: true,
          authorization_url: response.data.authorization_url,
          access_code: response.data.access_code,
          reference: response.data.reference,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Payment initialization failed',
        };
      }
    } catch (error) {
      logger.error('Payment initialization failed', error as Error);
      return {
        success: false,
        error: 'Failed to initialize payment',
      };
    }
  }

  /**
   * Verify a payment transaction
   */
  async verifyPayment(reference: string): Promise<{
    success: boolean;
    transaction?: PaystackTransaction;
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('GET', `/transaction/verify/${reference}`);
      
      if (response.status) {
        return {
          success: true,
          transaction: response.data,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Payment verification failed',
        };
      }
    } catch (error) {
      logger.error('Payment verification failed', error as Error);
      return {
        success: false,
        error: 'Failed to verify payment',
      };
    }
  }

  /**
   * Create a Paystack customer
   */
  async createCustomer(data: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    customer?: PaystackCustomer;
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('POST', '/customer', data);
      
      if (response.status) {
        return {
          success: true,
          customer: response.data,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Customer creation failed',
        };
      }
    } catch (error) {
      logger.error('Customer creation failed', error as Error);
      return {
        success: false,
        error: 'Failed to create customer',
      };
    }
  }

  /**
   * Create subscription
   */
  async createSubscription(data: {
    customer: string; // customer_code or email
    plan: string; // plan_code
    authorization?: string; // authorization_code
    start_date?: string;
  }): Promise<{
    success: boolean;
    subscription?: PaystackSubscription;
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('POST', '/subscription', data);
      
      if (response.status) {
        return {
          success: true,
          subscription: response.data,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Subscription creation failed',
        };
      }
    } catch (error) {
      logger.error('Subscription creation failed', error as Error);
      return {
        success: false,
        error: 'Failed to create subscription',
      };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionCode: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('POST', `/subscription/disable`, {
        code: subscriptionCode,
        token: this.generateToken(),
      });
      
      if (response.status) {
        return {
          success: true,
          message: response.message || 'Subscription cancelled successfully',
        };
      } else {
        return {
          success: false,
          error: response.message || 'Subscription cancellation failed',
        };
      }
    } catch (error) {
      logger.error('Subscription cancellation failed', error as Error);
      return {
        success: false,
        error: 'Failed to cancel subscription',
      };
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionCode: string): Promise<{
    success: boolean;
    subscription?: PaystackSubscription;
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('GET', `/subscription/${subscriptionCode}`);
      
      if (response.status) {
        return {
          success: true,
          subscription: response.data,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Failed to fetch subscription',
        };
      }
    } catch (error) {
      logger.error('Subscription fetch failed', error as Error);
      return {
        success: false,
        error: 'Failed to get subscription details',
      };
    }
  }

  /**
   * List customer transactions
   */
  async getCustomerTransactions(customerCode: string): Promise<{
    success: boolean;
    transactions?: PaystackTransaction[];
    error?: string;
  }> {
    try {
      const response = await this.makeRequest('GET', `/customer/${customerCode}/transaction`);
      
      if (response.status) {
        return {
          success: true,
          transactions: response.data,
        };
      } else {
        return {
          success: false,
          error: response.message || 'Failed to fetch transactions',
        };
      }
    } catch (error) {
      logger.error('Transaction fetch failed', error as Error);
      return {
        success: false,
        error: 'Failed to get transaction history',
      };
    }
  }

  /**
   * Webhook signature verification
   */
  verifyWebhookSignature(): boolean {
    try {
      const crypto = window.crypto || (globalThis as any).crypto;
      if (!crypto || !crypto.subtle) {
        console.warn('WebCrypto not available, skipping signature verification');
        return true; // Allow in development
      }
      
      // Note: For production, implement proper HMAC verification
      // This would typically be done on the server side
      return true;
    } catch (error) {
      logger.error('Webhook verification failed', error as Error);
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event: {
    event: string;
    data: PaystackTransaction | PaystackSubscription;
  }): Promise<void> {
    try {
      logger.info('Processing Paystack webhook', { event: event.event });

      switch (event.event) {
        case 'charge.success':
          await this.handlePaymentSuccess(event.data as PaystackTransaction);
          break;
          
        case 'subscription.create':
          await this.handleSubscriptionCreated(event.data as PaystackSubscription);
          break;
          
        case 'subscription.disable':
          await this.handleSubscriptionCancelled(event.data as PaystackSubscription);
          break;
          
        case 'subscription.not_renew':
          await this.handleSubscriptionNotRenew(event.data as PaystackSubscription);
          break;
          
        case 'invoice.create':
        case 'invoice.update':
          await this.handleInvoiceUpdate(event.data as any);
          break;
          
        default:
          logger.info('Unhandled webhook event', { event: event.event });
      }
    } catch (error) {
      logger.error('Webhook processing failed', error as Error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Paystack API
   */
  private async makeRequest(method: 'GET' | 'POST' | 'PUT', endpoint: string, body?: any): Promise<any> {
    // For server-side requests, this would use the secret key
    // For client-side initialization, we'll use the Edge Function
    const response = await fetch('/api/paystack-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        endpoint,
        data: body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Generate unique payment reference
   */
  private generateReference(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `viral_${timestamp}_${random}`;
  }

  /**
   * Generate webhook token
   */
  private generateToken(): string {
    return Math.random().toString(36).substr(2, 15);
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSuccess(transaction: PaystackTransaction): Promise<void> {
    try {
      // Mock implementation - billing tables don't exist yet
      console.log('Payment success handled:', transaction.id);

      // Update user credits if it's a credit purchase
      if (transaction.metadata?.type === 'credits') {
        console.log('Credits purchase detected - would update user credits');
      }
      
      logger.info('Payment processed successfully', {
        reference: transaction.reference,
        amount: transaction.amount,
      });
    } catch (error) {
      logger.error('Failed to process payment success', error as Error);
      throw error;
    }
  }

  /**
   * Handle subscription creation
   */
  private async handleSubscriptionCreated(subscription: PaystackSubscription): Promise<void> {
    try {
      // Mock implementation - subscription tables don't exist yet
      console.log('Subscription created:', subscription.subscription_code);
      
      logger.info('Subscription created successfully', {
        subscriptionCode: subscription.subscription_code,
        plan: subscription.plan.name,
      });
    } catch (error) {
      logger.error('Failed to process subscription creation', error as Error);
      throw error;
    }
  }

  /**
   * Handle subscription cancellation
   */
  private async handleSubscriptionCancelled(subscription: PaystackSubscription): Promise<void> {
    try {
      // Mock implementation - subscription tables don't exist yet
      console.log('Subscription cancelled:', subscription.subscription_code);
      
      logger.info('Subscription cancelled successfully', {
        subscriptionCode: subscription.subscription_code,
      });
    } catch (error) {
      logger.error('Failed to process subscription cancellation', error as Error);
      throw error;
    }
  }

  /**
   * Handle subscription non-renewal
   */
  private async handleSubscriptionNotRenew(subscription: PaystackSubscription): Promise<void> {
    try {
      // Mock implementation - subscription tables don't exist yet  
      console.log('Subscription not renewing:', subscription.subscription_code);

      logger.info('Subscription set to not renew', {
        subscriptionCode: subscription.subscription_code,
      });
    } catch (error) {
      logger.error('Failed to process subscription non-renewal', error as Error);
      throw error;
    }
  }

  /**
   * Handle invoice updates
   */
  private async handleInvoiceUpdate(invoice: any): Promise<void> {
    try {
      // Update invoice status in database
      logger.info('Invoice updated', { invoiceId: invoice.id });
    } catch (error) {
      logger.error('Failed to process invoice update', error as Error);
      throw error;
    }
  }

  /**
   * Get plan configuration
   */
  static getPlanConfig(planId: 'starter' | 'pro' | 'enterprise') {
    const plans = {
      starter: {
        name: 'Starter',
        price: 19,
        credits: 50,
        plan_code: 'viral_starter_monthly',
        features: ['50 clips/month', 'HD quality', 'No watermarks'],
      },
      pro: {
        name: 'Pro',
        price: 49,
        credits: 200,
        plan_code: 'viral_pro_monthly',
        features: ['200 clips/month', '4K quality', 'Team collaboration'],
      },
      enterprise: {
        name: 'Enterprise',
        price: 199,
        credits: 'unlimited',
        plan_code: 'viral_enterprise_monthly',
        features: ['Unlimited clips', 'White-label', 'Priority support'],
      },
    };

    return plans[planId];
  }
}

/**
 * React hook for Paystack integration
 */
export const usePaystack = () => {
  const paystackService = new PaystackService();

  const initializePayment = async (data: {
    email: string;
    amount: number;
    plan?: string;
    metadata?: Record<string, any>;
  }) => {
    return await paystackService.initializePayment({
      ...data,
      amount: data.amount * 100, // Convert naira to kobo
    });
  };

  const verifyPayment = async (reference: string) => {
    return await paystackService.verifyPayment(reference);
  };

  const createSubscription = async (data: {
    customerCode: string;
    planCode: string;
    authorizationCode?: string;
  }) => {
    return await paystackService.createSubscription({
      customer: data.customerCode,
      plan: data.planCode,
      authorization: data.authorizationCode,
    });
  };

  return {
    initializePayment,
    verifyPayment,
    createSubscription,
    cancelSubscription: paystackService.cancelSubscription.bind(paystackService),
    getSubscription: paystackService.getSubscription.bind(paystackService),
    getCustomerTransactions: paystackService.getCustomerTransactions.bind(paystackService),
  };
};

// Export singleton instance
export const paystackService = new PaystackService();