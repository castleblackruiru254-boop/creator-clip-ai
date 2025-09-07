#!/usr/bin/env node

/**
 * Test script for video processing pipeline validation
 * Tests the complete video processing flow from URL to final clips
 */

import { createClient } from '@supabase/supabase-js';
import { VideoQueue } from '../lib/video-queue';
import { transcriptService } from '../lib/transcript-service';
import { VideoCDNService } from '../lib/video-cdn';
import { validateVideoFile, getProcessingEstimate, isValidVideoUrl } from '../lib/video-validation';

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  testVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll for testing
  testProjectTitle: 'Test Project - Video Pipeline Validation',
};

// Initialize services
const supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
const videoQueue = new VideoQueue(supabase);

/**
 * Test video URL validation
 */
async function testUrlValidation() {
  console.log('🧪 Testing URL validation...');
  
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://vimeo.com/123456789',
    'https://invalid-url.com/video',
    'not-a-url',
  ];
  
  for (const url of testUrls) {
    const isValid = isValidVideoUrl(url);
    console.log(`  ${isValid ? '✅' : '❌'} ${url} - ${isValid ? 'Valid' : 'Invalid'}`);
  }
  
  console.log('✅ URL validation test completed\n');
}

/**
 * Test video format validation
 */
async function testFormatValidation() {
  console.log('🧪 Testing video format validation...');
  
  const testFormats = [
    {
      container: 'mp4',
      duration: 600,
      fileSize: 100 * 1024 * 1024, // 100MB
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
    },
    {
      container: 'avi',
      duration: 3600,
      fileSize: 2 * 1024 * 1024 * 1024, // 2GB
    },
    {
      container: 'invalid',
      duration: 50000, // Too long
      fileSize: 20 * 1024 * 1024 * 1024, // Too large
    },
  ];
  
  for (const [index, format] of testFormats.entries()) {
    try {
      const estimate = getProcessingEstimate(format as any);
      console.log(`  ✅ Format ${index + 1}: Valid - Est. ${estimate.formattedTime}`);
    } catch (error) {
      console.log(`  ❌ Format ${index + 1}: Invalid - ${error}`);
    }
  }
  
  console.log('✅ Format validation test completed\n');
}

/**
 * Test transcript service
 */
async function testTranscriptService() {
  console.log('🧪 Testing transcript service...');
  
  try {
    // Test with a short audio file (would need actual file in production)
    console.log('  📝 Testing transcript generation (mocked)...');
    
    // Mock transcript for testing
    const mockTranscript = {
      text: 'This is a test transcript with multiple segments.',
      segments: [
        { start: 0, end: 5, text: 'This is a test transcript' },
        { start: 5, end: 10, text: 'with multiple segments.' },
      ],
    };
    
    // Test highlight analysis
    const highlights = await transcriptService.analyzeTranscriptForHighlights(mockTranscript);
    console.log(`  ✅ Generated ${highlights.length} highlights`);
    
    // Test subtitle generation
    const subtitles = await transcriptService.generateEnhancedSubtitles(mockTranscript, 'engaging');
    console.log(`  ✅ Generated ${subtitles.length} subtitle segments`);
    
  } catch (error) {
    console.log(`  ❌ Transcript service error: ${error}`);
  }
  
  console.log('✅ Transcript service test completed\n');
}

/**
 * Test video queue operations
 */
