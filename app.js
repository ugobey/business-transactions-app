const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const multer = require("multer");
const {
    initializeDataFiles,
    readTransactions,
    readAppSettings,
    updateAppSettings,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    refundTransactionById,
    readAuditTrail,
    undoDeleteByAuditId,
    undoRefundByAuditId,
} = require("./lib/database");
require("dotenv").config();
const { backupAppData, initializeAuth, getAuthUrl, exchangeCodeForToken, revokeAuth, listBackupFiles, restoreAppData } = require("./lib/backup");

const app = express();
const port = process.env.PORT || 3000;
const PAGE_SIZE = 50;
const uploadDirPath = path.join(__dirname, "uploads");
const PAYMENT_METHODS = new Set(["credit_card", "cash", "bank_transfer", "cheque"]);
const STATUSES = new Set(["paid", "partially_paid", "refunded", "pending"]);
const ALLOWED_ATTACHMENT_MIME_PATTERN = /^(image\/[a-z0-9.+-]+|application\/pdf)$/i;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".avif",
    ".pdf",
]);
const MIME_EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
    "image/tiff": ".tif",
    "image/heif": ".heif",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
};

async function clearUploadDirectoryContents(directoryPath = uploadDirPath) {
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        await Promise.all(entries.map(async (entry) => {
            const entryPath = path.join(directoryPath, entry.name);

            if (entry.isDirectory()) {
                await fs.rm(entryPath, { recursive: true, force: true });
                return;
            }

            await fs.unlink(entryPath);
        }));
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return;
        }

        throw withFunctionError("clearUploadDirectoryContents", error);
    }
}

async function clearUploadsWhenNoTransactionsExist() {
    try {
        const transactions = await readTransactions();
        if (transactions.length > 0) {
            return false;
        }

        await clearUploadDirectoryContents(uploadDirPath);
        return true;
    } catch (error) {
        throw withFunctionError("clearUploadsWhenNoTransactionsExist", error);
    }
}

function resolveUploadExtension(file = {}) {
    try {
        const originalExtension = String(path.extname(String(file.originalname || "")) || "").toLowerCase();
        if (/^\.[a-z0-9]{1,10}$/i.test(originalExtension)) {
            return originalExtension;
        }

        const mimeType = String(file.mimetype || "").toLowerCase();
        return MIME_EXTENSION_MAP[mimeType] || "";
    } catch (error) {
        throw withFunctionError("resolveUploadExtension", error);
    }
}

function isAllowedAttachmentFile(file = {}) {
    try {
        const mimeType = String(file.mimetype || "").toLowerCase();
        if (ALLOWED_ATTACHMENT_MIME_PATTERN.test(mimeType)) {
            return true;
        }

        const originalExtension = String(path.extname(String(file.originalname || "")) || "").toLowerCase();
        return ALLOWED_ATTACHMENT_EXTENSIONS.has(originalExtension);
    } catch (error) {
        throw withFunctionError("isAllowedAttachmentFile", error);
    }
}

