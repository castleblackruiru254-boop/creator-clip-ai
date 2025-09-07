import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReconstructFileRequest {
  fileName: string;
  totalChunks: number;
  originalSize: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { fileName, totalChunks, originalSize }: ReconstructFileRequest = await req.json();

    // Download all chunks
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    for (let i = 0; i < totalChunks; i++) {
      const chunkFileName = `${fileName}.part${i}`;
      
      const { data: chunkData, error: downloadError } = await supabaseClient.storage
        .from('user-videos')
        .download(chunkFileName);

      if (downloadError) {
        throw new Error(`Failed to download chunk ${i}: ${downloadError.message}`);
      }

      const chunkArrayBuffer = await chunkData.arrayBuffer();
      const chunkUint8Array = new Uint8Array(chunkArrayBuffer);
      chunks.push(chunkUint8Array);
      totalSize += chunkUint8Array.length;
    }

    // Verify total size matches original
    if (totalSize !== originalSize) {
      throw new Error(`Size mismatch: expected ${originalSize}, got ${totalSize}`);
    }

    // Reconstruct the file
    const reconstructedFile = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      reconstructedFile.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload the reconstructed file
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('user-videos')
      .upload(fileName, reconstructedFile, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload reconstructed file: ${uploadError.message}`);
    }

    // Clean up chunk files
    const cleanupPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkFileName = `${fileName}.part${i}`;
      cleanupPromises.push(
        supabaseClient.storage
          .from('user-videos')
          .remove([chunkFileName])
      );
    }

    await Promise.all(cleanupPromises);

    // Get public URL for the reconstructed file
    const { data: urlData } = supabaseClient.storage
      .from('user-videos')
      .getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: urlData.publicUrl,
        fileName,
        size: totalSize
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('File reconstruction error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'File reconstruction failed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