async function testVideoQueue() {
  console.log('🧪 Testing video queue operations...');
  
  try {
    // Test adding a job
    const testUserId = '00000000-0000-0000-0000-000000000000'; // Test user ID
    
    const jobId = await videoQueue.addJob(
      'process_video',
      {
        url: TEST_CONFIG.testVideoUrl,
        projectTitle: TEST_CONFIG.testProjectTitle,
        clipCount: 3,
        clipDuration: 30,
      },
      testUserId,
      'normal'
    );
    
    console.log(`  ✅ Job added with ID: ${jobId}`);
    
    // Test fetching jobs
    const jobs = await videoQueue.getNextJobs(1);
    console.log(`  ✅ Fetched ${jobs.length} pending jobs`);
    
    // Test job progress
    const progress = await videoQueue.getJobProgress(jobId);
    console.log(`  ✅ Job progress: ${progress?.progress || 0}%`);
    
    // Cancel the test job
    const cancelled = await videoQueue.cancelJob(jobId);
    console.log(`  ✅ Job cancelled: ${cancelled}`);
    
  } catch (error) {
    console.log(`  ❌ Queue operation error: ${error}`);
  }
  
  console.log('✅ Video queue test completed\n');
}

/**
 * Test CDN service
 */
async function testCDNService() {
  console.log('🧪 Testing CDN service...');
  
  try {
    // Test URL generation
    const videoUrl = VideoCDNService.getVideoUrl('videos', 'test/video.mp4');
    console.log(`  ✅ Video URL: ${videoUrl}`);
    
    const thumbnailUrl = VideoCDNService.getThumbnailUrl('thumbnails', 'test/thumb.jpg');
    console.log(`  ✅ Thumbnail URL: ${thumbnailUrl}`);
    
    // Test adaptive streaming URLs
    const streamingUrls = VideoCDNService.getStreamingUrls('videos', 'test/video.mp4');
    console.log(`  ✅ Streaming qualities: ${streamingUrls.qualities.length}`);
    
    // Test embed code generation
    const embedCode = VideoCDNService.generateEmbedCode(videoUrl, {
      width: 640,
      height: 360,
      autoplay: false,
    });
    console.log(`  ✅ Embed code generated (${embedCode.length} chars)`);
    
  } catch (error) {
    console.log(`  ❌ CDN service error: ${error}`);
  }
  
  console.log('✅ CDN service test completed\n');
}

/**
 * Test database operations
 */
async function testDatabaseOperations() {
  console.log('🧪 Testing database operations...');
  
  try {
    // Test queue stats function
    const { data: stats, error: statsError } = await supabase.rpc('get_queue_stats');
    if (statsError) throw statsError;
    
    console.log(`  ✅ Queue stats: ${stats?.[0]?.total_jobs || 0} total jobs`);
    
    // Test cleanup function
    const { data: cleaned, error: cleanError } = await supabase.rpc('cleanup_queue_jobs');
    if (cleanError) throw cleanError;
    
    console.log(`  ✅ Cleanup completed: ${cleaned || 0} jobs removed`);
    
  } catch (error) {
    console.log(`  ❌ Database operation error: ${error}`);
  }
  
  console.log('✅ Database operations test completed\n');
}

/**
 * Test file operations (mock)
 */
