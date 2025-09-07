import { Button } from "@/components/ui/button";
import { Video, Menu, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md border-b border-border z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">ViralClips</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-foreground hover:text-primary transition-colors cursor-pointer">Features</a>
            <Link to="/pricing" className="text-foreground hover:text-primary transition-colors cursor-pointer">Pricing</Link>
            <a href="#demo" className="text-foreground hover:text-primary transition-colors cursor-pointer">Demo</a>
            <a href="#contact" className="text-foreground hover:text-primary transition-colors cursor-pointer">Contact</a>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <>
                <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                  <User className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
                <Button variant="ghost" onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/auth')}>Sign In</Button>
                <Button variant="hero" onClick={() => navigate('/auth')}>Get Started Free</Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-foreground hover:text-primary transition-colors py-2" onClick={() => setIsMenuOpen(false)}>Features</a>
              <Link to="/pricing" className="text-foreground hover:text-primary transition-colors py-2" onClick={() => setIsMenuOpen(false)}>Pricing</Link>
              <a href="#demo" className="text-foreground hover:text-primary transition-colors py-2" onClick={() => setIsMenuOpen(false)}>Demo</a>
              <a href="#contact" className="text-foreground hover:text-primary transition-colors py-2" onClick={() => setIsMenuOpen(false)}>Contact</a>
              <div className="flex flex-col gap-2 pt-4">
                {user ? (
                  <>
                    <Button variant="ghost" onClick={() => navigate('/dashboard')}>Dashboard</Button>
                    <Button variant="ghost" onClick={signOut}>Sign Out</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => navigate('/auth')}>Sign In</Button>
                    <Button variant="hero" onClick={() => navigate('/auth')}>Get Started Free</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;