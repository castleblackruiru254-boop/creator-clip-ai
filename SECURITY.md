# Security Guide for ViralClips

This document outlines the security measures implemented in ViralClips and deployment best practices.

## 🔐 Security Features Implemented

### 1. Environment Variable Protection
- ✅ All sensitive data moved to environment variables
- ✅ No hardcoded secrets in source code
- ✅ Comprehensive `.gitignore` prevents accidental commits
- ✅ Environment validation on startup

### 2. Input Validation & Sanitization
- ✅ Zod schema validation for all user inputs
- ✅ YouTube URL format validation
- ✅ XSS protection through input sanitization
- ✅ SQL injection prevention via Supabase RLS

### 3. Rate Limiting
- ✅ Per-user rate limiting on expensive operations
- ✅ Subscription tier-based rate limit scaling
- ✅ IP-based fallback for anonymous requests
- ✅ Proper 429 responses with retry headers

### 4. Authentication & Authorization
- ✅ Supabase Auth with Row Level Security (RLS)
- ✅ JWT token validation
- ✅ Social OAuth providers (Google, GitHub)
- ✅ PKCE flow for enhanced security
- ✅ Automatic session refresh

### 5. HTTP Security Headers
- ✅ Content Security Policy (CSP)
- ✅ XSS Protection headers
- ✅ Clickjacking prevention
- ✅ Content-Type protection
- ✅ Referrer policy enforcement

## 🚀 Production Deployment Checklist

### Pre-Deployment Security Tasks

#### 1. Environment Variables Setup
```bash
# Required environment variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
YOUTUBE_API_KEY=your-youtube-api-key
OPENAI_API_KEY=your-openai-api-key
```

#### 2. Database Security Configuration
```sql
-- Enable additional security policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtitles ENABLE ROW LEVEL SECURITY;

-- Add audit logging (recommended)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  user_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. Supabase Edge Functions Security
```bash
# Set environment variables for Edge Functions
supabase secrets set YOUTUBE_API_KEY=your-key
supabase secrets set OPENAI_API_KEY=your-key
supabase secrets set RATE_LIMIT_REDIS_URL=your-redis-url
```

#### 4. CORS Configuration
Update `supabase/config.toml`:
```toml
[api]
# Production CORS settings
cors_origins = ["https://your-domain.com", "https://www.your-domain.com"]
```

### Production Environment Security

#### 1. HTTPS Enforcement
- ✅ Use HTTPS in production (enforced by Supabase)
- ✅ HSTS headers implemented
- ✅ Secure cookie settings

#### 2. API Key Management
```bash
# Use environment-specific keys
# Development
OPENAI_API_KEY=sk-dev-...
YOUTUBE_API_KEY=dev-key-...

# Production  
OPENAI_API_KEY=sk-prod-...
YOUTUBE_API_KEY=prod-key-...
```

#### 3. Database Backup & Recovery
```bash
# Regular database backups
supabase db dump > backup-$(date +%Y%m%d).sql

# Point-in-time recovery enabled in Supabase Pro
```

## 🛡️ Security Best Practices

### Input Validation Rules
1. **All user inputs** are validated using Zod schemas
2. **YouTube URLs** are validated for format and video ID
3. **Project titles/descriptions** are sanitized for XSS
4. **Search queries** are limited and sanitized
5. **File uploads** (future) will be scanned for malware

### Rate Limiting Configuration
```typescript
// Current rate limits (per user per minute)
{
  search: 50 requests,
  processVideo: 3 requests, 
  aiAnalysis: 10 requests,
  auth: 5 requests per 15 minutes,
  default: 100 requests
}

// Subscription multipliers
free: 1x
starter: 2x  
pro: 5x
enterprise: 10x
```

### Error Handling
- ✅ No sensitive information in error messages
- ✅ Standardized error responses
- ✅ Proper HTTP status codes
- ✅ Client-side error boundaries

## 🔍 Security Monitoring

### Recommended Production Monitoring
1. **Error Tracking**: Sentry integration
2. **Performance Monitoring**: Web Vitals tracking
3. **Security Scanning**: Regular dependency audits
4. **Log Analysis**: Supabase logs monitoring
5. **Rate Limit Monitoring**: Alert on abuse attempts

### Security Audit Commands
```bash
# Check for vulnerabilities
npm audit
npm audit fix

# TypeScript strict checking
npm run type-check

# Linting for security issues
npm run lint

# Test build
npm run build
```

## 🚨 Incident Response

### If Security Issue Detected
1. **Immediate**: Disable affected functionality
2. **Rotate**: All API keys and secrets
3. **Patch**: Fix the vulnerability
4. **Deploy**: Updated version immediately
5. **Notify**: Users if data potentially affected

### Emergency Contacts
- Database: Supabase support
- CDN: Hosting provider support
- Security: Security team lead

## 📋 Security Compliance

### Data Privacy
- ✅ GDPR compliant data handling
- ✅ User data deletion capabilities
- ✅ Privacy policy implementation
- ✅ Cookie consent management

### Content Security
- ✅ Content moderation for uploaded videos
- ✅ Copyright respect mechanisms
- ✅ Terms of service enforcement
- ✅ Abuse reporting system

## 🔧 Development Security

### Development Environment
```bash
# Use separate API keys for development
OPENAI_API_KEY=sk-dev-...
YOUTUBE_API_KEY=dev-key-...

# Local Supabase instance
supabase start
supabase db reset
```

### Code Security Practices
- ✅ Regular dependency updates
- ✅ TypeScript strict mode (to be enabled)
- ✅ ESLint security rules
- ✅ No console.log in production builds
- ✅ Minification and obfuscation

---

## 🔄 Regular Security Maintenance

### Monthly Tasks
- [ ] Update all dependencies
- [ ] Rotate API keys
- [ ] Review access logs
- [ ] Update rate limits if needed
- [ ] Security penetration testing

### Quarterly Tasks  
- [ ] Full security audit
- [ ] Backup testing
- [ ] Disaster recovery testing
- [ ] Performance security review
- [ ] Third-party security assessments

This security implementation follows industry best practices and provides a solid foundation for production deployment.
