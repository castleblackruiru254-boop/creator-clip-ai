import { supabase } from '@/integrations/supabase/client';

export interface StorageQuota {
  used: number;
  limit: number;
  percentage: number;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  bucket: string;
  uploadedAt: string;
  userId: string;
  projectId?: string;
  status: 'uploading' | 'processing' | 'completed' | 'error' | 'cleanup';
  isTemporary: boolean;
  expiresAt?: string;
}

export interface StorageBucket {
  name: string;
  description: string;
  isPublic: boolean;
  maxFileSize: number;
  allowedTypes: string[];
  retentionDays: number;
}

class FileStorageService {
  private readonly buckets: Record<string, StorageBucket> = {
    'video-uploads': {
      name: 'video-uploads',
      description: 'User uploaded video files',
      isPublic: false,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      allowedTypes: ['video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm'],
      retentionDays: 30
    },
    'processed-clips': {
      name: 'processed-clips',
      description: 'Generated video clips',
      isPublic: true,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      allowedTypes: ['video/mp4'],
      retentionDays: 90
    },
    'thumbnails': {
      name: 'thumbnails',
      description: 'Video thumbnails',
      isPublic: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      retentionDays: 90
    },
    'temp-files': {
      name: 'temp-files',
      description: 'Temporary processing files',
      isPublic: false,
      maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
      allowedTypes: ['*'],
      retentionDays: 1
    }
  };

