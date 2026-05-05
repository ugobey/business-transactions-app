const { google } = require("googleapis");
const { createReadStream } = require("fs");
const path = require("path");
const fs = require("fs/promises");

const drive = google.drive("v3");
const TOKEN_PATH = path.join(__dirname, "..", "data", "google-token.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let oAuth2Client = null;

async function loadOAuth2Client(credentialsPath) {
    const content = await fs.readFile(credentialsPath, "utf8");
    const credentials = JSON.parse(content);
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function initializeAuth(credentialsPath) {
    try {
        oAuth2Client = await loadOAuth2Client(credentialsPath);
        const tokenContent = await fs.readFile(TOKEN_PATH, "utf8");
        const token = JSON.parse(tokenContent);
        oAuth2Client.setCredentials(token);
        if (token.expiry_date && token.expiry_date < Date.now()) {
            const { credentials } = await oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(credentials);
            await saveToken(credentials);
        }
        return true;
    } catch {
        return false;
    }
}

async function getAuthUrl(credentialsPath, redirectUri) {
    const content = await fs.readFile(credentialsPath, "utf8");
    const credentials = JSON.parse(content);
    const { client_id, client_secret } = credentials.installed || credentials.web;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
    return oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
    });
}

async function exchangeCodeForToken(code) {
    if (!oAuth2Client) {
        throw new Error("OAuth2 client not initialized. Call getAuthUrl() first.");
    }
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await saveToken(tokens);
}

async function saveToken(token) {
    await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
}

async function revokeAuth() {
    try { if (oAuth2Client) await oAuth2Client.revokeCredentials(); } catch { }
    try { await fs.unlink(TOKEN_PATH); } catch { }
    oAuth2Client = null;
}

async function findOrCreateBackupFolder() {
    if (!oAuth2Client) throw new Error("Not authorized. Please connect Google Drive first.");
    try {
        const response = await drive.files.list({
            auth: oAuth2Client,
            q: "name='BusinessTransactionsBackup' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces: "drive",
            pageSize: 1,
            fields: "files(id, name)",
        });
        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }
        const createResponse = await drive.files.create({
            auth: oAuth2Client,
            requestBody: { name: "BusinessTransactionsBackup", mimeType: "application/vnd.google-apps.folder" },
            fields: "id",
        });
        return createResponse.data.id;
    } catch (error) {
        throw new Error(`Failed to find/create backup folder: ${error.message}`);
    }
}

async function uploadFile(filePath, fileName, folderId) {
    if (!oAuth2Client) throw new Error("Not authorized. Please connect Google Drive first.");
    try {
        const response = await drive.files.create({
            auth: oAuth2Client,
            requestBody: { name: fileName, parents: [folderId] },
            media: { body: createReadStream(filePath) },
            fields: "id, name, size",
        });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    }
}

async function uploadFolder(folderPath, parentFolderId, folderName) {
    if (!oAuth2Client) throw new Error("Not authorized. Please connect Google Drive first.");
    const baseName = folderName || path.basename(folderPath);
    try {
        const folderResponse = await drive.files.create({
            auth: oAuth2Client,
            requestBody: { name: baseName, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] },
            fields: "id",
        });
        const driveFolderId = folderResponse.data.id;
        const files = await fs.readdir(folderPath);
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile()) await uploadFile(filePath, file, driveFolderId);
        }
        return driveFolderId;
    } catch (error) {
        throw new Error(`Failed to upload folder: ${error.message}`);
    }
}

async function backupAppData(transactionsPath, auditTrailPath, uploadsPath) {
    if (!oAuth2Client) throw new Error("Not authorized. Please connect Google Drive first.");
    try {
        const backupFolderId = await findOrCreateBackupFolder();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const backupDate = new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const backupFolderResponse = await drive.files.create({
            auth: oAuth2Client,
            requestBody: { name: `Backup-${timestamp}`, mimeType: "application/vnd.google-apps.folder", parents: [backupFolderId] },
            fields: "id",
        });
        const backupSubFolderId = backupFolderResponse.data.id;
        const results = { timestamp: backupDate, files: [] };
        if (await fileExists(transactionsPath)) {
            const r = await uploadFile(transactionsPath, "transactions.json", backupSubFolderId);
            results.files.push({ name: "transactions.json", size: r.size, id: r.id });
        }
        if (await fileExists(auditTrailPath)) {
            const r = await uploadFile(auditTrailPath, "audit-trail.json", backupSubFolderId);
            results.files.push({ name: "audit-trail.json", size: r.size, id: r.id });
        }
        if (await folderExists(uploadsPath)) {
            await uploadFolder(uploadsPath, backupSubFolderId, "uploads");
            results.files.push({ name: "uploads/", type: "folder" });
        }
        return results;
    } catch (error) {
        throw new Error(`Backup failed: ${error.message}`);
    }
}

async function fileExists(filePath) {
    try { await fs.access(filePath); return true; } catch { return false; }
}

async function folderExists(folderPath) {
    try { return (await fs.stat(folderPath)).isDirectory(); } catch { return false; }
}

module.exports = { initializeAuth, getAuthUrl, exchangeCodeForToken, revokeAuth, backupAppData };