const uploadStorage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadDirPath);
    },
    filename: (_req, file, callback) => {
        try {
            const extension = resolveUploadExtension(file);
            const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 1000000000)}`;
            callback(null, `${uniqueName}${extension}`);
        } catch (error) {
            callback(error);
        }
    },
});

const upload = multer({
    storage: uploadStorage,
    fileFilter: (req, file, callback) => {
        try {
            if (isAllowedAttachmentFile(file)) {
                callback(null, true);
                return;
            }

            req.fileValidationError = "invalid-attachment-type";
            callback(null, false);
        } catch (error) {
            callback(error);
        }
    },
});

fs.mkdir(uploadDirPath, { recursive: true }).catch((error) => {
    console.error(withFunctionError("createUploadsDirectory", error));
});

initializeDataFiles()
    .then(() => clearUploadsWhenNoTransactionsExist())
    .catch((error) => {
        console.error(withFunctionError("initializeUploadsCleanup", error));
    });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/vendor/bootstrap", express.static(path.join(__dirname, "node_modules", "bootstrap", "dist")));
app.use("/uploads", express.static(uploadDirPath));
app.use(express.static(path.join(__dirname, "public")));

const TRANSLATIONS = {
    en: {
        appTitle: "Avital Farhang's Business Transactions",
        subtitle: "Track every payment with clarity, speed, and confidence.",
        totalRevenue: "Total Revenue",
        recordedTransactionSingular: "recorded transaction",
        recordedTransactionPlural: "recorded transactions",
        newTransaction: "New Transaction",
        captureIncoming: "Capture incoming payments and keep your books current.",
        receiptNumber: "Receipt Number",
        amountPaid: "Amount Paid",
        date: "Date",
        whatItWasFor: "What Was It For?",
        whoPaid: "Who Paid?",
        saveTransaction: "Save Transaction",
        transactionLedger: "Transaction Ledger",
        latestFirst: "Latest first",
        noTransactionsYet: "No transactions yet",
        savedPaymentsAppear: "Your saved payments will appear here.",
        paidBy: "Paid By",
        purpose: "Purpose",
        amount: "Amount",
        update: "Update",
        delete: "Delete",
        refund: "Refund",
        cancel: "Cancel",
        deleteConfirmTitle: "Delete Transaction",
        deleteConfirmBody: "This action will permanently remove the transaction unless you undo it.",
        confirmDelete: "Yes, Delete",
        undo: "Undo",
        auditTrail: "Audit Trail",
        backToLedger: "Back to Ledger",
        auditTrailTitle: "Transaction Audit Trail",
        action: "Action",
        transactionId: "Transaction ID",
        timestamp: "Timestamp",
        details: "Details",
        noAuditEntries: "No audit entries yet.",
        undoFromAudit: "Undo Delete",
        undoRefundFromAudit: "Undo Refund",
        undoUnavailable: "Undo unavailable",
        settings: "Settings",
        stats: "Stats",
        statsTitle: "Business Statistics",
        statsSubtitle: "A quick snapshot of your transaction performance.",
        totalTransactionsStat: "Total Transactions",
        averageTransaction: "Average Transaction",
        medianTransaction: "Median Transaction",
        largestTransaction: "Largest Transaction",
        uniquePayers: "Unique Payers",
        topPayer: "Top Payer",
        topPurpose: "Top Purpose",
        annualTotalCurrentYear: "Current Year Total",
        recent30DaysRevenue: "Revenue (Last 30 Days)",
        monthlyBreakdown: "Monthly Breakdown",
        paymentTypeBreakdown: "Payment Type Breakdown",
        statusBreakdown: "Status Breakdown",
        paymentType: "Payment Type",
        paymentTypeCash: "Cash",
        paymentTypeCreditCard: "Credit Card",
        paymentTypeBankTransfer: "Bank Transfer",
        paymentTypeCheque: "Cheque",
        refundTransactionsStat: "Refund Transactions",
        totalRefunded: "Total Refunded",
        month: "Month",
        transactionCount: "Transaction Count",
        totalAmount: "Total Amount",
        changeVsPreviousMonth: "Change vs Previous Month",
        noStatsData: "No transaction data available yet.",
        unknownLabel: "Unknown",
        annualThreshold: "Annual Total Threshold",
        alertPercentThreshold: "Alert Percent Threshold",
        saveSettings: "Save Settings",
        appBrand: "Navbar Brand",
        receiptPrefix: "Receipt Prefix",
        receiptPrefixHelp: "Optional prefix automatically added to every receipt number.",
        successSettingsSaved: "Settings saved successfully.",
        invalidSettings: "Please provide a valid annual threshold and an alert percent between 1 and 100.",
        annualAlertTitle: "Annual Threshold Alert",
        annualAlertNearMessage: "You have reached {percent}% of your annual threshold ({total} out of {threshold}).",
        annualAlertExceededMessage: "You exceeded your annual threshold ({total} out of {threshold}).",
        previous: "Previous",
        next: "Next",
        page: "Page",
        of: "of",
        apply: "Apply",
        clear: "Clear",
        filter: "Filter",
        all: "All",
        language: "Language",
        english: "English",
        hebrew: "עברית",
        successSaved: "Transaction saved successfully.",
        successUpdated: "Transaction updated successfully.",
        successDeleted: "Transaction deleted successfully.",
        successUndoDeleted: "Deleted transaction restored successfully.",
        successRefunded: "Transaction refunded successfully.",
        successUndoRefunded: "Refund undo completed successfully.",
        errorTitle: "Error",
        close: "Close",
        unexpectedError: "Something went wrong. Please try again.",
        validationError: "Please provide a receipt number, valid amount, date (today or earlier), purpose, and payer name.",
        updateNotFound: "Could not find that transaction to update.",
        deleteNotFound: "Could not find that transaction to delete.",
        refundNotAvailable: "Could not refund that transaction.",
        undoDeleteNotAvailable: "This delete action cannot be undone.",
        undoDeleteDuplicateReceipt: "Cannot undo delete because a transaction with the same receipt number already exists.",
        undoRefundNotAvailable: "This refund action cannot be undone.",
        undoRefundDuplicateReceipt: "Cannot undo refund because a transaction with the same receipt number already exists.",
        refundUndoBody: "This transaction was marked as refunded. You can undo this action.",
        requiredField: "This field is required.",
        noResultsFound: "No results found",
        noResultsDescription: "No transactions match the applied filters.",
        duplicateReceiptNumber: "Receipt number already exists. Please use a unique receipt number.",
        paymentMethod: "Payment Method",
        paymentReference: "Payment Reference",
        customerId: "Customer ID",
        status: "Status",
        statusPaid: "Paid",
        statusPartiallyPaid: "Partially Paid",
        statusRefunded: "Refunded",
        statusPending: "Pending",
        isRefund: "Is Refund",
        notes: "Notes",
        attachmentPath: "Attachment Path / URL",
        attachmentUpload: "Upload Attachment",
        viewReceipt: "View Receipt",
        downloadReceipt: "Download Receipt",
        receiptPreviewTitle: "Receipt Preview",
        replaceReceiptConfirm: "Uploading a new receipt will overwrite the existing receipt. Continue?",
        replaceReceiptConfirmTitle: "Replace Existing Receipt",
        confirmReplaceReceipt: "Yes, Replace",
        receiptPreviewLoading: "Loading receipt preview...",
        receiptPreviewUnavailable: "Preview is unavailable for this file type. Please download the receipt.",
        openInNewTab: "Open in New Tab",
        invalidAttachmentType: "Only image and PDF files are allowed.",
        paymentReferenceHelp: "Bank ref / transaction ID / check number",
        invalidPaymentMethod: "Please select a valid payment method.",
        invalidStatus: "Please select a valid payment status.",
        paymentReferenceRequired: "Payment reference is required for non-cash paid statuses (not required for pending).",
        customerIdRequired: "Customer ID is required.",
        customerIdMismatch: "Customer ID must match the existing customer record for this payer.",
        customerNameMismatch: "This Customer ID is already linked to a different payer.",
        backup: "Backup",
        backupRestore: "Backup / Restore",
        restore: "Restore",
        restoreFromDrive: "Restore from Drive",
        restoreLatestBackup: "Latest backup on Drive:",
        restoreNoBackups: "No backups found on Google Drive.",
        restoreConfirmTitle: "Restore from Backup",
        restoreConfirmBody: "This will replace all current transactions, audit trail, and receipts with data from the latest backup. This cannot be undone.",
        restoreConfirmButton: "Yes, Restore",
        backupTitle: "Google Drive Backup",
        backupDescription: "Backup your transactions, audit trail, and receipts to Google Drive.",
    },
    he: {
        appTitle: "עסקאות עסקיות של אביטל פרהנג",
        subtitle: "עקבו אחרי כל תשלום בבהירות, במהירות ובביטחון.",
        totalRevenue: "סך ההכנסות",
        recordedTransactionSingular: "עסקה מתועדת",
        recordedTransactionPlural: "עסקאות מתועדות",
        newTransaction: "עסקה חדשה",
        captureIncoming: "תעדו תשלומים נכנסים ושמרו על הנהלת חשבונות עדכנית.",
        receiptNumber: "מספר קבלה",
        amountPaid: "סכום ששולם",
        date: "תאריך",
        whatItWasFor: "מטרת התשלום",
        whoPaid: "מי שילם?",
        saveTransaction: "שמור עסקה",
        transactionLedger: "יומן עסקאות",
        latestFirst: "מהחדש לישן",
        noTransactionsYet: "אין עסקאות עדיין",
        savedPaymentsAppear: "התשלומים שנשמרו יופיעו כאן.",
        paidBy: "שולם על ידי",
        purpose: "מטרה",
        amount: "סכום",
        update: "עדכן",
        delete: "מחק",
        refund: "החזר",
        cancel: "בטל",
        deleteConfirmTitle: "מחיקת עסקה",
        deleteConfirmBody: "פעולה זו תסיר את העסקה לצמיתות אלא אם תבצעו ביטול.",
        confirmDelete: "כן, מחק",
        undo: "בטל פעולה",
        auditTrail: "יומן ביקורת",
        backToLedger: "חזרה ליומן העסקאות",
        auditTrailTitle: "יומן ביקורת עסקאות",
        action: "פעולה",
        transactionId: "מזהה עסקה",
        timestamp: "חותמת זמן",
        details: "פרטים",
        noAuditEntries: "עדיין אין רשומות ביומן הביקורת.",
        undoFromAudit: "שחזור מחיקה",
        undoRefundFromAudit: "ביטול החזר",
        undoUnavailable: "שחזור לא זמין",
        settings: "הגדרות",
        stats: "סטטיסטיקות",
        statsTitle: "סטטיסטיקות עסקיות",
        statsSubtitle: "מבט מהיר על ביצועי העסקאות שלכם.",
        totalTransactionsStat: "סך עסקאות",
        averageTransaction: "ממוצע לעסקה",
        medianTransaction: "חציון עסקה",
        largestTransaction: "העסקה הגבוהה ביותר",
        uniquePayers: "מספר משלמים ייחודיים",
        topPayer: "משלם מוביל",
        topPurpose: "מטרה מובילה",
        annualTotalCurrentYear: "סך הכל לשנה הנוכחית",
        recent30DaysRevenue: "הכנסות ב-30 הימים האחרונים",
        monthlyBreakdown: "פילוח חודשי",
        paymentTypeBreakdown: "פילוח לפי אמצעי תשלום",
        statusBreakdown: "פילוח לפי סטטוס",
        paymentType: "אמצעי תשלום",
        paymentTypeCash: "מזומן",
        paymentTypeCreditCard: "כרטיס אשראי",
        paymentTypeBankTransfer: "העברה בנקאית",
        paymentTypeCheque: "צ'ק",
        refundTransactionsStat: "עסקאות החזר",
        totalRefunded: "סך הוחזר",
        month: "חודש",
        transactionCount: "כמות עסקאות",
        totalAmount: "סכום כולל",
        changeVsPreviousMonth: "שינוי לעומת חודש קודם",
        noStatsData: "עדיין אין נתוני עסקאות.",
        unknownLabel: "לא ידוע",
        annualThreshold: "סף שנתי כולל",
        alertPercentThreshold: "אחוז סף התראה",
        saveSettings: "שמור הגדרות",
        appBrand: "כותרת בסרגל הניווט",
        receiptPrefix: "קידומת מספר קבלה",
        receiptPrefixHelp: "קידומת אופציונלית שמתווספת אוטומטית לכל מספר קבלה.",
        successSettingsSaved: "ההגדרות נשמרו בהצלחה.",
        invalidSettings: "נא להזין סף שנתי תקין ואחוז התראה בין 1 ל-100.",
        annualAlertTitle: "התראת סף שנתי",
        annualAlertNearMessage: "הגעתם ל-{percent}% מהסף השנתי ({total} מתוך {threshold}).",
        annualAlertExceededMessage: "עברתם את הסף השנתי ({total} מתוך {threshold}).",
        previous: "הקודם",
        next: "הבא",
        page: "עמוד",
        of: "מתוך",
        apply: "החל",
        clear: "נקה",
        filter: "סינון",
        all: "הכל",
        language: "שפה",
        english: "English",
        hebrew: "עברית",
        successSaved: "העסקה נשמרה בהצלחה.",
        successUpdated: "העסקה עודכנה בהצלחה.",
        successDeleted: "העסקה נמחקה בהצלחה.",
        successUndoDeleted: "העסקה שנמחקה שוחזרה בהצלחה.",
        successRefunded: "העסקה סומנה כהחזר בהצלחה.",
        successUndoRefunded: "ביטול ההחזר בוצע בהצלחה.",
        errorTitle: "שגיאה",
        close: "סגור",
        unexpectedError: "משהו השתבש. נא לנסות שוב.",
        validationError: "נא להזין מספר קבלה, סכום ותאריך תקינים (היום או קודם), מטרה ושם משלם.",
        updateNotFound: "לא נמצאה עסקה לעדכון.",
        deleteNotFound: "לא נמצאה עסקה למחיקה.",
        refundNotAvailable: "לא ניתן לבצע החזר לעסקה זו.",
        undoDeleteNotAvailable: "לא ניתן לשחזר את פעולת המחיקה הזו.",
        undoDeleteDuplicateReceipt: "לא ניתן לבטל מחיקה כי קיימת עסקה עם אותו מספר קבלה.",
        undoRefundNotAvailable: "לא ניתן לבטל את פעולת ההחזר הזו.",
        undoRefundDuplicateReceipt: "לא ניתן לבטל החזר כי קיימת עסקה עם אותו מספר קבלה.",
        refundUndoBody: "העסקה סומנה כהחזר. ניתן לבטל את הפעולה.",
        requiredField: "שדה זה הוא חובה.",
        noResultsFound: "לא נמצאו תוצאות",
        noResultsDescription: "אין עסקאות התואמות לסינונים שהוחלו.",
        duplicateReceiptNumber: "מספר הקבלה כבר קיים. נא להזין מספר קבלה ייחודי.",
        paymentMethod: "אמצעי תשלום",
        paymentReference: "אסמכתא לתשלום",
        customerId: "מזהה לקוח",
        status: "סטטוס",
        statusPaid: "שולם",
        statusPartiallyPaid: "שולם חלקית",
        statusRefunded: "הוחזר",
        statusPending: "ממתין",
        isRefund: "האם החזר",
        notes: "הערות",
        attachmentPath: "נתיב / קישור לקובץ",
        attachmentUpload: "העלאת קובץ",
        viewReceipt: "צפייה בקבלה",
        downloadReceipt: "הורדת קבלה",
        receiptPreviewTitle: "תצוגת קבלה",
        replaceReceiptConfirm: "העלאת קבלה חדשה תדרוס את הקבלה הקיימת. להמשיך?",
        replaceReceiptConfirmTitle: "החלפת קבלה קיימת",
        confirmReplaceReceipt: "כן, החלף",
        receiptPreviewLoading: "טוען תצוגת קבלה...",
        receiptPreviewUnavailable: "לא ניתן להציג תצוגה מקדימה עבור סוג קובץ זה. נא להוריד את הקבלה.",
        openInNewTab: "פתח בלשונית חדשה",
        invalidAttachmentType: "ניתן להעלות רק קבצי תמונה ו-PDF.",
        paymentReferenceHelp: "אסמכתא בנקאית / מזהה עסקה / מספר צ'ק",
        invalidPaymentMethod: "נא לבחור אמצעי תשלום תקין.",
        invalidStatus: "נא לבחור סטטוס תשלום תקין.",
        paymentReferenceRequired: "נדרשת אסמכתא בסטטוסים ששולמו ובאמצעי תשלום שאינם מזומן (לא נדרש בסטטוס ממתין).",
        customerIdRequired: "נדרש מזהה לקוח.",
        customerIdMismatch: "מזהה הלקוח חייב להתאים לרשומת הלקוח הקיימת עבור משלם זה.",
        customerNameMismatch: "מזהה לקוח זה כבר משויך למשלם אחר.",
        backup: "גיבוי",
        backupRestore: "גיבוי / שחזור",
        restore: "שחזור",
        restoreFromDrive: "שחזור מ-Drive",
        restoreLatestBackup: "גיבוי אחרון ב-Drive:",
        restoreNoBackups: "לא נמצאו קבצי גיבוי ב-Google Drive.",
        restoreConfirmTitle: "שחזור מגיבוי",
        restoreConfirmBody: "פעולה זו תחליף את כל הנתונים הנוכחיים (עסקאות, יומן ביקורת וקבלות) בנתונים מהגיבוי האחרון. לא ניתן לבטל פעולה זו.",
        restoreConfirmButton: "כן, שחזר",
        backupTitle: "גיבוי Google Drive",
        backupDescription: "גבה את ההעסקאות שלך, יומן ביקורת וקבלות ל-Google Drive.",
    },
};

function withFunctionError(functionName, error) {
    const message = error instanceof Error ? error.message : String(error);
    const contextualError = new Error(`[${functionName}] ${message}`);
    contextualError.cause = error;
    return contextualError;
}

function getLanguage(input) {
    try {
        return input === "he" ? "he" : "en";
    } catch (error) {
        throw withFunctionError("getLanguage", error);
    }
}

function getCookieValue(cookieHeader, name) {
    try {
        if (!cookieHeader) {
            return null;
        }

        const parts = cookieHeader.split(";").map((part) => part.trim());
        const target = parts.find((part) => part.startsWith(`${name}=`));
        if (!target) {
            return null;
        }

        return decodeURIComponent(target.slice(name.length + 1));
    } catch (error) {
        throw withFunctionError("getCookieValue", error);
    }
}

function resolveLanguage(req) {
    try {
        const cookieLang = getCookieValue(req.headers.cookie, "lang");
        return getLanguage(cookieLang || req.query.lang || req.body?.lang);
    } catch (error) {
        throw withFunctionError("resolveLanguage", error);
    }
}

function formatCurrency(amount, lang = "en") {
    try {
        const locale = lang === "he" ? "he-IL" : "en-US";

        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "ILS",
        }).format(amount);
    } catch (error) {
        throw withFunctionError("formatCurrency", error);
    }
}

function normalizeTransactions(transactions) {
    try {
        return transactions.map((item) => ({
            ...item,
            receiptNumber: item.receiptNumber || "",
            payment_method: item.payment_method || "cash",
            payment_reference: item.payment_reference || "",
            customer_id: item.customer_id || "",
            status: item.status || "paid",
            is_refund: Boolean(item.is_refund),
            notes: item.notes || "",
            attachment_path: item.attachment_path || "",
        }));
    } catch (error) {
        throw withFunctionError("normalizeTransactions", error);
    }
}

function normalizePaymentMethod(value) {
    try {
        const normalized = String(value || "").trim().toLowerCase();
        return PAYMENT_METHODS.has(normalized) ? normalized : "";
    } catch (error) {
        throw withFunctionError("normalizePaymentMethod", error);
    }
}

function normalizeStatus(value) {
    try {
        const normalized = String(value || "").trim().toLowerCase();
        return STATUSES.has(normalized) ? normalized : "";
    } catch (error) {
        throw withFunctionError("normalizeStatus", error);
    }
}

function shouldRequirePaymentReference(paymentMethod, status = "") {
    try {
        const normalizedStatus = String(status || "").trim().toLowerCase();
        if (normalizedStatus === "pending") {
            return false;
        }

        return paymentMethod === "credit_card" || paymentMethod === "bank_transfer" || paymentMethod === "cheque";
    } catch (error) {
        throw withFunctionError("shouldRequirePaymentReference", error);
    }
}

function buildCustomerMaps(transactions, excludeId = "") {
    try {
        const customerIdByPayer = new Map();
        const payerByCustomerId = new Map();

        transactions.forEach((item) => {
            if (excludeId && item.id === excludeId) {
                return;
            }

            const payerName = String(item.paidBy || "").trim();
            const normalizedPayerName = payerName.toLowerCase();
            const customerId = String(item.customer_id || "").trim();

            if (normalizedPayerName && customerId && !customerIdByPayer.has(normalizedPayerName)) {
                customerIdByPayer.set(normalizedPayerName, customerId);
            }

            if (customerId && normalizedPayerName && !payerByCustomerId.has(customerId)) {
                payerByCustomerId.set(customerId, normalizedPayerName);
            }
        });

        return {
            customerIdByPayer,
            payerByCustomerId,
        };
    } catch (error) {
        throw withFunctionError("buildCustomerMaps", error);
    }
}

function parsePaidByAutocompleteValue(rawPaidBy) {
    try {
        const normalizedInput = String(rawPaidBy || "").trim();
        const match = /^(.*?)(?:\s*\((CUST-\d+)\))$/i.exec(normalizedInput);

        if (!match) {
            return {
                payerName: normalizedInput,
                hintedCustomerId: "",
            };
        }

        return {
            payerName: String(match[1] || "").trim(),
            hintedCustomerId: String(match[2] || "").trim().toUpperCase(),
        };
    } catch (error) {
        throw withFunctionError("parsePaidByAutocompleteValue", error);
    }
}

function generateNextCustomerId(transactions, excludeId = "") {
    try {
        let maxIdNumber = 0;

        transactions.forEach((item) => {
            if (excludeId && item.id === excludeId) {
                return;
            }

            const customerId = String(item.customer_id || "").trim();
            const match = /^CUST-(\d+)$/i.exec(customerId);
            if (!match) {
                return;
            }

            const idNumber = Number.parseInt(match[1], 10);
            if (Number.isFinite(idNumber) && idNumber > maxIdNumber) {
                maxIdNumber = idNumber;
            }
        });

        return `CUST-${String(maxIdNumber + 1).padStart(4, "0")}`;
    } catch (error) {
        throw withFunctionError("generateNextCustomerId", error);
    }
}

function resolveCustomerIdForPayer({
    transactions,
    paidBy,
    hintedCustomerId = "",
    excludeId = "",
}) {
    try {
        const normalizedPayer = String(paidBy || "").trim().toLowerCase();
        const normalizedHintedCustomerId = String(hintedCustomerId || "").trim().toUpperCase();
        const { customerIdByPayer, payerByCustomerId } = buildCustomerMaps(transactions, excludeId);
        let existingCustomerId = customerIdByPayer.get(normalizedPayer) || "";

        if (normalizedHintedCustomerId) {
            const hintPayerName = payerByCustomerId.get(normalizedHintedCustomerId) || "";
            if (!hintPayerName || hintPayerName === normalizedPayer) {
                existingCustomerId = normalizedHintedCustomerId;
            }
        }

        const resolvedCustomerId = existingCustomerId || generateNextCustomerId(transactions, excludeId);

        return {
            isValid: true,
            resolvedCustomerId,
            errorKey: "",
        };
    } catch (error) {
        throw withFunctionError("resolveCustomerIdForPayer", error);
    }
}

function normalizeReceiptNumber(value) {
    try {
        return String(value || "").trim().toLowerCase();
    } catch (error) {
        throw withFunctionError("normalizeReceiptNumber", error);
    }
}

function applyReceiptPrefix(receiptNumber, receiptPrefix = "") {
    try {
        const safeReceiptNumber = String(receiptNumber || "").trim();
        const safePrefix = String(receiptPrefix || "").trim();

        if (!safePrefix || !safeReceiptNumber) {
            return safeReceiptNumber;
        }

        return safeReceiptNumber.startsWith(safePrefix)
            ? safeReceiptNumber
            : `${safePrefix}${safeReceiptNumber}`;
    } catch (error) {
        throw withFunctionError("applyReceiptPrefix", error);
    }
}

function hasDuplicateReceiptNumber(transactions, receiptNumber, excludeId = "") {
    try {
        const normalizedCandidate = normalizeReceiptNumber(receiptNumber);
        if (!normalizedCandidate) {
            return false;
        }

        return transactions.some((item) => item.id !== excludeId && normalizeReceiptNumber(item.receiptNumber) === normalizedCandidate);
    } catch (error) {
        throw withFunctionError("hasDuplicateReceiptNumber", error);
    }
}

function sortTransactionsByCreatedAt(transactions) {
    try {
        return [...transactions].sort((left, right) => {
            const leftTime = Number(new Date(left.createdAt || 0));
            const rightTime = Number(new Date(right.createdAt || 0));

            const safeLeftTime = Number.isFinite(leftTime) && leftTime > 0
                ? leftTime
                : Number.parseInt(String(left.id || "").split("-")[0], 10) || 0;
            const safeRightTime = Number.isFinite(rightTime) && rightTime > 0
                ? rightTime
                : Number.parseInt(String(right.id || "").split("-")[0], 10) || 0;

            if (safeRightTime !== safeLeftTime) {
                return safeRightTime - safeLeftTime;
            }

            return String(right.id || "").localeCompare(String(left.id || ""));
        });
    } catch (error) {
        throw withFunctionError("sortTransactionsByCreatedAt", error);
    }
}

function getTodayDateString() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    } catch (error) {
        throw withFunctionError("getTodayDateString", error);
    }
}

function isValidDateNotInFuture(dateString) {
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) {
            return false;
        }

        const [year, month, day] = dateString.split("-").map(Number);
        const parsed = new Date(year, month - 1, day);
        const isRealDate = parsed.getFullYear() === year
            && parsed.getMonth() === month - 1
            && parsed.getDate() === day;

        if (!isRealDate) {
            return false;
        }

        return dateString <= getTodayDateString();
    } catch (error) {
        throw withFunctionError("isValidDateNotInFuture", error);
    }
}

function parsePage(value) {
    try {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return 1;
        }

        return parsed;
    } catch (error) {
        throw withFunctionError("parsePage", error);
    }
}

function normalizeFilters(raw = {}) {
    try {
        return {
            receiptNumber: String(raw.receiptNumber || "").trim(),
            date: String(raw.date || "").trim(),
            paidBy: String(raw.paidBy || "").trim(),
            purpose: String(raw.purpose || "").trim(),
            amount: String(raw.amount || "").trim(),
        };
    } catch (error) {
        throw withFunctionError("normalizeFilters", error);
    }
}

function resolveQueryFilters(query = {}) {
    try {
        return normalizeFilters({
            receiptNumber: query.receiptNumber,
            date: query.date,
            paidBy: query.paidBy,
            purpose: query.purpose,
            amount: query.amount,
        });
    } catch (error) {
        throw withFunctionError("resolveQueryFilters", error);
    }
}

function resolveBodyFilters(body = {}) {
    try {
        return normalizeFilters({
            receiptNumber: body.fReceiptNumber,
            date: body.fDate,
            paidBy: body.fPaidBy,
            purpose: body.fPurpose,
            amount: body.fAmount,
        });
    } catch (error) {
        throw withFunctionError("resolveBodyFilters", error);
    }
}

function hasActiveFilters(filters) {
    try {
        return Boolean(filters.receiptNumber || filters.date || filters.paidBy || filters.purpose || filters.amount);
    } catch (error) {
        throw withFunctionError("hasActiveFilters", error);
    }
}

function matchesFilter(value, filterValue) {
    try {
        if (!filterValue) {
            return true;
        }

        return String(value || "").toLowerCase().includes(filterValue.toLowerCase());
    } catch (error) {
        throw withFunctionError("matchesFilter", error);
    }
}

function applyFilters(transactions, filters) {
    try {
        return transactions.filter((item) => {
            if (!matchesFilter(item.receiptNumber, filters.receiptNumber)) {
                return false;
            }

            if (filters.date && item.date !== filters.date) {
                return false;
            }

            if (!matchesFilter(item.paidBy, filters.paidBy)) {
                return false;
            }

            if (!matchesFilter(item.purpose, filters.purpose)) {
                return false;
            }

            if (!matchesFilter(item.amount, filters.amount)) {
                return false;
            }

            return true;
        });
    } catch (error) {
        throw withFunctionError("applyFilters", error);
    }
}

function buildIndexPath({ success, page, filters, deletedAuditId, refundedAuditId } = {}) {
    try {
        const params = new URLSearchParams();

        if (success) {
            params.set("success", String(success));
        }

        if (deletedAuditId) {
            params.set("deletedAudit", String(deletedAuditId));
        }

        if (refundedAuditId) {
            params.set("refundedAudit", String(refundedAuditId));
        }

        if (page && Number(page) > 1) {
            params.set("page", String(page));
        }

        const safeFilters = normalizeFilters(filters);
        if (safeFilters.receiptNumber) {
            params.set("receiptNumber", safeFilters.receiptNumber);
        }
        if (safeFilters.date) {
            params.set("date", safeFilters.date);
        }
        if (safeFilters.paidBy) {
            params.set("paidBy", safeFilters.paidBy);
        }
        if (safeFilters.purpose) {
            params.set("purpose", safeFilters.purpose);
        }
        if (safeFilters.amount) {
            params.set("amount", safeFilters.amount);
        }

        const query = params.toString();
        return query ? `/?${query}` : "/";
    } catch (error) {
        throw withFunctionError("buildIndexPath", error);
    }
}

function stringifyAuditDetails(payload = {}) {
    try {
        const beforeState = payload && typeof payload.before === "object" && payload.before !== null
            ? payload.before
            : null;
        const afterState = payload && typeof payload.after === "object" && payload.after !== null
            ? payload.after
            : null;

        if (beforeState && afterState) {
            const excludedKeys = new Set(["id", "createdAt"]);
            const keys = Array.from(new Set([
                ...Object.keys(beforeState),
                ...Object.keys(afterState),
            ]))
                .filter((key) => !excludedKeys.has(key))
                .sort();

            const changes = keys
                .filter((key) => {
                    const beforeValue = beforeState[key];
                    const afterValue = afterState[key];
                    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
                })
                .map((key) => {
                    const beforeValue = beforeState[key];
                    const afterValue = afterState[key];
                    const beforeText = beforeValue === undefined || beforeValue === null || beforeValue === ""
                        ? "(empty)"
                        : (typeof beforeValue === "object" ? JSON.stringify(beforeValue) : String(beforeValue));
                    const afterText = afterValue === undefined || afterValue === null || afterValue === ""
                        ? "(empty)"
                        : (typeof afterValue === "object" ? JSON.stringify(afterValue) : String(afterValue));
                    return `${key}: ${beforeText} -> ${afterText}`;
                });

            if (changes.length > 0) {
                return changes.join(" | ");
            }

            return "No field changes recorded.";
        }

        return Object.entries(payload)
            .filter(([key]) => key !== "before" && key !== "after" && key !== "transaction")
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(" | ");
    } catch (error) {
        throw withFunctionError("stringifyAuditDetails", error);
    }
}

function formatLabelTemplate(template, values = {}) {
    try {
        return String(template || "").replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
    } catch (error) {
        throw withFunctionError("formatLabelTemplate", error);
    }
}

function getSignedTransactionAmount(transaction) {
    try {
        const rawAmount = Number(transaction?.amount || 0);
        const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
        const isRefunded = String(transaction?.status || "").toLowerCase() === "refunded" || Boolean(transaction?.is_refund);
        const isPending = String(transaction?.status || "").toLowerCase() === "pending";

        // Refunded and pending transactions are excluded from paid revenue totals.
        return (isRefunded || isPending) ? 0 : Math.abs(safeAmount);
    } catch (error) {
        throw withFunctionError("getSignedTransactionAmount", error);
    }
}

function getTransactionYear(transaction) {
    try {
        const dateValue = String(transaction?.date || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue.slice(0, 4);
        }

        const createdAt = String(transaction?.createdAt || "").trim();
        if (/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) {
            return createdAt.slice(0, 4);
        }

        return "";
    } catch (error) {
        throw withFunctionError("getTransactionYear", error);
    }
}

function calculateAnnualThresholdStatus(transactions, settings, labels, lang) {
    try {
        const currentYear = String(new Date().getFullYear());
        const annualTotal = transactions
            .filter((item) => getTransactionYear(item) === currentYear)
            .reduce((sum, item) => sum + getSignedTransactionAmount(item), 0);

        const threshold = Number(settings.annualTotalThreshold);
        const alertPercent = Number(settings.annualAlertPercent);
        const triggerAmount = threshold * (alertPercent / 100);
        const shouldShowAlert = annualTotal >= triggerAmount;

        const totalText = formatCurrency(annualTotal, lang);
        const thresholdText = formatCurrency(threshold, lang);
        const nearMessage = formatLabelTemplate(labels.annualAlertNearMessage, {
            percent: alertPercent,
            total: totalText,
            threshold: thresholdText,
        });
        const exceededMessage = formatLabelTemplate(labels.annualAlertExceededMessage, {
            total: totalText,
            threshold: thresholdText,
        });

        return {
            currentYear,
            annualTotal,
            annualTotalText: totalText,
            annualThresholdText: thresholdText,
            annualAlertPercent: alertPercent,
            annualTotalThreshold: threshold,
            shouldShowAnnualAlert: shouldShowAlert,
            annualAlertMessage: annualTotal >= threshold ? exceededMessage : nearMessage,
            annualAlertExceeded: annualTotal >= threshold,
        };
    } catch (error) {
        throw withFunctionError("calculateAnnualThresholdStatus", error);
    }
}

function getTransactionDateObject(transaction) {
    try {
        const dateValue = String(transaction?.date || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            const parsedDate = new Date(`${dateValue}T00:00:00`);
            if (!Number.isNaN(parsedDate.getTime())) {
                return parsedDate;
            }
        }

        const createdAtDate = new Date(String(transaction?.createdAt || ""));
        if (!Number.isNaN(createdAtDate.getTime())) {
            return createdAtDate;
        }

        return null;
    } catch (error) {
        throw withFunctionError("getTransactionDateObject", error);
    }
}

function calculateStatistics(transactions, lang, labels) {
    try {
        const locale = lang === "he" ? "he-IL" : "en-US";
        const formatter = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
        const numericAmounts = transactions
            .map((item) => getSignedTransactionAmount(item))
            .filter((value) => Number.isFinite(value));
        const totalRevenue = numericAmounts.reduce((sum, value) => sum + value, 0);
        const totalTransactions = transactions.length;
        const averageAmount = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

        const sortedAmounts = [...numericAmounts].sort((a, b) => a - b);
        const medianAmount = sortedAmounts.length === 0
            ? 0
            : sortedAmounts.length % 2 === 1
                ? sortedAmounts[Math.floor(sortedAmounts.length / 2)]
                : (sortedAmounts[(sortedAmounts.length / 2) - 1] + sortedAmounts[sortedAmounts.length / 2]) / 2;

        const largestAmount = sortedAmounts.length > 0 ? sortedAmounts[sortedAmounts.length - 1] : 0;
        const uniquePayers = new Set(transactions.map((item) => String(item.paidBy || "").trim()).filter(Boolean)).size;

        const payerTotals = new Map();
        const purposeTotals = new Map();
        const monthlyTotals = new Map();
        const paymentMethodTotals = new Map([
            ["cash", { count: 0, total: 0 }],
            ["credit_card", { count: 0, total: 0 }],
            ["bank_transfer", { count: 0, total: 0 }],
            ["cheque", { count: 0, total: 0 }],
        ]);
        const statusTotals = new Map([
            ["paid", { count: 0, total: 0 }],
            ["partially_paid", { count: 0, total: 0 }],
            ["pending", { count: 0, total: 0 }],
        ]);
        const currentYear = String(new Date().getFullYear());
        const last30DaysStart = new Date();
        last30DaysStart.setDate(last30DaysStart.getDate() - 30);
        let recent30DaysRevenue = 0;
        let annualCurrentYearTotal = 0;
        let refundCount = 0;
        let totalRefundedAmount = 0;

        transactions.forEach((item) => {
            const amount = getSignedTransactionAmount(item);
            if (!Number.isFinite(amount)) {
                return;
            }

            const rawAmount = Number(item.amount || 0);
            const statusAmount = Number.isFinite(rawAmount) ? Math.abs(rawAmount) : 0;

            const isRefund = String(item.status || "").toLowerCase() === "refunded" || Boolean(item.is_refund);
            if (isRefund) {
                refundCount += 1;
                totalRefundedAmount += Math.abs(Number(item.amount || 0));
            }

            const paymentMethod = String(item.payment_method || "cash").trim().toLowerCase();
            if (paymentMethodTotals.has(paymentMethod) && amount > 0 && !isRefund) {
                const existingMethodTotals = paymentMethodTotals.get(paymentMethod) || { count: 0, total: 0 };
                paymentMethodTotals.set(paymentMethod, {
                    count: existingMethodTotals.count + 1,
                    total: existingMethodTotals.total + amount,
                });
            }

            const statusKey = String(item.status || "paid").trim().toLowerCase();
            if (statusTotals.has(statusKey) && !isRefund) {
                const existingStatusTotals = statusTotals.get(statusKey) || { count: 0, total: 0 };
                statusTotals.set(statusKey, {
                    count: existingStatusTotals.count + 1,
                    total: existingStatusTotals.total + statusAmount,
                });
            }

            const payer = String(item.paidBy || "").trim() || labels.unknownLabel;
            const purpose = String(item.purpose || "").trim() || labels.unknownLabel;
            payerTotals.set(payer, (payerTotals.get(payer) || 0) + amount);
            purposeTotals.set(purpose, (purposeTotals.get(purpose) || 0) + amount);

            const transactionDate = getTransactionDateObject(item);
            if (transactionDate) {
                if (transactionDate >= last30DaysStart) {
                    recent30DaysRevenue += amount;
                }

                const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, "0")}`;
                const existingMonth = monthlyTotals.get(monthKey) || { total: 0, count: 0 };
                monthlyTotals.set(monthKey, {
                    total: existingMonth.total + amount,
                    count: existingMonth.count + 1,
                });

                if (String(transactionDate.getFullYear()) === currentYear) {
                    annualCurrentYearTotal += amount;
                }
            }
        });

        const topPayer = [...payerTotals.entries()].sort((a, b) => b[1] - a[1])[0] || [labels.unknownLabel, 0];
        const topPurpose = [...purposeTotals.entries()].sort((a, b) => b[1] - a[1])[0] || [labels.unknownLabel, 0];

        const sortedMonthKeysAsc = [...monthlyTotals.keys()].sort((a, b) => a.localeCompare(b));
        const currentMonthKey = sortedMonthKeysAsc[sortedMonthKeysAsc.length - 1] || "";
        const previousMonthKey = sortedMonthKeysAsc[sortedMonthKeysAsc.length - 2] || "";
        const currentMonthTotal = currentMonthKey ? (monthlyTotals.get(currentMonthKey)?.total || 0) : 0;
        const previousMonthTotal = previousMonthKey ? (monthlyTotals.get(previousMonthKey)?.total || 0) : 0;
        const monthOverMonthChangePercent = previousMonthTotal > 0
            ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
            : null;

        const monthlyBreakdown = [...monthlyTotals.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 12)
            .map(([monthKey, value]) => {
                const monthDate = new Date(`${monthKey}-01T00:00:00`);
                return {
                    monthKey,
                    monthLabel: Number.isNaN(monthDate.getTime()) ? monthKey : formatter.format(monthDate),
                    total: value.total,
                    count: value.count,
                };
            });

        const paymentMethodLabelByKey = {
            cash: labels.paymentTypeCash,
            credit_card: labels.paymentTypeCreditCard,
            bank_transfer: labels.paymentTypeBankTransfer,
            cheque: labels.paymentTypeCheque,
        };

        const paymentTypeBreakdown = [...paymentMethodTotals.entries()]
            .map(([methodKey, value]) => ({
                methodKey,
                methodLabel: paymentMethodLabelByKey[methodKey] || methodKey,
                count: value.count,
                total: value.total,
            }))
            .filter((row) => row.count > 0)
            .sort((a, b) => b.total - a.total);

        const statusLabelByKey = {
            paid: labels.statusPaid,
            partially_paid: labels.statusPartiallyPaid,
            pending: labels.statusPending,
        };

        const statusBreakdown = [...statusTotals.entries()]
            .map(([statusKey, value]) => ({
                statusKey,
                statusLabel: statusLabelByKey[statusKey] || statusKey,
                count: value.count,
                total: value.total,
            }));

        return {
            totalTransactions,
            totalRevenue,
            averageAmount,
            medianAmount,
            largestAmount,
            refundCount,
            totalRefundedAmount,
            uniquePayers,
            topPayerName: topPayer[0],
            topPayerAmount: topPayer[1],
            topPurposeName: topPurpose[0],
            topPurposeAmount: topPurpose[1],
            annualCurrentYearTotal,
            recent30DaysRevenue,
            monthOverMonthChangePercent,
            paymentTypeBreakdown,
            statusBreakdown,
            monthlyBreakdown,
        };
    } catch (error) {
        throw withFunctionError("calculateStatistics", error);
    }
}

