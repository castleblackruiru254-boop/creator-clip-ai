import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  HardDrive, 
  Trash2, 
  Download, 
  RefreshCw, 
  AlertTriangle,
  FolderOpen,
  Video,
  Image,
  File
} from 'lucide-react';
import { fileStorageService, FileMetadata, StorageQuota } from '@/lib/file-storage';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface StorageManagerProps {
  onFileSelect?: (file: FileMetadata) => void;
  bucketFilter?: string;
  className?: string;
}

const StorageManager: React.FC<StorageManagerProps> = ({
  onFileSelect,
  bucketFilter,
  className = ''
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadFiles();
      loadStorageQuota();
    }
  }, [user, bucketFilter]);

  const loadFiles = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const result = await fileStorageService.listUserFiles(user.id, {
        bucket: bucketFilter,
        limit: 50
      });
      setFiles(result.files);
    } catch (error) {
      console.error('Failed to load files:', error);
      toast({
        title: 'Failed to Load Files',
        description: 'Could not load your files. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStorageQuota = async () => {
    if (!user) return;

    try {
      const quota = await fileStorageService.getStorageUsage(user.id);
      setStorageQuota(quota);
    } catch (error) {
      console.error('Failed to load storage quota:', error);
    }
  };

  const handleDeleteFile = async (file: FileMetadata) => {
    if (!user) return;

    try {
      setDeleting(file.id);
      const success = await fileStorageService.deleteFile(file.id, file.bucket, user.id);
      
      if (success) {
        setFiles(prev => prev.filter(f => f.id !== file.id));
        setSelectedFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.id);
          return newSet;
        });
        await loadStorageQuota(); // Refresh quota
        
        toast({
          title: 'File Deleted',
          description: `${file.name} has been deleted successfully.`
        });
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast({
        title: 'Delete Failed',
        description: `Failed to delete ${file.name}. Please try again.`,
        variant: 'destructive'
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!user || selectedFiles.size === 0) return;

    try {
      const filesToDelete = files.filter(f => selectedFiles.has(f.id));
      let deleted = 0;
      let failed = 0;

      for (const file of filesToDelete) {
        try {
          const success = await fileStorageService.deleteFile(file.id, file.bucket, user.id);
          if (success) {
            deleted++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      // Refresh file list and quota
      await loadFiles();
      await loadStorageQuota();
      setSelectedFiles(new Set());

      toast({
        title: 'Bulk Delete Complete',
        description: `${deleted} files deleted successfully${failed > 0 ? `, ${failed} failed` : ''}.`
      });
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast({
        title: 'Bulk Delete Failed',
        description: 'Failed to delete selected files. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      uploading: { variant: 'secondary', label: 'Uploading' },
      processing: { variant: 'default', label: 'Processing' },
      completed: { variant: 'outline', label: 'Ready' },
      error: { variant: 'destructive', label: 'Error' },
      cleanup: { variant: 'secondary', label: 'Cleaning' }
    };

    const config = variants[status] || variants.completed;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatFileSize = (bytes: number): string => {
    return fileStorageService.formatFileSize(bytes);
  };

  const getQuotaColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading files...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Storage Quota */}
      {storageQuota && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Used: {formatFileSize(storageQuota.used)}</span>
                <span>Limit: {formatFileSize(storageQuota.limit)}</span>
              </div>
              <Progress 
                value={storageQuota.percentage} 
                className={`h-2 ${getQuotaColor(storageQuota.percentage)}`}
              />
              <div className="text-xs text-muted-foreground">
                {storageQuota.percentage.toFixed(1)}% of storage used
              </div>
            </div>

            {storageQuota.percentage >= 90 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Your storage is almost full. Consider deleting unused files or upgrading your plan.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* File Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Your Files ({files.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedFiles.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedFiles.size})
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={loadFiles}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Files Found</h3>
              <p className="text-muted-foreground">
                {bucketFilter 
                  ? `No files found in ${bucketFilter} bucket.`
                  : 'Upload some files to get started!'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bulk Actions */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedFiles.size} of {files.length} selected
                </span>
              </div>

              {/* File List */}
              <div className="grid gap-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50 ${
                      selectedFiles.has(file.id) ? 'bg-primary/10 border-primary' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedFiles);
                        if (e.target.checked) {
                          newSelected.add(file.id);
                        } else {
                          newSelected.delete(file.id);
                        }
                        setSelectedFiles(newSelected);
                      }}
                      className="rounded"
                    />

                    <div className="flex items-center gap-2">
                      {getFileIcon(file.type)}
                      <div>
                        <div className="font-medium">{file.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatFileSize(file.size)} • {file.bucket}
                          {file.isTemporary && ' • Temporary'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {getStatusBadge(file.status)}
                      
                      <div className="text-xs text-muted-foreground">
                        {new Date(file.uploadedAt).toLocaleDateString()}
                      </div>

                      {file.expiresAt && (
                        <div className="text-xs text-orange-600">
                          Expires: {new Date(file.expiresAt).toLocaleDateString()}
                        </div>
                      )}

                      <div className="flex gap-1">
                        {onFileSelect && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onFileSelect(file)}
                          >
                            Select
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(file.url, '_blank')}
                        >
                          <Download className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFile(file)}
                          disabled={deleting === file.id}
                        >
                          {deleting === file.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StorageManager;
