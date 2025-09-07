import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import DemoSection from "@/components/DemoSection";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";

const LandingPage = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <DemoSection />
      <PricingSection />
      <Footer />
    </div>
  );
};

export default LandingPage;