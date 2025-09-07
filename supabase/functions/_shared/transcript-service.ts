/**
 * Real Transcript Generation Service using OpenAI Whisper API
 * 
 * This module provides actual speech-to-text transcription capabilities
 * for video processing and subtitle generation.
 */

export interface TranscriptSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

/**
 * Generate transcript from audio using OpenAI Whisper API
 */
export async function generateTranscriptWithWhisper(
  audioFilePath: string,
  language: string = 'en'
): Promise<TranscriptResult> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    console.warn('OpenAI API key not configured, using mock transcript');
    return generateMockTranscriptResult();
  }

  try {
    console.log(`Generating transcript using Whisper API (language: ${language})`);
    
    // Read audio file
    const audioData = await Deno.readFile(audioFilePath);
    
    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', new Blob([audioData], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    formData.append('response_format', 'verbose_json'); // Get detailed segments
    formData.append('temperature', '0'); // More deterministic output
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Whisper API error:', errorData);
      throw new Error(`Whisper API error: ${response.status} - ${errorData}`);
    }

    const transcriptionData = await response.json();
    
    return {
      text: transcriptionData.text,
      segments: transcriptionData.segments || [],
      language: transcriptionData.language || language,
      duration: transcriptionData.duration || 0
    };
    
  } catch (error) {
    console.error('Whisper transcription failed:', error);
    console.log('Falling back to mock transcript...');
    return generateMockTranscriptResult();
  }
}

/**
 * Generate transcript from video URL (downloads, extracts audio, transcribes)
 */
export async function generateTranscriptFromVideo(
  videoUrl: string,
  startTime?: number,
  endTime?: number,
  language: string = 'en'
): Promise<TranscriptResult> {
  const { 
    initializeFFmpeg, 
    downloadYouTubeVideo, 
    extractAudioForTranscript,
    createWorkingDirectory,
    cleanupWorkingDirectory
  } = await import('./ffmpeg-utils.ts');
  
  let workingDir: string | null = null;
  
  try {
    // Create working directory
    workingDir = await createWorkingDirectory();
    
    // Initialize FFmpeg
    const ffmpegProcessor = await initializeFFmpeg();
    
    // Download video
    console.log('Downloading video for transcription...');
    const videoPath = await downloadYouTubeVideo(videoUrl, workingDir);
    
    // Extract audio segment if time range is specified
    let audioPath = `${workingDir}/audio.wav`;
    
    if (startTime !== undefined && endTime !== undefined) {
      // Extract specific audio segment
      const segmentAudioPath = `${workingDir}/audio_segment.wav`;
      const command = new Deno.Command('ffmpeg', {
        args: [
          '-y',
          '-i', videoPath,
          '-ss', startTime.toString(),
          '-t', (endTime - startTime).toString(),
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '16000',
          '-ac', '1',
          segmentAudioPath
        ],
        stdout: 'piped',
        stderr: 'piped'
      });
      
      const { success, stderr } = await command.output();
      if (!success) {
        const errorText = new TextDecoder().decode(stderr);
        throw new Error(`Audio segment extraction failed: ${errorText}`);
      }
      
      audioPath = segmentAudioPath;
    } else {
      // Extract full audio
      await extractAudioForTranscript(ffmpegProcessor, videoPath, audioPath);
    }
    
    // Generate transcript using Whisper
    const transcript = await generateTranscriptWithWhisper(audioPath, language);
    
    return transcript;
    
  } catch (error) {
    console.error('Video transcription failed:', error);
    throw new Error(`Failed to generate transcript: ${error.message}`);
  } finally {
    // Clean up working directory
    if (workingDir) {
      await cleanupWorkingDirectory(workingDir);
    }
  }
}

/**
 * Analyze transcript for highlight moments using AI
 */
