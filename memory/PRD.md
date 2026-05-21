# PRD — Le Bon Clic

## Problème original
"Génère moi la web app de mon github" — l'utilisateur a fourni le repo GitHub `ANDREMONAMOUR/Lebonclic` à déployer dans Emergent.

## Produit
**Le Bon Clic** — Service d'assistance informatique à domicile pour seniors (Lyon & Métropole).
SPA React 19 + FastAPI + MongoDB, avec intégrations Brevo (SMS/Email), Stripe (paiement), Airtable (CRM miroir).

## Personas
- **Senior client** : prend RDV via le site, paie un acompte Stripe, reçoit SMS/Email de confirmation
- **Artisan / Admin** : gère son agenda via le back-office (admin router)

## Architecture
```
/app/
├── backend/         FastAPI + APScheduler + ReportLab
│   ├── server.py, config.py, auth.py, payments.py,
│   ├── brevo_sms.py, brevo_email.py, scheduler.py,
│   ├── admin_router.py, admin_auth.py, pdf_invoice.py
├── frontend/        React 19 + Tailwind + shadcn/ui + Craco
│   └── src/ (App.js, AdminApp.jsx, components/)
└── memory/          PRD, test_credentials
```

## Intégrations tierces
| Service | Mode | État |
|---|---|---|
| Brevo (SMS + Email transactional) | LIVE | ✅ configuré |
| Stripe Checkout (acompte) | **LIVE** ⚠️ | ✅ configuré + webhook |
| Airtable CRM mirror | LIVE | ✅ enabled (base `appEHw6wjOrkHYhWw`) |

⚠️ **Stripe est en mode LIVE** : tout test de paiement génèrera de vrais débits.

## Endpoints clés
- `GET /api/health`
- `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`
- `POST /api/bookings`, `GET /api/bookings/me`
- `POST /api/payments/create-checkout`
- `POST /api/webhook/stripe`
- `/api/admin/*` (protégé)

## Auth
- OTP par SMS via Brevo
- **Bypass code `1234` activé** dans `.env` (`OTP_BYPASS_CODE=1234`) pour démo/tests
- JWT 30j (`JWT_EXPIRY_HOURS=720`)

## Changelog
### 2026-05-21 (session fork)
- ✅ Code cloné depuis GitHub `ANDREMONAMOUR/Lebonclic`
- ✅ Dépendances installées (pip + yarn)
- ✅ `.env` backend/frontend créés et peuplés
- ✅ Clés Stripe LIVE + Brevo + Airtable intégrées
- ✅ Fix `load_dotenv(override=True)` dans `backend/config.py`
- ✅ Smoke test passé : `/api/health`, OTP send/verify (bypass 1234), landing page rendue

### 2026-05-21 — Enhancements
- ✅ Lien Google Reviews rendu configurable via `REACT_APP_GOOGLE_REVIEWS_URL` (frontend/.env)
  - Fichier `App.js` : composant `GoogleReviews` utilise `process.env.REACT_APP_GOOGLE_REVIEWS_URL` avec fallback générique
  - `data-testid="google-reviews-link"` ajouté
- ✅ Flux SMS+Email de rappel J-1 vérifié bout-en-bout
  - Création booking pour demain → `POST /api/admin/run-reminders-j1` → `{"status":"ok","notified":1}`
  - Logs scheduler : SMS + Email préparés correctement (mode DEV car `SMS_DEV_MODE=true`)
  - Cron quotidien actif : 18h00 Europe/Paris
  - Pour activation en prod : passer `SMS_DEV_MODE=false` dans `backend/.env`

## Backlog (P0 → P2)
- **P1** : Tester le flux Brevo réel (envoi SMS sur numéro français vérifié + envoi email)
- **P1** : Tester le flux Stripe — **uniquement après bascule vers clés `sk_test_...`** ou via webhook simulé
- **P1** : Vérifier la sync Airtable best-effort sur création de Client/Booking
- **P2** : Configurer le webhook Stripe dans le dashboard Stripe avec l'URL publique `https://code-to-app-190.preview.emergentagent.com/api/webhook/stripe`
- **P2** : Désactiver le bypass OTP `1234` avant mise en production
- **P2** : Régression complète backend + frontend via `testing_agent_v3_fork`

## Tâches actuelles
Aucune — l'app est en état healthy et prête à être utilisée/testée par l'utilisateur.
