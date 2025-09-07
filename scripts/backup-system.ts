#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BackupConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  backupPath: string;
  retentionDays: number;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
}

interface BackupResult {
  id: string;
  timestamp: string;
  type: 'database' | 'storage' | 'full';
  status: 'success' | 'failed';
  size: number;
  path: string;
  checksum: string;
  error?: string;
}

class BackupManager {
  private config: BackupConfig;
  private supabase: any;

  constructor(config: BackupConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  async createFullBackup(): Promise<BackupResult> {
    const backupId = `full-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const backupDir = path.join(this.config.backupPath, backupId);

    console.log(`🔄 Starting full backup: ${backupId}`);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      // 1. Database backup
      console.log('📊 Backing up database...');
      const dbResult = await this.backupDatabase(backupDir);

      // 2. Storage backup
      console.log('🗄️ Backing up storage...');
      const storageResult = await this.backupStorage(backupDir);

      // 3. Configuration backup
      console.log('⚙️ Backing up configuration...');
      await this.backupConfiguration(backupDir);

      // 4. Create backup manifest
      const manifest = {
        id: backupId,
        timestamp,
        type: 'full',
        database: dbResult,
        storage: storageResult,
        configuration: true,
      };

      await fs.writeFile(
        path.join(backupDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // 5. Calculate total size and checksum
      const { size, checksum } = await this.calculateBackupMetadata(backupDir);

      // 6. Upload to remote storage if configured
      if (this.config.s3Bucket) {
        console.log('☁️ Uploading to remote storage...');
        await this.uploadToS3(backupDir, backupId);
      }

      // 7. Clean up old backups
      await this.cleanupOldBackups();

      const result: BackupResult = {
        id: backupId,
        timestamp,
        type: 'full',
        status: 'success',
        size,
        path: backupDir,
        checksum,
      };

      console.log(`✅ Full backup completed: ${backupId}`);
      console.log(`📊 Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`🔒 Checksum: ${checksum}`);

      return result;
    } catch (error) {
      console.error(`❌ Backup failed: ${error.message}`);
      
      return {
        id: backupId,
        timestamp,
        type: 'full',
        status: 'failed',
        size: 0,
        path: backupDir,
        checksum: '',
        error: error.message,
      };
    }
  }

  private async backupDatabase(backupDir: string): Promise<boolean> {
    try {
      // Export all tables to JSON
      const tables = [
        'projects',
        'clips',
        'processing_queue',
        'video_processing_progress',
        'user_preferences',
      ];

      for (const table of tables) {
        console.log(`  📋 Exporting table: ${table}`);
        
        const { data, error } = await this.supabase
          .from(table)
          .select('*');

        if (error) {
          throw new Error(`Failed to backup table ${table}: ${error.message}`);
        }

        await fs.writeFile(
          path.join(backupDir, `${table}.json`),
          JSON.stringify(data, null, 2)
        );
      }

      // Export database schema
      console.log('  🏗️ Exporting database schema...');
      const { data: schemaData } = await this.supabase.rpc('get_schema_info');
      
      await fs.writeFile(
        path.join(backupDir, 'schema.json'),
        JSON.stringify(schemaData, null, 2)
      );

      return true;
    } catch (error) {
      console.error(`Database backup failed: ${error.message}`);
      throw error;
    }
  }

  private async backupStorage(backupDir: string): Promise<boolean> {
    try {
      const storageDir = path.join(backupDir, 'storage');
      await fs.mkdir(storageDir, { recursive: true });

      // List all buckets
      const { data: buckets, error: bucketsError } = await this.supabase.storage.listBuckets();
      
      if (bucketsError) {
        throw new Error(`Failed to list buckets: ${bucketsError.message}`);
      }

      for (const bucket of buckets) {
        console.log(`  🪣 Backing up bucket: ${bucket.name}`);
        
        const bucketDir = path.join(storageDir, bucket.name);
        await fs.mkdir(bucketDir, { recursive: true });

        // List all files in bucket
        const { data: files, error: filesError } = await this.supabase.storage
          .from(bucket.name)
          .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

        if (filesError) {
          console.warn(`  ⚠️ Could not list files in bucket ${bucket.name}: ${filesError.message}`);
          continue;
        }

        // Download each file
        for (const file of files || []) {
          if (file.name) {
            try {
              const { data: fileData, error: downloadError } = await this.supabase.storage
                .from(bucket.name)
                .download(file.name);

              if (downloadError) {
                console.warn(`    ⚠️ Could not download ${file.name}: ${downloadError.message}`);
                continue;
              }

              if (fileData) {
                const buffer = await fileData.arrayBuffer();
                await fs.writeFile(
                  path.join(bucketDir, file.name),
                  Buffer.from(buffer)
                );
              }
            } catch (error) {
              console.warn(`    ⚠️ Error downloading ${file.name}: ${error.message}`);
            }
          }
        }

        // Create bucket manifest
        await fs.writeFile(
          path.join(bucketDir, '_manifest.json'),
          JSON.stringify({
            bucket: bucket.name,
            files: files?.map(f => ({
              name: f.name,
              size: f.metadata?.size,
              lastModified: f.updated_at,
            })) || [],
            backupTime: new Date().toISOString(),
          }, null, 2)
        );
      }

      return true;
    } catch (error) {
      console.error(`Storage backup failed: ${error.message}`);
      throw error;
    }
  }

  private async backupConfiguration(backupDir: string): Promise<void> {
    const configDir = path.join(backupDir, 'configuration');
    await fs.mkdir(configDir, { recursive: true });

    // Backup important configuration files
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'tailwind.config.js',
      'supabase/config.toml',
      'supabase/migrations',
      'supabase/functions',
    ];

    for (const configFile of configFiles) {
      try {
        const sourcePath = path.resolve(configFile);
        const targetPath = path.join(configDir, path.basename(configFile));
        
        const stats = await fs.stat(sourcePath);
        
        if (stats.isDirectory()) {
          // Copy directory recursively
          await this.copyDirectory(sourcePath, targetPath);
        } else {
          // Copy file
          await fs.copyFile(sourcePath, targetPath);
        }
      } catch (error) {
        console.warn(`Could not backup ${configFile}: ${error.message}`);
      }
    }
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    
    const items = await fs.readdir(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      const stats = await fs.stat(sourcePath);
      
      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  private async calculateBackupMetadata(backupDir: string): Promise<{ size: number; checksum: string }> {
    const { stdout: sizeOutput } = await execAsync(`du -sb "${backupDir}"`);
    const size = parseInt(sizeOutput.split('\t')[0]);

    const { stdout: checksumOutput } = await execAsync(`find "${backupDir}" -type f -exec sha256sum {} \\; | sort | sha256sum`);
    const checksum = checksumOutput.split(' ')[0];

    return { size, checksum };
  }

  private async uploadToS3(backupDir: string, backupId: string): Promise<void> {
    if (!this.config.s3Bucket) return;

    // Create compressed archive
    const archivePath = `${backupDir}.tar.gz`;
    await execAsync(`tar -czf "${archivePath}" -C "${path.dirname(backupDir)}" "${path.basename(backupDir)}"`);

    // Upload to S3 (using AWS CLI)
    const s3Path = `s3://${this.config.s3Bucket}/backups/${backupId}.tar.gz`;
    
    await execAsync(`aws s3 cp "${archivePath}" "${s3Path}"`, {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: this.config.s3AccessKey,
        AWS_SECRET_ACCESS_KEY: this.config.s3SecretKey,
        AWS_DEFAULT_REGION: this.config.s3Region,
      },
    });

    // Clean up local archive
    await fs.unlink(archivePath);

    console.log(`☁️ Backup uploaded to: ${s3Path}`);
  }

  private async cleanupOldBackups(): Promise<void> {
    const backupPath = this.config.backupPath;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    try {
      const entries = await fs.readdir(backupPath);
      
      for (const entry of entries) {
        const entryPath = path.join(backupPath, entry);
        const stats = await fs.stat(entryPath);
        
        if (stats.isDirectory() && stats.mtime < cutoffDate) {
          console.log(`🗑️ Removing old backup: ${entry}`);
          await fs.rm(entryPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn(`Cleanup warning: ${error.message}`);
    }
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    const backupDir = path.join(this.config.backupPath, backupId);
    
    console.log(`🔄 Starting restore from backup: ${backupId}`);

    try {
      // Verify backup exists and is valid
      const manifestPath = path.join(backupDir, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      console.log(`📋 Restore manifest:`, manifest);

      // 1. Restore database
      if (manifest.database) {
        console.log('📊 Restoring database...');
        await this.restoreDatabase(backupDir);
      }

      // 2. Restore storage
      if (manifest.storage) {
        console.log('🗄️ Restoring storage...');
        await this.restoreStorage(backupDir);
      }

      console.log(`✅ Restore completed successfully`);
    } catch (error) {
      console.error(`❌ Restore failed: ${error.message}`);
      throw error;
    }
  }

  private async restoreDatabase(backupDir: string): Promise<void> {
    const tables = [
      'projects',
      'clips', 
      'processing_queue',
      'video_processing_progress',
      'user_preferences',
    ];

    for (const table of tables) {
      const tablePath = path.join(backupDir, `${table}.json`);
      
      try {
        const tableData = JSON.parse(await fs.readFile(tablePath, 'utf-8'));
        
        // Clear existing data (be careful!)
        await this.supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        // Insert backup data
        if (tableData.length > 0) {
          const { error } = await this.supabase.from(table).insert(tableData);
          if (error) {
            throw new Error(`Failed to restore table ${table}: ${error.message}`);
          }
        }
        
        console.log(`  ✅ Restored table: ${table} (${tableData.length} records)`);
      } catch (error) {
        console.error(`  ❌ Failed to restore table ${table}: ${error.message}`);
        throw error;
      }
    }
  }

  private async restoreStorage(backupDir: string): Promise<void> {
    const storageDir = path.join(backupDir, 'storage');
    
    try {
      const buckets = await fs.readdir(storageDir);
      
      for (const bucketName of buckets) {
        const bucketPath = path.join(storageDir, bucketName);
        const manifestPath = path.join(bucketPath, '_manifest.json');
        
        if (await this.fileExists(manifestPath)) {
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
          
          console.log(`  🪣 Restoring bucket: ${bucketName}`);
          
          for (const fileInfo of manifest.files) {
            if (fileInfo.name && fileInfo.name !== '_manifest.json') {
              try {
                const filePath = path.join(bucketPath, fileInfo.name);
                const fileData = await fs.readFile(filePath);
                
                const { error } = await this.supabase.storage
                  .from(bucketName)
                  .upload(fileInfo.name, fileData, { upsert: true });
                
                if (error) {
                  console.warn(`    ⚠️ Could not restore ${fileInfo.name}: ${error.message}`);
                }
              } catch (error) {
                console.warn(`    ⚠️ Error restoring ${fileInfo.name}: ${error.message}`);
              }
            }
          }
          
          console.log(`  ✅ Restored bucket: ${bucketName} (${manifest.files.length} files)`);
        }
      }
    } catch (error) {
      console.error(`Storage restore failed: ${error.message}`);
      throw error;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listBackups(): Promise<BackupResult[]> {
    try {
      const entries = await fs.readdir(this.config.backupPath);
      const backups: BackupResult[] = [];

      for (const entry of entries) {
        const manifestPath = path.join(this.config.backupPath, entry, 'manifest.json');
        
        if (await this.fileExists(manifestPath)) {
          try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
            const stats = await fs.stat(path.join(this.config.backupPath, entry));
            
            backups.push({
              id: manifest.id,
              timestamp: manifest.timestamp,
              type: manifest.type,
              status: 'success',
              size: stats.size,
              path: path.join(this.config.backupPath, entry),
              checksum: '', // Would need to recalculate
            });
          } catch (error) {
            console.warn(`Could not read backup manifest for ${entry}: ${error.message}`);
          }
        }
      }

      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`Failed to list backups: ${error.message}`);
      return [];
    }
  }

  async verifyBackup(backupId: string): Promise<boolean> {
    const backupDir = path.join(this.config.backupPath, backupId);
    
    try {
      // Check manifest exists
      const manifestPath = path.join(backupDir, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

      // Verify database backup files
      const tables = ['projects', 'clips', 'processing_queue', 'video_processing_progress', 'user_preferences'];
      
      for (const table of tables) {
        const tablePath = path.join(backupDir, `${table}.json`);
        if (!(await this.fileExists(tablePath))) {
          throw new Error(`Missing database backup file: ${table}.json`);
        }

        // Verify JSON is valid
        JSON.parse(await fs.readFile(tablePath, 'utf-8'));
      }

      // Verify storage backup
      const storageDir = path.join(backupDir, 'storage');
      if (!(await this.fileExists(storageDir))) {
        throw new Error('Missing storage backup directory');
      }

      console.log(`✅ Backup verification passed: ${backupId}`);
      return true;
    } catch (error) {
      console.error(`❌ Backup verification failed: ${error.message}`);
      return false;
    }
  }
}

// Disaster recovery procedures
export class DisasterRecovery {
  private backupManager: BackupManager;

  constructor(config: BackupConfig) {
    this.backupManager = new BackupManager(config);
  }

  async createRecoveryPlan(): Promise<void> {
    console.log('📋 Creating disaster recovery plan...');

    const plan = {
      procedures: [
        {
          scenario: 'Database corruption',
          steps: [
            '1. Stop all processing jobs',
            '2. Create emergency backup of current state',
            '3. Restore from latest verified backup',
            '4. Verify data integrity',
            '5. Resume operations',
          ],
          estimatedDowntime: '15-30 minutes',
        },
        {
          scenario: 'Storage system failure',
          steps: [
            '1. Switch to read-only mode',
            '2. Restore storage from backup',
            '3. Verify file integrity',
            '4. Resume write operations',
          ],
          estimatedDowntime: '30-60 minutes',
        },
        {
          scenario: 'Complete system failure',
          steps: [
            '1. Provision new infrastructure',
            '2. Deploy application from container registry',
            '3. Restore database from backup',
            '4. Restore storage from backup',
            '5. Update DNS and routing',
            '6. Verify all systems operational',
          ],
          estimatedDowntime: '2-4 hours',
        },
      ],
      contacts: [
        'Primary: DevOps Engineer',
        'Secondary: System Administrator', 
        'Escalation: Technical Director',
      ],
      backupLocations: [
        'Local: /backups/viralclips',
        'Remote: S3 bucket',
        'Geographic: Multiple regions',
      ],
    };

    await fs.writeFile(
      path.join(this.backupManager['config'].backupPath, 'disaster-recovery-plan.json'),
      JSON.stringify(plan, null, 2)
    );

    console.log('✅ Disaster recovery plan created');
  }

  async testRecovery(): Promise<boolean> {
    console.log('🧪 Testing disaster recovery procedures...');

    try {
      // 1. Create test backup
      const testBackup = await this.backupManager.createFullBackup();
      
      // 2. Verify backup integrity
      const isValid = await this.backupManager.verifyBackup(testBackup.id);
      
      if (!isValid) {
        throw new Error('Backup verification failed');
      }

      // 3. Test restoration process (on test environment only)
      if (process.env.NODE_ENV === 'test') {
        console.log('🔄 Testing restore process...');
        await this.backupManager.restoreFromBackup(testBackup.id);
      }

      console.log('✅ Disaster recovery test completed successfully');
      return true;
    } catch (error) {
      console.error(`❌ Disaster recovery test failed: ${error.message}`);
      return false;
    }
  }
}

// Main execution
async function main() {
  const config: BackupConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    backupPath: process.env.BACKUP_PATH || './backups',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  };

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('❌ Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const command = process.argv[2];
  const backupManager = new BackupManager(config);
  const disasterRecovery = new DisasterRecovery(config);

  switch (command) {
    case 'backup':
      await backupManager.createFullBackup();
      break;

    case 'restore':
      const backupId = process.argv[3];
      if (!backupId) {
        console.error('❌ Backup ID required for restore');
        process.exit(1);
      }
      await backupManager.restoreFromBackup(backupId);
      break;

    case 'list':
      const backups = await backupManager.listBackups();
      console.log('📋 Available backups:');
      backups.forEach(backup => {
        console.log(`  ${backup.id} - ${backup.timestamp} (${(backup.size / 1024 / 1024).toFixed(2)} MB)`);
      });
      break;

    case 'verify':
      const verifyId = process.argv[3];
      if (!verifyId) {
        console.error('❌ Backup ID required for verification');
        process.exit(1);
      }
      const isValid = await backupManager.verifyBackup(verifyId);
      console.log(isValid ? '✅ Backup is valid' : '❌ Backup is invalid');
      break;

    case 'test-recovery':
      await disasterRecovery.testRecovery();
      break;

    case 'create-plan':
      await disasterRecovery.createRecoveryPlan();
      break;

    default:
      console.log(`
Usage: tsx scripts/backup-system.ts <command> [options]

Commands:
  backup           Create a full system backup
  restore <id>     Restore from backup
  list             List available backups
  verify <id>      Verify backup integrity
  test-recovery    Test disaster recovery procedures
  create-plan      Create disaster recovery plan

Environment Variables:
  SUPABASE_URL                 Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY    Supabase service role key
  BACKUP_PATH                  Local backup directory (default: ./backups)
  BACKUP_RETENTION_DAYS        Backup retention period (default: 30)
  BACKUP_S3_BUCKET             S3 bucket for remote backups
  BACKUP_S3_REGION             S3 region (default: us-east-1)
  AWS_ACCESS_KEY_ID            AWS access key
  AWS_SECRET_ACCESS_KEY        AWS secret key
      `);
      break;
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
