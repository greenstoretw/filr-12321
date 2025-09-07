/**
 * Sustainable Store Map - Backend (Apps Script) - v20.1 (UI-Independent Auth Fix)
 * 解決了因在獨立腳本中呼叫 SpreadsheetApp.getUi() 而導致的執行環境錯誤。
 *
 * 核心變更：
 * 1.  將 forceReAuthorization 函式中的 .getUi().alert() 回饋機制，
 * 替換為 console.log()。這使得函式可以在任何執行環境（包括獨立腳本）下被安全地手動執行，
 * 同時開發者仍可在執行紀錄中查看結果。
 */

// =================================================================
// SPREADSHEET CONFIGURATION
// =================================================================
const SPREADSHEET_ID = '1ipGMr9qwr2basl5bA6e_230rgi9Q9THS-Oa-pC0f-i8';
const TOKEN_EXPIRATION = 60 * 60 * 8; // 8 hours in seconds

// =================================================================
// ROBUST SHEET ACCESSOR FUNCTIONS
// =================================================================
/**
 * 取得主要的 Spreadsheet 物件。
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Spreadsheet 物件。
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * 依據名稱取得特定的 Sheet 物件。
 * @param {string} name 工作表的名稱。
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Sheet 物件。
 */
function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}


// =================================================================
// AUTHORIZATION FIX UTILITY
// =================================================================
/**
 * [工具函式] 強制重新授權
 * 請從 Apps Script 編輯器頂端手動選擇並執行此函式，以修復試算表存取權限問題。
 * 執行後，請遵循彈出視窗的指示，並在左側「執行紀錄」中查看結果。
 */
function forceReAuthorization() {
  try {
    const ss = getSpreadsheet(); // 現在會在這裡觸發授權
    console.log('成功存取試算表！權限看起來是正常的。');
  } catch (e) {
    console.error('觸發授權流程時發生錯誤。如果您已完成授權，請忽略此訊息。錯誤: ' + e.message);
  }
}

// =================================================================
// CORS HANDLING
// =================================================================
const ALLOWED_ORIGINS = [
  'https://greenstoretw.github.io',
  'http://127.0.0.1:5500'
];

function doOptions(e) {
  const origin = e.headers.origin;
  const output = ContentService.createTextOutput();
  if (ALLOWED_ORIGINS.indexOf(origin) > -1) {
    output.setHeader('Access-Control-Allow-Origin', origin)
          .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  return output.withMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// MAIN ROUTER (doPost)
// =================================================================

function doPost(e) {
  const origin = e.headers.origin;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    const publicActions = {
      'getPublicData': getPublicData, 'getPublicPolicies': getPublicPolicies,
      'submitFeedback': submitFeedback, 'sendRecommendation': sendRecommendation,
      'login': login,
    };

    if (publicActions[action]) {
      const result = publicActions[action](payload);
      return successResponse(result, origin);
    }

    const token = payload.token;
    if (!verifyToken(token)) {
      return errorResponse('無效或過期的 token。請重新登入。', origin, 401);
    }
    
    const adminActions = {
        'getDashboardStats': getDashboardStats, 'getSubscribers': getSubscribers,
        'deleteSubscriber': (p) => deleteSubscriber(p.email), 'getAnnouncements': getAnnouncements,
        'setAnnouncements': (p) => setAnnouncements(p.announcements), 'getPolicies': getPolicies,
        'setPolicy': (p) => setPolicy(p.key, p.value), 'getShops': getShops,
        'getShopById': (p) => getShopById(p.id), 'saveShop': (p) => saveShop(p.shop),
        'deleteShop': (p) => deleteShop(p.id),
        'getFeedback': getFeedback,
        'updateFeedbackStatus': (p) => updateFeedbackStatus(p)
    };
    
    if (adminActions[action]) {
        const result = adminActions[action](payload);
        return successResponse(result, origin);
    }

    return errorResponse(`未知的 action: ${action}`, origin);

  } catch (err) {
    console.error(`doPost Error: ${err.toString()}`, { message: err.message, stack: err.stack, requestData: e.postData.contents });
    return errorResponse(`伺服器內部錯誤: ${err.message}`, origin);
  }
}

// =================================================================
// RESPONSE HELPERS
// =================================================================
function createJsonResponse(data, origin) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .withMimeType(ContentService.MimeType.JSON);
  if (ALLOWED_ORIGINS.indexOf(origin) > -1) {
    output.setHeader('Access-Control-Allow-Origin', origin);
  }
  return output;
}
function successResponse(data, origin) { return createJsonResponse({ status: 'success', data: data }, origin); }
function errorResponse(message, origin, statusCode = 500) { return createJsonResponse({ status: 'error', message: message }, origin); }

