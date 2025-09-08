import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Upload, 
  X, 
  Play, 
  FileVideo, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  Cloud,
  HardDrive
} from 'lucide-react';
import { fileStorageService } from '@/lib/file-storage';

interface FileUploadProps {
  onFilesUploaded: (files: Array<{url: string, name: string, size: number}>) => void;
  onUploadError: (error: string) => void;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
  disabled?: boolean;
}

interface UploadedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  url?: string;
  error?: string;
}

// Configuration constants for file uploads
export const MAX_FILE_SIZE_MB = 500; // 500MB max file size
export const ACCEPTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-ms-wmv',
  'video/3gpp',
  'video/x-flv'
];

const FileUpload: React.FC<FileUploadProps> = ({
  onFilesUploaded,
  onUploadError,
  maxSize = 2 * 1024 * 1024 * 1024, // 2GB default
  acceptedTypes = [".mp4", ".mov", ".avi", ".mkv", ".webm"],
  disabled = false
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = (file: File): string | null => {
    // Check file type by extension
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedTypes.includes(fileExt)) {
      return `Unsupported file format. Please upload: ${acceptedTypes.join(', ')}`;
    }

    // Check file size
    if (file.size > maxSize) {
      return `File size too large. Maximum size is ${fileStorageService.formatFileSize(maxSize)}, but your file is ${fileStorageService.formatFileSize(file.size)}`;
    }

    return null;
  };

  const generateFileId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const uploadFileWithService = async (file: File): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    // Check storage quota
    const quotaCheck = await fileStorageService.checkStorageQuota();
    if ((quotaCheck.percentage || 0) > 95) {
      throw new Error('Insufficient storage space');
    }

    const filePath = `uploads/${user.id}/${Date.now()}-${file.name}`;

    // Use chunked upload for files larger than 50MB
    if (file.size > 50 * 1024 * 1024) {
      const result = await fileStorageService.uploadFile(
        file,
        filePath,
        'video-uploads',
        { isTemporary: false }
      );

      if (!result.success) {
        throw new Error(result.error || 'Chunked upload failed');
      }

      return result.fileUrl!;
    } else {
      // Regular upload for smaller files
      const result = await fileStorageService.uploadFile(
        file,
        filePath,
        'video-uploads',
        { isTemporary: false }
      );

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      return result.fileUrl!;
    }
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (disabled || !user) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];

    // Validate all files first
    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        onUploadError(validationError);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Start upload process
    setIsUploading(true);

    const newFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      id: generateFileId(),
      status: 'pending',
      progress: 0
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    const completedFiles: Array<{url: string, name: string, size: number}> = [];

    // Upload files sequentially
    for (const uploadFile of newFiles) {
      try {
        // Update status to uploading
        setUploadedFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
        ));

        const fileUrl = await uploadFileWithService(uploadFile.file);

        // Update status to completed
        setUploadedFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'completed', progress: 100, url: fileUrl }
            : f
        ));

        completedFiles.push({
          url: fileUrl,
          name: uploadFile.file.name,
          size: uploadFile.file.size
        });

        toast({
          title: "Upload Successful",
          description: `${uploadFile.file.name} has been uploaded successfully.`,
        });

      } catch (error) {
        console.error('File upload failed:', error);
        
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        // Update status to error
        setUploadedFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error', error: errorMessage }
            : f
        ));

        onUploadError(errorMessage);
      }
    }

    // Notify parent of all completed uploads
    if (completedFiles.length > 0) {
      onFilesUploaded(completedFiles);
    }

    setIsUploading(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'uploading':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <FileVideo className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'uploading':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/5'
            : disabled
            ? 'border-muted-foreground/20 cursor-not-allowed'
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!disabled ? handleFileSelect : undefined}
      >
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="mb-4">
            {isUploading ? (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            ) : (
              <Upload className={`h-12 w-12 ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
            )}
          </div>
          
          <h3 className={`text-lg font-semibold mb-2 ${disabled ? 'text-muted-foreground/50' : ''}`}>
            {isUploading ? 'Uploading Files...' : 'Upload Video Files'}
          </h3>
          
          <p className={`text-sm mb-4 max-w-sm ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
            {disabled 
              ? 'File upload is currently disabled'
              : 'Drag and drop your video files here, or click to browse and select files'
            }
          </p>

          {!disabled && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="secondary" className="text-xs">
                  Max {fileStorageService.formatFileSize(maxSize)}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {acceptedTypes.join(', ')}
                </Badge>
              </div>

              <Button variant="outline" disabled={isUploading}>
                <HardDrive className="w-4 h-4 mr-2" />
                Choose Files
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Uploaded Files</h4>
          {uploadedFiles.map((uploadFile) => (
            <Card key={uploadFile.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(uploadFile.status)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{uploadFile.file.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatFileSize(uploadFile.file.size)}</span>
                      <span>•</span>
                      <span className={getStatusColor(uploadFile.status)}>
                        {uploadFile.status === 'pending' && 'Pending'}
                        {uploadFile.status === 'uploading' && `Uploading ${uploadFile.progress}%`}
                        {uploadFile.status === 'completed' && 'Completed'}
                        {uploadFile.status === 'error' && 'Failed'}
                      </span>
                    </div>
                    {uploadFile.error && (
                      <p className="text-xs text-red-500 mt-1">{uploadFile.error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {uploadFile.status === 'uploading' && (
                    <div className="w-24">
                      <Progress value={uploadFile.progress} className="h-2" />
                    </div>
                  )}
                  
                  {uploadFile.status === 'completed' && uploadFile.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(uploadFile.url, '_blank')}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.id)}
                    disabled={uploadFile.status === 'uploading'}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Instructions */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Cloud className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Upload Guidelines</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Supported formats: {acceptedTypes.join(', ').toUpperCase()}</p>
                <p>• Maximum file size: {fileStorageService.formatFileSize(maxSize)} per file</p>
                <p>• Files are processed in the order they're uploaded</p>
                <p>• Large files are uploaded in chunks for reliability</p>
                <p>• Processing will begin automatically after upload completes</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FileUpload;
