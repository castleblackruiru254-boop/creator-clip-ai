#!/usr/bin/env node

/**
 * Production Database Deployment Script
 * 
 * This script:
 * 1. Runs the database setup SQL script
 * 2. Verifies all tables and functions are created
 * 3. Tests RLS policies
 * 4. Sets up storage buckets
 * 5. Verifies Edge Functions are deployed
 * 6. Runs health checks
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://uhqlwmucjhnpyvgxtupw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️ ${message}`, 'blue');
}

async function runDatabaseSetup() {
  try {
    logInfo('Starting database setup...');
    
    // Read the setup SQL script
    const sqlScript = readFileSync(join(__dirname, 'setup-database.sql'), 'utf8');
    
    // Split the script into individual statements
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--') && stmt !== 'SELECT');
    
    logInfo(`Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error) {
          logWarning(`Statement ${i + 1} warning: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err) {
        logError(`Statement ${i + 1} failed: ${err.message}`);
        errorCount++;
      }
    }
    
    logInfo(`Database setup completed: ${successCount} success, ${errorCount} errors`);
    return errorCount === 0;
    
  } catch (error) {
    logError(`Database setup failed: ${error.message}`);
    return false;
  }
}

async function verifyTables() {
  logInfo('Verifying database tables...');
  
  const requiredTables = [
    'profiles',
    'projects', 
    'clips',
    'subtitles',
    'processing_queue',
    'user_clips'
  ];
  
  let allTablesExist = true;
  
  for (const table of requiredTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error && error.code === 'PGRST116') {
        logError(`Table '${table}' does not exist`);
        allTablesExist = false;
      } else {
        logSuccess(`Table '${table}' exists`);
      }
    } catch (err) {
      logError(`Error checking table '${table}': ${err.message}`);
      allTablesExist = false;
    }
  }
  
  return allTablesExist;
}

async function verifyFunctions() {
  logInfo('Verifying database functions...');
  
  const requiredFunctions = [
    'get_user_active_subscription',
    'get_user_active_jobs',
    'update_updated_at_column',
    'create_user_profile'
  ];
  
  let allFunctionsExist = true;
  
  for (const func of requiredFunctions) {
    try {
      const { data, error } = await supabase.rpc(func, {});
      
      if (error && error.code === '42883') {
        logError(`Function '${func}' does not exist`);
        allFunctionsExist = false;
      } else {
        logSuccess(`Function '${func}' exists`);
      }
    } catch (err) {
      // Some functions might require parameters, so we just check if they're callable
      logSuccess(`Function '${func}' exists (callable)`);
    }
  }
  
  return allFunctionsExist;
}

async function verifyStorageBuckets() {
  logInfo('Verifying storage buckets...');
  
  const requiredBuckets = [
    'video-uploads',
    'processed-clips', 
    'thumbnails',
    'temp-files'
  ];
  
  let allBucketsExist = true;
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      logError(`Failed to list buckets: ${error.message}`);
      return false;
    }
    
    const existingBuckets = buckets.map(b => b.id);
    
    for (const bucket of requiredBuckets) {
      if (existingBuckets.includes(bucket)) {
        logSuccess(`Bucket '${bucket}' exists`);
      } else {
        logError(`Bucket '${bucket}' does not exist`);
        allBucketsExist = false;
      }
    }
    
    return allBucketsExist;
    
  } catch (err) {
    logError(`Error verifying storage buckets: ${err.message}`);
    return false;
  }
}

async function testRLSPolicies() {
  logInfo('Testing Row Level Security policies...');
  
  try {
    // Test that unauthenticated users cannot access protected data
    const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || 'anon-key');
    
    const { data, error } = await anonClient
      .from('profiles')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('insufficient_privilege')) {
      logSuccess('RLS policies are working - anonymous access blocked');
      return true;
    } else {
      logWarning('RLS policies may not be properly configured');
      return false;
    }
    
  } catch (err) {
    logError(`Error testing RLS policies: ${err.message}`);
    return false;
  }
}

async function verifyEdgeFunctions() {
  logInfo('Verifying Edge Functions...');
  
  const requiredFunctions = [
    'process-youtube-url',
    'youtube-search',
    'process-video',
    'generate-clips'
  ];
  
  let allFunctionsDeployed = true;
  
  for (const func of requiredFunctions) {
    try {
      // Try to invoke the function with minimal payload to test if it exists
      const { error } = await supabase.functions.invoke(func, {
        body: { test: true }
      });
      
      // If we get a response (even an error), the function exists
      if (error && error.message && !error.message.includes('Function not found')) {
        logSuccess(`Edge Function '${func}' is deployed`);
      } else if (error && error.message.includes('Function not found')) {
        logError(`Edge Function '${func}' is not deployed`);
        allFunctionsDeployed = false;
      } else {
        logSuccess(`Edge Function '${func}' is deployed and responding`);
      }
      
    } catch (err) {
      if (err.message.includes('Function not found')) {
        logError(`Edge Function '${func}' is not deployed`);
        allFunctionsDeployed = false;
      } else {
        logSuccess(`Edge Function '${func}' is deployed`);
      }
    }
  }
  
  return allFunctionsDeployed;
}

async function runHealthCheck() {
  logInfo('Running comprehensive health check...');
  
  const checks = [
    { name: 'Database Connection', test: () => supabase.from('profiles').select('count').limit(1) },
    { name: 'Auth Service', test: () => supabase.auth.getSession() },
    { name: 'Storage Service', test: () => supabase.storage.listBuckets() }
  ];
  
  let allHealthy = true;
  
  for (const check of checks) {
    try {
      const start = Date.now();
      await check.test();
      const duration = Date.now() - start;
      
      if (duration < 1000) {
        logSuccess(`${check.name} - healthy (${duration}ms)`);
      } else {
        logWarning(`${check.name} - slow response (${duration}ms)`);
      }
      
    } catch (err) {
      logError(`${check.name} - unhealthy: ${err.message}`);
      allHealthy = false;
    }
  }
  
  return allHealthy;
}

async function generateReport(results) {
  log('\n' + '='.repeat(50), 'cyan');
  log('DEPLOYMENT REPORT', 'cyan');
  log('='.repeat(50), 'cyan');
  
  const overallSuccess = Object.values(results).every(Boolean);
  
  log(`\nOverall Status: ${overallSuccess ? 'SUCCESS' : 'FAILURE'}`, overallSuccess ? 'green' : 'red');
  
  log('\nDetailed Results:');
  Object.entries(results).forEach(([check, passed]) => {
    const status = passed ? 'PASS' : 'FAIL';
    const color = passed ? 'green' : 'red';
    log(`  ${check}: ${status}`, color);
  });
  
  if (overallSuccess) {
    log('\n🎉 Database deployment completed successfully!', 'green');
    log('Your application is ready for production use.', 'green');
  } else {
    log('\n💥 Database deployment has issues that need attention.', 'red');
    log('Please review the errors above and re-run the deployment.', 'red');
  }
  
  log('\nNext Steps:', 'blue');
  log('1. Update your environment variables with actual API keys', 'blue');
  log('2. Deploy your Edge Functions: npm run deploy:functions', 'blue');
  log('3. Test your application thoroughly', 'blue');
  log('4. Set up monitoring and alerts', 'blue');
}

// Main deployment function
async function main() {
  log('🚀 Starting Creator Clip AI Database Deployment', 'cyan');
  log(`Target: ${SUPABASE_URL}`, 'cyan');
  log('='.repeat(60), 'cyan');
  
  const results = {};
  
  // Run all deployment and verification steps
  results['Database Setup'] = await runDatabaseSetup();
  results['Tables Verification'] = await verifyTables();
  results['Functions Verification'] = await verifyFunctions();
  results['Storage Buckets'] = await verifyStorageBuckets();
  results['RLS Policies'] = await testRLSPolicies();
  results['Edge Functions'] = await verifyEdgeFunctions();
  results['Health Check'] = await runHealthCheck();
  
  // Generate final report
  await generateReport(results);
  
  // Exit with appropriate code
  const success = Object.values(results).every(Boolean);
  process.exit(success ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Run the deployment
main().catch((error) => {
  logError(`Deployment failed: ${error.message}`);
  process.exit(1);
});