function getAuditReceiptNumber(entry, entriesById = new Map()) {
    try {
        const directReceiptNumber = entry?.payload?.transaction?.receiptNumber
            || entry?.payload?.after?.receiptNumber
            || entry?.payload?.before?.receiptNumber
            || entry?.payload?.receiptNumber;

        if (directReceiptNumber !== undefined && directReceiptNumber !== null && String(directReceiptNumber).trim() !== "") {
            return String(directReceiptNumber);
        }

        if (entry?.action === "undo_delete" || entry?.action === "undo_refund") {
            const sourceAuditId = String(entry?.payload?.sourceAuditId || "").trim();
            if (!sourceAuditId) {
                return "";
            }

            const sourceEntry = entriesById.get(sourceAuditId);
            if (!sourceEntry) {
                return "";
            }

            return getAuditReceiptNumber(sourceEntry, entriesById);
        }

        return "";
    } catch (error) {
        throw withFunctionError("getAuditReceiptNumber", error);
    }
}

function getAuditCustomerId(entry, entriesById = new Map()) {
    try {
        const directCustomerId = entry?.payload?.transaction?.customer_id
            || entry?.payload?.after?.customer_id
            || entry?.payload?.before?.customer_id
            || entry?.payload?.customer_id;

        if (directCustomerId !== undefined && directCustomerId !== null && String(directCustomerId).trim() !== "") {
            return String(directCustomerId);
        }

        if (entry?.action === "undo_delete" || entry?.action === "undo_refund") {
            const sourceAuditId = String(entry?.payload?.sourceAuditId || "").trim();
            if (!sourceAuditId) {
                return "";
            }

            const sourceEntry = entriesById.get(sourceAuditId);
            if (!sourceEntry) {
                return "";
            }

            return getAuditCustomerId(sourceEntry, entriesById);
        }

        return "";
    } catch (error) {
        throw withFunctionError("getAuditCustomerId", error);
    }
}

