const fs = require("fs/promises");
const path = require("path");

const dataFilePath = path.join(__dirname, "..", "data", "transactions.json");
const auditFilePath = path.join(__dirname, "..", "data", "audit-trail.json");
const settingsFilePath = path.join(__dirname, "..", "data", "settings.json");

const DEFAULT_SETTINGS = {
    annualTotalThreshold: 100000,
    annualAlertPercent: 95,
};

function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidRecordArray(value) {
    return Array.isArray(value) && value.every((item) => isPlainObject(item));
}

async function readArrayJsonFile(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, "utf8");

        if (!fileContent || fileContent.trim().length === 0) {
            await fs.writeFile(filePath, "[]\n", "utf8");
            return [];
        }

        const parsed = JSON.parse(fileContent);
        if (!isValidRecordArray(parsed)) {
            await fs.writeFile(filePath, "[]\n", "utf8");
            return [];
        }

        return parsed;
    } catch (error) {
        if (error.code === "ENOENT") {
            await fs.writeFile(filePath, "[]\n", "utf8");
            return [];
        }

        await fs.writeFile(filePath, "[]\n", "utf8");
        return [];
    }
}

async function writeAuditTrail(entries) {
    await fs.writeFile(auditFilePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function readAuditTrail() {
    return readArrayJsonFile(auditFilePath);
}

function normalizeSettings(input = {}) {
    const threshold = Number(input.annualTotalThreshold);
    const alertPercent = Number(input.annualAlertPercent);

    const safeThreshold = Number.isFinite(threshold) && threshold > 0
        ? threshold
        : DEFAULT_SETTINGS.annualTotalThreshold;
    const safeAlertPercent = Number.isFinite(alertPercent) && alertPercent > 0 && alertPercent <= 100
        ? alertPercent
        : DEFAULT_SETTINGS.annualAlertPercent;

    return {
        annualTotalThreshold: safeThreshold,
        annualAlertPercent: safeAlertPercent,
    };
}

async function readAppSettings() {
    try {
        const fileContent = await fs.readFile(settingsFilePath, "utf8");
        if (!fileContent || fileContent.trim().length === 0) {
            const defaults = normalizeSettings(DEFAULT_SETTINGS);
            await fs.writeFile(settingsFilePath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
            return defaults;
        }

        const parsed = JSON.parse(fileContent);
        if (!isPlainObject(parsed)) {
            const defaults = normalizeSettings(DEFAULT_SETTINGS);
            await fs.writeFile(settingsFilePath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
            return defaults;
        }

        const normalized = normalizeSettings(parsed);

        const parsedText = JSON.stringify(parsed);
        const normalizedText = JSON.stringify(normalized);
        if (parsedText !== normalizedText) {
            await fs.writeFile(settingsFilePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
        }

        return normalized;
    } catch (error) {
        if (error.code === "ENOENT") {
            const defaults = normalizeSettings(DEFAULT_SETTINGS);
            await fs.writeFile(settingsFilePath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
            return defaults;
        }

        const defaults = normalizeSettings(DEFAULT_SETTINGS);
        await fs.writeFile(settingsFilePath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
        return defaults;
    }
}

async function updateAppSettings(input = {}) {
    const normalized = normalizeSettings(input);
    await fs.writeFile(settingsFilePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
}

async function initializeDataFiles() {
    await readTransactions();
    await readAuditTrail();
    await readAppSettings();
}

function createAuditEntry(action, payload = {}) {
    return {
        id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        action,
        payload,
        createdAt: new Date().toISOString(),
    };
}

function sortByCreatedAtDesc(items) {
    return [...items].sort((left, right) => {
        const leftTime = getRecordCreatedAtTime(left);
        const rightTime = getRecordCreatedAtTime(right);
        if (rightTime !== leftTime) {
            return rightTime - leftTime;
        }

        const leftId = String(left.id || "");
        const rightId = String(right.id || "");
        return rightId.localeCompare(leftId);
    });
}

function getRecordCreatedAtTime(record) {
    const createdAtTime = Number(new Date(record?.createdAt || 0));
    if (Number.isFinite(createdAtTime) && createdAtTime > 0) {
        return createdAtTime;
    }

    const id = String(record?.id || "");
    const idPrefix = Number.parseInt(id.split("-")[0], 10);
    if (Number.isFinite(idPrefix) && idPrefix > 0) {
        return idPrefix;
    }

    return 0;
}

async function appendAuditEntry(action, payload = {}) {
    const trail = await readAuditTrail();
    const entry = createAuditEntry(action, payload);
    trail.unshift(entry);
    await writeAuditTrail(trail);
    return entry;
}

async function readTransactions() {
    const transactions = await readArrayJsonFile(dataFilePath);
    return sortByCreatedAtDesc(transactions);
}

async function writeTransactions(transactions) {
    const sortedTransactions = sortByCreatedAtDesc(transactions || []);
    await fs.writeFile(dataFilePath, `${JSON.stringify(sortedTransactions, null, 2)}\n`, "utf8");
}

async function addTransaction(transactionInput) {
    const transactions = await readTransactions();

    const transaction = {
        id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        receiptNumber: transactionInput.receiptNumber,
        amount: Number(transactionInput.amount),
        date: transactionInput.date,
        purpose: transactionInput.purpose,
        paidBy: transactionInput.paidBy,
        createdAt: new Date().toISOString(),
    };

    transactions.unshift(transaction);
    await writeTransactions(transactions);
    await appendAuditEntry("create", {
        transactionId: transaction.id,
        after: transaction,
    });

    return transaction;
}

async function updateTransaction(id, transactionInput) {
    const transactions = await readTransactions();
    const index = transactions.findIndex((item) => item.id === id);

    if (index === -1) {
        return null;
    }

    const existing = transactions[index];
    const before = { ...existing };
    const updatedTransaction = {
        ...existing,
        receiptNumber: transactionInput.receiptNumber,
        amount: Number(transactionInput.amount),
        date: transactionInput.date,
        purpose: transactionInput.purpose,
        paidBy: transactionInput.paidBy,
    };

    transactions[index] = updatedTransaction;
    await writeTransactions(transactions);
    await appendAuditEntry("update", {
        transactionId: updatedTransaction.id,
        before,
        after: updatedTransaction,
    });

    return updatedTransaction;
}

async function deleteTransaction(id) {
    const transactions = await readTransactions();
    const index = transactions.findIndex((item) => item.id === id);

    if (index === -1) {
        return null;
    }

    const [deletedTransaction] = transactions.splice(index, 1);
    await writeTransactions(transactions);
    const auditEntry = await appendAuditEntry("delete", {
        transactionId: deletedTransaction.id,
        transaction: deletedTransaction,
    });

    return {
        transaction: deletedTransaction,
        auditEntryId: auditEntry.id,
    };
}

async function undoDeleteByAuditId(auditId) {
    const trail = await readAuditTrail();
    const entryIndex = trail.findIndex((entry) => entry.id === auditId);

    if (entryIndex === -1) {
        return { restored: false, reason: "not-found" };
    }

    const entry = trail[entryIndex];
    const deletedTransaction = entry.payload?.transaction;
    if (entry.action !== "delete" || !deletedTransaction?.id) {
        return { restored: false, reason: "invalid-entry" };
    }

    if (entry.undo?.restoredAt) {
        return { restored: false, reason: "already-undone" };
    }

    const transactions = await readTransactions();
    const alreadyExists = transactions.some((item) => item.id === deletedTransaction.id);
    if (alreadyExists) {
        return { restored: false, reason: "already-exists" };
    }

    const restoredTransactions = sortByCreatedAtDesc([...transactions, deletedTransaction]);
    await writeTransactions(restoredTransactions);

    trail[entryIndex] = {
        ...entry,
        undo: {
            restoredAt: new Date().toISOString(),
        },
    };
    await writeAuditTrail(trail);

    await appendAuditEntry("undo_delete", {
        sourceAuditId: auditId,
        transactionId: deletedTransaction.id,
    });

    return {
        restored: true,
        transaction: deletedTransaction,
    };
}

module.exports = {
    initializeDataFiles,
    readTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    readAuditTrail,
    undoDeleteByAuditId,
    readAppSettings,
    updateAppSettings,
};
