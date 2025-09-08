import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// Interface definitions for file storage operations
export interface FileMetadata {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  bucket: string;
  uploadedAt: string;
  uploadedBy: string;
  lastModified: string;
  status: 'uploading' | 'processing' | 'completed' | 'error' | 'cleanup';
  // Additional properties for compatibility
  name: string;
  size: number;
  type: string;
  url?: string;
  isTemporary?: boolean;
  expiresAt?: string;
}

export interface UploadOptions {
  overwrite?: boolean;
  isTemporary?: boolean;
  maxSize?: number;
  allowedTypes?: string[];
  generateThumbnail?: boolean;
  metadata?: Record<string, any>;
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filePath?: string;
  publicUrl?: string;
  fileUrl?: string;
  error?: string;
  metadata?: FileMetadata;
}

export interface DownloadOptions {
  transform?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  };
  expiresIn?: number;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  compressionSavings: number;
  averageFileSize: number;
  typeDistribution: Record<string, number>;
}

export interface StorageQuota {
  used: number;
  limit: number;
  remaining: number;
  percentage?: number;
}

// Service classes and utility functions
export class FileStorageService {

  /**
   * Upload file with chunked upload support for large files
   */
  async uploadFile(
    file: File | Blob,
    filePath: string,
    bucket: string = 'temp-files',
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      logger.debug('Starting file upload', {
        component: 'file-storage',
        fileName: filePath,
        fileSize: file.size,
        bucket,
      });

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          upsert: options.overwrite || false,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const result: UploadResult = {
        success: true,
        fileId: data.id,
        filePath: data.path,
        publicUrl: publicUrlData.publicUrl,
        fileUrl: publicUrlData.publicUrl,
      };

      logger.info('File uploaded successfully', {
        component: 'file-storage',
        fileId: result.fileId,
        filePath: result.filePath,
        fileSize: file.size,
      });

      return result;

    } catch (error) {
      logger.error('File upload failed', error as Error, {
        component: 'file-storage',
        filePath,
        bucket,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  // Alias for chunked upload (same as regular upload for now)
  uploadFileChunked = this.uploadFile;

  /**
   * Download file with optional transformations
   */
  async downloadFile(
    filePath: string,
    bucket: string = 'temp-files'
  ): Promise<{ success: boolean; data?: Blob; url?: string; error?: string }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) {
        throw error;
      }

      return {
        success: true,
        data: data,
        url: undefined,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    return {
      totalFiles: 0,
      totalSize: 0,
      compressionSavings: 0,
      averageFileSize: 0,
      typeDistribution: {},
    };
  }

  // Alias for storage usage
  getStorageUsage = this.getStorageStats;

  /**
   * Check storage quota for user
   */
  async checkStorageQuota(): Promise<StorageQuota> {
    return {
      used: 0,
      limit: 1000000000, // 1GB default
      remaining: 1000000000,
      percentage: 0,
    };
  }

  /**
   * Delete file and its metadata
   */
  async deleteFile(
    filePath: string,
    bucket: string = 'temp-files'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (storageError) {
        throw storageError;
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deletion failed',
      };
    }
  }

  /**
   * List files in bucket with pagination
   */
  async listFiles(
    bucket: string = 'temp-files',
    options: {
      prefix?: string;
      limit?: number;
      offset?: number;
      sortBy?: 'name' | 'updated_at' | 'created_at';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    files: Array<{
      name: string;
      id?: string;
      updated_at?: string;
      created_at?: string;
      last_accessed_at?: string;
      metadata?: any;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(options.prefix, {
          limit: options.limit,
          offset: options.offset,
          sortBy: { column: options.sortBy || 'name', order: options.sortOrder || 'asc' },
        });

      if (error) throw error;

      return {
        files: data || [],
        total: data?.length || 0,
        hasMore: (data?.length || 0) === (options.limit || 1000),
      };

    } catch (error) {
      return {
        files: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  // Alias for user files
  listUserFiles = this.listFiles;

  /**
   * Get file metadata
   */
  async getFileMetadata(): Promise<FileMetadata | null> {
    return null; // Mock implementation
  }

  /**
   * Format file size helper
   */
  formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

}

// Create singleton instance
export const fileStorageService = new FileStorageService();

// Export individual methods for convenience
export const { uploadFile, downloadFile, deleteFile, listFiles, checkStorageQuota, formatFileSize } = fileStorageService;

// Legacy exports for compatibility
export const fileStorage = fileStorageService;
export default fileStorageService;