async function readBackupSetupStepsContent() {
    try {
        const backupSetupPath = path.join(__dirname, "BACKUP_SETUP.md");
        const markdown = await fs.readFile(backupSetupPath, "utf8");
        const sectionMatch = markdown.match(/## Setup Steps\s*([\s\S]*?)(?:\n##\s|$)/);

        if (!sectionMatch) {
            return "Setup steps are currently unavailable.";
        }

        return sectionMatch[1].trim();
    } catch {
        return "Setup steps are currently unavailable.";
    }
}

async function renderIndex(res, options = {}) {
    try {
        const lang = getLanguage(options.lang);
        const labels = TRANSLATIONS[lang];
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const allAuditEntries = await readAuditTrail();
        const settings = await readAppSettings();
        const annualThresholdStatus = calculateAnnualThresholdStatus(allTransactions, settings, labels, lang);
        const availableDates = Array.from(new Set(allTransactions.map((item) => item.date).filter(Boolean)))
            .sort((a, b) => b.localeCompare(a));
        const filters = normalizeFilters(options.filters);
        const filteredTransactions = applyFilters(allTransactions, filters);
        const totalRevenue = allTransactions.reduce((sum, item) => sum + getSignedTransactionAmount(item), 0);
        const maxDate = getTodayDateString();
        const totalTransactions = filteredTransactions.length;
        const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE));
        const requestedPage = parsePage(options.page);
        const currentPage = Math.min(requestedPage, totalPages);
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageTransactions = filteredTransactions.slice(startIndex, startIndex + PAGE_SIZE);
        const backupSetupStepsContent = await readBackupSetupStepsContent();

        return res.status(options.statusCode || 200).render("index", {
            lang,
            isRtl: lang === "he",
            labels,
            transactions: pageTransactions,
            totalTransactions,
            hasAnyTransactions: allTransactions.length > 0,
            hasAnyAuditEntries: allAuditEntries.length > 0,
            filters,
            hasActiveFilters: hasActiveFilters(filters),
            availableDates,
            currentPage,
            totalPages,
            totalRevenue,
            maxDate,
            pageSize: PAGE_SIZE,
            buildPageHref: (targetPage) => buildIndexPath({ page: targetPage, filters }),
            formatCurrency: (amount) => formatCurrency(amount, lang),
            formData: options.formData || {
                receiptNumber: "",
                amount: "",
                date: "",
                purpose: "",
                paidBy: "",
                payment_method: "cash",
                payment_reference: "",
                status: "paid",
                notes: "",
            },
            error: options.error || null,
            successMessage: options.successMessage || null,
            undoDeleteAuditId: options.undoDeleteAuditId || null,
            undoRefundAuditId: options.undoRefundAuditId || null,
            settings,
            receiptDirectory: allTransactions.map((item) => ({
                id: item.id,
                receiptNumber: item.receiptNumber || "",
            })),
            customerDirectory: Array.from(new Map(
                allTransactions
                    .map((item) => ({
                        paidBy: String(item.paidBy || "").trim(),
                        customerId: String(item.customer_id || "").trim(),
                    }))
                    .filter((entry) => entry.paidBy && entry.customerId)
                    .map((entry) => [
                        `${entry.paidBy.toLowerCase()}::${entry.customerId.toUpperCase()}`,
                        entry,
                    ]),
            ).values()),
            purposeDirectory: Array.from(new Map(
                allTransactions
                    .map((item) => String(item.purpose || "").trim())
                    .filter(Boolean)
                    .map((purpose) => [purpose.toLowerCase(), purpose]),
            ).values()),
            backupSetupStepsContent,
            ...annualThresholdStatus,
        });
    } catch (error) {
        throw withFunctionError("renderIndex", error);
    }
}

