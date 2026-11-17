"""Testes de API sem acesso externo nem chaves de terceiros."""
import asyncio
import base64
import importlib

import httpx
import pytest


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "radar.db"))
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SEED_DEMO", "true")
    monkeypatch.delenv("APP_PASSWORD", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    import app
    module = importlib.reload(app)
    module.init_db()
    return module


def req(module, method, url, **kwargs):
    async def run():
        transport = httpx.ASGITransport(app=module.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            return await c.request(method, url, **kwargs)
    return asyncio.run(run())


def test_health(service):
    response = req(service, "GET", "/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_frontend(service):
    response = req(service, "GET", "/")
    assert response.status_code == 200
    assert "Radar Social AI" in response.text


def test_dashboard_demo_clear(service):
    data = req(service, "GET", "/api/dashboard").json()
    assert data["stats"]["total"] == 0
    assert data["demo"] is True
    assert len(data["top"]) == 3


def test_reject_untrusted_url(service):
    response = req(service, "POST", "/api/trends/manual",
         json={"title": "Sinal de teste bastante longo", "url": "file:///etc/passwd"})
    assert response.status_code == 422
    assert service.canonical_url("https://a.pt/post?utm_source=x&id=5") == "https://a.pt/post?id=5"
    assert service.canonical_url("https://username:pw@a.pt/") == ""


def test_manual_save_and_search(service):
    body = {"title": "Nova funcionalidade do LinkedIn para marketing",
            "summary": "Oportunidade para empresas", "platform": "LinkedIn",
            "url": "https://example.org/announcement"}
    created = req(service, "POST", "/api/trends/manual", json=body)
    assert created.status_code == 200
    pk = created.json()["id"]
    found = req(service, "GET", "/api/trends?platform=LinkedIn&q=funcionalidade").json()["items"]
    assert any(t["id"] == pk for t in found)
    changed = req(service, "POST", "/api/trends/" + str(pk) + "/save")
    assert changed.status_code == 200
    assert changed.json()["saved"] is True
    assert req(service, "POST", "/api/trends/manual", json=body).status_code == 409


def test_ideas_crud(service):
    result = req(service, "POST", "/api/ideas", json={"trend_id": 1, "platform": "LinkedIn"})
    assert result.status_code == 200
    pk = result.json()["id"]
    all_ideas = req(service, "GET", "/api/ideas").json()["items"]
    assert any(i["id"] == pk and i["origin"] == "Regras" for i in all_ideas)
    saved = req(service, "PATCH", "/api/ideas/" + str(pk),
                json={"status": "Pronto", "hook": "Uma mudança relevante"})
    assert saved.status_code == 200
    assert req(service, "PATCH", "/api/ideas/" + str(pk),
               json={"scheduled_for": "2026-11-30"}).status_code == 200
    assert req(service, "GET", "/api/ideas").json()["items"][0]["scheduled_for"] == "2026-11-30"
    assert req(service, "PATCH", "/api/ideas/" + str(pk),
               json={"scheduled_for": "2026-99-99"}).status_code == 422
    assert req(service, "PATCH", "/api/ideas/" + str(pk),
               json={"status": "Erro"}).status_code == 422


def test_csv_export(service):
    response = req(service, "GET", "/api/export.csv")
    assert response.status_code == 200
    assert "Prioridade editorial" in response.text
    assert "DEMO" in response.text


def test_basic_auth(service, monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", "senha-de-teste-bastante-longa")
    locked = importlib.reload(service)
    locked.init_db()
    assert req(locked, "GET", "/api/dashboard").status_code == 401
    basic = base64.b64encode(b"admin:senha-de-teste-bastante-longa").decode("ascii")
    response = req(locked, "GET", "/api/dashboard", headers={"Authorization": "Basic " + basic})
    assert response.status_code == 200
    assert req(locked, "GET", "/api/health").status_code == 200


def test_production_requires_password(service, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PASSWORD", "short")
    locked = importlib.reload(service)
    async def check():
        async with locked.lifespan(locked.app):
            pass
    with pytest.raises(RuntimeError, match="APP_PASSWORD"):
        asyncio.run(check())


def test_editorial_score_not_viral(service):
    ref = service.datetime(2026, 11, 17, tzinfo=service.timezone.utc)
    score, factors = service.score_trend("New Instagram marketing feature", "", ref.isoformat(), "Oficial", ref)
    assert 0 <= score <= 100
    assert sum(factors.values()) == score
    assert "atualidade" in factors


def test_refresh_ingests_real_rss_and_removes_demo(service, monkeypatch):
    from datetime import datetime, timezone
    from email.utils import format_datetime
    published = format_datetime(datetime.now(timezone.utc))
    xml = ('<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>'
           '<item><title>New Instagram marketing feature</title>'
           '<link>https://example.org/real-signal</link>'
           '<description>Update for marketers.</description>'
           '<pubDate>' + published + '</pubDate></item></channel></rss>').encode()
    async def fake_get(self, url):
        return httpx.Response(200, content=xml, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    response = req(service, "POST", "/api/refresh")
    assert response.status_code == 200, response.text
    assert response.json()["added"] == 1
    signal = req(service, "GET", "/api/trends?q=Instagram").json()["items"]
    assert len(signal) == 1
    assert signal[0]["demo"] is False
    assert req(service, "GET", "/api/dashboard").json()["stats"]["total"] == 1
