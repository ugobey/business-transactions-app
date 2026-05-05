# Google Drive Backup Setup Guide

Your Business Transactions app supports backup to your personal Google Drive using OAuth2. Follow these steps once.

## Prerequisites

- A free Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)

## Setup Steps

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown → **NEW PROJECT**
3. Name it e.g. "Business Transactions Backup" → **CREATE**
4. Select the new project from the dropdown

### Step 2: Enable Google Drive API

1. Search for **"Google Drive API"** in the search bar
2. Click **Google Drive API** → **ENABLE**

### Step 3: Create OAuth2 Credentials (Desktop App)

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted to configure the consent screen:
   - Choose **External** → **CREATE**
   - Fill in App name (e.g. "Business Transactions Backup") and your email
   - Click **SAVE AND CONTINUE** through the remaining steps → **BACK TO DASHBOARD**
4. Back on Credentials, click **+ CREATE CREDENTIALS** → **OAuth client ID** again
5. Application type: **Desktop app**
6. Name: anything (e.g. "Backup Client") → **CREATE**
7. Click **DOWNLOAD JSON** and save the file

### Step 4: Configure Your App

1. Copy the downloaded JSON file to your project root and rename it to `credentials.json`
2. Restart your app (`npm start`)

### Step 5: Authorize Google Drive

1. Open your app and click the **Backup** button in the navbar
2. Click **Connect Google Drive** — a new tab opens
3. Sign in with your Google account and click **Allow**
4. The tab will close automatically and the modal will refresh to show "✓ Google Drive connected"
5. Click **Backup Now**

Backups are saved in a folder called **BusinessTransactionsBackup** in your personal Google Drive.

---

## Security Notes

- `credentials.json` is in `.gitignore` — never commit it
- The saved token is stored at `data/google-token.json` (also excluded from git)
- To disconnect, click **Disconnect** in the Backup modal

## Automated Backups (Optional)

Schedule automatic backups using cron (Mac/Linux):
```bash
# Add to crontab -e — runs daily at 2 AM
0 2 * * * curl -s -X POST http://localhost:3000/admin/backup
```


