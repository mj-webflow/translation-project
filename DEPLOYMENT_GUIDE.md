# Deployment Guide for Webflow Cloud

## Overview

This app uses Supabase for authentication. Since Webflow Cloud doesn't support environment variables at build time, we use a config file approach.

## Setup Steps

### 1. Configure Supabase Credentials

Open `src/lib/supabase-config.ts` and replace the placeholder values:

```typescript
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxx.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**Where to find these values:**
1. Go to your Supabase project: https://supabase.com
2. Click **Settings** → **API**
3. Copy:
   - **Project URL** → Replace `https://xxxxx.supabase.co`
   - **anon/public key** → Replace `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 2. Local Development

For local development, you can still use `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-...
```

The config file will use environment variables if available, otherwise fall back to hardcoded values.

### 3. Deploy to Webflow Cloud

1. **Update `supabase-config.ts`** with your production Supabase credentials
2. **Commit your changes**:
   ```bash
   git add src/lib/supabase-config.ts
   git commit -m "Configure Supabase for production"
   git push
   ```
3. **Build and deploy**:
   ```bash
   npm run build
   npm run preview  # Test locally first
   ```
4. Deploy to Webflow Cloud via their deployment process

### 4. Update Supabase Redirect URLs

After deploying, update your Supabase project:

1. Go to **Authentication** → **URL Configuration**
2. Add production redirect URLs:
   ```
   https://your-domain.webflow.io/app/login
   https://your-domain.webflow.io/app/reset-password
   https://your-domain.webflow.io/app/setup
   ```
3. Set **Site URL** to: `https://your-domain.webflow.io/app`

## Security Notes

### Is it safe to hardcode the Supabase anon key?

**Yes!** The Supabase anon key is designed to be public. It's safe to:
- ✅ Commit to git
- ✅ Expose in client-side code
- ✅ Include in your build

**Why it's safe:**
- The anon key has limited permissions (defined by Row Level Security policies)
- It can only access data that your RLS policies allow
- It cannot access admin functions or bypass security rules
- Supabase expects this key to be public (it's in every browser request)

**What you should NEVER expose:**
- ❌ `SUPABASE_SERVICE_ROLE_KEY` (admin key)
- ❌ Database password
- ❌ `OPENAI_API_KEY` (keep this server-side only)

### Additional Security

Your app already has these security layers:
1. **Email restriction**: Only @webflow.com emails can log in
2. **Invite-only**: Users must be invited via Supabase dashboard
3. **Middleware protection**: Routes are protected server-side
4. **RLS policies**: Supabase enforces row-level security

## Troubleshooting

### "Supabase configuration not set" warning

If you see this warning, it means you haven't updated `supabase-config.ts` yet:

1. Open `src/lib/supabase-config.ts`
2. Replace `YOUR_SUPABASE_URL_HERE` with your actual Supabase URL
3. Replace `YOUR_SUPABASE_ANON_KEY_HERE` with your actual anon key
4. Restart your dev server

### Environment variables not working in Webflow Cloud

This is expected! Webflow Cloud doesn't support `NEXT_PUBLIC_*` environment variables at build time. That's why we use the config file approach.

**Solution**: Hardcode the values in `supabase-config.ts` as described above.

### Different credentials for dev/staging/prod

If you need different Supabase projects for different environments:

**Option 1: Use git branches**
- `main` branch: Production credentials
- `dev` branch: Development credentials

**Option 2: Use environment detection**
```typescript
// src/lib/supabase-config.ts
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

export const SUPABASE_URL = isDev 
  ? 'https://dev-project.supabase.co'
  : 'https://prod-project.supabase.co';
```

## Deployment Checklist

- [ ] Updated `supabase-config.ts` with production credentials
- [ ] Tested locally with `npm run dev`
- [ ] Tested build with `npm run build && npm run preview`
- [ ] Updated Supabase redirect URLs for production domain
- [ ] Invited team members via Supabase dashboard
- [ ] Tested login flow on production
- [ ] Verified @webflow.com email restriction works
- [ ] Tested translation functionality

## Support

For issues or questions:
- Check `SUPABASE_SETUP.md` for detailed Supabase configuration
- Check `SUPABASE_CHECKLIST.md` for step-by-step verification
- Review Webflow Cloud docs: https://developers.webflow.com/webflow-cloud

