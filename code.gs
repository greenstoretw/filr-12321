/**
 * @fileoverview
 * 這是「永續商店地圖」專案的後端 Google Apps Script 程式碼。
 * 它處理所有 API 請求，並使用 Google Sheets 作為資料庫。
 */

// --- 全域設定 ---

// 【重要】請將此處替換為您的 Google Sheet ID
const SPREADSHEET_ID = "1ipGMr9qwr2basl5b7T7n2aILTJ7jeGBZ1zWvgPshPs"; 
// 【重要】請設定一個安全的後台管理密碼
const ADMIN_PASSWORD = "YOUR_ADMIN_PASSWORD"; 

// 工作表名稱，請確保與您的 Google Sheet 中的工作表名稱一致
const SHEETS = {
  SHOPS: "Shops",
  TAGS: "Tags",
  SUBSCRIBERS: "Subscribers",
  FEEDBACK: "Feedback",
  ANNOUNCEMENTS: "Announcements",
  POLICIES: "Policies"
};

// 支援的語言列表，根據您的 CSV 欄位設定
const LANGUAGES = ['zh-TW', 'en', 'fr', 'de', 'es', 'ja', 'la'];

/**
 * 處理 GET 請求，提供網頁介面。
 * @param {GoogleAppsScript.Events.DoGet} e 事件參數。
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML 輸出。
 */
function doGet(e) {
  if (e.parameter.page === 'admin') {
    // 如果網址參數 page 為 admin，則提供後台管理頁面
    return HtmlService.createTemplateFromFile('index (2)').evaluate()
      .setTitle('永續商店後台管理')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }
  // 預設提供公開的地圖頁面
  return HtmlService.createTemplateFromFile('index (3)').evaluate()
    .setTitle('永續商店地圖')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * 處理 POST 請求，作為 API 端點。
 * @param {GoogleAppsScript.Events.DoPost} e 事件參數。
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 格式的回應。
 */
function doPost(e) {
  let response;
  try {
    const request = JSON.parse(e.postData.contents);
    const { action, payload, password } = request;

    // 需要管理員權限才能執行的操作列表
    const adminActions = [
      'getAdminData', 'saveShop', 'deleteShop', 'saveTag', 'deleteTag',
      'deleteSubscriber', 'sendRecommendation', 'setAnnouncements', 'setPolicy', 'translate'
    ];

    // 如果執行的是管理員操作，則檢查密碼
    if (adminActions.includes(action)) {
      if (password !== ADMIN_PASSWORD) {
        throw new Error("權限不足 (Authentication failed)");
      }
    }

    // 根據 action 參數執行對應的函式
    switch (action) {
      // 公開 API
      case 'getPublicData':
        response = getPublicData();
        break;
      case 'subscribe':
        response = subscribe(payload);
        break;
      case 'submitFeedback':
        response = submitFeedback(payload);
        break;
      // 後台 API
      case 'login':
        response = login(payload);
        break;
      case 'getAdminData':
        response = getAdminData();
        break;
      case 'saveShop':
        response = saveShop(payload);
        break;
      case 'deleteShop':
        response = deleteShop(payload);
        break;
      case 'saveTag':
         response = saveTag(payload);
        break;
      case 'deleteTag':
        response = deleteTag(payload);
        break;
      case 'deleteSubscriber':
        response = deleteSubscriber(payload);
        break;
      case 'sendRecommendation':
        response = sendRecommendation(payload);
        break;
      case 'setAnnouncements':
        response = setAnnouncements(payload);
        break;
      case 'setPolicy':
        response = setPolicy(payload);
        break;
      case 'translate':
        response = translate(payload);
        break;
      default:
        throw new Error(`未知的操作 (Unknown action): ${action}`);
    }
    // 成功時回傳 JSON
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: response }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // 發生錯誤時記錄並回傳錯誤訊息
    Logger.log(error);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- Google Sheet 互動輔助函式 ---

/**
 * 將工作表的二維陣列資料轉換為物件陣列。
 * @param {Array<Array<any>>} data 來自 getValues() 的二維陣列。
 * @returns {Array<Object>} 物件陣列。
 */
function sheetDataToObjects(data) {
  if (data.length < 2) return [];
  const headers = data[0].map(h => h.trim());
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

/**
 * 從指定的工作表獲取所有資料。
 * @param {string} sheetName 工作表名稱。
 * @returns {Array<Object>} 物件陣列。
 */
function getSheetData(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0) return [];
  const data = sheet.getDataRange().getValues();
  return sheetDataToObjects(data);
}

/**
 * 根據唯一鍵值更新工作表中的一列。
 * @param {string} sheetName 工作表名稱。
 * @param {string} keyColumn 唯一鍵的欄位標題 (例如 'id')。
 * @param {any} keyValue 要尋找的鍵值。
 * @param {Object} rowObject 包含新資料的物件。
 */
function updateRow(sheetName, keyColumn, keyValue, rowObject) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const keyIndex = headers.indexOf(keyColumn);

    if (keyIndex === -1) throw new Error(`在工作表 '${sheetName}' 中找不到欄位 '${keyColumn}'。`);

    const rowIndex = data.findIndex(row => row[keyIndex] == keyValue);

    if (rowIndex === -1) throw new Error(`找不到 ${keyColumn} = ${keyValue} 的資料列。`);

    const newRow = headers.map(header => rowObject[header] !== undefined ? rowObject[header] : data[rowIndex][headers.indexOf(header)]);
    sheet.getRange(rowIndex + 1, 1, 1, newRow.length).setValues([newRow]);
}

/**
 * 在工作表末尾添加新的一列。
 * @param {string} sheetName 工作表名稱。
 * @param {Object} rowObject 包含新資料的物件。
 */
function appendRow(sheetName, rowObject) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => rowObject[header] || '');
    sheet.appendRow(newRow);
}

