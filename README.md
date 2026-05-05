# Business Transactions App

A full-featured Express + EJS web app for tracking business transactions, managing receipts, reviewing audit history, and backing up/restoring data with Google Drive.

## Features

### Core transaction management
- Create transactions with:
  - Receipt number
  - Amount
  - Date
  - Purpose
  - Payer name
  - Payment method (cash, credit card, bank transfer, cheque)
  - Optional payment reference
  - Status (paid, partially paid, pending)
  - Notes
  - Optional file attachment (images and PDF)
- Edit transactions directly from the ledger
- Delete transactions with undo support
- Refund transactions with undo support
- Automatic customer ID generation and payer/customer directory helpers
- Receipt number prefix support from settings

### Attachments
- Upload and store receipt files in the uploads directory
- Allowed types include images and PDF
- File extension resolution from original filename or MIME type
- Invalid attachment type protection on upload

### Ledger UX
- Filter transactions by:
  - Receipt number
  - Date
  - Payer
  - Purpose
  - Amount
- Pagination
- Latest-first transaction sorting
- Pending/refunded visual states
- Inline editing and action controls

### Audit trail
- Dedicated admin audit page
- Detailed audit records for create/update/delete/refund/undo operations
- Undo actions from audit page for:
  - Delete
  - Refund
- Localized timestamp display in UI

### Statistics dashboard
- Totals and performance metrics:
  - Total transactions
  - Total revenue
  - Average and median transaction
  - Largest transaction
  - Unique payers
  - Top payer and top purpose
  - Refund count and total refunded
  - Current year total
  - Last 30 days revenue
  - Month-over-month change
- Breakdown tables by payment type and status
- Monthly breakdown table and chart

### Settings
- Annual total threshold
- Annual alert percentage
- Navbar app brand
- Receipt prefix
- Backup retention settings:
  - maxBackupsToKeep
  - maxBackupsToDisplay
- Persistent settings stored in data/settings.json

### Annual threshold alerts
- Configurable warning and exceed alerts
- Alert banner/modal based on current-year totals

### Localization
- English and Hebrew language support
- RTL support for Hebrew

### Google Drive backup/restore
- OAuth2 connection with Google Drive
- Backup includes:
  - data/transactions.json
  - data/audit-trail.json
  - uploads/
- Creates ZIP archives and uploads them to Google Drive
- Automatic pruning of old backups based on settings
- Restore from selectable recent backups
- Progress tracking for backup/restore jobs
- Disconnect flow to revoke auth and clear token

### Credentials fallback flow
- If credentials.json is missing, empty, invalid, or auth fails:
  - Modal shows credentials JSON textarea
  - Client-side flow prompts user to paste credentials
  - Server validates expected Google installed-client structure
  - Validation errors are shown in modal
- Backup setup help button opens a large markdown-rendered help modal sourced from BACKUP_SETUP.md

## Tech stack
- Node.js
- Express
- EJS
- Bootstrap 5
- Multer (attachments)
- Google APIs Node client
- Archiver + Unzipper (backup ZIP/restore)
- Marked (render backup setup markdown help)

## Project structure

```text
business-transactions-app/
  app.js
  package.json
  BACKUP_SETUP.md
  credentials.json                # local only, do not commit
  data/
    transactions.json
    audit-trail.json
    settings.json
    google-token.json             # created after OAuth
    tmp/                          # temporary ZIP staging
  lib/
    database.js
    backup.js
  public/
    css/
      styles.css
  uploads/
  views/
    index.ejs
    stats.ejs
    admin-audit.ejs
```

## Prerequisites
- Node.js 18+
- npm
- Google account (for backup/restore feature)

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

Development mode (auto-reload):

```bash
npm run dev
```

Default URL:
- http://localhost:3000

## Environment variables
Current required environment variables:
- PORT (optional, default: 3000)

Example .env:

```env
PORT=3000
```

## Data storage
This app uses JSON file storage (no database server required):
- data/transactions.json
- data/audit-trail.json
- data/settings.json
- uploads/ for receipt files

## Backup setup
For full Google Drive setup instructions, see:
- BACKUP_SETUP.md

You can also open Backup / Restore in the app and use the built-in Help button from the credentials section.

## Key routes

### UI routes
- GET /
- GET /stats
- GET /admin/audit

### Transaction routes
- POST /transactions
- POST /transactions/:id/update
- POST /transactions/:id/delete
- POST /transactions/:id/refund

### Undo routes
- POST /audit/:auditId/undo-delete
- POST /audit/:auditId/undo-refund
- POST /admin/audit/:auditId/undo-delete
- POST /admin/audit/:auditId/undo-refund

### Settings route
- POST /settings

### Backup/restore routes
- GET /admin/backup/status
- GET /admin/backup/credentials-status
- POST /admin/backup/credentials
- GET /admin/backup/auth
- GET /admin/backup/auth/callback
- POST /admin/backup/revoke
- POST /admin/backup
- POST /admin/backup/start
- GET /admin/backup/progress/:jobId
- GET /admin/restore/backups
- POST /admin/restore/start
- POST /admin/uploads/cleanup-if-empty

## Security notes
- Keep credentials.json local and out of git
- data/google-token.json contains OAuth token data and should remain private
- Uploaded files and backup content may include sensitive financial data
- Use HTTPS and authentication if deploying beyond localhost/private network

## Troubleshooting

### Credentials textarea appears unexpectedly
- Ensure pasted JSON follows the expected Google installed-client format
- Ensure required fields exist and redirect_uris includes http://localhost

### Backup auth failures
- The app clears invalid credentials and token state after auth errors
- Paste fresh credentials JSON and reconnect

### No backups listed
- Confirm Google Drive authorization succeeded
- Confirm backups exist in the BusinessTransactionsBackup folder
- Verify maxBackupsToDisplay in settings is greater than 0

## License
Private/internal project unless you choose to add an explicit license.
