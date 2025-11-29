from playwright.sync_api import sync_playwright
import urllib.parse

# Sample CSV content
csv_content = """"学部","学科","コース名","教材","締切"
"情報学部","情報学科","プログラミング演習","課題1","2025-07-20 23:55"
"情報学部","情報学科","アルゴリズム","課題2","2025-07-21 23:55"
"""
csv_encoded = urllib.parse.quote(csv_content)

def verify_csv_import(page):
    # Navigate to the app with the csv query parameter
    url = f"http://localhost:3000/?csv={csv_encoded}"
    print(f"Navigating to {url}")
    page.goto(url)

    # Wait for the table to appear (indicating successful import)
    page.wait_for_selector("table")

    # Check if the data is displayed
    content = page.content()
    if "課題1" in content and "プログラミング演習" in content:
        print("CSV data successfully imported and displayed.")
    else:
        print("CSV data not found on the page.")

    # Take a screenshot
    page.screenshot(path="verification/import_success.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_csv_import(page)
        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()