/**
 * 根據唯一鍵值刪除工作表中的一列。
 * @param {string} sheetName 工作表名稱。
 * @param {string} keyColumn 唯一鍵的欄位標題。
 * @param {any} keyValue 要尋找的鍵值。
 */
function deleteRowByKey(sheetName, keyColumn, keyValue) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const keyIndex = headers.indexOf(keyColumn);

    if (keyIndex === -1) throw new Error(`在工作表 '${sheetName}' 中找不到欄位 '${keyColumn}'。`);
    
    const rowIndex = data.findIndex(row => row[keyIndex] == keyValue);

    if (rowIndex > 0) { // rowIndex 是從 0 開始，所以 > 0 才代表是資料列
        sheet.deleteRow(rowIndex + 1);
        return { message: `項目已刪除 (Item deleted)` };
    } else {
        throw new Error(`找不到要刪除的項目 (Item to delete not found)`);
    }
}


// --- API 函式實作 ---

/**
 * 獲取所有公開資料 (商店、標籤、公告、政策)。
 */
function getPublicData() {
    const tagsData = getSheetData(SHEETS.TAGS);
    const tagsMap = tagsData.reduce((acc, tag) => {
        acc[tag.id] = tag;
        return acc;
    }, {});
    
    const policiesData = getSheetData(SHEETS.POLICIES);
    const policiesMap = policiesData.reduce((acc, policy) => {
        acc[policy.key] = policy;
        return acc;
    }, {});

    return {
        shops: getSheetData(SHEETS.SHOPS),
        tags: tagsMap,
        announcements: (getSheetData(SHEETS.ANNOUNCEMENTS)[0] || {}),
        policies: policiesMap,
    };
}

/**
 * 處理電子報訂閱。
 */
function subscribe({ email }) {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('無效的電子郵件格式 (Invalid email format)');
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.SUBSCRIBERS);
  
  const emails = sheet.getRange("A:A").getValues().flat();
  if (emails.includes(email)) {
    return { message: '您已訂閱 (You are already subscribed)' };
  }
  
  sheet.appendRow([email, new Date()]);
  return { message: '訂閱成功！ (Subscription successful!)' };
}

/**
 * 處理意見回饋提交。
 */
function submitFeedback({ email, type, message }) {
  if (!email || !message || !type) {
    throw new Error('請填寫所有欄位 (Please fill all fields)');
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.FEEDBACK);
  sheet.appendRow([email, type, message, new Date()]);
  return { message: '感謝您的回饋！ (Thank you for your feedback!)' };
}

/**
 * 處理後台登入。
 */
function login({ password }) {
  if (password === ADMIN_PASSWORD) {
    return { success: true };
  } else {
    throw new Error('密碼錯誤 (Incorrect password)');
  }
}

/**
 * 獲取所有後台管理資料。
 */
function getAdminData() {
  return {
    shops: getSheetData(SHEETS.SHOPS),
    tags: getSheetData(SHEETS.TAGS),
    subscribers: getSheetData(SHEETS.SUBSCRIBERS),
    feedback: getSheetData(SHEETS.FEEDBACK),
    announcements: (getSheetData(SHEETS.ANNOUNCEMENTS)[0] || {}),
    policies: getSheetData(SHEETS.POLICIES),
  };
}

/**
 * 儲存 (新增或更新) 店家資料。
 */
