# Greenroof (綠簷) - Firebase 設定指南

本文件旨在說明如何設定您的 Firebase 專案，以成功運行公開網站 (`index (3).html`) 和後台管理面板 (`index (2).html`)。

專案的後端已完全從 Google Apps Script 遷移至 Firebase，因此舊的 `code.gs` 檔案和 Google Sheets 已不再需要。

---

## 1. Firebase 專案設定

1.  **建立專案**：前往 [Firebase 控制台](https://console.firebase.google.com/) 並建立一個新專案。
2.  **註冊您的 Web 應用**：在您的專案主控台中，點擊網頁圖示 (`</>`) 來註冊一個新的 Web 應用。您可以為它取一個名字，例如「綠簷 Greenroof」。
3.  **取得 Firebase 設定檔**：註冊後，Firebase 會提供一個 `firebaseConfig` 物件。**請務必複製這段程式碼**，因為您的兩個 HTML 檔案都需要用到它。

---

## 2. 啟用 Firebase 服務

在 Firebase 控制台的左側選單中，找到「建構」(Build) 區塊。

### A. Authentication (驗證)

1.  前往 **Authentication**。
2.  點擊 **「開始使用」** (Get started)。
3.  在「登入方式」(Sign-in method) 標籤頁中，從供應商列表中選擇 **Google**。
4.  **啟用** Google 供應商，並設定一個專案的支援電子郵件。
5.  **重要**：您可能需要在 Google Cloud Platform (GCP) 控制台中設定 OAuth 同意畫面。如果需要，Firebase 會提供一個直接連結引導您前往設定。

### B. Firestore Database (資料庫)

1.  前往 **Firestore Database**。
2.  點擊 **「建立資料庫」** (Create database)。
3.  以**測試模式**啟動。這將允許您在設定初期方便地讀寫資料。您稍後需要設定更安全性的規則。
4.  為您的資料庫選擇一個地區位置。

---

## 3. 設定 Firestore 集合 (Collections)

為了讓應用程式正常運作，您需要手動建立以下幾個集合與文件。

### A. `admins` 集合 (用於後台權限管理)

這個集合用來控制誰可以登入後台管理面板。

1.  **建立集合**：點擊「+ 開始集合」(+ Start collection)，並輸入集合 ID：`admins`。
2.  **新增管理員**：您需要為每一位管理員新增一個文件。
    *   **文件 ID (Document ID)**：文件 ID **必須**是該位管理員的 **Firebase UID**。您可以在使用者第一次登入後，於 Firebase Authentication 的「使用者」分頁中找到他的 UID。
    *   **欄位 (Fields)**：文件本身可以留空，或者您可以新增一個欄位如 `isAdmin: true` 以方便辨識。應用程式只會檢查文件是否存在，來判斷是否為管理員。

### B. `site_settings` 集合 (用於公告與政策)

這個集合用來存放全站的設定。

1.  **建立集合**：建立一個集合，ID 為 `site_settings`。
2.  **建立 `announcements` 文件**:
    *   文件 ID: `announcements`
    *   欄位: `content` (類型: `string`, 值: `在這裡輸入您的公告文字。`)
3.  **建立 `policies` 文件**:
    *   文件 ID: `policies`
    *   欄位 1: `privacy` (類型: `string`, 值: `您的隱私權政策內容。`)
    *   欄位 2: `disclaimer` (類型: `string`, 值: `您的免責聲明內容。`)

### C. 其他將自動建立的集合

以下集合會在您使用網站功能時自動被建立，但了解其結構對您有幫助：
*   **`shops`**: 當您透過後台新增店家或從 CSV 匯入時建立。
*   **`reviews`**: 當使用者提交評論時建立。
*   **`subscribers`**: 當使用者訂閱電子報時建立。

---

## 4. 更新您的 HTML 檔案

現在，您需要將在第一步複製的 `firebaseConfig` 物件，貼到您的兩個 HTML 檔案中。

1.  打開 `index (2).html` (後台管理面板)。
2.  找到 `firebaseConfig` 物件，並用您自己專案的真實設定取代預留位置。
3.  打開 `index (3).html` (公開網站)。
4.  重複同樣的步驟，用您的設定取代預留位置。

---

## 5. 保護您的資料庫 (重要！)

初始的「測試模式」規則並不安全，它允許任何人讀寫您的資料。在您完成所有設定後，請務必更新您的 Firestore 安全性規則。

1.  在 Firebase 控制台中，前往 **Firestore Database** -> **規則 (Rules)** 標籤頁。
2.  用以下規則取代現有的所有內容，以提供一個更安全的基礎：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 檢查使用者是否為管理員的函式
    function isAdmin() {
      return exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // 公開網站的資料：任何人都可以讀取
    match /shops/{shopId} {
      allow read: if true;
      allow write: if isAdmin(); // 只有管理員可以寫入
    }

    match /site_settings/{docId} {
      allow read: if true;
      allow write: if isAdmin(); // 只有管理員可以寫入
    }

    // 評論：任何人都可以讀取，但只有登入的使用者才能建立
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if isAdmin(); // 只有管理員可以修改或刪除
    }

    // 訂閱者：任何人都可以新增訂閱，但只有管理員可以讀取或刪除
    match /subscribers/{subscriberId} {
        allow create: if true;
        allow read, write, delete: if isAdmin();
    }

    // 管理員列表：只有管理員自己可以讀取，以確認權限
    match /admins/{userId} {
        allow get: if isAdmin();
        allow list, create, update, delete: if false; // 禁止其他操作
    }
  }
}
```

完成以上所有步驟後，您的兩個網站就應該可以完全依靠 Firebase 順利運作了。