// =================================================================
// AUTHENTICATION (STABLE VERSION)
// =================================================================
function login(payload) {
    const ADMIN_PASSWORD = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!ADMIN_PASSWORD) { throw new Error('後台管理員密碼 (ADMIN_PASSWORD) 未在指令碼屬性中設定。'); }
    if (payload.password === ADMIN_PASSWORD) { return { token: createToken({ user: 'admin' }) }; } 
    else { throw new Error('密碼錯誤'); }
}
function createToken(payload) {
    const TOKEN_SECRET = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
    if (!TOKEN_SECRET) { throw new Error('Token Secret (TOKEN_SECRET) 未在指令碼屬性中設定。'); }
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...payload, iat: now, exp: now + TOKEN_EXPIRATION };
    const toSign = `${Utilities.base64EncodeWebSafe(JSON.stringify(header))}.${Utilities.base64EncodeWebSafe(JSON.stringify(claims))}`;
    const signature = Utilities.computeHmacSha256Signature(toSign, TOKEN_SECRET);
    return `${toSign}.${Utilities.base64EncodeWebSafe(signature)}`;
}
function verifyToken(token) {
    try {
        if (!token) return null;
        const TOKEN_SECRET = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
        if (!TOKEN_SECRET) { console.error("TOKEN_SECRET is not set in Script Properties."); return null; }
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const toSign = `${parts[0]}.${parts[1]}`;
        const computedSignature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(toSign, TOKEN_SECRET));
        if (computedSignature !== parts[2]) return null;
        const claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
        return (claims.exp < Math.floor(Date.now() / 1000)) ? null : claims;
    } catch (e) { console.error("Error during token verification: " + e.toString()); return null; }
}

// =================================================================
// FEEDBACK MANAGEMENT FUNCTIONS
// =================================================================
function getFeedback() {
    const feedbackSheet = getSheet('Feedback');
    const feedbackData = sheetToObjects(feedbackSheet);
    return feedbackData.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
}
function updateFeedbackStatus(payload) {
    const { timestamp, newStatus } = payload;
    if (!timestamp || !newStatus) { throw new Error('缺少必要參數 (timestamp, newStatus)'); }
    const feedbackSheet = getSheet('Feedback');
    const data = feedbackSheet.getDataRange().getValues();
    const headers = data[0];
    const timestampIndex = headers.indexOf('Timestamp');
    const statusIndex = headers.indexOf('Status');
    if (timestampIndex === -1 || statusIndex === -1) { throw new Error('Feedback 表格缺少 Timestamp 或 Status 欄位'); }
    const rowIndex = data.findIndex(row => row[timestampIndex] && new Date(row[timestampIndex]).toISOString() === new Date(timestamp).toISOString());
    if (rowIndex > 0) {
        feedbackSheet.getRange(rowIndex + 1, statusIndex + 1).setValue(newStatus);
        return { message: '狀態更新成功' };
    } else { throw new Error('找不到該筆回報紀錄'); }
}