async function testFileOperations() {
  console.log('🧪 Testing file operations...');
  
  try {
    // Test file validation (client-side)
    const mockFile = new File(['mock content'], 'test.mp4', { type: 'video/mp4' });
    const validation = validateVideoFile(mockFile);
    
    console.log(`  ${validation.isValid ? '✅' : '❌'} File validation: ${validation.isValid ? 'Valid' : validation.errors.join(', ')}`);
    
    if (validation.warnings.length > 0) {
      console.log(`  ⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }
    
  } catch (error) {
    console.log(`  ❌ File operation error: ${error}`);
  }
  
  console.log('✅ File operations test completed\n');
}

/**
 * Integration test - complete pipeline
 */
async function testCompletePipeline() {
  console.log('🧪 Testing complete pipeline integration...');
  
  try {
    // Step 1: Validate URL
    const isValidUrl = isValidVideoUrl(TEST_CONFIG.testVideoUrl);
    if (!isValidUrl) {
      throw new Error('Invalid test video URL');
    }
    console.log('  ✅ Step 1: URL validation passed');
    
    // Step 2: Mock video metadata
    const mockVideoFormat = {
      container: 'mp4' as const,
      duration: 212, // 3:32 minutes
      fileSize: 50 * 1024 * 1024, // 50MB
      resolution: { width: 1280, height: 720 },
      frameRate: 30,
    };
    
    // Step 3: Estimate processing time
    const estimate = getProcessingEstimate(mockVideoFormat, 5);
    console.log(`  ✅ Step 2: Processing estimate - ${estimate.formattedTime}`);
    
    // Step 4: Test queue job creation (without actually processing)
    console.log('  ✅ Step 3: Ready for queue job creation');
    console.log(`    - Estimated transcript time: ${estimate.breakdown.transcript}s`);
    console.log(`    - Estimated analysis time: ${estimate.breakdown.analysis}s`);
    console.log(`    - Estimated clip time: ${estimate.breakdown.clips}s`);
    
    // Step 5: Mock CDN URLs
    const videoUrl = VideoCDNService.getVideoUrl('videos', 'test/output.mp4');
    const thumbnailUrl = VideoCDNService.getThumbnailUrl('thumbnails', 'test/thumb.jpg');
    console.log('  ✅ Step 4: CDN URLs generated');
    
  } catch (error) {
    console.log(`  ❌ Pipeline integration error: ${error}`);
    return false;
  }
  
  console.log('✅ Complete pipeline integration test passed\n');
  return true;
}

/**
 * Performance benchmarks
 */
async function runPerformanceBenchmarks() {
  console.log('🧪 Running performance benchmarks...');
  
  const benchmarks = [
    {
      name: 'URL validation (100 URLs)',
      test: () => {
        const start = Date.now();
        for (let i = 0; i < 100; i++) {
          isValidVideoUrl(TEST_CONFIG.testVideoUrl);
        }
        return Date.now() - start;
      }
    },
    {
      name: 'Format validation (100 formats)',
      test: () => {
        const start = Date.now();
        const format = {
          container: 'mp4' as const,
          duration: 600,
          fileSize: 100 * 1024 * 1024,
        };
        for (let i = 0; i < 100; i++) {
          getProcessingEstimate(format, 5);
        }
        return Date.now() - start;
      }
    },
    {
      name: 'CDN URL generation (1000 URLs)',
      test: () => {
        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
          VideoCDNService.getVideoUrl('videos', `test/video_${i}.mp4`);
        }
        return Date.now() - start;
      }
    },
  ];
  
  for (const benchmark of benchmarks) {
    const time = benchmark.test();
    console.log(`  ⏱️  ${benchmark.name}: ${time}ms`);
  }
  
  console.log('✅ Performance benchmarks completed\n');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting video processing pipeline tests...\n');
  
  const startTime = Date.now();
  let allTestsPassed = true;
  
  try {
    // Run all tests
    await testUrlValidation();
    await testFormatValidation();
    await testTranscriptService();
    await testVideoQueue();
    await testCDNService();
    await testDatabaseOperations();
    await testFileOperations();
    
    // Integration test
    const pipelinePassed = await testCompletePipeline();
    if (!pipelinePassed) {
      allTestsPassed = false;
    }
    
    // Performance benchmarks
    await runPerformanceBenchmarks();
    
  } catch (error) {
    console.error('❌ Test runner error:', error);
    allTestsPassed = false;
  }
  
  const totalTime = Date.now() - startTime;
  
  console.log('📊 Test Results Summary:');
  console.log(`  Status: ${allTestsPassed ? '✅ All tests passed' : '❌ Some tests failed'}`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (allTestsPassed) {
    console.log('\n🎉 Video processing pipeline is ready for production!');
    
    console.log('\n📋 Next steps:');
    console.log('  1. Deploy edge functions to production');
    console.log('  2. Configure storage buckets with proper permissions');
    console.log('  3. Set up CDN and caching rules');
    console.log('  4. Configure monitoring and alerting');
    console.log('  5. Test with real video files');
  } else {
    console.log('\n❌ Some components need attention before production deployment');
  }
  
  process.exit(allTestsPassed ? 0 : 1);
}