app.get("/", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.query.page);
        const filters = resolveQueryFilters(req.query);
        const deletedAudit = String(req.query.deletedAudit || "").trim();
        const refundedAudit = String(req.query.refundedAudit || "").trim();
        const successCode = req.query.success;
        const successMessage = successCode === "1"
            ? labels.successSaved
            : successCode === "2"
                ? labels.successUpdated
                : successCode === "3"
                    ? labels.successDeleted
                    : successCode === "4"
                        ? labels.successUndoDeleted
                        : successCode === "5"
                            ? labels.successSettingsSaved
                            : successCode === "6"
                                ? labels.successRefunded
                                : successCode === "7"
                                    ? labels.successUndoRefunded
                : null;

        await renderIndex(res, {
            lang,
            page,
            filters,
            successMessage,
            undoDeleteAuditId: successCode === "3" ? deletedAudit : null,
            undoRefundAuditId: successCode === "6" ? refundedAudit : null,
        });
    } catch (error) {
        next(withFunctionError("app.get /", error));
    }
});

app.get("/stats", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const settings = await readAppSettings();
        const stats = calculateStatistics(allTransactions, lang, labels);

        return res.status(200).render("stats", {
            lang,
            isRtl: lang === "he",
            labels,
            settings,
            stats,
            formatCurrency: (amount) => formatCurrency(amount, lang),
        });
    } catch (error) {
        return next(withFunctionError("app.get /stats", error));
    }
});

app.post("/transactions", upload.single("attachment_upload"), async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];

        const formData = {
            receiptNumber: req.body.receiptNumber,
            amount: req.body.amount,
            date: req.body.date,
            purpose: req.body.purpose,
            paidBy: req.body.paidBy,
            payment_method: req.body.payment_method,
            payment_reference: req.body.payment_reference,
            status: req.body.status,
            notes: req.body.notes,
        };

        const amount = Number(formData.amount);
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const settings = await readAppSettings();
        const receiptPrefix = String(settings.receiptPrefix || "").trim();
        const effectiveReceiptNumber = applyReceiptPrefix(formData.receiptNumber, receiptPrefix);
        const paymentMethod = normalizePaymentMethod(formData.payment_method);
        const paymentReference = String(formData.payment_reference || "").trim();
        const status = normalizeStatus(formData.status);
        const parsedPaidBy = parsePaidByAutocompleteValue(formData.paidBy);
        const paidBy = parsedPaidBy.payerName;
        const notes = String(formData.notes || "").trim();
        const attachmentPath = req.file ? `/uploads/${req.file.filename}` : "";
        const customerResolution = resolveCustomerIdForPayer({
            transactions: allTransactions,
            paidBy,
            hintedCustomerId: parsedPaidBy.hintedCustomerId,
        });

        if (req.fileValidationError === "invalid-attachment-type") {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod || "cash",
                    payment_reference: paymentReference,
                    status: status || "paid",
                    notes,
                },
                error: labels.invalidAttachmentType,
            });
        }

        if (!formData.receiptNumber?.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDateNotInFuture(formData.date) || !formData.purpose?.trim() || !paidBy) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod || "cash",
                    payment_reference: paymentReference,
                    status: status || "paid",
                    notes,
                },
                error: labels.validationError,
            });
        }

        if (!paymentMethod) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_reference: paymentReference,
                    status: status || "paid",
                    notes,
                },
                error: labels.invalidPaymentMethod,
            });
        }

        if (!status) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference,
                    notes,
                },
                error: labels.invalidStatus,
            });
        }

        if (shouldRequirePaymentReference(paymentMethod, status) && !paymentReference) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod,
                    status,
                    notes,
                },
                error: labels.paymentReferenceRequired,
            });
        }

        if (hasDuplicateReceiptNumber(allTransactions, effectiveReceiptNumber)) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference,
                    status,
                    customer_id: customerResolution.resolvedCustomerId,
                    notes,
                },
                error: labels.duplicateReceiptNumber,
            });
        }

        await addTransaction({
            receiptNumber: effectiveReceiptNumber,
            amount,
            date: formData.date,
            purpose: formData.purpose.trim(),
            paidBy,
            payment_method: paymentMethod,
            payment_reference: paymentReference,
            customer_id: customerResolution.resolvedCustomerId,
            status,
            is_refund: status === "refunded",
            notes,
            attachment_path: attachmentPath,
        });

        return res.redirect("/?success=1");
    } catch (error) {
        return next(withFunctionError("app.post /transactions", error));
    }
});

app.post("/settings", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const annualTotalThreshold = Number(req.body.annualTotalThreshold);
        const annualAlertPercent = Number(req.body.annualAlertPercent);
        const appBrand = String(req.body.appBrand || "").trim();
        const receiptPrefix = String(req.body.receiptPrefix || "").trim();
        const maxBackupsToKeep = Number(req.body.maxBackupsToKeep);
        const maxBackupsToDisplay = Number(req.body.maxBackupsToDisplay);
        const isValid = Number.isFinite(annualTotalThreshold)
            && annualTotalThreshold > 0
            && Number.isFinite(annualAlertPercent)
            && annualAlertPercent > 0
            && annualAlertPercent <= 100
            && Number.isFinite(maxBackupsToKeep)
            && maxBackupsToKeep > 0
            && Number.isFinite(maxBackupsToDisplay)
            && maxBackupsToDisplay > 0;

        if (!isValid) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.invalidSettings,
            });
        }

        await updateAppSettings({
            annualTotalThreshold,
            annualAlertPercent,
            appBrand,
            receiptPrefix,
            maxBackupsToKeep,
            maxBackupsToDisplay,
        });

        return res.redirect(buildIndexPath({ success: 5, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /settings", error));
    }
});

// --- Google Drive Backup OAuth2 routes ---

function getCredentialsPath() {
    return path.join(__dirname, "credentials.json");
}

function renderBackupAuthPopupResponse(success, message) {
    const statusMessage = String(message || "");
    const responseType = success ? "googleDriveAuthComplete" : "googleDriveAuthFailed";
    const title = success ? "Google Drive connected" : "Google Drive connection failed";
    const body = success
        ? "Google Drive connected successfully. You can close this tab."
        : `Google Drive connection failed.${statusMessage ? ` ${statusMessage}` : ""} You can close this tab and add your credentials again.`;

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>${title}</title>
</head>
<body>
    <p>${body}</p>
    <script>
        if (window.opener) {
            window.opener.postMessage({ type: ${JSON.stringify(responseType)}, success: ${success}, message: ${JSON.stringify(statusMessage)} }, "*");
        }
        window.close();
    </script>
</body>
</html>`;
}

function getBackupAuthErrorMessage(error, fallbackMessage) {
    const fallback = String(fallbackMessage || "Google Drive authorization failed.").trim();
    const rawMessage = error instanceof Error ? error.message : String(error || "");
    const normalizedMessage = rawMessage.trim();
    return normalizedMessage || fallback;
}

async function clearCredentialsFile() {
    const credentialsPath = getCredentialsPath();
    await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
    await fs.writeFile(credentialsPath, "", "utf8");
}

async function resetBackupCredentialsAfterAuthError() {
    try {
        await revokeAuth();
    } catch {
        // Ignore cleanup errors during auth reset.
    }

    try {
        await clearCredentialsFile();
    } catch {
        // Ignore cleanup errors during auth reset.
    }
}

function validateGoogleDriveCredentialsShape(credentials) {
    const installed = credentials && typeof credentials === "object" ? credentials.installed : null;
    if (!installed || typeof installed !== "object" || Array.isArray(installed)) {
        return {
            valid: false,
            error: "Invalid credentials format. Expected an installed OAuth client object.",
        };
    }

    const requiredStringFields = [
        "client_id",
        "project_id",
        "client_secret",
    ];

    for (const fieldName of requiredStringFields) {
        const fieldValue = String(installed[fieldName] || "").trim();
        if (!fieldValue) {
            return {
                valid: false,
                error: `Invalid credentials format. Missing required field: installed.${fieldName}.`,
            };
        }
    }

    const expectedUrlFields = {
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    };

    for (const [fieldName, expectedValue] of Object.entries(expectedUrlFields)) {
        const fieldValue = String(installed[fieldName] || "").trim();
        if (fieldValue !== expectedValue) {
            return {
                valid: false,
                error: `Invalid credentials format. installed.${fieldName} must be ${expectedValue}.`,
            };
        }
    }

    if (!Array.isArray(installed.redirect_uris) || installed.redirect_uris.length === 0) {
        return {
            valid: false,
            error: "Invalid credentials format. installed.redirect_uris must be a non-empty array.",
        };
    }

    const normalizedRedirectUris = installed.redirect_uris
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    if (!normalizedRedirectUris.includes("http://localhost")) {
        return {
            valid: false,
            error: "Invalid credentials format. installed.redirect_uris must include http://localhost.",
        };
    }

    return { valid: true, error: "" };
}

async function validateCredentialsFile() {
    try {
        const credentialsPath = getCredentialsPath();
        const content = await fs.readFile(credentialsPath, "utf8");
        if (!content || content.trim().length === 0) {
            return { valid: false, error: "Credentials file is empty." };
        }
        const parsed = JSON.parse(content);
        return validateGoogleDriveCredentialsShape(parsed);
    } catch (error) {
        return { valid: false, error: "Credentials file is not valid JSON." };
    }
}

const backupJobs = new Map();
const BACKUP_JOB_TTL_MS = 10 * 60 * 1000;

function createBackupJob() {
    const jobId = `backup-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const job = {
        id: jobId,
        status: "running",
        stage: "starting",
        percent: 0,
        message: "Starting backup...",
        createdAt: Date.now(),
        result: null,
        error: null,
    };
    backupJobs.set(jobId, job);
    return job;
}

function cleanupBackupJobLater(jobId) {
    setTimeout(() => {
        backupJobs.delete(jobId);
    }, BACKUP_JOB_TTL_MS);
}

app.get("/admin/backup/status", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.json({ configured: false, authorized: false });
        }
        const authorized = await initializeAuth(credentialsPath);
        return res.json({ configured: true, authorized });
    } catch (error) {
        return next(withFunctionError("app.get /admin/backup/status", error));
    }
});

app.get("/admin/backup/credentials-status", async (req, res, next) => {
    try {
        const validation = await validateCredentialsFile();
        return res.json({ success: true, credentialsValid: validation.valid });
    } catch (error) {
        return next(withFunctionError("app.get /admin/backup/credentials-status", error));
    }
});

app.post("/admin/backup/credentials", async (req, res, next) => {
    try {
        const credentialsJson = String(req.body.credentialsJson || "").trim();
        if (!credentialsJson) {
            return res.status(400).json({ success: false, error: "Credentials JSON is required." });
        }

        let parsed;
        try {
            parsed = JSON.parse(credentialsJson);
        } catch (parseError) {
            return res.status(400).json({ success: false, error: "Invalid JSON format." });
        }

        const validation = validateGoogleDriveCredentialsShape(parsed);
        if (!validation.valid) {
            return res.status(400).json({ success: false, error: validation.error });
        }

        const credentialsPath = getCredentialsPath();
        await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
        await fs.writeFile(credentialsPath, JSON.stringify(parsed, null, 2), "utf8");

        return res.json({ success: true, message: "Credentials saved successfully." });
    } catch (error) {
        return next(withFunctionError("app.post /admin/backup/credentials", error));
    }
});

app.get("/admin/backup/auth", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.status(400).send("Credentials file not found.");
        }
        const redirectUri = `${req.protocol}://${req.get("host")}/admin/backup/auth/callback`;
        const authUrl = await getAuthUrl(credentialsPath, redirectUri);
        return res.redirect(authUrl);
    } catch (error) {
        await resetBackupCredentialsAfterAuthError();
        return res.status(400).send(renderBackupAuthPopupResponse(false, getBackupAuthErrorMessage(error, "The credentials file is invalid.")));
    }
});

app.get("/admin/backup/auth/callback", async (req, res, next) => {
    try {
        const authError = String(req.query.error || "").trim();
        const authErrorDescription = String(req.query.error_description || "").trim();
        if (authError) {
            await resetBackupCredentialsAfterAuthError();
            const details = authErrorDescription || authError.replace(/_/g, " ");
            return res.status(400).send(renderBackupAuthPopupResponse(false, getBackupAuthErrorMessage(details, "Google rejected the authorization request.")));
        }

        const code = String(req.query.code || "").trim();
        if (!code) {
            await resetBackupCredentialsAfterAuthError();
            return res.status(400).send(renderBackupAuthPopupResponse(false, "Missing authorization code."));
        }

        await exchangeCodeForToken(code);
        return res.send(renderBackupAuthPopupResponse(true, ""));
    } catch (error) {
        await resetBackupCredentialsAfterAuthError();
        return res.status(400).send(renderBackupAuthPopupResponse(false, getBackupAuthErrorMessage(error, "The credentials were rejected during authorization.")));
    }
});

app.post("/admin/backup/revoke", async (req, res, next) => {
    try {
        await revokeAuth();
        return res.json({ success: true });
    } catch (error) {
        return next(withFunctionError("app.post /admin/backup/revoke", error));
    }
});

app.post("/admin/backup", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.status(400).json({ success: false, error: "Credentials file not found." });
        }
        const authorized = await initializeAuth(credentialsPath);
        if (!authorized) {
            return res.status(401).json({ success: false, error: "not_authorized" });
        }
        try {
            const dataFilePath = path.join(__dirname, "data", "transactions.json");
            const auditFilePath = path.join(__dirname, "data", "audit-trail.json");
            const uploadsPath = path.join(__dirname, "uploads");
            const backupResult = await backupAppData(dataFilePath, auditFilePath, uploadsPath);
            return res.json({
                success: true,
                message: `Backup created successfully at ${backupResult.timestamp}`,
                filesBackedUp: backupResult.files.length,
                details: backupResult,
            });
        } catch (backupError) {
            console.error("Backup error:", backupError);
            return res.status(500).json({ success: false, error: backupError.message || "Backup failed" });
        }
    } catch (error) {
        return next(withFunctionError("app.post /admin/backup", error));
    }
});

app.post("/admin/backup/start", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.status(400).json({ success: false, error: "Credentials file not found." });
        }

        const authorized = await initializeAuth(credentialsPath);
        if (!authorized) {
            return res.status(401).json({ success: false, error: "not_authorized" });
        }

        const settings = await readAppSettings();
        const job = createBackupJob();

        void (async () => {
            try {
                const dataFilePath = path.join(__dirname, "data", "transactions.json");
                const auditFilePath = path.join(__dirname, "data", "audit-trail.json");
                const uploadsPath = path.join(__dirname, "uploads");

                const backupResult = await backupAppData(
                    dataFilePath,
                    auditFilePath,
                    uploadsPath,
                    (progress) => {
                        const currentJob = backupJobs.get(job.id);
                        if (!currentJob) {
                            return;
                        }

                        currentJob.stage = String(progress.stage || currentJob.stage);
                        currentJob.percent = Math.max(0, Math.min(100, Number(progress.percent || currentJob.percent)));
                        currentJob.message = String(progress.message || currentJob.message);
                    },
                    settings.maxBackupsToKeep || 10,
                );

                const currentJob = backupJobs.get(job.id);
                if (currentJob) {
                    currentJob.status = "completed";
                    currentJob.stage = "completed";
                    currentJob.percent = 100;
                    currentJob.message = "Backup completed successfully.";
                    currentJob.result = backupResult;
                }
            } catch (error) {
                const currentJob = backupJobs.get(job.id);
                if (currentJob) {
                    currentJob.status = "failed";
                    currentJob.stage = "failed";
                    currentJob.message = "Backup failed.";
                    currentJob.error = error.message;
                }
            } finally {
                cleanupBackupJobLater(job.id);
            }
        })();

        return res.json({ success: true, jobId: job.id });
    } catch (error) {
        return next(withFunctionError("app.post /admin/backup/start", error));
    }
});

app.get("/admin/backup/progress/:jobId", (req, res) => {
    const jobId = String(req.params.jobId || "").trim();
    const job = backupJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: "job_not_found" });
    }

    return res.json({ success: true, job });
});

app.get("/admin/restore/backups", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.status(400).json({ success: false, error: "Credentials file not found." });
        }
        const authorized = await initializeAuth(credentialsPath);
        if (!authorized) {
            return res.status(401).json({ success: false, error: "not_authorized" });
        }
        const settings = await readAppSettings();
        const files = await listBackupFiles(settings.maxBackupsToDisplay || 10);
        return res.json({ success: true, files });
    } catch (error) {
        return next(withFunctionError("app.get /admin/restore/backups", error));
    }
});

app.post("/admin/restore/start", async (req, res, next) => {
    try {
        const credentialsPath = getCredentialsPath();
        if (!credentialsPath) {
            return res.status(400).json({ success: false, error: "Credentials file not found." });
        }
        const authorized = await initializeAuth(credentialsPath);
        if (!authorized) {
            return res.status(401).json({ success: false, error: "not_authorized" });
        }
        const settings = await readAppSettings();
        const job = createBackupJob();
        const selectedFileId = String(req.body.fileId || "").trim();
        void (async () => {
            try {
                const dataFilePath = path.join(__dirname, "data", "transactions.json");
                const auditFilePath = path.join(__dirname, "data", "audit-trail.json");
                const uploadsPath = path.join(__dirname, "uploads");
                const result = await restoreAppData(
                    dataFilePath,
                    auditFilePath,
                    uploadsPath,
                    (progress) => {
                        const currentJob = backupJobs.get(job.id);
                        if (!currentJob) return;
                        currentJob.stage = String(progress.stage || currentJob.stage);
                        currentJob.percent = Math.max(0, Math.min(100, Number(progress.percent || currentJob.percent)));
                        currentJob.message = String(progress.message || currentJob.message);
                    },
                    selectedFileId,
                    settings.maxBackupsToDisplay || 10,
                );
                const currentJob = backupJobs.get(job.id);
                if (currentJob) {
                    currentJob.status = "completed";
                    currentJob.stage = "completed";
                    currentJob.percent = 100;
                    currentJob.message = "Restore completed successfully.";
                    currentJob.result = result;
                }
            } catch (error) {
                const currentJob = backupJobs.get(job.id);
                if (currentJob) {
                    currentJob.status = "failed";
                    currentJob.stage = "failed";
                    currentJob.message = "Restore failed.";
                    currentJob.error = error.message;
                }
            } finally {
                cleanupBackupJobLater(job.id);
            }
        })();
        return res.json({ success: true, jobId: job.id });
    } catch (error) {
        return next(withFunctionError("app.post /admin/restore/start", error));
    }
});

