"""Smoke end-to-end do Trend Explorer. Executar com uvicorn em http://127.0.0.1:8017."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:8017"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1512, "height": 1000}, device_scale_factor=1)
        js_errors = []
        page.on("pageerror", lambda error: js_errors.append(str(error)))

        page.goto(BASE, wait_until="networkidle")
        assert page.locator("#dashboard.active").count() == 1
        page.locator('.sidebar button[data-page="explorer"]').click()
        page.locator("#trend-list .signal").first.wait_for()
        assert page.locator("#trend-list .signal").count() == 3
        assert page.locator(".explorer-inspector .score-gauge").count() == 1
        assert page.locator(".score-factor progress").count() == 4
        assert page.locator("#trend-inspector .inspector-heading").inner_text().startswith("DEMO")
        assert "DEMO" in page.locator("#trend-inspector").inner_text()

        first_heading = page.locator("#trend-inspector .inspector-heading").inner_text()
        page.locator("#trend-list [data-select]").nth(1).click()
        second_heading = page.locator("#trend-inspector .inspector-heading").inner_text()
        assert first_heading != second_heading, "Selecting a trend must update the inspector"

        # Guardar/desguardar no servidor e refletir a alteração na UI.
        page.locator("#trend-inspector button[data-save]").click()
        page.locator("#trend-inspector button[data-save]").filter(has_text="Guardado").wait_for()
        page.locator("#saved-only").check()
        expect(page.locator("#trend-list .signal")).to_have_count(1)
        page.locator("#saved-only").uncheck()

        # Gerar um rascunho e verificar persistência no Content Studio.
        page.locator("#trend-inspector button[data-generate]").first.click()
        assert page.locator("#generate-modal").evaluate("(e) => e.open") is True
        page.locator("#generate-form button[type=submit]").click()
        page.locator("#studio.active").wait_for()
        page.locator("#edit-hook").wait_for()
        assert page.locator("#edit-id").input_value().isdigit()
        page.locator("#edit-scheduled").fill("2026-12-04")
        page.locator("#edit-status").select_option("Pronto")
        assert page.locator("#edit-hook").input_value()
        assert page.locator("#edit-body").input_value()
        assert page.locator("#editor-form").evaluate("(f) => f.checkValidity()")
        page.locator("#editor-form button[type=submit]").click()
        expect(page.locator("#toast")).to_contain_text("Rascunho guardado.")

        page.locator('button[data-page="planner"]').click()
        page.locator("#planner.active").wait_for()
        expect(page.locator("#planner-list")).to_contain_text("04/12/2026")

        # Ação direta "Adicionar ao Planner" cria novo rascunho planeado.
        page.locator('.sidebar button[data-page="explorer"]').click()
        page.locator("#trend-inspector button[data-plan]").click()
        assert page.locator("#plan-modal").evaluate("(e) => e.open") is True
        page.locator("#plan-date").fill("2026-12-09")
        page.locator("#plan-form button[type=submit]").click()
        page.locator("#planner.active").wait_for()
        expect(page.locator("#planner-list .idea-item")).to_have_count(2)

        # Pesquisa e filtro continuam a funcionar.
        page.locator('.sidebar button[data-page="explorer"]').click()
        page.locator("#platform-filter").select_option("Instagram")
        expect(page.locator("#trend-list .signal")).to_have_count(1)
        page.locator("#search").fill("sem-correspondencia-xyz")
        expect(page.locator("#trend-list .signal")).to_have_count(0)
        expect(page.locator("#trend-inspector")).to_contain_text("Sem sinais")

        # Captura para inspeção no CI.
        page.locator("#search").fill("")
        page.locator("#platform-filter").select_option("Todas")
        page.wait_for_timeout(400)
        page.screenshot(path="/tmp/radar-social-trend-explorer.png", full_page=True)
        assert js_errors == [], "Uncaught JavaScript exceptions: " + str(js_errors)
        browser.close()


if __name__ == "__main__":
    main()