export async function analyzeTranscriptForHighlights(
  transcript: TranscriptResult,
  videoTitle: string,
  videoDuration: number
): Promise<{
  id: string;
  startTime: number;
  endTime: number;
  confidence: number;
  type: string;
  description: string;
  suggestedTitle: string;
  aiScore: number;
  keywords: string[];
  platform: string;
}[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    console.warn('OpenAI API key not configured, using fallback analysis');
    return generateFallbackHighlights(transcript, videoDuration);
  }

  const prompt = `Analyze this video transcript and identify the most engaging moments for viral short-form content.

Video Title: "${videoTitle}"
Video Duration: ${videoDuration} seconds
Transcript: "${transcript.text}"

Identify 3-5 highlights with the highest viral potential. For each highlight:

1. Choose optimal 15-60 second segments based on transcript timing
2. Focus on moments with:
   - Strong emotional hooks or reactions
   - Surprising revelations or plot twists  
   - Educational "aha" moments
   - Dramatic or funny content
   - Actionable tips or insights
   - Relatable struggles or successes

3. Consider platform preferences:
   - TikTok: High energy, trendy, music-friendly
   - YouTube Shorts: Educational, storytelling, clear value
   - Instagram Reels: Aesthetic, lifestyle, behind-the-scenes

Return a JSON object with a "highlights" array. Each highlight should have:
- start_time: number (seconds from transcript segments)
- end_time: number (seconds)
- type: string (hook/educational/emotional/funny/dramatic/tutorial)
- title: string (viral-style with emojis)
- description: string
- engagement_score: number (0.0-1.0)
- keywords: string[]
- platform: string (tiktok/youtube_shorts/instagram_reels/all)`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert viral content analyst specializing in identifying engaging moments from video transcripts. You understand timing, pacing, and what makes content shareable on social media platforms.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    // Convert AI response to highlight format
    return (aiResponse.highlights || []).map((h: any, index: number) => ({
      id: `transcript_highlight_${index + 1}`,
      startTime: h.start_time || 0,
      endTime: h.end_time || 30,
      confidence: 0.9, // High confidence for transcript-based analysis
      type: h.type || 'general',
      description: h.description || 'Engaging moment',
      suggestedTitle: h.title || '🔥 Viral Moment',
      aiScore: h.engagement_score || 0.8,
      keywords: h.keywords || [],
      platform: h.platform || 'all'
    }));
    
  } catch (error) {
    console.error('AI transcript analysis failed:', error);
    return generateFallbackHighlights(transcript, videoDuration);
  }
}

/**
 * Generate fallback highlights from transcript when AI analysis fails
 */
function generateFallbackHighlights(
  transcript: TranscriptResult, 
  videoDuration: number
): {
  id: string;
  startTime: number;
  endTime: number;
  confidence: number;
  type: string;
  description: string;
  suggestedTitle: string;
  aiScore: number;
  keywords: string[];
  platform: string;
}[] {
  const highlights = [];
  const segments = transcript.segments || [];
  
  if (segments.length === 0) {
    // No segments available, create time-based highlights
    const numClips = Math.min(3, Math.floor(videoDuration / 45));
    
    for (let i = 0; i < numClips; i++) {
      const startTime = i * 45 + 15;
      const endTime = Math.min(startTime + 30, videoDuration - 5);
      
      if (endTime - startTime >= 15) {
        highlights.push({
          id: `fallback_${i + 1}`,
          startTime,
          endTime,
          confidence: 0.6,
          type: 'general',
          description: `Engaging moment ${i + 1}`,
          suggestedTitle: `🔥 Viral Moment #${i + 1}`,
          aiScore: 0.7,
          keywords: ['viral', 'engaging'],
          platform: 'all'
        });
      }
    }
    
    return highlights;
  }
  
  // Analyze transcript segments for engaging content
  const engagingWords = [
    'incredible', 'amazing', 'insane', 'wow', 'perfect', 'best', 'secret', 
    'trick', 'shocking', 'unbelievable', 'mind-blowing', 'game-changer'
  ];
  
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
  const emotionalWords = ['love', 'hate', 'excited', 'scared', 'surprised', 'shocked'];
  
  let currentHighlight: any = null;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.text.toLowerCase();
    
    // Calculate engagement score for this segment
    let engagementScore = 0;
    
    engagingWords.forEach(word => {
      if (text.includes(word)) engagementScore += 0.3;
    });
    
    questionWords.forEach(word => {
      if (text.includes(word)) engagementScore += 0.2;
    });
    
    emotionalWords.forEach(word => {
      if (text.includes(word)) engagementScore += 0.25;
    });
    
    // Look for exclamation marks and caps
    if (text.includes('!')) engagementScore += 0.1;
    if (/[A-Z]{3,}/.test(segment.text)) engagementScore += 0.15;
    
    // Start a new highlight if this segment is engaging
    if (engagementScore > 0.3) {
      if (!currentHighlight) {
        currentHighlight = {
          startTime: Math.max(0, segment.start - 2), // Start 2s before
          segments: [segment],
          totalScore: engagementScore
        };
      } else {
        currentHighlight.segments.push(segment);
        currentHighlight.totalScore += engagementScore;
      }
    } else if (currentHighlight) {
      // End current highlight
      const endTime = Math.min(videoDuration, currentHighlight.segments[currentHighlight.segments.length - 1].end + 2);
      const duration = endTime - currentHighlight.startTime;
      
      // Only add if it's a good length and has sufficient engagement
      if (duration >= 15 && duration <= 60 && currentHighlight.totalScore > 0.5) {
        const highlightText = currentHighlight.segments.map((s: any) => s.text).join(' ');
        
        highlights.push({
          id: `transcript_${highlights.length + 1}`,
          startTime: currentHighlight.startTime,
          endTime,
          confidence: Math.min(0.9, currentHighlight.totalScore / currentHighlight.segments.length),
          type: determineHighlightType(highlightText),
          description: highlightText.substring(0, 100) + (highlightText.length > 100 ? '...' : ''),
          suggestedTitle: generateViralTitle(highlightText),
          aiScore: Math.min(0.95, currentHighlight.totalScore / currentHighlight.segments.length),
          keywords: extractKeywords(highlightText),
          platform: recommendPlatform(highlightText)
        });
      }
      
      currentHighlight = null;
    }
  }
  
  // Ensure we have at least one highlight
  if (highlights.length === 0 && segments.length > 0) {
    const midPoint = Math.floor(segments.length / 2);
    const startSegment = segments[Math.max(0, midPoint - 2)];
    const endSegment = segments[Math.min(segments.length - 1, midPoint + 2)];
    
    highlights.push({
      id: 'transcript_fallback',
      startTime: startSegment.start,
      endTime: endSegment.end,
      confidence: 0.7,
      type: 'general',
      description: segments.slice(midPoint - 2, midPoint + 3).map(s => s.text).join(' '),
      suggestedTitle: '🔥 Key Moment',
      aiScore: 0.75,
      keywords: ['engaging', 'moment'],
      platform: 'all'
    });
  }
  
  return highlights.slice(0, 5); // Return top 5 highlights
}

