import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

const LoadingSpinner = ({ 
  size = "md", 
  className = "", 
  text = "Loading..." 
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8", 
    lg: "w-12 h-12"
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen ${className}`}>
      <Loader2 className={`animate-spin text-primary ${sizeClasses[size]}`} />
      {text && (
        <p className="mt-4 text-sm text-muted-foreground">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
