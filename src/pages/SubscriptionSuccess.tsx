import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  CheckCircle, 
  Crown, 
  Star,
  ArrowRight,
  Loader2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { verifyPayment } from '@/lib/paystack-utils';

interface PaymentVerification {
  success: boolean;
  status: string;
  plan?: {
    name: string;
    code: string;
    amount: number;
  };
  subscription?: {
    id: string;
    status: string;
  };
  credits_added?: number;
  message?: string;
}

const SubscriptionSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: _user } = useAuth();
  const { toast } = useToast();
  
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [verificationData, setVerificationData] = useState<PaymentVerification | null>(null);
  const [timeLeft, setTimeLeft] = useState(5);

  const reference = searchParams.get('reference');
  const trxref = searchParams.get('trxref');

  useEffect(() => {
    if (reference || trxref) {
      verifySubscriptionPayment(reference || trxref || '');
    } else {
      setVerificationStatus('failed');
      setVerificationData({
        success: false,
        status: 'invalid',
        message: 'No payment reference found'
      });
    }
  }, [reference, trxref]);

  useEffect(() => {
    if (verificationStatus === 'success' && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else if (verificationStatus === 'success' && timeLeft === 0) {
      navigate('/dashboard/subscription');
    }
  }, [verificationStatus, timeLeft, navigate]);

  const verifySubscriptionPayment = async (paymentReference: string) => {
    try {
      const result = await verifyPayment(paymentReference);
      
      const verificationResult: PaymentVerification = {
        success: result.success,
        status: result.success ? 'success' : 'failed',
        message: result.message,
        ...result
      };
      
      setVerificationData(verificationResult);
      setVerificationStatus(result.success ? 'success' : 'failed');
      
      if (result.success) {
        toast({
          title: "Payment Successful!",
          description: result.message || "Your subscription has been activated successfully.",
        });
      } else {
        toast({
          title: "Payment Verification Failed",
          description: result.message || "Could not verify your payment. Please contact support.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Payment verification failed:', error);
      setVerificationStatus('failed');
      setVerificationData({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Verification failed'
      });
      
      toast({
        title: "Verification Error",
        description: "An error occurred while verifying your payment.",
        variant: "destructive",
      });
    }
  };

  const getPlanDisplayName = (planCode: string) => {
    const plans = {
      'viral_starter_monthly': 'Starter',
      'viral_pro_monthly': 'Pro',
      'viral_enterprise_monthly': 'Enterprise',
    };
    
    return plans[planCode as keyof typeof plans] || planCode;
  };

  const renderVerificationContent = () => {
    switch (verificationStatus) {
      case 'verifying':
        return (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center p-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Verifying Payment</h2>
              <p className="text-muted-foreground">
                Please wait while we confirm your payment...
              </p>
            </CardContent>
          </Card>
        );
        
      case 'success':
        return (
          <Card className="max-w-md mx-auto border-green-200 bg-green-50 dark:bg-green-950/10">
            <CardContent className="text-center p-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-green-800 dark:text-green-200 mb-2">
                Payment Successful!
              </h2>
              
              {verificationData?.plan && (
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-center gap-2">
                    <Crown className="h-5 w-5 text-green-600" />
                    <span className="text-lg font-semibold text-green-800 dark:text-green-200">
                      {getPlanDisplayName(verificationData.plan.code)} Plan Activated
                    </span>
                  </div>
                  
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                    <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      <p>Amount: <span className="font-medium">${verificationData.plan.amount}</span></p>
                      {verificationData.subscription && (
                        <p>Subscription ID: <span className="font-mono text-xs">{verificationData.subscription.id}</span></p>
                      )}
                      {verificationData.credits_added && (
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">+{verificationData.credits_added} credits added</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {verificationData?.message || 'Your subscription is now active and ready to use!'}
                </p>
                
                <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <span>Redirecting to dashboard in {timeLeft}s</span>
                </div>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={() => navigate('/dashboard/subscription')}
                  >
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                  >
                    Start Creating
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
        
      case 'failed':
        return (
          <Card className="max-w-md mx-auto border-red-200 bg-red-50 dark:bg-red-950/10">
            <CardContent className="text-center p-8">
              <XCircle className="h-16 w-16 text-red-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-red-800 dark:text-red-200 mb-2">
                Payment Failed
              </h2>
              
              <div className="space-y-4 mb-6">
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {verificationData?.status || 'Unknown Error'}
                    </span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {verificationData?.message || 'Your payment could not be processed.'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Don't worry, you haven't been charged. You can try again or contact support if you need help.
                </p>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={() => navigate('/pricing')}
                  >
                    Try Again
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Payment Processing</h1>
          <p className="text-muted-foreground">
            We're processing your payment and setting up your subscription.
          </p>
        </div>

        {/* Main Content */}
        {renderVerificationContent()}

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground">
            Having issues? Contact our support team at{' '}
            <a href="mailto:support@creator-clip.ai" className="text-primary hover:underline">
              support@creator-clip.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
