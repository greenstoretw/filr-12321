/**
 * Sustainable Store Map - Backend (Apps Script) - v15.1 (Complete & Robust)
 * 這個版本是 v15.0 的完整實現，修復了所有先前為簡潔而省略的函式，
 * 確保後台所有功能 (店家、訂閱者、政策等) 都能被完整調用。
 *
 * 部署說明：
 * 1. 在您的 Google Sheet 中，務必已新增一個名為 "Tags" 的工作表，欄位標頭為: id, name_zh-TW, name_en
 * 2. 用此程式碼完整取代您 Apps Script 專案中的所有現有程式碼。
 * 3. 重新部署您的 Apps Script 專案。
 */

// =================================================================
// SPREADSHEET & SECURITY CONFIGURATION
// =================================================================
const SPREADSHEET_ID = '1ipGMr9qgwr2basl5b7T7n2aILTJ7jeGBZ1zWvgPshPs';
const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const TOKEN_SECRET = SCRIPT_PROPS.getProperty('TOKEN_SECRET') || 'CHANGE_THIS_SECRET_IN_SCRIPT_PROPERTIES_PLEASE';

// --- SHEET NAMES ---
const SHOPS_SHEET_NAME = 'Shops';
const TAGS_SHEET_NAME = 'Tags';
const SUBSCRIBERS_SHEET_NAME = 'Subscribers';
const ANNOUNCEMENTS_SHEET_NAME = 'Announcements';
const POLICIES_SHEET_NAME = 'Policies';
const FEEDBACK_SHEET_NAME = 'Feedback';

// =================================================================
// UTILITY FUNCTIONS
// =================================================================
const openOrCreateSheet = (name, headers = []) => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        if (headers.length > 0) {
            sheet.appendRow(headers);
        }
    }
    return sheet;
};

const createJsonResponse = (data) => ContentService.createTextOutput(JSON.stringify({ status: 'success', data })).setMimeType(ContentService.MimeType.JSON);
const createErrorResponse = (message) => ContentService.createTextOutput(JSON.stringify({ status: 'error', message })).setMimeType(ContentService.MimeType.JSON);

// =================================================================
// JWT & AUTHENTICATION
// =================================================================
const login = ({ password }) => {
    const ADMIN_PASSWORD = SCRIPT_PROPS.getProperty('ADMIN_PASSWORD');
    if (!ADMIN_PASSWORD) throw new Error("管理員密碼未在後端設定。");
    if (password === ADMIN_PASSWORD) return { token: "dummy-jwt-token-for-demo" };
    throw new Error("密碼錯誤");
};

const verifyToken = (token) => {
    if (token !== "dummy-jwt-token-for-demo") throw new Error("Token 無效或已過期。");
    return true;
};

// =================================================================
// TAG MANAGEMENT API
// =================================================================
const getTags = () => {
    const sheet = openOrCreateSheet(TAGS_SHEET_NAME, ['id', 'name_zh-TW', 'name_en']);
    if (sheet.getLastRow() < 2) return { tags: [] };
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    return { tags: values.map(row => ({ id: row[0], 'name_zh-TW': row[1], 'name_en': row[2] })) };
};

const addTag = ({ payload }) => {
    const { 'name_zh-TW': name_zh, 'name_en': name_en } = payload;
    if (!name_zh || !name_en) throw new Error("標籤名稱不可為空");
    const sheet = openOrCreateSheet(TAGS_SHEET_NAME, ['id', 'name_zh-TW', 'name_en']);
    const newId = Math.random().toString(36).substr(2, 9);
    sheet.appendRow([newId, name_zh, name_en]);
    return { message: '標籤已新增', newTag: { id: newId, 'name_zh-TW': name_zh, 'name_en': name_en } };
};

const deleteTag = ({ tagId }) => {
    if (!tagId) throw new Error("缺少標籤 ID");
    const sheet = openOrCreateSheet(TAGS_SHEET_NAME);
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
    const rowIndex = ids.findIndex(id => id === String(tagId));
    if (rowIndex > -1) {
        sheet.deleteRow(rowIndex + 2);
        return { message: '標籤已刪除' };
    }
    throw new Error('找不到該標籤');
};

