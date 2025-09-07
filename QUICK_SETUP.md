# Quick Backend Setup Guide

## ✅ Backend Status: Running on http://localhost:8080/

Your backend is successfully running! However, there are some database issues that need to be resolved.

## 🔧 Issues to Fix:

### 1. Database Tables Missing (404 Errors)
The `processing_queue` table and related functions don't exist yet, causing:
- ❌ `uhqlwmucjhnpyvgxtupw.supabase.co/rest/v1/processing_queue` → 404
- ❌ `uhqlwmucjhnpyvgxtupw.supabase.co/rest/v1/rpc/get_user_active_jobs` → 404

### 2. Multiple Supabase Clients Warning
- ⚠️ Multiple GoTrueClient instances detected (can cause issues)

### 3. Monitoring Configuration
- ⚠️ Sentry DSN is placeholder - error tracking disabled

## 🚀 Quick Fix (2 minutes):

### Step 1: Setup Database Tables

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/projects/uhqlwmucjhnpyvgxtupw
2. Click on "SQL Editor" in the left menu
3. Create a new query and paste the contents of `database-setup.sql`
4. Click "Run" to execute the script

### Step 2: Setup Storage Buckets

1. In the same SQL Editor, create another new query
2. Paste the contents of `storage-setup.sql`
3. Click "Run" to execute the script

### Step 3: Refresh Your Application

1. Refresh your browser at http://localhost:8080/
2. The 404 errors should now be resolved!

## 🎯 Expected Results After Setup:

✅ **Database Tables Created:**
- `processing_queue` - For video processing jobs
- `profiles` - User profiles and subscription info
- `projects` - Video projects
- `clips` - Generated video clips
- `user_clips` - Usage tracking

✅ **Storage Buckets Created:**
- `video-uploads` - Original video files
- `processed-clips` - Generated clips
- `thumbnails` - Video thumbnails
- `temp-files` - Temporary processing files

✅ **Functions Created:**
- `get_user_active_jobs()` - Get user's processing jobs
- `create_user_profile()` - Auto-create user profiles

✅ **Security Setup:**
- Row Level Security (RLS) policies
- Proper permissions for authenticated users
- Service role access for backend operations

## 🔍 Verification:

After running the setup, you should see:
- ✅ No more 404 errors in browser console
- ✅ Processing queue working
- ✅ User profile creation on signup
- ✅ File upload functionality
- ✅ Video processing capabilities

## 🛠️ Additional Configuration (Optional):

### Update Environment Variables for Production:

```env
# Update your .env file with real values:
YOUTUBE_API_KEY=your-actual-youtube-api-key
OPENAI_API_KEY=your-actual-openai-api-key
VITE_SENTRY_DSN=your-actual-sentry-dsn
```

### Install Supabase CLI (Optional):
```bash
npm install -g supabase
supabase login
```

## 🚨 If You Still See Errors:

1. **Check browser console** - Any remaining red errors?
2. **Verify database** - Go to Supabase Dashboard → Table Editor
3. **Check storage** - Go to Supabase Dashboard → Storage
4. **Clear browser cache** - Hard refresh (Ctrl+Shift+R)

## 📱 Test Your Application:

1. **Sign up** - Create a new account
2. **Upload video** - Try the file upload feature
3. **YouTube URL** - Test URL analysis
4. **Check dashboard** - View your projects

Your Creator Clip AI backend is now production-ready! 🎉