function saveShop(shopData) {
  if (shopData.id) { // 如果有 id，則為更新
    updateRow(SHEETS.SHOPS, 'id', shopData.id, shopData);
  } else { // 否則為新增
    shopData.id = (shopData.name_en || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
    appendRow(SHEETS.SHOPS, shopData);
  }
  return { message: '店家已儲存 (Shop saved)', shop: shopData };
}

/**
 * 刪除店家。
 */
function deleteShop({ id }) {
  return deleteRowByKey(SHEETS.SHOPS, 'id', id);
}

/**
 * 儲存 (新增或更新) 標籤資料。
 */
function saveTag(tagData) {
   if (tagData.id) { // 更新
        updateRow(SHEETS.TAGS, 'id', tagData.id, tagData);
    } else { // 新增
        tagData.id = (tagData.name_en || 'tag').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
        appendRow(SHEETS.TAGS, tagData);
    }
    return { message: '標籤已儲存 (Tag saved)', tag: tagData };
}

/**
 * 刪除標籤。
 */
function deleteTag({ id }) {
  return deleteRowByKey(SHEETS.TAGS, 'id', id);
}

/**
 * 刪除訂閱者。
 */
function deleteSubscriber({ email }) {
  return deleteRowByKey(SHEETS.SUBSCRIBERS, 'Email', email);
}

/**
 * 儲存公告。
 */
function setAnnouncements(payload) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.ANNOUNCEMENTS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 公告通常只有一列資料，直接更新第二列
    const newRow = headers.map(header => payload[header] || '');
    sheet.getRange(2, 1, 1, newRow.length).setValues([newRow]);
    
    return { message: '公告已儲存 (Announcements saved)' };
}

/**
 * 儲存單一政策。
 */
function setPolicy({ key, value }) {
    // 後台一次只儲存一個語言的政策（預設為 zh-TW）
    const policyData = { [`value_zh-TW`]: value };
    updateRow(SHEETS.POLICIES, 'key', key, policyData);
    return { message: '政策已儲存 (Policy saved)' };
}

/**
 * 翻譯文字。
 */
function translate({ text, sourceLang, targetLang }) {
  if (!text) return { translatedText: "" };
  // 處理 Google Translate API 對中文語系代碼的要求
  const mapLang = (lang) => {
    if (lang === 'zh-TW') return 'zh-Hant';
    return lang;
  }
  const translatedText = LanguageApp.translate(text, mapLang(sourceLang), mapLang(targetLang));
  return { translatedText };
}

/**
 * 發送推薦店家電子郵件給所有訂閱者。
 */
function sendRecommendation({ shopId }) {
    const shops = getSheetData(SHEETS.SHOPS);
    const shop = shops.find(s => s.id == shopId);

    if (!shop) {
        throw new Error('找不到店家 (Shop not found)');
    }

    const subscribers = getSheetData(SHEETS.SUBSCRIBERS);
    const emails = subscribers.map(s => s.Email).filter(Boolean);

    if (emails.length === 0) {
        return { message: '沒有訂閱者可供發送 (No subscribers to send to)' };
    }

    // 【重要】請將 YOUR_WEB_APP_URL 替換為您部署後的網路應用程式 URL
    const webAppUrl = "YOUR_WEB_APP_URL"; 

    const subject = `【永續商店地圖推薦】 ${shop['name_zh-TW']}`;
    const body = `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
            <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #2E7D32;">永續商店地圖 - 本週推薦</h2>
                <h3 style="color: #1B5E20;">${shop['name_zh-TW']} (${shop['name_en']})</h3>
                <p><b>類型：</b> ${shop['type_zh-TW']}</p>
                <p><b>地址：</b> ${shop['address_zh-TW']}</p>
                <p style="background-color: #F1F8E9; padding: 15px; border-radius: 5px;">${(shop['longDescription_zh-TW'] || '').replace(/\n/g, '<br>')}</p>
                <p style="text-align: center; margin-top: 25px;">
                  <a href="${webAppUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">查看更多資訊</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777; text-align: center;">您會收到此郵件是因為您訂閱了永續商店地圖的電子報。</p>
            </div>
        </body>
        </html>
    `;

    // 為了避免超出 Google 的郵件發送配額，使用迴圈並加入延遲
    emails.forEach(email => {
        try {
            MailApp.sendEmail({
                to: email,
                subject: subject,
                htmlBody: body,
                name: '永續商店地圖'
            });
            Utilities.sleep(1100); // 每次發送後延遲 1.1 秒
        } catch (e) {
            Logger.log(`無法發送郵件至 ${email}: ${e.message}`);
        }
    });

    return { message: `已開始將 ${shop['name_zh-TW']} 的推薦信發送給 ${emails.length} 位訂閱者。` };
}

