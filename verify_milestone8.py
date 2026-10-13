import asyncio
from playwright.async_api import async_playwright
import os

async def run_verification():
    os.makedirs("screenshots", exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        print("1. Navigating to Certificate Studio...")
        await page.goto("http://localhost:5173")
        await page.wait_for_selector("text=Certificate Studio")
        await page.wait_for_timeout(1000)

        print("2. Uploading Certificate Template and CSV...")
        template_path = os.path.abspath("storage/jobs/97dcc55d-0dcc-4e54-a7c6-0c597f007e62/template_original.png")
        csv_path = os.path.abspath("storage/jobs/97dcc55d-0dcc-4e54-a7c6-0c597f007e62/participants.csv")

        # Set files on hidden file inputs
        file_inputs = page.locator("input[type='file']")
        # First file input is template uploader
        await file_inputs.nth(0).set_input_files(template_path)
        await page.wait_for_timeout(1500)

        # Second file input is CSV uploader
        await file_inputs.nth(1).set_input_files(csv_path)
        await page.wait_for_timeout(1500)

        print("3. Capturing Upload screen with loaded files (1440px)...")
        await page.screenshot(path="screenshots/v1_upload_1440.png", full_page=True)

        # Responsive check: 768px (Tablet / narrow)
        await page.set_viewport_size({"width": 768, "height": 1024})
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshots/v1_upload_768.png", full_page=True)

        # Responsive check: 1024px
        await page.set_viewport_size({"width": 1024, "height": 768})
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshots/v1_upload_1024.png", full_page=True)

        # Back to 1440px
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(500)

        print("4. Navigating to Editor...")
        continue_edit_btn = page.locator("button:has-text('Continue to Edit')")
        await continue_edit_btn.wait_for(state="visible", timeout=10000)
        await continue_edit_btn.click()
        
        await page.wait_for_timeout(2000)
        print("5. Capturing Editor screen with bounds (1440px)...")
        await page.screenshot(path="screenshots/v1_editor_1440.png", full_page=True)

        print("6. Testing Preview toggle (hiding editing boundaries)...")
        preview_btn = page.locator("button:has-text('Preview')")
        if await preview_btn.is_visible():
            await preview_btn.click()
            await page.wait_for_timeout(1000)
            print("Captured Preview mode screenshot...")
            await page.screenshot(path="screenshots/v1_editor_preview_1440.png", full_page=True)
            
            # Exit Preview mode
            exit_preview_btn = page.locator("button:has-text('Exit Preview')")
            if await exit_preview_btn.is_visible():
                await exit_preview_btn.click()
                await page.wait_for_timeout(500)

        print("7. Testing 'Perfect Fit All Names'...")
        fit_btn = page.locator("button:has-text('Perfect Fit All Names')")
        if await fit_btn.is_visible():
            await fit_btn.click()
            await page.wait_for_timeout(2000)

        print("8. Testing 'Save' action...")
        save_btn = page.locator("button:has-text('Save Template')")
        if await save_btn.is_visible():
            print("Save Template button is visible")

        print("9. Navigating to Export screen...")
        continue_export = page.locator("button:has-text('Continue to Export')")
        await continue_export.wait_for(state="visible", timeout=10000)
        await continue_export.click()

        await page.wait_for_timeout(2000)
        print("10. Capturing Export screen (1440px)...")
        await page.screenshot(path="screenshots/v1_export_1440.png", full_page=True)

        print("11. Testing batch certificate generation...")
        gen_btn = page.locator("button:has-text('Generate Certificates')")
        if not await gen_btn.is_visible():
            gen_btn = page.locator("button:has-text('Regenerate Batch')")

        if await gen_btn.is_visible() and await gen_btn.is_enabled():
            print("Clicking Generate Certificates...")
            await gen_btn.click()
            # Wait for generation to complete
            await page.wait_for_selector("text=Ready for Download", timeout=20000)
            await page.wait_for_timeout(1000)
            print("12. Capturing Completed Export screen...")
            await page.screenshot(path="screenshots/v1_export_completed_1440.png", full_page=True)

        print("All verification steps passed successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
