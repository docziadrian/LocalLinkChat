# LocalLinkChat Setup Guide

This guide explains how to configure LocalLinkChat, including API keys and environment variables.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [OpenRouter AI Configuration](#openrouter-ai-configuration)
4. [Google OAuth Setup](#google-oauth-setup)
5. [Email Configuration](#email-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Create your environment file:**
   ```bash
   # Create .env file in project root
   touch .env
   ```

3. **Add minimum required configuration to `.env`:**
   ```env
   NODE_ENV=development
   SESSION_SECRET=your-random-secret-key-here
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   Open http://localhost:5000 in your browser.

---

## Environment Variables

Create a `.env` file in the project root with the following variables:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` or `production` |
| `SESSION_SECRET` | Secret key for session encryption | `your-super-secret-key` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `DATABASE_URL` | SQLite database path | `./locallinkchat.db` |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI support | - |
| `OPENROUTER_MODEL` | AI model to use | `google/gemini-2.0-flash-exp:free` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | - |

---

## OpenRouter AI Configuration

The support chat feature uses OpenRouter AI to provide intelligent responses. Here's how to set it up:

### Step 1: Get an API Key

1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign up or log in
3. Navigate to **Keys** section: https://openrouter.ai/keys
4. Click **Create Key**
5. Give your key a name (e.g., "LocalLinkChat")
6. Copy the API key (starts with `sk-or-v1-`)

### Step 2: Add to Environment

Add to your `.env` file:

```env
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
```

### Step 3: Choose a Model (Optional)

You can specify which AI model to use. Add to `.env`:

```env
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
```

#### Available Free Models

| Model | Description |
|-------|-------------|
| `google/gemini-2.0-flash-exp:free` | Default, fast and capable |
| `google/gemma-2-9b-it:free` | Google's compact model |
| `meta-llama/llama-3.3-70b-instruct:free` | Meta's large instruction-tuned model |

#### Recommended Paid Models (Better Quality)

| Model | Description | Cost |
|-------|-------------|------|
| `anthropic/claude-3-haiku` | Fast and smart | ~$0.25/1M tokens |
| `openai/gpt-4o-mini` | OpenAI's efficient model | ~$0.15/1M tokens |
| `google/gemini-flash-1.5` | Google's fast model | ~$0.075/1M tokens |

### Step 4: Verify Configuration

Restart your server and test the support chat. If configured correctly, you'll receive AI-powered responses.

**Note:** If the API key is not configured, users will receive a default fallback message.

---

## Google OAuth Setup

To enable "Continue with Google" sign-in:

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** > **Credentials**

### Step 2: Create OAuth 2.0 Client ID

1. Click **Create Credentials** > **OAuth client ID**
2. Choose **Web application**
3. Add authorized JavaScript origins:
   - `http://localhost:5000` (development)
   - Your production URL
4. Add authorized redirect URIs:
   - `http://localhost:5000` (development)
   - Your production URL

### Step 3: Configure Environment

Add to your `.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Important:** The `VITE_` prefix is required for the client ID because it's used in the frontend.

---

## Email Configuration

Magic link authentication works in development by logging links to the console. For production, configure an email service.

### Development Mode (Default)

Magic links are printed to the terminal:
```
🔗 Magic Link: http://localhost:5000/api/auth/verify?token=xxx&email=user@example.com
```

Copy and paste this link into your browser to complete authentication.

### Production Mode

Configure SMTP settings in `.env`:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

Supported email providers:
- SendGrid
- Mailgun
- Amazon SES
- Custom SMTP

---

## Troubleshooting

### Support Chat Returns Default Messages

**Cause:** OpenRouter API key not configured or invalid.

**Solution:**
1. Verify your API key is correct
2. Check the server logs for errors
3. Ensure you have credits in your OpenRouter account

### Google Sign-In Not Working

**Cause:** OAuth client ID misconfigured.

**Solution:**
1. Verify `VITE_GOOGLE_CLIENT_ID` is set correctly
2. Check authorized origins in Google Cloud Console
3. Ensure the client ID matches your domain

### Magic Links Not Arriving (Production)

**Cause:** Email service not configured.

**Solution:**
1. Configure SMTP settings in `.env`
2. Verify email service credentials
3. Check spam folders

### Database Errors

**Cause:** Database file permissions or corruption.

**Solution:**
1. Delete `locallinkchat.db` to start fresh
2. Check file permissions
3. Ensure directory is writable

---

## Example Complete `.env` File

```env
# Server
NODE_ENV=development
PORT=5000

# Security
SESSION_SECRET=generate-a-random-32-character-string

# Database
DATABASE_URL=./locallinkchat.db

# OpenRouter AI (Optional but recommended)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
SITE_URL=http://localhost:5000

# Google OAuth (Optional)
VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
```

---

## Support

For additional help:
- Open an issue on GitHub
- Check the project documentation
- Contact the development team

---

**LocalLinkChat** - Connect with local professionals who share your interests.

