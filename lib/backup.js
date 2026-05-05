const { google } = require("googleapis");
const { createReadStream, createWriteStream } = require("fs");
const path = require("path");
const fs = require("fs/promises");

const drive = google.drive("v3");
const TOKEN_PATH = path.join(__dirname, "..", "data", "google-token.json");
const TEMP_DIR_PATH = path.join(__dirname, "..", "data", "tmp");
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
    try {
        if (oAuth2Client) {
            await oAuth2Client.revokeCredentials();
        }
    } catch {
        // Ignore revoke errors.
    }

    try {
        await fs.unlink(TOKEN_PATH);
    } catch {
        // Ignore if token file does not exist.
    }

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

async function uploadFile(filePath, fileName, folderId, onProgress) {
    if (!oAuth2Client) {
        throw new Error("Not authorized. Please connect Google Drive first.");
    }

    try {
        const fileStats = await fs.stat(filePath);
        const totalBytes = Number(fileStats.size || 0);
        let uploadedBytes = 0;

        const stream = createReadStream(filePath);
        stream.on("data", (chunk) => {
            uploadedBytes += Number(chunk?.length || 0);
            if (typeof onProgress === "function" && totalBytes > 0) {
                const percent = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
                onProgress({ uploadedBytes, totalBytes, percent });
            }
        });

        const response = await drive.files.create({
            auth: oAuth2Client,
            requestBody: { name: fileName, parents: [folderId] },
            media: { body: stream },
            fields: "id, name, size",
        });

        if (typeof onProgress === "function") {
            onProgress({ uploadedBytes: totalBytes, totalBytes, percent: 100 });
        }

        return response.data;
    } catch (error) {
        throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    }
}

async function createBackupZip(transactionsPath, auditTrailPath, uploadsPath, onProgress) {
    let archiver;
    try {
        archiver = require("archiver");
    } catch {
        throw new Error("Zip support is not installed. Run: npm install archiver");
    }

    await fs.mkdir(TEMP_DIR_PATH, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const zipFileName = `backup-${timestamp}.zip`;
    const zipPath = path.join(TEMP_DIR_PATH, zipFileName);

    return new Promise(async (resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            resolve({ zipPath, zipFileName, sizeBytes: archive.pointer() });
        });

        output.on("error", (error) => {
            reject(error);
        });

        archive.on("error", (error) => {
            reject(error);
        });

        archive.on("progress", (progress) => {
            if (typeof onProgress !== "function") {
                return;
            }

            const totalBytes = Number(progress?.fs?.totalBytes || 0);
            const processedBytes = Number(progress?.fs?.processedBytes || 0);
            let percent = 0;

            if (totalBytes > 0) {
                percent = Math.min(100, Math.round((processedBytes / totalBytes) * 100));
            } else {
                const totalEntries = Number(progress?.entries?.total || 0);
                const processedEntries = Number(progress?.entries?.processed || 0);
                percent = totalEntries > 0 ? Math.min(100, Math.round((processedEntries / totalEntries) * 100)) : 0;
            }

            onProgress({ percent, processedBytes, totalBytes });
        });

        archive.pipe(output);

        if (await fileExists(transactionsPath)) {
            archive.file(transactionsPath, { name: "transactions.json" });
        }

        if (await fileExists(auditTrailPath)) {
            archive.file(auditTrailPath, { name: "audit-trail.json" });
        }

        if (await folderExists(uploadsPath)) {
            archive.directory(uploadsPath, "uploads");
        }

        await archive.finalize();
    });
}

async function deleteLocalFile(filePath) {
    try {
        await fs.unlink(filePath);
        return true;
    } catch {
        return false;
    }
}

async function backupAppData(transactionsPath, auditTrailPath, uploadsPath, onProgress) {
    if (!oAuth2Client) {
        throw new Error("Not authorized. Please connect Google Drive first.");
    }

    let zipPath = "";

    try {
        if (typeof onProgress === "function") {
            onProgress({
                stage: "zipping",
                percent: 0,
                message: "Preparing zip archive...",
            });
        }

        const zipResult = await createBackupZip(
            transactionsPath,
            auditTrailPath,
            uploadsPath,
            (zipProgress) => {
                if (typeof onProgress === "function") {
                    onProgress({
                        stage: "zipping",
                        percent: Math.min(50, Math.round((Number(zipProgress.percent || 0) / 100) * 50)),
                        message: "Zipping files...",
                    });
                }
            },
        );

        zipPath = zipResult.zipPath;

        if (typeof onProgress === "function") {
            onProgress({
                stage: "uploading",
                percent: 55,
                message: "Zip ready. Uploading to Google Drive...",
            });
        }

        const backupFolderId = await findOrCreateBackupFolder();

        const uploadResult = await uploadFile(
            zipPath,
            zipResult.zipFileName,
            backupFolderId,
            (uploadProgress) => {
                if (typeof onProgress === "function") {
                    const uploadPercent = Number(uploadProgress.percent || 0);
                    onProgress({
                        stage: "uploading",
                        percent: Math.min(95, 55 + Math.round((uploadPercent / 100) * 40)),
                        message: "Uploading zip file...",
                    });
                }
            },
        );

        if (typeof onProgress === "function") {
            onProgress({
                stage: "cleanup",
                percent: 97,
                message: "Cleaning up local temporary files...",
            });
        }

        const zipDeleted = await deleteLocalFile(zipPath);
        zipPath = "";

        const backupDate = new Date().toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        if (typeof onProgress === "function") {
            onProgress({
                stage: "completed",
                percent: 100,
                message: "Backup completed successfully.",
            });
        }

        return {
            timestamp: backupDate,
            files: [
                {
                    name: zipResult.zipFileName,
                    size: uploadResult.size,
                    id: uploadResult.id,
                    type: "zip",
                },
            ],
            zipDeleted,
        };
    } catch (error) {
        if (zipPath) {
            await deleteLocalFile(zipPath);
        }

        throw new Error(`Backup failed: ${error.message}`);
    }
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function folderExists(folderPath) {
    try {
        return (await fs.stat(folderPath)).isDirectory();
    } catch {
        return false;
    }
}

module.exports = {
    initializeAuth,
    getAuthUrl,
    exchangeCodeForToken,
    revokeAuth,
    backupAppData,
};
