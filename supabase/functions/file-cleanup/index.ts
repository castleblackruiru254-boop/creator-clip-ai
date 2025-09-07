import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  bucket: string;
  uploaded_at: string;
  user_id: string;
  project_id?: string;
  status: string;
  is_temporary: boolean;
  expires_at?: string;
}

interface CleanupResult {
  success: boolean;
  cleaned: number;
  errors: number;
  totalSize: number;
  details: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { mode = 'auto' } = await req.json().catch(() => ({}));

    console.log(`Starting file cleanup with mode: ${mode}`);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let cleaned = 0;
    let errors = 0;
    let totalSize = 0;
    const details: string[] = [];

    // Find files to cleanup based on mode
    let query = supabase
      .from('file_metadata')
      .select('*')
      .neq('status', 'cleanup');

    if (mode === 'expired') {
      // Only expired files
      query = query.or(`expires_at.lt.${now.toISOString()}`);
    } else if (mode === 'temporary') {
      // Only temporary files older than 1 day
      query = query
        .eq('is_temporary', true)
        .lt('uploaded_at', oneDayAgo.toISOString());
    } else if (mode === 'old') {
      // Files older than 1 week in temp buckets
      query = query
        .eq('bucket', 'temp-files')
        .lt('uploaded_at', oneWeekAgo.toISOString());
    } else {
      // Auto mode: all cleanup criteria
      query = query.or(`
        expires_at.lt.${now.toISOString()},
        and(is_temporary.eq.true,uploaded_at.lt.${oneDayAgo.toISOString()}),
        and(bucket.eq.temp-files,uploaded_at.lt.${oneWeekAgo.toISOString()})
      `);
    }

    const { data: filesToClean, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Failed to query files for cleanup: ${queryError.message}`);
    }

    console.log(`Found ${filesToClean?.length || 0} files to clean`);

    if (!filesToClean || filesToClean.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          cleaned: 0,
          errors: 0,
          totalSize: 0,
          details: ['No files found for cleanup'],
          message: 'No files require cleanup at this time'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Process each file for cleanup
    for (const file of filesToClean) {
      try {
        details.push(`Processing file: ${file.name} (${file.bucket}/${file.id})`);

        // Mark as cleanup status first
        const { error: updateError } = await supabase
          .from('file_metadata')
          .update({ status: 'cleanup' })
          .eq('id', file.id);

        if (updateError) {
          console.error(`Failed to update status for ${file.id}:`, updateError);
          errors++;
          details.push(`Error updating status: ${updateError.message}`);
          continue;
        }

        // Delete from storage
        const { error: deleteError } = await supabase.storage
          .from(file.bucket)
          .remove([file.id]);

        if (deleteError) {
          console.error(`Failed to delete file ${file.id} from storage:`, deleteError);
          errors++;
          details.push(`Error deleting from storage: ${deleteError.message}`);
          continue;
        }

        // Remove metadata
        const { error: metadataError } = await supabase
          .from('file_metadata')
          .delete()
          .eq('id', file.id);

        if (metadataError) {
          console.error(`Failed to delete metadata for ${file.id}:`, metadataError);
          errors++;
          details.push(`Error deleting metadata: ${metadataError.message}`);
          continue;
        }

        cleaned++;
        totalSize += file.size;
        details.push(`Successfully cleaned: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      } catch (fileError) {
        console.error(`Error processing file ${file.id}:`, fileError);
        errors++;
        details.push(`Error processing file: ${fileError.message}`);
      }
    }

    // Additional cleanup for orphaned chunks (files in temp-files that don't have metadata)
    try {
      const { data: tempFiles, error: listError } = await supabase.storage
        .from('temp-files')
        .list('chunks', { limit: 1000 });

      if (!listError && tempFiles) {
        for (const tempFile of tempFiles) {
          // Check if this chunk directory has expired (older than 1 day)
          if (tempFile.updated_at) {
            const fileDate = new Date(tempFile.updated_at);
            if (fileDate < oneDayAgo) {
              const { error: chunkCleanupError } = await supabase.storage
                .from('temp-files')
                .remove([`chunks/${tempFile.name}`]);

              if (!chunkCleanupError) {
                details.push(`Cleaned orphaned chunk directory: ${tempFile.name}`);
              } else {
                details.push(`Failed to clean chunk directory: ${tempFile.name}`);
                errors++;
              }
            }
          }
        }
      }
    } catch (chunkError) {
      console.error('Error cleaning orphaned chunks:', chunkError);
      details.push(`Error cleaning orphaned chunks: ${chunkError.message}`);
      errors++;
    }

    const result: CleanupResult = {
      success: errors === 0,
      cleaned,
      errors,
      totalSize,
      details: details.slice(0, 50) // Limit details to prevent large responses
    };

    console.log(`Cleanup completed: ${cleaned} files cleaned, ${errors} errors, ${(totalSize / 1024 / 1024).toFixed(2)} MB freed`);

    return new Response(
      JSON.stringify({
        ...result,
        message: `Cleanup completed: ${cleaned} files cleaned, ${(totalSize / 1024 / 1024).toFixed(2)} MB freed`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('File cleanup error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        cleaned: 0,
        errors: 1,
        details: [`Fatal error: ${error.message}`]
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