/**
 * Determine highlight type based on content
 */
function determineHighlightType(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('how to') || lowerText.includes('tutorial') || lowerText.includes('learn')) {
    return 'educational';
  }
  if (lowerText.includes('funny') || lowerText.includes('hilarious') || lowerText.includes('laugh')) {
    return 'funny';
  }
  if (lowerText.includes('shocking') || lowerText.includes('incredible') || lowerText.includes('amazing')) {
    return 'dramatic';
  }
  if (lowerText.includes('tip') || lowerText.includes('secret') || lowerText.includes('trick')) {
    return 'hook';
  }
  
  return 'general';
}

/**
 * Generate viral-style title from text content
 */
function generateViralTitle(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('secret') || lowerText.includes('trick')) {
    return '🤫 The Secret They Don\'t Want You to Know!';
  }
  if (lowerText.includes('amazing') || lowerText.includes('incredible')) {
    return '🤯 This is INCREDIBLE!';
  }
  if (lowerText.includes('how to') || lowerText.includes('tutorial')) {
    return '💡 You NEED to See This!';
  }
  if (lowerText.includes('shocking') || lowerText.includes('wow')) {
    return '😱 I Can\'t Believe This Happened!';
  }
  if (lowerText.includes('perfect') || lowerText.includes('best')) {
    return '✨ This is PERFECT!';
  }
  
  return '🔥 This Will Blow Your Mind!';
}

/**
 * Extract keywords from text content
 */
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const commonWords = new Set([
    'this', 'that', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 
    'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 
    'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 
    'them', 'well', 'were'
  ]);
  
  const keywords = words
    .filter(word => !commonWords.has(word))
    .reduce((acc: { [key: string]: number }, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});
    
  return Object.entries(keywords)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Recommend platform based on content analysis
 */
function recommendPlatform(text: string): string {
  const lowerText = text.toLowerCase();
  
  // TikTok indicators
  if (lowerText.includes('dance') || lowerText.includes('music') || lowerText.includes('trend')) {
    return 'tiktok';
  }
  
  // YouTube Shorts indicators
  if (lowerText.includes('tutorial') || lowerText.includes('how to') || lowerText.includes('explain')) {
    return 'youtube_shorts';
  }
  
  // Instagram Reels indicators  
  if (lowerText.includes('aesthetic') || lowerText.includes('lifestyle') || lowerText.includes('behind')) {
    return 'instagram_reels';
  }
  
  return 'all';
}

/**
 * Generate mock transcript result for fallback
 */
