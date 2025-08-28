import LandingPage from "./LandingPage";
import { useEffect } from "react";

const Index = () => {
  useEffect(() => {
    // SEO optimization
    document.title = "ViralClips - AI-Powered Video Editor for Short-Form Content";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Turn long videos into viral clips with AI. Create engaging TikTok, YouTube Shorts, and Instagram Reels content automatically. Start free today!');
    }

    // Add structured data for SEO
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "ViralClips",
      "description": "AI-powered video editing platform for creating viral short-form content",
      "url": "https://viralclips.site",
      "applicationCategory": "VideoEditingApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      // Cleanup
      const existingScript = document.querySelector('script[type="application/ld+json"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  return <LandingPage />;
};

export default Index;
