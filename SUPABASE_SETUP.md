# Supabase Authentication Setup Guide

This guide will help you set up Supabase authentication for the Webflow Translation Project with **@webflow.com email restriction**.

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Project Name**: `webflow-translation` (or your choice)
   - **Database Password**: Generate a strong password (save it securely)
   - **Region**: Choose closest to your users
5. Click **"Create new project"** and wait ~2 minutes for setup

## 2. Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## 3. Configure Environment Variables

Create or update your `.env.local` file:

```bash
# OpenAI API Key (Required)
OPENAI_API_KEY=your_openai_api_key_here

# Webflow API Token (Optional - can be set via UI)
WEBFLOW_API_TOKEN=your_webflow_api_token_here

# Webflow Site ID (Optional - can be set via UI)
WEBFLOW_SITE_ID=your_webflow_site_id_here

# Base Path for Webflow Cloud deployment
NEXT_PUBLIC_BASE_PATH=/app

# Supabase Configuration (Required for Authentication)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Configure Email Settings in Supabase

### Enable Email Auth

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled
3. Click **Email** to configure:
   - ✅ Enable email provider
   - ✅ Confirm email (recommended)
   - ✅ Secure email change

### Configure Email Templates (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize these templates:
   - **Confirm signup**: Sent when new user is invited
   - **Magic Link**: For passwordless login (optional)
   - **Change Email Address**: When user changes email
   - **Reset Password**: For password recovery

Update the **Confirm signup** template to mention it's for Webflow employees:

```html
<h2>Confirm your email</h2>
<p>Welcome to the Webflow Translation Project!</p>
<p>Follow this link to confirm your @webflow.com email address:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
```

## 5. Configure URL Configuration ⚠️ IMPORTANT

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL**:
   - For local dev: `http://localhost:3000`
   - For production: `https://your-webflow-cloud-url.webflow.io/app`
3. Add **Redirect URLs** (click "Add URL" for each):
   - `http://localhost:3000/reset-password` (local dev)
   - `http://localhost:3000/login` (local dev)
   - `https://your-webflow-cloud-url.webflow.io/app/reset-password` (production)
   - `https://your-webflow-cloud-url.webflow.io/app/login` (production)

**⚠️ Critical:** Make sure the redirect URLs match exactly, including the `/app` prefix for production!

## 6. Restrict to @webflow.com Emails (Database Policy)

### Option A: Using Supabase Dashboard (Recommended)

1. Go to **Authentication** → **Policies**
2. Click **"New Policy"** on the `auth.users` table
3. Create a policy to restrict signups:

**Policy Name**: `Restrict to @webflow.com emails`

**SQL**:
```sql
CREATE OR REPLACE FUNCTION public.is_webflow_email(email text)
RETURNS boolean AS $$
BEGIN
  RETURN email LIKE '%@webflow.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Option B: Application-Level Restriction (Already Implemented)

The login page (`/src/app/login/page.tsx`) already includes this check:

```typescript
if (!data.user.email?.endsWith('@webflow.com')) {
  await supabase.auth.signOut();
  setError('Access restricted to @webflow.com email addresses only.');
  return;
}
```

## 7. Invite Users

### Method 1: Using Supabase Dashboard (Recommended)

1. Go to **Authentication** → **Users**
2. Click **"Invite user"**
3. Enter the user's **@webflow.com** email address
4. Click **"Send invitation"**
5. User will receive an email with a link to set their password

**What the user sees:**
1. Receives email: "You have been invited to join..."
2. Clicks the link in the email
3. Redirected to `/reset-password` page
4. Sets their password
5. Automatically logged in and redirected to `/setup`

**⚠️ Important:** The invite link redirects to `/reset-password`, not `/login`. This is correct! The `/reset-password` page handles both password resets AND initial password setup for new users.

### Method 2: Using Supabase API (Programmatic)

You can create a simple admin script:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
)

async function inviteUser(email: string) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email)
  
  if (error) {
    console.error('Error inviting user:', error)
  } else {
    console.log('User invited:', data)
  }
}

// Invite users
inviteUser('john.doe@webflow.com')
inviteUser('jane.smith@webflow.com')
```

## 8. Test the Authentication Flow

### Local Development

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000`

3. You should be redirected to `/login`

4. Log in with a valid @webflow.com email you invited

5. After successful login, you'll be redirected to `/setup` to enter:
   - Webflow Site ID
   - Webflow API Token

6. After entering credentials, you'll be redirected to `/pages`

**Authentication Flow:**
- `/ (root)` → redirects to `/login`
- `/login` → authenticate → redirects to `/setup`
- `/setup` → enter Webflow credentials → redirects to `/pages`
- `/pages` → translation interface (protected)

### Test Password Reset

1. Go to `/login`
2. Enter your email
3. Click **"Forgot password?"**
4. Check your email for the reset link
5. Click the link and set a new password

## 9. Deploy to Webflow Cloud

1. Make sure your environment variables are set in Webflow Cloud:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BASE_PATH=/app`

