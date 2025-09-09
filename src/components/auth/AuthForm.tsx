import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Video, Mail, Lock, User, Github, Chrome } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthService } from "@/lib/auth-service-simple";
import { useToast } from "@/hooks/use-toast";
import { SignUpSchema, SignInSchema, validateAndSanitize } from "@/lib/validation";

interface AuthFormProps {
  onSuccess?: () => void;
}

const AuthForm = ({ onSuccess }: AuthFormProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
  });
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    setError("");
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Validate input data
      const schema = isSignUp ? SignUpSchema : SignInSchema;
      const validatedData = validateAndSanitize(schema, formData);

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: validatedData.email,
          password: validatedData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: (validatedData as any).fullName || validatedData.email.split('@')[0],
            }
          }
        });

        if (error) throw error;

        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
        });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: validatedData.email,
          password: validatedData.password,
        });

        if (error) throw error;

        // Update the user's last sign-in time using our production-grade service
        if (data.user) {
          await AuthService.onSignInSuccess(data.user.id);
        }

        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        onSuccess?.();
      }
    } catch (error: unknown) {
      let errorMessage = 'An unexpected error occurred';
      
      if (error instanceof Error) {
        // Handle common Supabase auth errors with user-friendly messages
        switch (error.message) {
          case 'Invalid login credentials':
            errorMessage = 'Invalid email or password. Please check your credentials and try again.';
            break;
          case 'User already registered':
            errorMessage = 'An account with this email already exists. Please sign in instead.';
            break;
          case 'Email not confirmed':
            errorMessage = 'Please check your email and click the confirmation link before signing in.';
            break;
          case 'Password should be at least 6 characters':
            errorMessage = 'Password must be at least 6 characters long.';
            break;
          case 'Invalid email':
            errorMessage = 'Please enter a valid email address.';
            break;
          case 'To many requests':
          case 'Too many requests':
            errorMessage = 'Too many attempts. Please wait a few minutes before trying again.';
            break;
          default:
            errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      
      toast({
        title: "Authentication Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        }
      });
      if (error) throw error;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-gradient-to-r from-primary to-accent rounded-xl flex items-center justify-center">
          <Video className="w-6 h-6 text-white" />
        </div>
        <div>
          <CardTitle className="text-2xl">{isSignUp ? "Create Account" : "Welcome Back"}</CardTitle>
          <CardDescription>
            {isSignUp 
              ? "Start creating viral clips with AI" 
              : "Sign in to your ViralClips account"
            }
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="pl-10"
                  required={isSignUp}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleInputChange}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleInputChange}
                className="pl-10 pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-8 w-8"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full" variant="hero" disabled={loading}>
            {loading ? "Loading..." : (isSignUp ? "Create Account" : "Sign In")}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            onClick={() => handleSocialAuth('google')}
            disabled={loading}
            className="w-full"
          >
            <Chrome className="mr-2 h-4 w-4" />
            Google
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSocialAuth('github')}
            disabled={loading}
            className="w-full"
          >
            <Github className="mr-2 h-4 w-4" />
            GitHub
          </Button>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthForm;