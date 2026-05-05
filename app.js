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
    readAuditTrail,
    undoDeleteByAuditId,
} = require("./lib/database");

const app = express();
const port = process.env.PORT || 3000;
const PAGE_SIZE = 50;
const uploadDirPath = path.join(__dirname, "uploads");
const PAYMENT_METHODS = new Set(["credit_card", "cash", "bank_transfer", "cheque"]);
const STATUSES = new Set(["paid", "partially_paid", "refunded", "pending"]);

const upload = multer({ dest: uploadDirPath });

fs.mkdir(uploadDirPath, { recursive: true }).catch((error) => {
    console.error(withFunctionError("createUploadsDirectory", error));
});

initializeDataFiles().catch((error) => {
    console.error(withFunctionError("initializeDataFiles", error));
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
        month: "Month",
        transactionCount: "Transaction Count",
        totalAmount: "Total Amount",
        changeVsPreviousMonth: "Change vs Previous Month",
        noStatsData: "No transaction data available yet.",
        unknownLabel: "Unknown",
        annualThreshold: "Annual Total Threshold",
        alertPercentThreshold: "Alert Percent Threshold",
        saveSettings: "Save Settings",
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
        errorTitle: "Error",
        close: "Close",
        unexpectedError: "Something went wrong. Please try again.",
        validationError: "Please provide a receipt number, valid amount, date (today or earlier), purpose, and payer name.",
        updateNotFound: "Could not find that transaction to update.",
        deleteNotFound: "Could not find that transaction to delete.",
        undoDeleteNotAvailable: "This delete action cannot be undone.",
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
        paymentReferenceHelp: "Bank ref / transaction ID / check number",
        invalidPaymentMethod: "Please select a valid payment method.",
        invalidStatus: "Please select a valid payment status.",
        paymentReferenceRequired: "Payment reference is required for credit card and bank transfer payments.",
        customerIdRequired: "Customer ID is required.",
        customerIdMismatch: "Customer ID must match the existing customer record for this payer.",
        customerNameMismatch: "This Customer ID is already linked to a different payer.",
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
        month: "חודש",
        transactionCount: "כמות עסקאות",
        totalAmount: "סכום כולל",
        changeVsPreviousMonth: "שינוי לעומת חודש קודם",
        noStatsData: "עדיין אין נתוני עסקאות.",
        unknownLabel: "לא ידוע",
        annualThreshold: "סף שנתי כולל",
        alertPercentThreshold: "אחוז סף התראה",
        saveSettings: "שמור הגדרות",
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
        errorTitle: "שגיאה",
        close: "סגור",
        unexpectedError: "משהו השתבש. נא לנסות שוב.",
        validationError: "נא להזין מספר קבלה, סכום ותאריך תקינים (היום או קודם), מטרה ושם משלם.",
        updateNotFound: "לא נמצאה עסקה לעדכון.",
        deleteNotFound: "לא נמצאה עסקה למחיקה.",
        undoDeleteNotAvailable: "לא ניתן לשחזר את פעולת המחיקה הזו.",
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
        paymentReferenceHelp: "אסמכתא בנקאית / מזהה עסקה / מספר צ'ק",
        invalidPaymentMethod: "נא לבחור אמצעי תשלום תקין.",
        invalidStatus: "נא לבחור סטטוס תשלום תקין.",
        paymentReferenceRequired: "נדרש להזין אסמכתא לתשלומי כרטיס אשראי והעברה בנקאית.",
        customerIdRequired: "נדרש מזהה לקוח.",
        customerIdMismatch: "מזהה הלקוח חייב להתאים לרשומת הלקוח הקיימת עבור משלם זה.",
        customerNameMismatch: "מזהה לקוח זה כבר משויך למשלם אחר.",
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

function shouldRequirePaymentReference(paymentMethod) {
    try {
        return paymentMethod === "credit_card" || paymentMethod === "bank_transfer";
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

function resolveCustomerIdForPayer({
    transactions,
    paidBy,
    customerId,
    excludeId = "",
}) {
    try {
        const normalizedPayer = String(paidBy || "").trim().toLowerCase();
        const normalizedCustomerId = String(customerId || "").trim();
        const { customerIdByPayer, payerByCustomerId } = buildCustomerMaps(transactions, excludeId);

        if (!normalizedCustomerId) {
            return {
                isValid: false,
                resolvedCustomerId: "",
                errorKey: "customerIdRequired",
            };
        }

        const existingCustomerId = customerIdByPayer.get(normalizedPayer) || "";
        if (existingCustomerId && existingCustomerId !== normalizedCustomerId) {
            return {
                isValid: false,
                resolvedCustomerId: normalizedCustomerId,
                errorKey: "customerIdMismatch",
            };
        }

        const existingPayerForCustomerId = payerByCustomerId.get(normalizedCustomerId) || "";
        if (existingPayerForCustomerId && existingPayerForCustomerId !== normalizedPayer) {
            return {
                isValid: false,
                resolvedCustomerId: normalizedCustomerId,
                errorKey: "customerNameMismatch",
            };
        }

        return {
            isValid: true,
            resolvedCustomerId: existingCustomerId || normalizedCustomerId,
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

function buildIndexPath({ success, page, filters, deletedAuditId } = {}) {
    try {
        const params = new URLSearchParams();

        if (success) {
            params.set("success", String(success));
        }

        if (deletedAuditId) {
            params.set("deletedAudit", String(deletedAuditId));
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
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);

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
            .map((item) => Number(item.amount || 0))
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
        const currentYear = String(new Date().getFullYear());
        const last30DaysStart = new Date();
        last30DaysStart.setDate(last30DaysStart.getDate() - 30);
        let recent30DaysRevenue = 0;
        let annualCurrentYearTotal = 0;

        transactions.forEach((item) => {
            const amount = Number(item.amount || 0);
            if (!Number.isFinite(amount)) {
                return;
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

        return {
            totalTransactions,
            totalRevenue,
            averageAmount,
            medianAmount,
            largestAmount,
            uniquePayers,
            topPayerName: topPayer[0],
            topPayerAmount: topPayer[1],
            topPurposeName: topPurpose[0],
            topPurposeAmount: topPurpose[1],
            annualCurrentYearTotal,
            recent30DaysRevenue,
            monthOverMonthChangePercent,
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

        if (entry?.action === "undo_delete") {
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

async function renderIndex(res, options = {}) {
    try {
        const lang = getLanguage(options.lang);
        const labels = TRANSLATIONS[lang];
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const settings = await readAppSettings();
        const annualThresholdStatus = calculateAnnualThresholdStatus(allTransactions, settings, labels, lang);
        const availableDates = Array.from(new Set(allTransactions.map((item) => item.date).filter(Boolean)))
            .sort((a, b) => b.localeCompare(a));
        const filters = normalizeFilters(options.filters);
        const filteredTransactions = applyFilters(allTransactions, filters);
        const totalRevenue = allTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const maxDate = getTodayDateString();
        const totalTransactions = filteredTransactions.length;
        const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE));
        const requestedPage = parsePage(options.page);
        const currentPage = Math.min(requestedPage, totalPages);
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageTransactions = filteredTransactions.slice(startIndex, startIndex + PAGE_SIZE);

        return res.status(options.statusCode || 200).render("index", {
            lang,
            isRtl: lang === "he",
            labels,
            transactions: pageTransactions,
            totalTransactions,
            hasAnyTransactions: allTransactions.length > 0,
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
                customer_id: "",
                status: "paid",
                is_refund: false,
                notes: "",
                attachment_path: "",
            },
            error: options.error || null,
            successMessage: options.successMessage || null,
            undoDeleteAuditId: options.undoDeleteAuditId || null,
            settings,
            receiptDirectory: allTransactions.map((item) => ({
                id: item.id,
                receiptNumber: item.receiptNumber || "",
            })),
            customerDirectory: allTransactions
                .map((item) => ({
                    paidBy: String(item.paidBy || "").trim(),
                    customerId: String(item.customer_id || "").trim(),
                }))
                .filter((entry) => entry.paidBy && entry.customerId),
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
                : null;

        await renderIndex(res, {
            lang,
            page,
            filters,
            successMessage,
            undoDeleteAuditId: successCode === "3" ? deletedAudit : null,
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
        const stats = calculateStatistics(allTransactions, lang, labels);

        return res.status(200).render("stats", {
            lang,
            isRtl: lang === "he",
            labels,
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
            customer_id: req.body.customer_id,
            status: req.body.status,
            is_refund: Boolean(req.body.is_refund),
            notes: req.body.notes,
            attachment_path: req.body.attachment_path,
        };

        const amount = Number(formData.amount);
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const paymentMethod = normalizePaymentMethod(formData.payment_method);
        const paymentReference = String(formData.payment_reference || "").trim();
        const status = normalizeStatus(formData.status);
        const paidBy = String(formData.paidBy || "").trim();
        const customerId = String(formData.customer_id || "").trim();
        const notes = String(formData.notes || "").trim();
        const attachmentPathInput = String(formData.attachment_path || "").trim();
        const uploadedAttachmentPath = req.file ? `/uploads/${req.file.filename}` : "";
        const attachmentPath = uploadedAttachmentPath || attachmentPathInput;
        const customerResolution = resolveCustomerIdForPayer({
            transactions: allTransactions,
            paidBy,
            customerId,
        });

        if (!formData.receiptNumber?.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDateNotInFuture(formData.date) || !formData.purpose?.trim() || !formData.paidBy?.trim()) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod || "cash",
                    payment_reference: paymentReference,
                    customer_id: customerId,
                    status: status || "paid",
                    is_refund: Boolean(formData.is_refund),
                    notes,
                    attachment_path: attachmentPath,
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
                    customer_id: customerId,
                    status: status || "paid",
                    notes,
                    attachment_path: attachmentPath,
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
                    customer_id: customerId,
                    notes,
                    attachment_path: attachmentPath,
                },
                error: labels.invalidStatus,
            });
        }

        if (shouldRequirePaymentReference(paymentMethod) && !paymentReference) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod,
                    status,
                    customer_id: customerId,
                    notes,
                    attachment_path: attachmentPath,
                },
                error: labels.paymentReferenceRequired,
            });
        }

        if (!customerResolution.isValid) {
            return await renderIndex(res, {
                lang,
                statusCode: 400,
                formData: {
                    ...formData,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference,
                    status,
                    customer_id: customerId,
                    notes,
                    attachment_path: attachmentPath,
                },
                error: labels[customerResolution.errorKey] || labels.customerIdRequired,
            });
        }

        if (hasDuplicateReceiptNumber(allTransactions, formData.receiptNumber)) {
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
                    attachment_path: attachmentPath,
                },
                error: labels.duplicateReceiptNumber,
            });
        }

        await addTransaction({
            receiptNumber: formData.receiptNumber.trim(),
            amount,
            date: formData.date,
            purpose: formData.purpose.trim(),
            paidBy,
            payment_method: paymentMethod,
            payment_reference: paymentReference,
            customer_id: customerResolution.resolvedCustomerId,
            status,
            is_refund: Boolean(formData.is_refund),
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
        const isValid = Number.isFinite(annualTotalThreshold)
            && annualTotalThreshold > 0
            && Number.isFinite(annualAlertPercent)
            && annualAlertPercent > 0
            && annualAlertPercent <= 100;

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
        });

        return res.redirect(buildIndexPath({ success: 5, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /settings", error));
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
            customer_id: req.body.customer_id,
            status: req.body.status,
            is_refund: Boolean(req.body.is_refund),
            notes: req.body.notes,
            attachment_path: req.body.attachment_path,
            existing_attachment_path: req.body.existing_attachment_path,
        };

        const amount = Number(formData.amount);
        const allTransactions = sortTransactionsByCreatedAt(normalizeTransactions(await readTransactions()));
        const paymentMethod = normalizePaymentMethod(formData.payment_method);
        const paymentReference = String(formData.payment_reference || "").trim();
        const status = normalizeStatus(formData.status);
        const paidBy = String(formData.paidBy || "").trim();
        const customerId = String(formData.customer_id || "").trim();
        const notes = String(formData.notes || "").trim();
        const uploadedAttachmentPath = req.file ? `/uploads/${req.file.filename}` : "";
        const attachmentPathInput = String(formData.attachment_path || "").trim();
        const existingAttachmentPath = String(formData.existing_attachment_path || "").trim();
        const attachmentPath = uploadedAttachmentPath || attachmentPathInput || existingAttachmentPath;
        const customerResolution = resolveCustomerIdForPayer({
            transactions: allTransactions,
            paidBy,
            customerId,
            excludeId: req.params.id,
        });

        if (!formData.receiptNumber?.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDateNotInFuture(formData.date) || !formData.purpose?.trim() || !formData.paidBy?.trim()) {
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

        if (shouldRequirePaymentReference(paymentMethod) && !paymentReference) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.paymentReferenceRequired,
            });
        }

        if (!customerResolution.isValid) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels[customerResolution.errorKey] || labels.customerIdRequired,
            });
        }

        if (hasDuplicateReceiptNumber(allTransactions, formData.receiptNumber, req.params.id)) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.duplicateReceiptNumber,
            });
        }

        const updated = await updateTransaction(req.params.id, {
            receiptNumber: formData.receiptNumber.trim(),
            amount,
            date: formData.date,
            purpose: formData.purpose.trim(),
            paidBy,
            payment_method: paymentMethod,
            payment_reference: paymentReference,
            customer_id: customerResolution.resolvedCustomerId,
            status,
            is_refund: Boolean(formData.is_refund),
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

app.post("/audit/:auditId/undo-delete", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const page = parsePage(req.body.page);
        const filters = resolveBodyFilters(req.body);

        const result = await undoDeleteByAuditId(req.params.auditId);
        if (!result.restored) {
            return await renderIndex(res, {
                lang,
                page,
                filters,
                statusCode: 400,
                error: labels.undoDeleteNotAvailable,
            });
        }

        return res.redirect(buildIndexPath({ success: 4, page, filters }));
    } catch (error) {
        return next(withFunctionError("app.post /audit/:auditId/undo-delete", error));
    }
});

app.get("/admin/audit", async (req, res, next) => {
    try {
        const lang = resolveLanguage(req);
        const labels = TRANSLATIONS[lang];
        const successCode = req.query.success;
        const successMessage = successCode === "1" ? labels.successUndoDeleted : null;

        const entries = await readAuditTrail();
        const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
        const entriesWithReceipt = entries.map((entry) => ({
            ...entry,
            auditReceiptNumber: getAuditReceiptNumber(entry, entriesById),
        }));

        return res.status(200).render("admin-audit", {
            lang,
            isRtl: lang === "he",
            labels,
            entries: entriesWithReceipt,
            successMessage,
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
            return res.redirect("/admin/audit");
        }

        return res.redirect("/admin/audit?success=1");
    } catch (error) {
        return next(withFunctionError("app.post /admin/audit/:auditId/undo-delete", error));
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
                customer_id: req.body?.customer_id || "",
                status: req.body?.status || "paid",
                is_refund: Boolean(req.body?.is_refund),
                notes: req.body?.notes || "",
                attachment_path: req.body?.attachment_path || (req.file ? `/uploads/${req.file.filename}` : ""),
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
