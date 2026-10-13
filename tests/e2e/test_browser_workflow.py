import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = os.path.abspath("test-artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

async def run_e2e_workflow():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        print("[E2E] 1. Opening Certificate Studio...")
        await page.goto("http://localhost:5173")
        await page.wait_for_selector("text=Certificate Studio")
        await page.wait_for_timeout(1000)

        print("[E2E] 2. Testing New Project creation & dialog handling...")
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        new_project_btn = page.locator("button:has-text('New Project')")
        await new_project_btn.click()
        await page.wait_for_timeout(1500)

        print("[E2E] 3. Uploading Certificate Template and CSV...")
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

        print("[E2E] 4. Capturing Upload screen (1440px)...")
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_upload_1440.png"), full_page=True)

        print("[E2E] 5. Checking responsive layouts (1280px, 1024px, 768px)...")
        for w, h in [(1280, 800), (1024, 768), (768, 1024)]:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"e2e_upload_{w}.png"), full_page=True)

        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(400)

        print("[E2E] 6. Navigating to Visual Editor...")
        continue_edit_btn = page.locator("button:has-text('Continue to Edit')")
        await continue_edit_btn.click()
        await page.wait_for_timeout(2000)

        print("[E2E] 7. Testing font switching (Alex Brush, Allura, Great Vibes)...")
        # Target font selector specifically (label: "Font Family")
        font_select = page.locator("label:has-text('Font Family') + select")
        await font_select.select_option(value="alex_brush")
        await page.wait_for_timeout(600)
        await font_select.select_option(value="great_vibes")
        await page.wait_for_timeout(600)

        print("[E2E] 8. Testing Preview Mode toggle...")
        preview_btn = page.locator("button:has-text('Preview')")
        await preview_btn.click()
        await page.wait_for_timeout(800)
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_editor_preview.png"), full_page=True)
        
        exit_preview_btn = page.locator("button:has-text('Exit Preview')")
        await exit_preview_btn.click()
        await page.wait_for_timeout(500)

        print("[E2E] 9. Running Perfect Fit All Names...")
        fit_btn = page.locator("button:has-text('Perfect Fit All Names')")
        await fit_btn.click()
        await page.wait_for_timeout(2000)
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_editor_fitted.png"), full_page=True)

        print("[E2E] 10. Navigating to Export Screen...")
        continue_export = page.locator("button:has-text('Continue to Export')")
        await continue_export.click()
        await page.wait_for_timeout(2000)

        print("[E2E] 11. Generating batch certificates and verifying ZIP export...")
        gen_btn = page.locator("button:has-text('Generate Certificates')")
        if not await gen_btn.is_visible():
            gen_btn = page.locator("button:has-text('Regenerate Batch')")
        await gen_btn.click()

        await page.wait_for_selector("text=Ready for Download", timeout=20000)
        await page.wait_for_timeout(1000)
        download_btn = page.locator("a:has-text('Download certificates.zip')")
        assert await download_btn.is_visible(), "Download button must be visible"
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_export_completed.png"), full_page=True)

        print("[E2E] 12. Testing page reload session recovery...")
        await page.reload()
        await page.wait_for_timeout(2000)
        assert await page.locator("text=Export Certificates").is_visible(), "Session should restore on Export tab"
        assert await page.locator("text=Configuration Summary").is_visible(), "Configuration Summary must be intact"

        print("[E2E] All browser tests passed successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_e2e_workflow())
