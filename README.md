# Monitor 42Roma Dashboard

## 🇮🇹 Panoramica

La dashboard **Monitor 42Roma** fornisce una vista in tempo reale sullo stato del campus 42 Roma Elis, pensata per schermi TV, totem e player **BrightSign**. L'app combina un backend Flask con template responsive e un **player kiosk** che ruota automaticamente tra le varie schermate.

### Schermate pubbliche (rotazione kiosk)

| Pagina | URL | Contenuto |
|--------|-----|-----------|
| Splash | `/splash` | Logo iniziale |
| Mappa 42 Network | `/statistics/world` | Campus nel mondo per paese, sidebar campus, paese evidenziato |
| Piscine | `/piscines` | Funnel del percorso 42, date sessioni, QR apply |
| Common Core | `/statistics/cc` | Cerchi exam-rank animati, distribuzione voti, mastery opzionale |
| Workstations | `/workstations` | Mappa cluster C1/C2/C3, KPI postazioni, banner |
| Statistiche | `/statistics` | Provenienza, età, genere, exam-rank studenti |
| Foto | `/pictures` | Griglia 3×3 immagini casuali dal campus |
| Sponsor | `/sponsors` | Carousel loghi partner |
| Eventi | `/events` | Annunci ed eventi con descrizioni sintetizzate |

La home (`/`) reindirizza alla prima pagina del ciclo configurato.

### Caratteristiche principali

- **Player kiosk unico** (`/kiosk/player`): una sola URL per BrightSign, rotazione via iframe senza reload del widget.
- **Rotazione configurabile** da pannello staff: ordine pagine, durate, pagine attive/disattive.
- **Navigazione hardware**: GPIO BrightSign (prev / pause / next), tap zone laterali, frecce tastiera, pausa con spazio.
- **Autenticazione OAuth** con l'API 42 per distinguere utenti e staff.
- **Gestione annunci** con CRUD e preview live.
- **Pannello staff** per banner, manutenzione, rotazione monitor e Nagios.
- **Statistiche studenti** da CSV (`students_birth.csv`, `students.csv`, `all_students.csv`).
- **Mappa mondiale 42 Network** con conteggi campus, sidebar per continente e paese evidenziato configurabile.
- **Sintesi eventi LLM** (opzionale) via servizio esterno `EVENT_SUMMARIZE_URL`.
- **Persistenza locale** tramite JSON/CSV/YAML per log, banner, annunci, manutenzione e cache scuole network.

### Architettura

```
monitor/
├── backend/
│   ├── app.py                 # Flask: routing, OAuth, integrazioni
│   ├── config.py              # Variabili da .env
│   ├── display_delays.py      # Ciclo kiosk e durate pagine
│   ├── student_stats.py       # Grafici statistiche studenti
│   ├── piscines.py            # Funnel e date piscine
│   ├── network_schools.py     # Scraper/cache scuole 42network.org
│   ├── event_summaries.py     # Cache sintesi LLM eventi
│   ├── pictures_assets.py     # Thumbnail foto (Pillow)
│   ├── sponsors.py            # Loghi sponsor
│   ├── templates/             # Jinja2
│   └── static/                # CSS, JS, SVG, immagini, JSON
├── brightsign/
│   └── autorun.brs            # Script BrightSign HD224
├── server-start.sh            # Avvio produzione (uv + rsync static)
├── compose.yml                # Docker (dev)
├── display_delays.json        # Config rotazione (modificabile da staff)
└── .env                       # Credenziali e feature flags
```

### Requisiti

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (installer dipendenze)
- Flask 3.x, Requests, PyYAML, python-dotenv, Pillow, Gunicorn
- Certificati SSL (o disabilitazione esplicita in ambienti di test)
- Per BrightSign: HD224 con widget HTML e `brightsign_js_objects_enabled`

### Setup rapido

1. Copia `.env.sample` in `.env` e aggiorna le variabili (OAuth, URL interni, SSL, CSV studenti).
2. Installa dipendenze:
   ```bash
   uv sync
   ```
3. Avvia il server:
   ```bash
   uv run backend/app.py
   ```
   Oppure in produzione:
   ```bash
   ./server-start.sh
   ```
4. Accedi a `https://monitor.42roma.it` (o host locale) e fai login con account 42.

### Kiosk e BrightSign

**URL consigliata sul player:** `https://monitor.42roma.it/kiosk/player`

- Non impostare timer di reload sul widget BrightSign: il player gestisce il ciclo internamente.
- Config runtime: `GET /kiosk/config.json` (ordine pagine, durate, URL).
- Script di riferimento: `brightsign/autorun.brs`.
- GPIO: pin 0 = indietro, pin 1 = pausa, pin 2 = avanti.
- I comandi hardware vengono accettati solo a caricamento completo, con cooldown di 100 ms tra un comando e l'altro.

### Rotazione monitor (staff)

Da **Staff → Rotazione monitor** (`/staff/display_delays`) puoi:

- attivare/disattivare singole pagine del ciclo;
- cambiare l'ordine di rotazione;
- impostare la durata di ogni schermata (in secondi);
- per Common Core: secondi per cerchio × 6 rank;
- per Sponsor/Eventi: secondi per slide × numero slide.

