import AuthForm from "@/components/auth/AuthForm";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AuthPage = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-card to-muted p-6">
      <div className="w-full max-w-md">
        <AuthForm onSuccess={() => window.location.href = "/dashboard"} />
      </div>
    </div>
  );
};

export default AuthPage;