import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  CheckCircle, 
  Star,
  ArrowRight,
  Loader2,
  XCircle,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { verifyPayment } from '@/lib/paystack-utils';

interface CreditsVerification {
  success: boolean;
  status: string;
  credits_added?: number;
  bonus_credits?: number;
  total_credits?: number;
  package_name?: string;
  amount?: number;
  message?: string;
}

const CreditsSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [verificationData, setVerificationData] = useState<CreditsVerification | null>(null);
  const [timeLeft, setTimeLeft] = useState(5);

  const reference = searchParams.get('reference');
  const trxref = searchParams.get('trxref');

  useEffect(() => {
    if (reference || trxref) {
      verifyCreditsPayment(reference || trxref || '');
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
      navigate('/dashboard/subscription?tab=credits');
    }
  }, [verificationStatus, timeLeft, navigate]);

  const verifyCreditsPayment = async (paymentReference: string) => {
    try {
      const result = await verifyPayment(paymentReference);
      
      setVerificationData(result);
      setVerificationStatus(result.success ? 'success' : 'failed');
      
      if (result.success) {
        toast({
          title: "Credits Purchased!",
          description: result.message || "Your credits have been added to your account successfully.",
        });
      } else {
        toast({
          title: "Purchase Verification Failed",
          description: result.message || "Could not verify your purchase. Please contact support.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Credits verification failed:', error);
      setVerificationStatus('failed');
      setVerificationData({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Verification failed'
      });
      
      toast({
        title: "Verification Error",
        description: "An error occurred while verifying your purchase.",
        variant: "destructive",
      });
    }
  };

  const renderVerificationContent = () => {
    switch (verificationStatus) {
      case 'verifying':
        return (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center p-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Processing Purchase</h2>
              <p className="text-muted-foreground">
                Please wait while we confirm your credit purchase...
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
                Credits Purchased!
              </h2>
              
              <div className="space-y-4 mb-6">
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Star className="h-6 w-6 text-yellow-500" />
                    <span className="text-2xl font-bold text-green-800 dark:text-green-200">
                      +{verificationData?.total_credits || verificationData?.credits_added || 0} Credits
                    </span>
                  </div>
                  
                  {verificationData?.credits_added && verificationData?.bonus_credits && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-green-700 dark:text-green-300">
                        <span>Base credits:</span>
                        <span className="font-medium">+{verificationData.credits_added}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-green-700 dark:text-green-300">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Bonus credits:
                        </span>
                        <span className="font-medium">+{verificationData.bonus_credits}</span>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex items-center justify-between font-semibold text-green-800 dark:text-green-200">
                          <span>Total added:</span>
                          <span>+{(verificationData.credits_added || 0) + (verificationData.bonus_credits || 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {verificationData?.amount && (
                    <div className="mt-3 pt-3 border-t text-xs text-green-600 dark:text-green-400">
                      Amount paid: ${verificationData.amount.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {verificationData?.message || 'Your credits have been added to your account and are ready to use!'}
                </p>
                
                <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <span>Redirecting to credits dashboard in {timeLeft}s</span>
                </div>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={() => navigate('/dashboard/subscription?tab=credits')}
                  >
                    View Credits Dashboard
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
                Purchase Failed
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
                    {verificationData?.message || 'Your credit purchase could not be processed.'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Don't worry, you haven't been charged. You can try purchasing credits again.
                </p>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={() => navigate('/dashboard/subscription?tab=credits')}
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
          <div className="flex items-center justify-center gap-2 mb-4">
            <Star className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Credits Purchase</h1>
          </div>
          <p className="text-muted-foreground">
            We're processing your credit purchase and adding them to your account.
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

export default CreditsSuccess;
