import asyncio
from playwright.async_api import async_playwright
import os

async def run_comprehensive_verification():
    os.makedirs("screenshots", exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        print("1. Opening Certificate Studio...")
        await page.goto("http://localhost:5173")
        await page.wait_for_selector("text=Certificate Studio")
        await page.wait_for_timeout(1000)

        print("2. Testing New Project creation...")
        # Handle confirm dialog automatically
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        new_project_btn = page.locator("button:has-text('New Project')")
        await new_project_btn.click()
        await page.wait_for_timeout(1500)

        print("3. Uploading Certificate Template and CSV...")
        template_path = os.path.abspath("storage/jobs/97dcc55d-0dcc-4e54-a7c6-0c597f007e62/template_original.png")
        csv_path = os.path.abspath("storage/jobs/97dcc55d-0dcc-4e54-a7c6-0c597f007e62/participants.csv")

        file_inputs = page.locator("input[type='file']")
        await file_inputs.nth(0).set_input_files(template_path)
        await page.wait_for_timeout(1500)

        # Confirm template thumbnail loaded (Ready indicator visible)
        await page.wait_for_selector("text=Ready", timeout=5000)
        img_element = page.locator("img[alt='Certificate template preview']")
        assert await img_element.is_visible(), "Template preview image must be visible"

        await file_inputs.nth(1).set_input_files(csv_path)
        await page.wait_for_timeout(1500)

        print("4. Capturing Refined Upload Screen (1440px)...")
        await page.screenshot(path="screenshots/v1_refined_upload_1440.png", full_page=True)

        print("5. Checking responsive layout at 1280px, 1024px, 768px...")
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshots/v1_refined_upload_1280.png", full_page=True)

        await page.set_viewport_size({"width": 1024, "height": 768})
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshots/v1_refined_upload_1024.png", full_page=True)

        await page.set_viewport_size({"width": 768, "height": 1024})
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshots/v1_refined_upload_768.png", full_page=True)

        # Restore 1440px
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(500)

        print("6. Navigating to Editor...")
        continue_edit_btn = page.locator("button:has-text('Continue to Edit')")
        await continue_edit_btn.click()
        await page.wait_for_timeout(2000)

        print("7. Capturing Refined Editor Screen (1440px)...")
        await page.screenshot(path="screenshots/v1_refined_editor_1440.png", full_page=True)

        print("8. Testing Preview Mode toggle...")
        preview_btn = page.locator("button:has-text('Preview')")
        await preview_btn.click()
        await page.wait_for_timeout(1000)
        await page.screenshot(path="screenshots/v1_refined_editor_preview_1440.png", full_page=True)
        
        exit_preview_btn = page.locator("button:has-text('Exit Preview')")
        await exit_preview_btn.click()
        await page.wait_for_timeout(500)

        print("9. Running Perfect Fit All Names...")
        fit_btn = page.locator("button:has-text('Perfect Fit All Names')")
        await fit_btn.click()
        await page.wait_for_timeout(2000)

        print("10. Navigating to Export Screen...")
        continue_export = page.locator("button:has-text('Continue to Export')")
        await continue_export.click()
        await page.wait_for_timeout(2000)

        print("11. Capturing Refined Export Screen (1440px)...")
        await page.screenshot(path="screenshots/v1_refined_export_1440.png", full_page=True)

        print("12. Generating batch certificates...")
        gen_btn = page.locator("button:has-text('Generate Certificates')")
        if not await gen_btn.is_visible():
            gen_btn = page.locator("button:has-text('Regenerate Batch')")
        await gen_btn.click()

        await page.wait_for_selector("text=Ready for Download", timeout=20000)
        await page.wait_for_timeout(1000)
        print("13. Capturing Completed Export Screen...")
        await page.screenshot(path="screenshots/v1_refined_export_completed_1440.png", full_page=True)

        print("14. Testing page reload session recovery...")
        await page.reload()
        await page.wait_for_timeout(2000)
        # Verify header is restored and Export tab remains accessible with configuration intact
        assert await page.locator("text=Export Certificates").is_visible(), "Session should restore on Export tab"
        assert await page.locator("text=Configuration Summary").is_visible(), "Session should restore Configuration Summary"

        print("All comprehensive end-to-end tests completed successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_comprehensive_verification())
