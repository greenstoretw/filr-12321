import os
import json
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # --- Mock Data ---
        mock_shop_data = {"status": "success", "data": {"shops": [{"id": "shop1", "name_zh-TW": "永續測試商店", "type_zh-TW": "測試類別", "description_zh-TW": "這是一個測試用的店家描述。"}], "announcements": "", "policies": {}}}
        mock_reviews_data = {"status": "success", "data": {"reviews": []}}
        mock_leaderboard_data = {"status": "success", "data": {"leaderboard": []}}

        # --- Mock Firebase Auth ---
        page.add_init_script("""
            window.mockAuth = {
                subscribers: [],
                onAuthStateChanged(callback) { this.subscribers.push(callback); },
                signInWithPopup() {
                    const user = { uid: 'test-uid-123', displayName: '測試使用者' };
                    this.subscribers.forEach(cb => cb(user));
                    return Promise.resolve({ user });
                },
                signOut() { this.subscribers.forEach(cb => cb(null)); return Promise.resolve(); },
                triggerInitialState() { this.subscribers.forEach(cb => cb(null)); }
            };
            window.firebase = { initializeApp: () => {}, auth: () => window.mockAuth };
        """)

        # --- Route ALL external network calls ---
        def handle_route(route):
            request = route.request
            url = request.url

            # Intercept App Script API calls
            if "script.google.com" in url:
                post_data = request.post_data or ""
                if "getPublicData" in post_data: return route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_shop_data))
                if "getReviewsForShop" in post_data: return route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_reviews_data))
                if "getLeaderboard" in post_data: return route.fulfill(status=200, content_type="application/json", body=json.dumps(mock_leaderboard_data))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "success", "data": {}}))

            # Intercept map tiles and fonts
            if "tile.openstreetmap.org" in url or "fonts.googleapis.com" in url or "fonts.gstatic.com" in url:
                return route.fulfill(status=200, body="")

            # Let other requests (e.g., local file) continue
            return route.continue_()

        page.route("**/*", handle_route)

        # --- Test Execution ---
        file_path = os.path.abspath('index (3).html')
        page.goto(f'file://{file_path}', wait_until="domcontentloaded")

        page.evaluate("window.mockAuth.triggerInitialState()")
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)

        # --- SCENARIO 1: Logged Out ---
        print("Verifying logged-out state...")
        expect(page.get_by_text("永續測試商店")).to_be_visible()
        page.get_by_role("button", name="查看詳情").click()

        modal_container = page.locator("#shop-detail-container")
        expect(modal_container).to_be_visible()
        expect(modal_container.get_by_text("請先登入以發表評論。")).to_be_visible()
        print("Logged-out state verified successfully.")

        # --- SCENARIO 2: Logged In ---
        print("Verifying logged-in state...")
        page.evaluate("window.mockAuth.signInWithPopup()")
        page.get_by_role("button", name="查看詳情").click()

        expect(modal_container.get_by_text("您的姓名: 測試使用者")).to_be_visible()
        expect(modal_container.get_by_role("button", name="送出評論")).to_be_visible()
        print("Logged-in state verified successfully.")

        screenshot_path = 'jules-scratch/verification/auth-review-feature.png'
        modal_container.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run_verification()