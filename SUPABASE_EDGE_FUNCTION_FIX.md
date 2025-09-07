# Fixing "Function returned a non-2xx status code" Error in Supabase

This guide will help you resolve the Edge Function error you're experiencing with the video analysis feature in your ViralClips application.

## What's Causing the Error

The "Function returned a non-2xx status code" error occurs because the `process-youtube-url` Edge Function is failing due to missing API keys and configuration. The function requires:

1. **YouTube Data API Key** - To fetch video metadata
2. **OpenAI API Key** - To generate AI-powered highlights
3. **Proper Supabase Environment Variables**

## Step-by-Step Fix

### 1. Set Up YouTube Data API Key

#### Get YouTube API Key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **YouTube Data API v3**:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key

#### Add to Supabase:
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to "Settings" > "Edge Functions"
4. Add environment variable:
   - **Name**: `YOUTUBE_API_KEY`
   - **Value**: Your YouTube API key

### 2. Set Up OpenAI API Key (Optional but Recommended)

#### Get OpenAI API Key:
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-`)

#### Add to Supabase:
1. In Supabase Dashboard > "Settings" > "Edge Functions"
2. Add environment variable:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key

### 3. Deploy Edge Functions

#### Install Supabase CLI:
```bash
# Install Supabase CLI
npm install -g supabase

# Or using Homebrew (macOS)
brew install supabase/tap/supabase
```

#### Login and Deploy:
```bash
# Login to Supabase
supabase login

# Link to your project (replace with your project reference)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy process-youtube-url
```

### 4. Verify Environment Variables

Check that your environment variables are set correctly:

```bash
# List all functions and their environment variables
supabase functions list
```

### 5. Test the Function

#### Test via Supabase Dashboard:
1. Go to "Edge Functions" in your Supabase dashboard
2. Find `process-youtube-url` function
3. Click "Invoke" and test with:
```json
{
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

#### Test via curl:
```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.functions.supabase.co/process-youtube-url' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### 6. Alternative: Enable Development Mode

If you want to test the app without setting up APIs, you can modify the code to use mock data in development:

#### Update QuickGenerate.tsx:
Add this check in the `handleUrlAnalysis` function:

```typescript
const handleUrlAnalysis = async () => {
  try {
    // ... existing validation code ...

    // For development, use mock data
    if (import.meta.env.DEV) {
      const mockVideo = {
        id: "mock_video",
        title: "🔥 Amazing Demo Video for Testing",
        description: "This is a mock video for development testing",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        duration: "PT7M30S",
        publishedAt: new Date().toISOString(),
        channelTitle: "Demo Channel",
        viewCount: "1000000",
        url: youtubeUrl,
        durationSeconds: 450,
        highlights: [
          {
            id: "demo_1",
            startTime: 15,
            endTime: 45,
            confidence: 0.9,
            type: "hook",
            description: "Engaging opening moment",
            suggestedTitle: "🤯 Mind-Blowing Opening!",
            aiScore: 0.95,
            keywords: ["amazing", "shocking"],
            platform: "all"
          }
          // ... add more mock highlights
        ]
      };
      
      setAnalyzedVideo(mockVideo);
      toast({
        title: "Analysis Complete (Dev Mode)",
        description: "Using mock data for development testing",
      });
      return;
    }

    // ... rest of existing function for production
  } catch (error) {
    // ... existing error handling
  }
};
```

## Troubleshooting

### Common Issues:

1. **"API Key not valid"**: 
   - Make sure YouTube API key is correctly set
   - Verify the API is enabled in Google Cloud Console

2. **"Authentication failed"**:
   - Check that user is logged in to your app
   - Verify Supabase auth token is being passed correctly

3. **"Video is too short/long"**:
   - Function only processes videos between 1 minute and 2 hours
   - Use a different test video

4. **"Rate limit exceeded"**:
   - YouTube API has quota limits
   - Wait or upgrade your Google Cloud quota

### Check Function Logs:
1. Go to Supabase Dashboard > "Edge Functions"
2. Click on `process-youtube-url`
3. Check the "Logs" tab for detailed error messages

### Verify Function Status:
```bash
# Check function status
supabase functions list

# View function logs
supabase functions logs process-youtube-url
```

## Cost Considerations

- **YouTube API**: Free tier includes 10,000 units/day (about 1,000 video requests)
- **OpenAI API**: Pay-per-use (GPT-4 costs ~$0.03-0.06 per analysis)
- **Supabase Edge Functions**: 500,000 requests/month on free tier

## Quick Test URLs

Use these YouTube URLs for testing:
- Short video: `https://www.youtube.com/watch?v=jNQXAC9IVRw`
- Medium video: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Educational: `https://www.youtube.com/watch?v=kJQP7kiw5Fk`

## Support

If you continue to experience issues:
1. Check the Supabase function logs for specific errors
2. Verify all environment variables are set correctly
3. Test with different YouTube URLs
4. Consider enabling development mode with mock data for local testing

The error should be resolved once the API keys are properly configured and the Edge Function is redeployed with the correct environment variables.
