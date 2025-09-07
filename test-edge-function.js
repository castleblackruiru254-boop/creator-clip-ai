const testUrl = 'https://youtu.be/L_FY6aW9cJ4?si=dpdOA16oJ5zr8vn-';
const edgeFunctionUrl = 'https://uhqlwmucjhnpyvgxtupw.supabase.co/functions/v1/process-youtube-url';
const authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVocWx3bXVjamhucHl2Z3h0dXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNjcwMTMsImV4cCI6MjA3MTk0MzAxM30.D8dhFFBMs4xFyZM4x1b_gRoYB8HGmd7XPQlns4YOxkA';

async function testEdgeFunction() {
  try {
    console.log('Testing URL:', testUrl);
    console.log('Video ID extracted:', 'L_FY6aW9cJ4');
    console.log('Video ID length:', 'L_FY6aW9cJ4'.length);
    console.log('');
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        videoUrl: testUrl
      })
    });
    
    console.log('Response Status:', response.status);
    console.log('Response Status Text:', response.statusText);
    
    const responseData = await response.text();
    console.log('Raw Response:', responseData);
    
    if (response.ok) {
      try {
        const jsonData = JSON.parse(responseData);
        console.log('\n=== SUCCESS ===');
        console.log('Video Title:', jsonData.video?.title);
        console.log('Video Duration:', jsonData.video?.durationSeconds, 'seconds');
        console.log('Number of Highlights:', jsonData.highlights?.length || 0);
        console.log('Highlights:');
        jsonData.highlights?.forEach((h, i) => {
          console.log(`  ${i+1}. ${h.suggestedTitle} (${h.startTime}-${h.endTime}s)`);
        });
      } catch (parseError) {
        console.log('Response is not JSON:', responseData);
      }
    } else {
      console.log('\n=== ERROR ===');
      try {
        const errorData = JSON.parse(responseData);
        console.log('Error Message:', errorData.error);
        console.log('Error Details:', errorData.details);
      } catch (parseError) {
        console.log('Error Response (raw):', responseData);
      }
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testEdgeFunction();
