# Security Configuration Guide

This document outlines the security improvements implemented in the codebase and best practices for deployment.

## Critical Security Configurations

### 1. JWT Secrets (REQUIRED)

**All environments must configure strong JWT secrets:**

```bash
# Minimum 32 characters required
JWT_SECRET=your-strong-secret-key-at-least-32-characters
ADMIN_JWT_SECRET=your-strong-admin-secret-at-least-32-characters
```

**Validation:**
- Production: Startup will fail if secrets are missing or use default values
- Development/Staging: Warnings are displayed but startup continues

### 2. CORS Configuration

**Default behavior:**
- `CORS_ORIGINS=*` → credentials disabled (safe for public APIs)
- `CORS_ORIGINS=https://example.com` → credentials enabled (for authenticated sessions)

**Production setup:**
```bash
# Configure specific allowed origins
CORS_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

### 3. Debug Routes

**Debug routes are disabled by default.** To enable:

```bash
ENABLE_DEBUG_ROUTES=true  # Only in development
ENABLE_TEST_ROUTES=true   # Only in development
ALLOW_OPENID_AUTH=true    # Only in development
```

**Production:** Never set these to `true` in production.

### 4. Database Password

Always use strong database passwords:

```bash
DB_PASSWORD=strong-database-password
```

Production startup will fail if using default values.

## Request Validation

Schema-based validation is implemented for:
- Authentication endpoints (login)
- Order creation
- Address management

Validation ensures:
- Required fields are present
- Data types are correct
- Field constraints are met (length, pattern, etc.)

## Background Task Coordination

Task locking prevents overlapping execution:
- Commission settlement
- Auto-cancel expired orders
- Auto-confirm orders
- Refund deadline processing
- Agent order transfers

**Note:** Current implementation uses in-memory locks. For multi-instance deployments, consider using database advisory locks or Redis.

## Logging and Observability

Structured logging for:
- Authentication events (login, registration)
- Order lifecycle (creation, payment, fulfillment)
- Commission settlement
- API requests/responses
- Errors with stack traces

**Log locations:**
- Development: Console output only
- Production: Console + `logs/` directory (gitignored)

## Static File Security

Static uploads (`/uploads`) include:
- Cache-Control headers (30-day cache)
- X-Content-Type-Options: nosniff
- Proper MIME type handling

## Environment-Based Configuration

The mini program now uses centralized environment configuration:

**File:** `qianduan/config/env.js`

Change environments by modifying `CURRENT_ENV`:
```javascript
const CURRENT_ENV = process.env.NODE_ENV || 'production';
```

## Deployment Checklist

Before deploying to production:

- [ ] Set strong JWT_SECRET (≥32 chars)
- [ ] Set strong ADMIN_JWT_SECRET (≥32 chars)
- [ ] Set strong DB_PASSWORD
- [ ] Configure WECHAT_APPID and WECHAT_SECRET
- [ ] Configure CORS_ORIGINS with specific domains
- [ ] Set ENABLE_DEBUG_ROUTES=false
- [ ] Set ENABLE_TEST_ROUTES=false
- [ ] Set NODE_ENV=production
- [ ] Review and configure rate limits
- [ ] Set up log rotation for `logs/` directory
- [ ] Configure proper backup strategy for database

## Security Headers

The following security headers are automatically set:
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security (production only)

## Rate Limiting

Default rate limits:
- General API: 100 requests/minute per IP
- Login: 10 requests/minute per IP
- Withdrawal: 5 requests/minute per user

Configure via environment variables:
```bash
API_RATE_LIMIT=100
LOGIN_RATE_LIMIT=10
WITHDRAWAL_RATE_LIMIT=5
```

## Additional Security Recommendations

1. **Use HTTPS in production** - Required for secure cookie handling
2. **Regular security updates** - Keep dependencies up to date
3. **Database backups** - Implement automated backup strategy
4. **Monitor logs** - Set up log aggregation and alerting
5. **Secret rotation** - Periodically rotate JWT secrets and API keys
6. **API documentation** - Keep API docs updated for security review
7. **Penetration testing** - Conduct regular security audits

## Support

For security-related questions or to report vulnerabilities, please contact the development team.
