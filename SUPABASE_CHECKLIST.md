# Supabase Setup Checklist

Use this checklist to verify your Supabase configuration is correct.

## ✅ Step-by-Step Verification

### 1. Environment Variables

- [ ] `.env.local` file exists in project root
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set (format: `https://xxxxx.supabase.co`)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set (starts with `eyJ...`)
- [ ] `OPENAI_API_KEY` is set
- [ ] Restart dev server after adding env variables

**Test:** Run `npm run dev` - should start without errors

---

### 2. Supabase URL Configuration

Go to your Supabase project → **Authentication** → **URL Configuration**

#### Site URL
- [ ] For local: `http://localhost:3000`
- [ ] For production: `https://your-domain.webflow.io/app`

#### Redirect URLs (Add each one separately)
- [ ] `http://localhost:3000/reset-password`
- [ ] `http://localhost:3000/login`
- [ ] `http://localhost:3000/setup`
- [ ] Production URLs (if deploying):
  - [ ] `https://your-domain.webflow.io/app/reset-password`
  - [ ] `https://your-domain.webflow.io/app/login`
  - [ ] `https://your-domain.webflow.io/app/setup`

**⚠️ Important:** URLs must match EXACTLY (including `/app` prefix for production)

---

### 3. Email Provider Configuration

Go to **Authentication** → **Providers**

- [ ] **Email** provider is enabled
- [ ] **Confirm email** is toggled ON (recommended)
- [ ] **Secure email change** is toggled ON (recommended)

---

### 4. Email Templates

Go to **Authentication** → **Email Templates**

Check these templates are configured:
- [ ] **Confirm signup** - for new user invitations
- [ ] **Magic Link** - for passwordless login (optional)
- [ ] **Change Email Address** - for email changes
- [ ] **Reset Password** - for password recovery

**Recommended:** Customize the "Confirm signup" template to mention it's for Webflow employees

---

### 5. Invite a Test User

1. Go to **Authentication** → **Users**
2. Click **"Invite user"**
3. Enter your @webflow.com email
4. Click **"Send invitation"**

**Check:**
- [ ] Email received (check spam folder!)
- [ ] Email contains a clickable link
- [ ] Link format looks like: `http://localhost:3000/reset-password#access_token=...&type=invite`

---

### 6. Test the Invite Flow

Click the invite link from the email:

- [ ] Redirected to `/reset-password` page
- [ ] Page shows "Set Your Password" heading
- [ ] Can enter new password
- [ ] Can confirm password
- [ ] Click "Update Password" button
- [ ] See success message
- [ ] Automatically redirected to `/setup` page

**If you see errors:**
- Check browser console (F12 → Console)
- Look for the troubleshooting section in `SUPABASE_SETUP.md`

---

### 7. Test Login Flow

After setting password, log out and test login:

1. Visit `http://localhost:3000`
   - [ ] Redirected to `/login`

2. Enter your @webflow.com email and password
   - [ ] Can log in successfully
   - [ ] Redirected to `/setup` page

3. On `/setup` page:
   - [ ] See your email displayed at top right
   - [ ] See "Sign Out" button
   - [ ] Can enter Webflow Site ID
   - [ ] Can enter Webflow API Token
   - [ ] Click "Continue to Pages"
   - [ ] Redirected to `/pages`

4. On `/pages` page:
   - [ ] See your email at top right
   - [ ] See "Sign Out" button
   - [ ] Can see list of pages (if credentials are valid)

---

### 8. Test Sign Out

Click "Sign Out" button:
- [ ] Redirected to `/login` page
- [ ] Cannot access `/pages` without logging in
- [ ] Cannot access `/setup` without logging in

---

### 9. Test Password Reset

1. Go to `/login`
2. Click "Forgot password?"
3. Enter your email
4. Click the link

**Check:**
- [ ] Password reset email received
- [ ] Click link redirects to `/reset-password`
- [ ] Can set new password
- [ ] Redirected to `/login` after success
- [ ] Can log in with new password

---

### 10. Test @webflow.com Restriction

Try to invite a non-@webflow.com email:

1. Invite user with gmail.com or other domain
2. User sets password
3. User tries to log in
   - [ ] See error: "Access restricted to @webflow.com email addresses only"
   - [ ] User is immediately logged out

---

## 🐛 Common Issues & Quick Fixes

### Issue: "Invalid or expired link"
**Fix:** Check redirect URLs in Supabase → Authentication → URL Configuration

### Issue: Invite email not received
**Fix:** Check spam folder, verify email provider is enabled

### Issue: Can't log in after setting password
**Fix:** 
1. Check user status in Supabase dashboard (should have green dot)
2. Try password reset
3. Verify @webflow.com email restriction isn't blocking you

### Issue: Redirected to login after accessing `/pages`
**Fix:**
1. Check browser console for errors
2. Clear cookies and localStorage
3. Log in again

### Issue: "Session not found"
**Fix:**
1. Verify Site URL in Supabase matches your app URL
2. Clear browser cookies
3. Try incognito mode

---

## 📊 User Status in Supabase Dashboard

Go to **Authentication** → **Users** to check user status:

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| 🟢 Green dot | Active, confirmed | ✅ Ready to use |
| 🟡 Yellow/gray | Invited, not confirmed | Resend invite |
| 🔴 Red X | Disabled | Enable user |
| ⚪ No user | Not invited | Invite user |

---

## ✅ All Tests Passed?

If all checkboxes above are checked, your Supabase authentication is configured correctly! 🎉

**Next steps:**
1. Invite your team members
2. Deploy to Webflow Cloud
3. Update production redirect URLs in Supabase
4. Test production flow

---

## 🆘 Still Having Issues?

1. Check the detailed troubleshooting section in `SUPABASE_SETUP.md`
2. Check browser console for errors (F12 → Console)
3. Check Supabase logs: **Authentication** → **Logs**
4. Verify environment variables are loaded: `console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)`