  /**
   * Initialize storage buckets if they don't exist
   */
  async initializeBuckets(): Promise<void> {
    try {
      for (const bucket of Object.values(this.buckets)) {
        const { error } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.isPublic,
          fileSizeLimit: bucket.maxFileSize,
          allowedMimeTypes: bucket.allowedTypes
        });

        // Ignore error if bucket already exists
        if (error && !error.message.includes('already exists')) {
          console.error(`Failed to create bucket ${bucket.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize storage buckets:', error);
    }
  }

  /**
   * Upload a file to specified bucket with metadata tracking
   */
  async uploadFile(
    file: File,
    bucketName: string,
    filePath: string,
    options: {
      projectId?: string;
      isTemporary?: boolean;
      retentionHours?: number;
    } = {}
  ): Promise<{ success: boolean; fileUrl?: string; error?: string; metadata?: FileMetadata }> {
    try {
      const bucket = this.buckets[bucketName];
      if (!bucket) {
        return { success: false, error: 'Invalid bucket name' };
      }

      // Validate file size
      if (file.size > bucket.maxFileSize) {
        return { 
          success: false, 
          error: `File size exceeds limit of ${this.formatFileSize(bucket.maxFileSize)}` 
        };
      }

      // Validate file type
      if (bucket.allowedTypes.length > 0 && !bucket.allowedTypes.includes('*')) {
        const isAllowed = bucket.allowedTypes.some(type => {
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.slice(0, -2));
          }
          return file.type === type;
        });

        if (!isAllowed) {
          return { 
            success: false, 
            error: `File type ${file.type} not allowed in ${bucketName}` 
          };
        }
      }

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        return { success: false, error: error.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      // Record file metadata
      const expiresAt = options.isTemporary && options.retentionHours
        ? new Date(Date.now() + options.retentionHours * 60 * 60 * 1000).toISOString()
        : undefined;

      const metadata: FileMetadata = {
        id: data.path,
        name: file.name,
        size: file.size,
        type: file.type,
        url: urlData.publicUrl,
        bucket: bucketName,
        uploadedAt: new Date().toISOString(),
        userId: (await supabase.auth.getUser()).data.user?.id || '',
        projectId: options.projectId,
        status: 'completed',
        isTemporary: options.isTemporary || false,
        expiresAt
      };

      // Store metadata in database
      const { error: dbError } = await supabase
        .from('file_metadata')
        .insert(metadata);

      if (dbError) {
        console.error('Failed to store file metadata:', dbError);
        // Don't fail the upload, just log the error
      }

      return { 
        success: true, 
        fileUrl: urlData.publicUrl,
        metadata 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      };
    }
  }

  /**
   * Upload file in chunks for large files
   */
  async uploadFileChunked(
    file: File,
    bucketName: string,
    filePath: string,
    chunkSize: number = 5 * 1024 * 1024, // 5MB chunks
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
    try {
      const totalChunks = Math.ceil(file.size / chunkSize);
      const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;

      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const chunkPath = `chunks/${uploadId}/${chunkIndex.toString().padStart(4, '0')}`;

        const { error } = await supabase.storage
          .from('temp-files')
          .upload(chunkPath, chunk);

        if (error) {
          // Cleanup uploaded chunks on failure
          await this.cleanupChunks(uploadId);
          return { success: false, error: `Failed to upload chunk ${chunkIndex + 1}: ${error.message}` };
        }

        // Report progress
        if (onProgress) {
          onProgress(((chunkIndex + 1) / totalChunks) * 100);
        }
      }

      // Call Edge Function to reconstruct file
      const { data, error } = await supabase.functions.invoke('reconstruct-file', {
        body: {
          uploadId,
          totalChunks,
          fileName: file.name,
          finalBucket: bucketName,
          finalPath: filePath
        }
      });

      if (error || !data.success) {
        await this.cleanupChunks(uploadId);
        return { 
          success: false, 
          error: data?.error || error?.message || 'Failed to reconstruct file' 
        };
      }

      return { 
        success: true, 
        fileUrl: data.fileUrl 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Chunked upload failed' 
      };
    }
  }

  /**
   * Get user's current storage usage
   */
  async getStorageUsage(userId: string): Promise<StorageQuota> {
    try {
      const { data, error } = await supabase
        .from('file_metadata')
        .select('size')
        .eq('user_id', userId)
        .neq('status', 'cleanup');

      if (error) {
        throw error;
      }

      const used = data.reduce((total, file) => total + file.size, 0);
      
      // Get user's storage limit based on subscription
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

      const limit = this.getStorageLimit(profile?.subscription_tier || 'free');

      return {
        used,
        limit,
        percentage: (used / limit) * 100
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return { used: 0, limit: 1024 * 1024 * 1024, percentage: 0 }; // Default 1GB
    }
  }

  /**
   * Delete a file from storage and metadata
   */
  async deleteFile(filePath: string, bucketName: string, userId: string): Promise<boolean> {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);

      if (storageError) {
        console.error('Failed to delete file from storage:', storageError);
      }

      // Delete metadata
      const { error: dbError } = await supabase
        .from('file_metadata')
        .delete()
        .eq('id', filePath)
        .eq('user_id', userId);

      if (dbError) {
        console.error('Failed to delete file metadata:', dbError);
      }

      return !storageError && !dbError;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Cleanup expired and temporary files
   */
  async cleanupExpiredFiles(): Promise<{ cleaned: number; errors: number }> {
    try {
      const now = new Date().toISOString();
      
      // Find expired files
      const { data: expiredFiles, error } = await supabase
        .from('file_metadata')
        .select('*')
        .or(`expires_at.lt.${now},and(is_temporary.eq.true,uploaded_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()})`)
        .neq('status', 'cleanup');

      if (error) {
        throw error;
      }

      let cleaned = 0;
      let errors = 0;

      for (const file of expiredFiles || []) {
        try {
          // Mark as cleanup status first
          await supabase
            .from('file_metadata')
            .update({ status: 'cleanup' })
            .eq('id', file.id);

          // Delete from storage
          const { error: deleteError } = await supabase.storage
            .from(file.bucket)
            .remove([file.id]);

          if (deleteError) {
            console.error(`Failed to delete file ${file.id}:`, deleteError);
            errors++;
            continue;
          }

          // Remove metadata
          await supabase
            .from('file_metadata')
            .delete()
            .eq('id', file.id);

          cleaned++;
        } catch (fileError) {
          console.error(`Error cleaning file ${file.id}:`, fileError);
          errors++;
        }
      }

      return { cleaned, errors };
    } catch (error) {
      console.error('Failed to cleanup expired files:', error);
      return { cleaned: 0, errors: 1 };
    }
  }

  /**
   * Cleanup chunks after failed upload
   */
  private async cleanupChunks(uploadId: string): Promise<void> {
    try {
      const { data: files } = await supabase.storage
        .from('temp-files')
        .list(`chunks/${uploadId}`);

      if (files && files.length > 0) {
        const filePaths = files.map(file => `chunks/${uploadId}/${file.name}`);
        await supabase.storage
          .from('temp-files')
          .remove(filePaths);
      }
    } catch (error) {
      console.error('Failed to cleanup chunks:', error);
    }
  }

  /**
   * Get storage limit based on subscription tier
   */
  private getStorageLimit(tier: string): number {
    switch (tier) {
      case 'pro':
        return 50 * 1024 * 1024 * 1024; // 50GB
      case 'premium':
        return 100 * 1024 * 1024 * 1024; // 100GB
      case 'enterprise':
        return 500 * 1024 * 1024 * 1024; // 500GB
      default:
        return 5 * 1024 * 1024 * 1024; // 5GB for free tier
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(fileId: string, userId: string): Promise<FileMetadata | null> {
    try {
      const { data, error } = await supabase
        .from('file_metadata')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  /**
   * List user's files with pagination
   */
  async listUserFiles(
    userId: string,
    options: {
      bucket?: string;
      projectId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ files: FileMetadata[]; total: number }> {
    try {
      let query = supabase
        .from('file_metadata')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (options.bucket) {
        query = query.eq('bucket', options.bucket);
      }

      if (options.projectId) {
        query = query.eq('project_id', options.projectId);
      }

      if (options.status) {
        query = query.eq('status', options.status);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return { files: data || [], total: count || 0 };
    } catch (error) {
      console.error('Failed to list user files:', error);
      return { files: [], total: 0 };
    }
  }

  /**
   * Move file between buckets
   */
  async moveFile(
    filePath: string,
    fromBucket: string,
    toBucket: string,
    newPath?: string
  ): Promise<{ success: boolean; newUrl?: string; error?: string }> {
    try {
      const finalPath = newPath || filePath;

      // Download file from source bucket
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(fromBucket)
        .download(filePath);

      if (downloadError) {
        return { success: false, error: downloadError.message };
      }

      // Upload to destination bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(toBucket)
        .upload(finalPath, fileData, { cacheControl: '3600' });

      if (uploadError) {
        return { success: false, error: uploadError.message };
      }

      // Get new public URL
      const { data: urlData } = supabase.storage
        .from(toBucket)
        .getPublicUrl(uploadData.path);

      // Update metadata
      await supabase
        .from('file_metadata')
        .update({
          bucket: toBucket,
          url: urlData.publicUrl,
          id: uploadData.path
        })
        .eq('id', filePath);

      // Delete from source bucket
      await supabase.storage
        .from(fromBucket)
        .remove([filePath]);

      return { 
        success: true, 
        newUrl: urlData.publicUrl 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to move file' 
      };
    }
  }

  /**
   * Check if user has sufficient storage quota
   */
  async checkStorageQuota(
    userId: string, 
    requiredSpace: number
  ): Promise<{ hasQuota: boolean; current: StorageQuota; message?: string }> {
    try {
      const quota = await this.getStorageUsage(userId);
      const hasQuota = (quota.used + requiredSpace) <= quota.limit;
      
      let message;
      if (!hasQuota) {
        const needed = this.formatFileSize(requiredSpace);
        const available = this.formatFileSize(quota.limit - quota.used);
        message = `Insufficient storage space. Need ${needed}, but only ${available} available.`;
      }

      return { hasQuota, current: quota, message };
    } catch (error) {
      console.error('Failed to check storage quota:', error);
      return { 
        hasQuota: false, 
        current: { used: 0, limit: 0, percentage: 100 },
        message: 'Failed to check storage quota'
      };
    }
  }

  /**
   * Get signed URL for temporary file access
   */
  async getSignedUrl(
    bucketName: string,
    filePath: string,
    expiresIn: number = 3600
  ): Promise<{ signedUrl?: string; error?: string }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        return { error: error.message };
      }

      return { signedUrl: data.signedUrl };
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : 'Failed to create signed URL' 
      };
    }
  }
}

// Export singleton instance
export const fileStorageService = new FileStorageService();

// Initialize buckets on module load
fileStorageService.initializeBuckets().catch(console.error);
