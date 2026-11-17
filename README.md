# Radar Social AI

**Aplicação web de Social Media Intelligence**: recolha de notícias RSS/Atom, avaliação editorial transparente, dashboard, fontes, favoritos, geração de rascunhos, estados do Content Studio e exportação CSV. Interface em português de Portugal.

> **Estado:** MVP de utilização individual, preparado para deploy Docker/Render. Não é ainda um SaaS multiutilizador. RSS mede publicações e mudanças noticiadas; **não mede viralidade nem métricas privadas das plataformas**.

## Funcionalidades

- Radar de Instagram, TikTok, LinkedIn, YouTube e Meta por feeds RSS públicos verificados;
- score 0–100 para **prioridade editorial**, com justificações; fontes, datas e links;
- pesquisa, filtros, favoritos, inclusão manual de links, atualização sob pedido;
- Content Studio: rascunhos locais com regras ou IA opcional através de chave mantida no servidor;
- estados editoriais: Backlog, Rascunho, Pronto, Publicado; exportação CSV;
- SQLite, proteção HTTP Basic (HTTPS obrigatório em produção), limites de atualização, Docker, Render Blueprint, testes e workflow GitHub Actions para atualização diária;
- modo DEMO local claramente assinalado; desativado em produção.

## Arranque local

Requer Python 3.11+:

```bash
python -m venv .venv
source .venv/bin/activate  # no Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Abre **http://127.0.0.1:8000**. Em local, sem password, funciona com dados DEMO e permite recolher notícias reais com **Atualizar fontes**.

## Deploy em Render (com persistência)

1. No Render, escolhe **New → Blueprint** e liga o repositório `ninjaDX27/agentic-marketing`.
2. O ficheiro `render.yaml` prepara um web service Docker **pago** com disco persistente em `/srv/data`. Sem disco persistente, o SQLite perde dados em cada deploy ou reinício.
3. Introduz `APP_PASSWORD` com **pelo menos 16 caracteres**, como secret solicitado na criação. Opcional: configura `OPENAI_API_KEY` e `OPENAI_MODEL` nos Environment Variables (nunca os coloques em Git).
4. Quando o serviço estiver a funcionar, verifica `https://<o-teu-dominio>/api/health`. A interface exige `admin` e a password definida.
5. Em GitHub → Settings → Secrets and variables → Actions, cria `RADAR_URL` (URL HTTPS sem barra final) e `APP_PASSWORD` (a mesma password) para o workflow `.github/workflows/daily-sync.yml`. Executa manualmente o workflow uma vez.
6. Ativa deploys automáticos do Render a partir do branch main. A recolha agendada usa a hora Europe/Lisbon, sujeita a atrasos do GitHub Actions.

A configuração no repositório não cria uma conta Render nem publica automaticamente um domínio: requer a ligação do teu Render, as secrets e ativação de GitHub Actions.

## Ambiente

```text
APP_ENV=development
APP_PASSWORD=
DATABASE_PATH=./data/radar.db
SEED_DEMO=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

Em `APP_ENV=production`, a app recusa arrancar sem password com pelo menos 16 caracteres. A IA só é chamada no servidor. Não há publicação automática nas plataformas. Não uses scraping não autorizado.

## Desenvolvimento

```bash
pytest -q
docker build -t radar-social .
docker run -p 8000:8000 -e APP_ENV=production -e APP_PASSWORD="uma-frase-muito-segura" -v radar_data:/srv/data radar-social
```

### Segurança e limites

- API e interface protegidas por HTTP Basic no piloto; **obrigatório HTTPS**;
- feeds numa allowlist fixa, sem seguir redirecionamentos, limite de tamanho e timeout;
- links manuais não são acedidos pelo servidor, apenas guardados;
- tratamento de texto externo como dados não confiáveis; revisão humana antes da publicação;
- sem contas multiutilizador, RBAC, cobrança, OAuth social ou métricas privadas;
- o SQLite exige backups e alojamento com disco. Não é adequado a escalabilidade horizontal.

### Próxima evolução

Para SaaS comercial: Supabase/Postgres e autenticação por organização, RLS, audit log, quotas por cliente, análise histórica de desempenho autorizado, scheduler interno, Stripe, RGPD e observabilidade.