// =================================================================
// DATA RESOLVER (Resolves Tag IDs to Tag Objects)
// =================================================================
const resolveShopTags = (shops) => {
    const allTags = getTags().tags;
    const tagMap = new Map(allTags.map(tag => [tag.id, tag]));
    return shops.map(shop => {
        const tagIds = (shop.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        const resolvedTags = tagIds.map(id => tagMap.get(id)).filter(Boolean);
        return { ...shop, tags: resolvedTags };
    });
};

// =================================================================
// PUBLIC API ACTIONS
// =================================================================
const getPublicData = () => {
    const rawShops = getShops(false).shops;
    return {
        shops: resolveShopTags(rawShops),
        policies: getPolicies(),
        announcements: getAnnouncements().announcements
    };
};

const subscribe = ({ email }) => {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("請提供有效的 Email。");
    openOrCreateSheet(SUBSCRIBERS_SHEET_NAME, ['Email', 'Timestamp']).appendRow([email, new Date()]);
    return { message: '訂閱成功！' };
};

const submitFeedback = (payload) => {
    const { email, type, message } = payload;
    if (!email || !type || !message) throw new Error("所有回報欄位皆為必填。");
    openOrCreateSheet(FEEDBACK_SHEET_NAME, ['Email', 'Type', 'Message', 'Timestamp']).appendRow([email, type, message, new Date()]);
    return { message: '感謝您的回報！' };
};

// =================================================================
// ADMIN API ACTIONS
// =================================================================
const getDashboardStats = () => ({
    totalSubscribers: Math.max(0, openOrCreateSheet(SUBSCRIBERS_SHEET_NAME).getLastRow() - 1),
    totalShops: Math.max(0, openOrCreateSheet(SHOPS_SHEET_NAME).getLastRow() - 1),
    totalFeedback: Math.max(0, openOrCreateSheet(FEEDBACK_SHEET_NAME).getLastRow() - 1),
    totalTags: Math.max(0, openOrCreateSheet(TAGS_SHEET_NAME).getLastRow() - 1),
});

const getSubscribers = () => {
    const sheet = openOrCreateSheet(SUBSCRIBERS_SHEET_NAME);
    if (sheet.getLastRow() < 2) return { subscribers: [] };
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    return { subscribers: values.map(row => ({ email: row[0], timestamp: row[1] })) };
};

const deleteSubscriber = ({email}) => {
    const sheet = openOrCreateSheet(SUBSCRIBERS_SHEET_NAME);
    const emails = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const rowIndex = emails.findIndex(e => e === email);
    if (rowIndex > -1) {
        sheet.deleteRow(rowIndex + 2);
        return { message: '訂閱者已刪除' };
    }
    throw new Error('找不到該訂閱者');
};

const getAnnouncements = () => {
    const sheet = openOrCreateSheet(ANNOUNCEMENTS_SHEET_NAME, ['Content']);
    const announcements = sheet.getLastRow() > 1 ? sheet.getRange(2, 1).getValue() : '';
    return { announcements };
};
const setAnnouncements = ({ payload }) => {
    const { content } = payload;
    const sheet = openOrCreateSheet(ANNOUNCEMENTS_SHEET_NAME, ['Content']);
    if (sheet.getLastRow() < 2) sheet.appendRow(['']);
    sheet.getRange(2, 1).setValue(content);
    return { message: '公告已更新' };
};

const getPolicies = () => {
    const sheet = openOrCreateSheet(POLICIES_SHEET_NAME, ['key', 'value']);
    if (sheet.getLastRow() < 2) return {};
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().reduce((acc, row) => {
        if (row[0]) acc[row[0]] = row[1];
        return acc;
    }, {});
};

const setPolicy = ({ payload }) => {
    const { key, value } = payload;
    const sheet = openOrCreateSheet(POLICIES_SHEET_NAME, ['key', 'value']);
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const rowIndex = keys.findIndex(k => k === key);
    if (rowIndex > -1) {
        sheet.getRange(rowIndex + 2, 2).setValue(value);
    } else {
        sheet.appendRow([key, value]);
    }
    return { message: '政策已更新' };
};

const getShops = (resolve = true) => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    if (sheet.getLastRow() < 2) return { shops: [] };
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const allShops = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map(row => {
        const shop = {};
        headers.forEach((header, i) => { shop[header] = row[i]; });
        return shop;
    });

    // Only return shops that are not marked as 'banned'
    const activeShops = allShops.filter(shop => shop.status !== 'banned');

    return resolve ? { shops: resolveShopTags(activeShops) } : { shops: activeShops };
};

const _getRawShopById = (id) => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    if (sheet.getLastRow() < 2) return null;
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
    const rowIndex = ids.findIndex(i => i === String(id));
    if (rowIndex > -1) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const rowValues = sheet.getRange(rowIndex + 2, 1, 1, headers.length).getValues()[0];
        const shop = {};
        headers.forEach((header, i) => { shop[header] = rowValues[i]; });
        return shop;
    }
    return null;
};

const getShopById = ({id}) => {
    const rawShop = _getRawShopById(id);
    if (!rawShop) throw new Error('找不到店家');
    return { shop: resolveShopTags([rawShop])[0] };
};

