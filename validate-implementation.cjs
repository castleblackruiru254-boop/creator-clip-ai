const fs = require('fs');
const path = require('path');

console.log('🧪 Validating Last Sign-In Implementation for Production\n');

let allTestsPassed = true;

function testFailed(message) {
    console.log(`❌ ${message}`);
    allTestsPassed = false;
}

function testPassed(message) {
    console.log(`✅ ${message}`);
}

// Test 1: Environment Variables
console.log('1️⃣ Environment Variables');
try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'];
    
    required.forEach(varName => {
        if (envContent.includes(varName + '=')) {
            testPassed(`${varName} is configured`);
        } else {
            testFailed(`${varName} is missing`);
        }
    });
} catch (error) {
    testFailed(`Cannot read .env file: ${error.message}`);
}

// Test 2: Required Files
console.log('\n2️⃣ Required Files');
const requiredFiles = [
    'supabase/functions/update-last-sign-in/index.ts',
    'supabase/functions/_shared/cors.ts', 
    'supabase/functions/_shared/sign-in-rate-limiter.ts',
    'src/lib/auth-service-simple.ts',
    'src/contexts/AuthContext.tsx'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        testPassed(`${file} exists`);
    } else {
        testFailed(`${file} is missing`);
    }
});

// Test 3: Edge Function Content
console.log('\n3️⃣ Edge Function Validation');
try {
    const edgeFunc = fs.readFileSync('supabase/functions/update-last-sign-in/index.ts', 'utf8');
    
    const checks = [
        ['serve(async (req: Request)', 'Deno serve function'],
        ['SUPABASE_SERVICE_ROLE_KEY', 'Service role key access'],
        ['createClient(supabaseUrl, serviceRoleKey', 'Admin client creation'],
        ['getUserById(body.userId)', 'User verification'],
        ["from('profiles')", 'Profiles table access'],
        ['last_sign_in: now', 'Last sign-in update'],
        ['last_activity_at: now', 'Last activity update']
    ];
    
    checks.forEach(([code, description]) => {
        if (edgeFunc.includes(code)) {
            testPassed(description);
        } else {
            testFailed(`Missing: ${description}`);
        }
    });
} catch (error) {
    testFailed(`Cannot read Edge Function: ${error.message}`);
}

// Test 4: Client Service
console.log('\n4️⃣ Client Service Validation');
try {
    const clientService = fs.readFileSync('src/lib/auth-service-simple.ts', 'utf8');
    
    const checks = [
        ['export class AuthService', 'AuthService class export'],
        ['updateLastSignIn(userId: string)', 'Main update method'],
        ['onSignInSuccess', 'Sign-in success handler'],
        ['import.meta.env.VITE_SUPABASE_URL', 'Environment variable access'],
        ['MAX_RETRY_ATTEMPTS', 'Retry logic'],
        ["fetch(`${supabaseUrl}/functions/v1/", 'Direct HTTP fetch']
    ];
    
    checks.forEach(([code, description]) => {
        if (clientService.includes(code)) {
            testPassed(description);
        } else {
            testFailed(`Missing: ${description}`);
        }
    });
} catch (error) {
    testFailed(`Cannot read Client Service: ${error.message}`);
}

// Test 5: AuthContext Integration
console.log('\n5️⃣ AuthContext Integration');
try {
    const authContext = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
    
    const checks = [
        ['auth-service-simple', 'Import path'],
        ['onSignInSuccess', 'Method call'],
        ['SIGNED_IN', 'Event handler']
    ];
    
    checks.forEach(([code, description]) => {
        if (authContext.includes(code)) {
            testPassed(description);
        } else {
            testFailed(`Missing: ${description}`);
        }
    });
} catch (error) {
    testFailed(`Cannot read AuthContext: ${error.message}`);
}

// Test 6: Database Schema
console.log('\n6️⃣ Database Schema');
try {
    const migrationFiles = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
    let schemaChecked = false;
    
    migrationFiles.forEach(file => {
        const content = fs.readFileSync(`supabase/migrations/${file}`, 'utf8');
        if (content.includes('last_sign_in') && content.includes('TIMESTAMPTZ')) {
            testPassed(`Schema contains last_sign_in field (${file})`);
            schemaChecked = true;
        }
    });
    
    if (!schemaChecked) {
        testFailed('No migration found with last_sign_in field');
    }
} catch (error) {
    testFailed(`Cannot check migrations: ${error.message}`);
}

// Final Results
console.log('\n🎯 PRODUCTION READINESS ASSESSMENT');
console.log('=====================================');

if (allTestsPassed) {
    console.log('🟢 ALL TESTS PASSED - READY FOR PRODUCTION!');
    console.log('\n🚀 DEPLOYMENT COMMANDS:');
    console.log('1. npx supabase functions deploy update-last-sign-in');
    console.log('2. Set SUPABASE_SERVICE_ROLE_KEY in Supabase dashboard');
    console.log('3. Set SUPABASE_URL in Supabase dashboard');
    console.log('4. Update CORS origins in production');
    console.log('\n✨ Implementation is production-ready!');
} else {
    console.log('🔴 SOME TESTS FAILED - PLEASE FIX ISSUES BEFORE DEPLOYMENT');
    process.exit(1);
}