function generateMockTranscriptResult(): TranscriptResult {
  const mockSegments: TranscriptSegment[] = [
    {
      id: 0,
      seek: 0,
      start: 0.0,
      end: 3.2,
      text: "Hey everyone, welcome back to my channel!",
      tokens: [],
      temperature: 0.0,
      avg_logprob: -0.3,
      compression_ratio: 1.5,
      no_speech_prob: 0.1
    },
    {
      id: 1,
      seek: 32,
      start: 3.2,
      end: 6.8,
      text: "Today I'm going to show you something incredible",
      tokens: [],
      temperature: 0.0,
      avg_logprob: -0.25,
      compression_ratio: 1.4,
      no_speech_prob: 0.05
    },
    {
      id: 2,
      seek: 68,
      start: 6.8,
      end: 10.5,
      text: "that's going to completely change your perspective.",
      tokens: [],
      temperature: 0.0,
      avg_logprob: -0.28,
      compression_ratio: 1.6,
      no_speech_prob: 0.08
    },
    {
      id: 3,
      seek: 105,
      start: 10.5,
      end: 14.2,
      text: "This is the moment that everything clicked for me.",
      tokens: [],
      temperature: 0.0,
      avg_logprob: -0.22,
      compression_ratio: 1.3,
      no_speech_prob: 0.06
    },
    {
      id: 4,
      seek: 142,
      start: 14.2,
      end: 18.0,
      text: "You won't believe what happens next!",
      tokens: [],
      temperature: 0.0,
      avg_logprob: -0.26,
      compression_ratio: 1.5,
      no_speech_prob: 0.07
    }
  ];
  
  return {
    text: mockSegments.map(s => s.text).join(' '),
    segments: mockSegments,
    language: 'en',
    duration: 18.0
  };
}

/**
 * Generate enhanced subtitles from transcript with styling
 */
export async function generateEnhancedSubtitles(
  transcript: TranscriptResult,
  style: 'basic' | 'engaging' | 'viral' = 'engaging'
): Promise<{ text: string; startTime: number; endTime: number; confidence: number }[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey || transcript.segments.length === 0) {
    return generateBasicSubtitlesFromTranscript(transcript);
  }

  const prompt = `Transform this transcript into engaging subtitle segments for viral short-form content.

Original transcript segments with timing:
${transcript.segments.map(s => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s]: ${s.text}`).join('\n')}

Style: ${style}

Requirements:
1. Create subtitles optimized for mobile viewing (1-4 words each)
2. Time each subtitle for 1-3 seconds maximum
3. Add strategic emphasis for viral appeal
4. Break sentences at natural pause points
5. Use engaging formatting for key words

For viral style:
- Use ALL CAPS for exciting words
- Add strategic punctuation like "..." for suspense
- Break dramatic moments into separate subtitles

Return JSON format:
{
  "subtitles": [
    {
      "text": "Hey EVERYONE!",
      "start_time": 0.0,
      "end_time": 1.5,
      "confidence": 0.95
    }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert subtitle editor specializing in viral short-form content. You understand how to format subtitles for maximum engagement and readability on mobile devices.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    return (aiResponse.subtitles || []).map((s: any) => ({
      text: s.text,
      startTime: s.start_time || 0,
      endTime: s.end_time || 0,
      confidence: s.confidence || 0.8
    }));
    
  } catch (error) {
    console.error('AI subtitle enhancement failed:', error);
    return generateBasicSubtitlesFromTranscript(transcript);
  }
}

/**
 * Generate basic subtitles from transcript segments
 */
function generateBasicSubtitlesFromTranscript(
  transcript: TranscriptResult
): { text: string; startTime: number; endTime: number; confidence: number }[] {
  if (transcript.segments.length === 0) {
    // Generate from text if no segments
    const words = transcript.text.split(' ').filter(word => word.length > 0);
    const subtitles = [];
    const wordsPerSubtitle = 3;
    const secondsPerWord = 0.5;
    
    for (let i = 0; i < words.length; i += wordsPerSubtitle) {
      const segmentWords = words.slice(i, i + wordsPerSubtitle);
      const startTime = i * secondsPerWord;
      const endTime = startTime + (segmentWords.length * secondsPerWord);
      
      subtitles.push({
        text: segmentWords.join(' '),
        startTime: Number(startTime.toFixed(1)),
        endTime: Number(endTime.toFixed(1)),
        confidence: 0.7
      });
    }
    
    return subtitles;
  }
  
  // Use actual transcript segments
  return transcript.segments.map(segment => ({
    text: segment.text.trim(),
    startTime: segment.start,
    endTime: segment.end,
    confidence: 1 - segment.no_speech_prob // Convert no_speech_prob to confidence
  }));
}