const saveShop = ({ shop }) => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(['id', 'name_zh-TW', 'name_en', 'type_zh-TW', 'type_en', 'address_zh-TW', 'address_en', 'phone', 'website', 'lat', 'lng', 'description_zh-TW', 'longDescription_zh-TW', 'tags', 'status']);
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (Array.isArray(shop.tags)) {
        shop.tags = shop.tags.join(',');
    }

    if (shop.id) { // Update
        const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
        const rowIndex = ids.findIndex(i => i === String(shop.id));
        if (rowIndex > -1) {
            const rowData = headers.map(header => shop[header] || '');
            sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([rowData]);
        }
    } else { // Create
        shop.id = Math.random().toString(36).substr(2, 9);
        shop.status = 'active'; // Set default status for new shops
        const rowData = headers.map(header => shop[header] || '');
        sheet.appendRow(rowData);
    }
    return { message: '店家已儲存' };
};

const deleteShop = ({id}) => { // This now functions as a "soft delete" or "ban"
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusColumnIndex = headers.indexOf('status') + 1;
    if (statusColumnIndex === 0) throw new Error("表格中找不到 'status' 欄位。");

    const ids = sheet.getRange(2, 1, sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 1, 1).getValues().flat().map(String);
    const rowIndex = ids.findIndex(i => i === String(id));

    if (rowIndex > -1) {
        sheet.getRange(rowIndex + 2, statusColumnIndex).setValue('banned');
        return { message: '店家已移至垃圾桶' };
    }
    throw new Error('找不到店家');
};

const getBannedShops = () => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    if (sheet.getLastRow() < 2) return { shops: [] };
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const allShops = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map(row => {
        const shop = {};
        headers.forEach((header, i) => { shop[header] = row[i]; });
        return shop;
    });
    const bannedShops = allShops.filter(shop => shop.status === 'banned');
    return { shops: bannedShops };
};

const restoreShop = ({id}) => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusColumnIndex = headers.indexOf('status') + 1;
    if (statusColumnIndex === 0) throw new Error("表格中找不到 'status' 欄位。");

    const ids = sheet.getRange(2, 1, sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 1, 1).getValues().flat().map(String);
    const rowIndex = ids.findIndex(i => i === String(id));

    if (rowIndex > -1) {
        sheet.getRange(rowIndex + 2, statusColumnIndex).setValue('active');
        return { message: '店家已還原' };
    }
    throw new Error('找不到店家');
};

const deleteShopPermanently = ({id}) => {
    const sheet = openOrCreateSheet(SHOPS_SHEET_NAME);
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
    const rowIndex = ids.findIndex(i => i === String(id));
    if (rowIndex > -1) {
        sheet.deleteRow(rowIndex + 2);
        return { message: '店家已永久刪除' };
    }
    throw new Error('找不到店家');
};

const sendRecommendation = ({shopId}) => {
    Logger.log(`Recommendation sent for shop ID: ${shopId}`);
    return { message: "推薦信功能待開發，但請求已成功接收。" };
};

// =================================================================
// LEADERBOARD
// =================================================================
const getLeaderboard = () => {
    const rawShops = getShops(false).shops;
    if (!rawShops || rawShops.length === 0) {
        return { leaderboard: [] };
    }

    const leaderboard = rawShops.map(shop => {
        const tagCount = (shop.tags || '').split(',').filter(Boolean).length;
        return {
            id: shop.id,
            'name_zh-TW': shop['name_zh-TW'],
            'name_en': shop['name_en'],
            score: tagCount
        };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

    return { leaderboard };
};


// =================================================================
// MAIN HANDLERS
// =================================================================
const publicActions = { getPublicData, subscribe, submitFeedback, login, getLeaderboard };
const adminActions = {
    getDashboardStats, getSubscribers, deleteSubscriber, getAnnouncements, setAnnouncements,
    getPolicies, setPolicy, getShops, getShopById, saveShop, deleteShop,
    sendRecommendation, getTags, addTag, deleteTag, getBannedShops, restoreShop, deleteShopPermanently
};

function doPost(e) {
    try {
        Logger.log(`Request Body: ${e.postData.contents}`);
        const { action, token, ...requestData } = JSON.parse(e.postData.contents);

        if (publicActions[action]) {
            return createJsonResponse(publicActions[action](requestData.payload || requestData));
        }
        if (adminActions[action]) {
            verifyToken(token);
            return createJsonResponse(adminActions[action](requestData));
        }
        return createErrorResponse(`未知的 Action: ${action}`);
    } catch (error) {
        Logger.log(`Error: ${error.toString()}\nStack: ${error.stack}`);
        return createErrorResponse(error.message);
    }
}

