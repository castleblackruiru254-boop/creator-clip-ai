import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: string;
  url: string;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    
    const { query, maxResults = 25, publishedAfter, publishedBefore, location, relevanceLanguage = 'en' } = JSON.parse(body);

    // Get authorization header
    const authHeader = req.headers.authorization
    if (!authHeader) {
      throw new Error('Authorization header missing')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? ''
    )

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) {
      console.error('Auth error:', authError)
      throw new Error('Authentication failed')
    }

    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
      throw new Error('YouTube API key not configured');
    }

    // Build YouTube API search URL
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      maxResults: maxResults.toString(),
      type: 'video',
      key: youtubeApiKey,
      relevanceLanguage,
      safeSearch: 'moderate',
      videoDefinition: 'high',
      videoDuration: 'medium', // 4-20 minutes, good for creating clips
    });

    if (publishedAfter) {
      searchParams.append('publishedAfter', publishedAfter);
    }
    if (publishedBefore) {
      searchParams.append('publishedBefore', publishedBefore);
    }
    if (location) {
      searchParams.append('location', location);
      searchParams.append('locationRadius', '50km');
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
    
    console.log(`Searching YouTube for: "${query}" by user: ${user.email}`);

    // Fetch search results
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      throw new Error(`YouTube API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items.map((item: {
      id: { videoId: string };
    }) => item.id.videoId).join(',');

    // Get additional video details (duration, views, etc.)
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: youtubeApiKey,
    });

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`;
    const detailsResponse = await fetch(detailsUrl);
    
    if (!detailsResponse.ok) {
      throw new Error('Failed to fetch video details');
    }

    const detailsData = await detailsResponse.json();

    // Combine search results with details
    const videos: YouTubeVideo[] = searchData.items.map((item: {
      id: { videoId: string };
      snippet: {
        title: string;
        description: string;
        publishedAt: string;
        channelTitle: string;
        thumbnails: {
          high?: { url: string };
          medium?: { url: string };
        };
      };
    }) => {
      const details = detailsData.items.find((d: {
        id: string;
        contentDetails?: { duration: string };
        statistics?: { viewCount: string };
      }) => d.id === item.id.videoId);
      
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        duration: details?.contentDetails?.duration || 'Unknown',
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        viewCount: details?.statistics?.viewCount || '0',
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`
      };
    });

    // Filter out very short videos (less than 2 minutes) and very long ones (more than 1 hour)
    const filteredVideos = videos.filter(video => {
      if (video.duration === 'Unknown') return true;
      
      // Parse ISO 8601 duration (PT15M33S format)
      const match = video.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return true;
      
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2] || '0');
      const seconds = parseInt(match[3] || '0');
      
      const totalMinutes = hours * 60 + minutes + seconds / 60;
      
      // Keep videos between 2 minutes and 60 minutes
      return totalMinutes >= 2 && totalMinutes <= 60;
    });

    const response = {
      success: true,
      query,
      totalResults: searchData.pageInfo?.totalResults || 0,
      videos: filteredVideos,
      nextPageToken: searchData.nextPageToken,
      searchMetadata: {
        searchedAt: new Date().toISOString(),
        userId: user.id,
        resultsCount: filteredVideos.length,
        filters: {
          publishedAfter,
          publishedBefore,
          location,
          maxResults
        }
      }
    };

    console.log(`Found ${filteredVideos.length} suitable videos for user ${user.email}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(response));

  } catch (error) {
    console.error('Error in youtube-search function:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to search YouTube videos'
    }));
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});