// =================================================================
// UTILITY & OTHER FUNCTIONS
// =================================================================
function sheetToObjects(sheet) { if (!sheet) return []; const data = sheet.getDataRange().getValues(); if (data.length < 2) return []; const headers = data[0].map(h => h.trim()); return data.slice(1).map(row => { const obj = {}; headers.forEach((header, i) => { obj[header] = row[i]; }); return obj; }); }
function objectsToSheet(sheet, objects) { if (!sheet) return; if (objects.length === 0) { const lastRow = sheet.getLastRow(); if (lastRow > 1) { sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent(); } return; } const headers = Object.keys(objects[0]); const data = [headers]; objects.forEach(obj => { data.push(headers.map(header => obj[header] || "")); }); sheet.clearContents(); sheet.getRange(1, 1, data.length, headers.length).setValues(data); }
function getPublicData() { return { shops: sheetToObjects(getSheet('Shops')), announcements: getSheet('Announcements').getRange('A1').getValue() }; }
function getPublicPolicies() { return sheetToObjects(getSheet('Policies')).map(({ key, value }) => ({ key, value })); }
function submitFeedback(payload) { const { shopId, shopName, feedbackType, comment } = payload; if (!feedbackType || !comment) throw new Error('缺少必要的回報資訊。'); getSheet('Feedback').appendRow([new Date(), shopId || 'N/A', shopName || 'N/A', feedbackType, comment, 'new']); return { message: '感謝您的回報！' }; }
function sendRecommendation(payload) { const { recipientEmail, shopName, shopAddress, shopWebsite } = payload; if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) throw new Error('無效的收件者電子郵件格式'); if (!shopName) throw new Error('缺少店家名稱'); const subject = `您的朋友推薦了一家永續商店給您：${shopName}`; const body = `<p>您好，</p><p>您的朋友認為您可能會對這家永續商店感興趣：</p><h3 style="color: #2E7D32;">${shopName}</h3><p><strong>地址：</strong> ${shopAddress || '未提供'}</p><p><strong>網站：</strong> <a href="${shopWebsite}">${shopWebsite || '未提供'}</a></p><br><p>這封信件是透過「永續商店地圖」網站發送的。</p>`; MailApp.sendEmail({ to: recipientEmail, subject: subject, htmlBody: body }); return { message: '推薦信已成功寄出！' }; }
function getDashboardStats() { const subscribersSheet = getSheet('Subscribers'); const shopsSheet = getSheet('Shops'); const feedbackSheet = getSheet('Feedback'); return { subscriberCount: subscribersSheet.getLastRow() > 1 ? subscribersSheet.getLastRow() - 1 : 0, shopCount: shopsSheet.getLastRow() > 1 ? shopsSheet.getLastRow() - 1 : 0, feedbackCount: feedbackSheet.getLastRow() > 1 ? feedbackSheet.getLastRow() - 1 : 0 }; }
function getSubscribers() { return sheetToObjects(getSheet('Subscribers')).map(s => ({ email: s.Email, timestamp: s.Timestamp })); }
function deleteSubscriber(email) { const subscribersSheet = getSheet('Subscribers'); const data = subscribersSheet.getDataRange().getValues(); const index = data.findIndex(row => row[0] === email); if (index > -1) { subscribersSheet.deleteRow(index + 1); return { message: '刪除成功' }; } throw new Error('找不到該訂閱者'); }
function getAnnouncements() { return getSheet('Announcements').getRange(1, 1).getValue(); }
function setAnnouncements(announcements) { getSheet('Announcements').getRange(1, 1).setValue(announcements); return { message: '公告更新成功' }; }
function getPolicies() { return sheetToObjects(getSheet('Policies')); }
function setPolicy(key, value) { const policiesSheet = getSheet('Policies'); const data = policiesSheet.getDataRange().getValues(); const headers = data[0]; const keyIndex = headers.indexOf('key'); const valueIndex = headers.indexOf('value'); const rowIndex = data.findIndex(row => row[keyIndex] === key); if (rowIndex > -1) { policiesSheet.getRange(rowIndex + 1, valueIndex + 1).setValue(value); return { message: '政策更新成功' }; } throw new Error('找不到該政策'); }
function getShops() { return sheetToObjects(getSheet('Shops')); }
function getShopById(id) { const shop = sheetToObjects(getSheet('Shops')).find(s => s.id === id); if (!shop) throw new Error('找不到店家'); return shop; }
function saveShop(shopData) { const shopsSheet = getSheet('Shops'); const shops = sheetToObjects(shopsSheet); if (shopData.id) { const index = shops.findIndex(s => s.id === shopData.id); if (index > -1) shops[index] = { ...shops[index], ...shopData }; else throw new Error('找不到要更新的店家'); } else { shopData.id = Utilities.getUuid(); shops.push(shopData); } objectsToSheet(shopsSheet, shops); return { message: '店家儲存成功', id: shopData.id }; }
function deleteShop(id) { const shopsSheet = getSheet('Shops'); const shops = sheetToObjects(shopsSheet); const filteredShops = shops.filter(s => s.id !== id); if (shops.length === filteredShops.length) throw new Error('找不到要刪除的店家'); objectsToSheet(shopsSheet, filteredShops); return { message: '店家刪除成功' }; }