2. Update Supabase redirect URLs to include your production URL

3. Deploy your app:
   ```bash
   npm run build
   npm run preview
   ```

## 10. Security Best Practices

### ✅ DO:
- ✅ Always verify email ends with `@webflow.com` on login
- ✅ Enable email confirmation in Supabase
- ✅ Use Row Level Security (RLS) policies if storing user data
- ✅ Keep your `SUPABASE_SERVICE_ROLE_KEY` secret (never expose to client)
- ✅ Regularly review user list in Supabase dashboard
- ✅ Enable 2FA for your Supabase account

### ❌ DON'T:
- ❌ Don't expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code
- ❌ Don't allow public signups (invite-only)
- ❌ Don't store sensitive data without encryption
- ❌ Don't skip email verification

## 11. Managing Users

### View All Users
1. Go to **Authentication** → **Users**
2. See all registered users and their status

### Remove a User
1. Go to **Authentication** → **Users**
2. Click on the user
3. Click **"Delete user"**

### Disable a User
1. Go to **Authentication** → **Users**
2. Click on the user
3. Toggle **"User is disabled"**

## 12. Monitoring

### View Auth Logs
1. Go to **Authentication** → **Logs**
2. See all login attempts, signups, and errors

### Set Up Alerts (Optional)
1. Go to **Settings** → **Alerts**
2. Configure alerts for:
   - Failed login attempts
   - New user signups
   - Password resets

## Troubleshooting

### "I invited a user but they can't log in"

**Problem:** User receives invite email, clicks link, but gets redirected to login page without being able to set password.

**Solution:**
1. Check **Authentication** → **URL Configuration** in Supabase
2. Make sure `/reset-password` is in the **Redirect URLs** list
3. The invite link should redirect to `/reset-password`, NOT `/login`
4. User should see "Set Your Password" page, not login page

**Steps to verify:**
1. Go to Supabase → **Authentication** → **URL Configuration**
2. Verify these URLs are added:
   - `http://localhost:3000/reset-password` (for local)
   - `https://your-domain.com/app/reset-password` (for production)
3. Re-send the invite if needed

### "Invalid or expired link" on password setup

**Causes:**
- Invite link expired (links expire after 24 hours by default)
- Wrong redirect URL configured in Supabase
- User already used the link

**Solution:**
1. Go to **Authentication** → **Users** in Supabase
2. Find the user and click **"Send magic link"** or **"Invite user"** again
3. User will receive a new email with a fresh link
4. Make sure they click the link within 24 hours

### "Invalid login credentials"

**Causes:**
- User hasn't set their password yet (invited but didn't complete setup)
- Wrong password
- Email not confirmed (if email confirmation is enabled)

**Solution:**
1. Check if user exists: **Authentication** → **Users** in Supabase
2. Check user status:
   - ✅ Green dot = active and confirmed
   - ⚠️ Yellow/gray = invited but not confirmed
3. If user is invited but not confirmed:
   - Click on the user
   - Click **"Send magic link"** to resend invite
4. If password is wrong:
   - User can click "Forgot password?" on login page
   - They'll receive a password reset email

### "Access restricted to @webflow.com email addresses"

**This is expected behavior!**
- Only @webflow.com emails can access the app
- This message appears when someone tries to log in with a non-Webflow email
- If you need to add a non-Webflow email, you'll need to modify the code

### Email not sending

**Check these:**
1. **Spam folder** - Supabase emails often go to spam
2. **Email templates** - Go to **Authentication** → **Email Templates**
3. **SMTP settings** - Supabase uses their own SMTP by default (should work)
4. **Rate limits** - Supabase has rate limits on emails (check project quotas)

**To test email sending:**
1. Go to **Authentication** → **Users**
2. Click on a test user
3. Click **"Send magic link"**
4. Check if email arrives (check spam!)

### Redirect not working after login

**Problem:** After login, user stays on login page or gets error.

**Solution:**
1. Check browser console for errors (F12 → Console tab)
2. Verify `NEXT_PUBLIC_BASE_PATH` is set correctly in `.env.local`
3. For local dev, it should be empty or not set
4. For Webflow Cloud, it should be `/app`
5. Restart your dev server after changing env variables

### "Session not found" or "User not authenticated"

**Problem:** User logs in but immediately gets logged out.

**Causes:**
- Cookie settings issue
- Redirect URL mismatch
- Browser blocking third-party cookies

**Solution:**
1. Check **Authentication** → **URL Configuration**
2. Make sure **Site URL** matches your app URL exactly
3. Clear browser cookies and try again
4. Try in incognito/private mode
5. Check browser console for cookie errors

### User can't access `/pages` after setup

**Problem:** User enters Webflow credentials on `/setup` but gets redirected back to login.

**Causes:**
- Session expired
- Middleware not recognizing user

**Solution:**
1. Check browser console for errors
2. Try logging out and back in
3. Clear localStorage: `localStorage.clear()` in console
4. Verify middleware is running (check terminal logs)

## Need Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