Le modifiche vengono salvate in `display_delays.json`.

### Configurazione principale (`.env`)

| Variabile | Descrizione |
|-----------|-------------|
| `OAUTH_*` | Credenziali OAuth 42 |
| `CAMPUS_ID`, `CURSUS_ID` | Campus e cursus Intra |
| `CAMPUS_URL`, `NAGIOS_URL` | Servizi interni |
| `STUDENTS_BIRTH_CSV`, `STUDENTS_CSV`, `ALL_STUDENTS_CSV` | Dati studenti |
| `STUDENT_ORIGIN_COUNTRY` | Paese evidenziato nel grafico provenienza |
| `FUNNEL_DISPLAY_*`, `FUNNEL_CHART_*` | Conteggi funnel pagina Piscine |
| `WORLD_MAP_SIDEBAR_ENABLED` | Sidebar campus accanto alla mappa |
| `WORLD_MAP_SIDEBAR_VERTICAL` | Layout verticale (Europa \| mappa \| altri) vs orizzontale |
| `WORLD_MAP_HIGHLIGHT_COUNTRY` | Paese illuminato sulla mappa (es. `Luxembourg`, `LU`) |
| `CC_SHOW_MASTERY`, `CC_MASTERY_VISIBLE` | SVG mastery Common Core |
| `CC_SIDEBAR_RIGHT`, `CC_*_NEON`, `CC_*_BELOW` | Layout e stile pagina CC |
| `CC_BACK_NAV_START_FROM_END` | Navigazione indietro CC dall'ultimo cerchio |
| `EVENT_SUMMARIZE_URL` | Servizio LLM per sintesi descrizioni eventi |
| `NETWORK_SCHOOLS_*` | Scraper/cache elenco scuole 42network.org |

Vedi `.env.sample` per l'elenco completo.

### Sviluppo

Dipendenze di sviluppo (ruff):
```bash
uv sync --all-extras
uv run ruff check .
uv run ruff format .
```

Docker (dev con hot-reload):
```bash
docker compose up
```

---

## 🇬🇧 Overview

**Monitor 42Roma** is a real-time dashboard for the 42 Roma Elis campus, designed for TV displays, totems, and **BrightSign** players. It combines a Flask backend with responsive templates and a **kiosk player** that automatically rotates through multiple screens.

### Public screens (kiosk rotation)

| Page | URL | Content |
|------|-----|---------|
| Splash | `/splash` | Opening logo |
| 42 Network map | `/statistics/world` | Worldwide campus map, sidebar, highlight country |
| Piscines | `/piscines` | 42 path funnel, session dates, apply QR |
| Common Core | `/statistics/cc` | Animated exam-rank circles, grade distribution, optional mastery |
| Workstations | `/workstations` | C1/C2/C3 cluster map, workstation KPIs, banner |
| Statistics | `/statistics` | Student origin, age, gender, exam-rank charts |
| Pictures | `/pictures` | Random 3×3 campus photo grid |
| Sponsors | `/sponsors` | Partner logo carousel |
| Events | `/events` | Announcements and events with LLM summaries |

The home page (`/`) redirects to the first page in the configured cycle.

### Key features

- **Single kiosk player** (`/kiosk/player`): one BrightSign URL, iframe rotation without widget reload.
- **Configurable rotation** from staff panel: page order, durations, enable/disable pages.
- **Hardware navigation**: BrightSign GPIO (prev / pause / next), side tap zones, keyboard arrows, space to pause.
- **OAuth authentication** via the 42 API.
- **Announcement management** (create/edit/delete) with live previews.
- **Staff tools** for banner, maintenance, display rotation, and Nagios.
- **Student statistics** from CSV files.
- **42 Network world map** with campus counts, continent sidebar, and configurable highlighted country.
- **LLM event summarization** (optional) via external `EVENT_SUMMARIZE_URL`.
- **Local persistence** using JSON/CSV/YAML files.

### Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- Flask 3.x, Requests, PyYAML, python-dotenv, Pillow, Gunicorn
- SSL certificates or explicit override for test environments
- For BrightSign: HD224 with HTML widget and `brightsign_js_objects_enabled`

### Quick setup

1. Copy `.env.sample` to `.env` and adjust values.
2. Install dependencies:
   ```bash
   uv sync
   ```
3. Run the server:
   ```bash
   uv run backend/app.py
   ```
4. Browse to `https://monitor.42roma.it` and authenticate with your 42 account.

### Kiosk and BrightSign

**Recommended player URL:** `https://monitor.42roma.it/kiosk/player`

- Do not set a widget reload timer; the player handles the full cycle.
- Runtime config: `GET /kiosk/config.json`.
- Reference script: `brightsign/autorun.brs`.
- GPIO: pin 0 = prev, pin 1 = pause, pin 2 = next.
- Hardware commands are accepted only after full page load, with a 100 ms cooldown between commands.

### Display rotation (staff)

From **Staff → Rotazione monitor** you can configure cycle order, page durations, and which screens are active. Changes are saved to `display_delays.json`.

### Development

```bash
uv sync --all-extras
uv run ruff check .
uv run ruff format .
```

Happy monitoring! 🚀