app.post("/admin/uploads/cleanup-if-empty", async (req, res, next) => {
    try {
        const cleaned = await clearUploadsWhenNoTransactionsExist();
        return res.json({ success: true, cleaned });
    } catch (error) {
        return next(withFunctionError("app.post /admin/uploads/cleanup-if-empty", error));
    }
});

app.post("/transactions/:id/update", upload.single("attachment_upload"), async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const formData = {
            receiptNumber: req.body.receiptNumber,
            amount: req.body.amount,
            date: req.body.date,
            purpose: req.body.purpose,
            paidBy: req.body.paidBy,
            payment_method: req.body.payment_method,
            payment_reference: req.body.payment_reference,
            status: req.body.status,
            notes: req.body.notes,
            existing_attachment_path: req.body.existing_attachment_path,
        };

        const amount = Number(formData.amount);
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const settings = await readAppSettings();
        const receiptPrefix = String(settings.receiptPrefix || "").trim();
        const effectiveReceiptNumber = applyReceiptPrefix(formData.receiptNumber, receiptPrefix);
        const paymentMethod = normalizePaymentMethod(formData.payment_method);
        const paymentReference = String(formData.payment_reference || "").trim();
        const status = normalizeStatus(formData.status);
        const parsedPaidBy = parsePaidByAutocompleteValue(formData.paidBy);
        const paidBy = parsedPaidBy.payerName;
        const notes = String(formData.notes || "").trim();
        const uploadedAttachmentPath = req.file ? `/uploads/${req.file.filename}` : "";
        const existingAttachmentPath = String(formData.existing_attachment_path || "").trim();
        const attachmentPath = uploadedAttachmentPath || existingAttachmentPath;
        const customerResolution = resolveCustomerIdForPayer({
            transactions: allTransactions,
            paidBy,
            hintedCustomerId: parsedPaidBy.hintedCustomerId,
            excludeId: req.params.id,
        });

        if (req.fileValidationError === "invalid-attachment-type") {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.invalidAttachmentType,
            });
        }

        if (!formData.receiptNumber?.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDateNotInFuture(formData.date) || !formData.purpose?.trim() || !paidBy) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.validationError,
            });
        }

        if (!paymentMethod) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.invalidPaymentMethod,
            });
        }

        if (!status) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.invalidStatus,
            });
        }

        if (shouldRequirePaymentReference(paymentMethod, status) && !paymentReference) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.paymentReferenceRequired,
            });
        }

        if (hasDuplicateReceiptNumber(allTransactions, effectiveReceiptNumber, req.params.id)) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.duplicateReceiptNumber,
            });
        }

        const updated = await updateTransaction(req.params.id, {
            receiptNumber: effectiveReceiptNumber,
            amount,
            date: formData.date,
            purpose: formData.purpose.trim(),
            paidBy,
            payment_method: paymentMethod,
            payment_reference: paymentReference,
            customer_id: customerResolution.resolvedCustomerId,
            status,
            is_refund: status === "refunded",
            notes,
            attachment_path: attachmentPath,
        });

        if (!updated) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 404,
                error: labels.updateNotFound,
            });
        }

        return res.redirect(buildIndexPath({ success: 2, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /transactions/:id/update", error));
    }
});

app.post("/transactions/:id/delete", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const deleted = await deleteTransaction(req.params.id);
        if (!deleted) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 404,
                error: labels.deleteNotFound,
            });
        }

        await clearUploadsWhenNoTransactionsExist();

        return res.redirect(buildIndexPath({
            success: 3,
            page,
            filters,
            deletedAuditId: deleted.auditEntryId,
        }));
    } catch (error) {
        return next(withFunctionError("app.post /transactions/:id/delete", error));
    }
});

app.post("/transactions/:id/refund", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const refunded = await refundTransactionById(req.params.id);
        if (!refunded?.refunded) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.refundNotAvailable,
            });
        }

        return res.redirect(buildIndexPath({
            success: 6,
            page,
            filters,
            refundedAuditId: refunded.auditEntryId,
        }));
    } catch (error) {
        return next(withFunctionError("app.post /transactions/:id/refund", error));
    }
});

app.post("/audit/:auditId/undo-delete", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const result = await undoDeleteByAuditId(req.params.auditId);
        if (!result.restored) {
            const undoDeleteError = result.reason === "duplicate-receipt-number"
                ? labels.undoDeleteDuplicateReceipt
                : labels.undoDeleteNotAvailable;

            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: undoDeleteError,
            });
        }

        return res.redirect(buildIndexPath({ success: 4, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /audit/:auditId/undo-delete", error));
    }
});

app.post("/audit/:auditId/undo-refund", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const result = await undoRefundByAuditId(req.params.auditId);
        if (!result.restored) {
            const undoRefundError = result.reason === "duplicate-receipt-number"
                ? labels.undoRefundDuplicateReceipt
                : labels.undoRefundNotAvailable;

            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: undoRefundError,
            });
        }

        return res.redirect(buildIndexPath({ success: 7, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /audit/:auditId/undo-refund", error));
    }
});

app.get("/admin/audit", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const settings = await readAppSettings();
        const successCode = req.query.success;
        const errorCode = String(req.query.error || "").trim();
        const successMessage = successCode === "1"
            ? labels.successUndoDeleted
            : successCode === "2"
                ? labels.successUndoRefunded
                : null;
        const errorMessage = errorCode === "undo-delete-duplicate-receipt"
            ? labels.undoDeleteDuplicateReceipt
            : errorCode === "undo-refund-duplicate-receipt"
                ? labels.undoRefundDuplicateReceipt
                : errorCode === "undo-delete-not-available"
                    ? labels.undoDeleteNotAvailable
                    : errorCode === "undo-refund-not-available"
                        ? labels.undoRefundNotAvailable
                        : "";

        const entries = await readAuditTrail();
        const allTransactions = normalizeTransactions(await readTransactions());
        const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
        const entriesWithReceipt = entries.map((entry) => ({
            ...entry,
            auditReceiptNumber: getAuditReceiptNumber(entry, entriesById),
            auditCustomerId: getAuditCustomerId(entry, entriesById),
        }));

        return res.status(200).render("admin-audit", {
            lang,
            isRtl: lang === "he",
            labels,
            settings,
            entries: entriesWithReceipt,
            hasAnyTransactions: allTransactions.length > 0,
            successMessage,
            errorMessage,
            stringifyAuditDetails,
        });
    } catch (error) {
        return next(withFunctionError("app.get /admin/audit", error));
    }
});

app.post("/admin/audit/:auditId/undo-delete", async (req, res, next) => {
    try {
        const result = await undoDeleteByAuditId(req.params.auditId);
        if (!result.restored) {
            const errorCode = result.reason === "duplicate-receipt-number"
                ? "undo-delete-duplicate-receipt"
                : "undo-delete-not-available";
            return res.redirect(`/admin/audit?error=${encodeURIComponent(errorCode)}`);
        }

        return res.redirect("/admin/audit?success=1");
    } catch (error) {
        return next(withFunctionError("app.post /admin/audit/:auditId/undo-delete", error));
    }
});

app.post("/admin/audit/:auditId/undo-refund", async (req, res, next) => {
    try {
        const result = await undoRefundByAuditId(req.params.auditId);
        if (!result.restored) {
            const errorCode = result.reason === "duplicate-receipt-number"
                ? "undo-refund-duplicate-receipt"
                : "undo-refund-not-available";
            return res.redirect(`/admin/audit?error=${encodeURIComponent(errorCode)}`);
        }

        return res.redirect("/admin/audit?success=2");
    } catch (error) {
        return next(withFunctionError("app.post /admin/audit/:auditId/undo-refund", error));
    }
});

app.use(async (error, req, res, next) => {
    try {
        console.error(error);

        const acceptsHtml = (req.headers.accept || "").includes("text/html");
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];

        const rawBrowserErrorMessage = error instanceof Error && error.message
            ? error.message
            : labels.unexpectedError;
        const browserErrorMessage = rawBrowserErrorMessage.startsWith("[SERVER]")
            ? rawBrowserErrorMessage
            : `[SERVER] ${rawBrowserErrorMessage}`;

        if (!acceptsHtml) {
            return res.status(500).json({ error: browserErrorMessage });
        }

        const page = parsePage(req.query.page || req.body?.page);
        const queryFilters = resolveQueryFilters(req.query);
        const bodyFilters = resolveBodyFilters(req.body || {});
        const filters = normalizeFilters({
            receiptNumber: bodyFilters.receiptNumber || queryFilters.receiptNumber,
            date: bodyFilters.date || queryFilters.date,
            paidBy: bodyFilters.paidBy || queryFilters.paidBy,
            purpose: bodyFilters.purpose || queryFilters.purpose,
            amount: bodyFilters.amount || queryFilters.amount,
        });

        const formData = req.method === "POST" && req.path === "/transactions"
            ? {
                receiptNumber: req.body?.receiptNumber || "",
                amount: req.body?.amount || "",
                date: req.body?.date || "",
                purpose: req.body?.purpose || "",
                paidBy: req.body?.paidBy || "",
                payment_method: req.body?.payment_method || "cash",
                payment_reference: req.body?.payment_reference || "",
                status: req.body?.status || "paid",
                notes: req.body?.notes || "",
            }
            : undefined;

        return await renderIndex(res, {
            lang,
            page,
            filters,
            formData,
            statusCode: 500,
            error: browserErrorMessage,
        });
    } catch (handlerError) {
        console.error(handlerError);
        if (!res.headersSent) {
            res.status(500).send("Something went wrong while processing your request.");
        }
    }
});

app.listen(port, () => {
    try {
        console.log(`Server running at http://localhost:${port}`);
    } catch (error) {
        console.error(error);
    }
});
