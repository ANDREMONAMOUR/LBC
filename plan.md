# Plan — Le Bon Clic (SPA React + FastAPI + MongoDB)

## 0) Résumé & état actuel
- **Objectif produit** : SPA “Le Bon Clic” (assistance informatique à domicile, -50% crédit d’impôt), **public seniors**, UI minimaliste, accessible, sans jargon.
- **Stack** :
  - Frontend React/Tailwind (SPA majoritairement monolithique dans `frontend/src/App.js`)
  - Backend FastAPI + Motor/MongoDB
  - OTP SMS via Brevo (**bypass `1234` conservé pour tests**)
  - Emails transactionnels via Brevo
  - PDF factures via ReportLab
  - Rappels J-1 via APScheduler
  - **Paiement en ligne via Stripe Checkout (hosted)**
- **État** : **MVP complet, intégrations réelles en place et testées**.
- **Points de vigilance** :
  - Crédits Brevo SMS (actuellement limitants)
  - Sécurisation des endpoints admin en production
  - Migration Stripe vers vos **clés Stripe** + configuration webhook dans le Dashboard
  - Refactor futur de `App.js`

## 1) Décisions utilisateur (confirmées)
- (a) **Oui** : d’abord **P0 vérification stabilité frontend**, puis **P1 emails Brevo**. ✅
- (b) Emails Brevo sur **tous les événements** : réservation, modification, annulation, facture, rappel J-1. ✅
- (c) SMS rappel **J-1 à 18h00 fixe** la veille du rendez-vous (Europe/Paris). ✅
- (d) Conserver le bypass OTP **`1234`** pour les tests. ✅
- (e) Pas de nouvelles fonctionnalités (Stripe/Admin/Parrainage) pour l’instant. ✅
- (nouveau) **Stripe** :
  - (1) Checkout **hébergé Stripe** ✅
  - (2) Paiement **factures + acompte** ✅
  - (3) **Webhook + email** de confirmation ✅
  - (4) **Test mode** ✅
  - (5) Compte Stripe existant ✅

## 2) Travail déjà réalisé (référence)
### Frontend
- Landing + Auth SMS OTP + Dashboard (Wizard réservation, Devis, Suivi, Factures). ✅
- Chatbot “Lumi”. ✅
- Accessibilité : lecture vocale (Web Speech API). ✅
- **22 améliorations UI/UX/Accessibilité** (calendrier visuel, autocomplete adresse, dialogues, contraste élevé, PWA, etc.). ✅
- **Stripe Checkout** :
  - Bouton **« Payer en ligne »** sur les factures impayées (redirection Checkout Stripe). ✅
  - Bouton **« Payer 10€ en sécurité »** (acompte) dans l’onglet Suivi. ✅
  - Retour Stripe : détection `?payment=success|cancelled&session_id=...` + polling `/api/payments/status/{session_id}` + toast + refresh booking/invoices. ✅

### Backend
- FastAPI + MongoDB (index assurés). ✅
- OTP SMS Brevo (avec bypass `1234`). ✅
- Gestion réservations + annulation + **replanification**. ✅
- Génération PDF factures ReportLab. ✅
- **Emails transactionnels Brevo** (5 types) + **rappels SMS J-1** via scheduler (anti-doublon). ✅
- `/api/contact` accessible avec ou sans authentification (auth optionnelle). ✅
- **Stripe Checkout (test mode)** :
  - `backend/payments.py` + endpoints checkout/status/webhook ✅
  - `models.PaymentTransaction` + collection `payment_transactions` ✅
  - `brevo_email.send_payment_confirmation_email` ✅
  - Variables : `STRIPE_API_KEY=sk_test_emergent`, `BOOKING_DEPOSIT_EUR=10.0` ✅

## 3) Plan mis à jour (phases)

### Phase A — P0 : Vérification stabilité frontend (immédiat)
**Objectif** : confirmer que la réécriture de `App.js` compile et que l’app est utilisable (aucun crash React, flux principal intact).

**Étapes (réalisées)**
1. **Logs & compilation**
   - Vérification logs frontend + compilation `esbuild` sans erreurs. ✅
2. **Vérification visuelle (captures)**
   - Landing → Auth → OTP (`1234`) → Profil → Dashboard. ✅
   - Wizard réservation : étapes + **calendrier visuel**. ✅
   - Vérification : contraste élevé, A++, lisibilité, focus, CTA. ✅
3. **Smoke test fonctionnel**
   - Parcours complet validé jusqu’au wizard/calendrier. ✅
4. **Corrections P0**
   - Aucune correction bloquante requise. ✅

**Livrables**
- Frontend stable (pas d’erreurs runtime), flux principal complet. ✅

---

### Phase B — P1 : Backend Brevo Transactional Email + APScheduler (rappels)
**Objectif** : emails transactionnels complets + rappel SMS J-1 à 18h, reliés aux événements métier.

#### B1 — Emails transactionnels Brevo
**Événements couverts (TOUS) — réalisés**
1. Réservation créée (confirmation) ✅
2. Réservation modifiée (replanification) ✅
3. Réservation annulée ✅
4. Facture disponible ✅
5. Rappel J-1 (email) ✅

**Implémentation (réalisée)**
- `backend/brevo_email.py` (templates HTML senior-friendly, best-effort, logs). ✅

#### B2 — Rappels SMS J-1 à 18h (APScheduler)
**Règle — réalisée**
- Envoi la veille du RDV à **18h00 Europe/Paris** pour les RDV du lendemain. ✅

**Implémentation (réalisée)**
- `backend/scheduler.py` + cron APScheduler + anti-doublon `reminder_j1_sent_at`. ✅
- Endpoint test : `POST /api/admin/run-reminders-j1` (gated par `OTP_BYPASS_CODE`). ✅

**Livrables**
- Emails transactionnels + scheduler opérationnels. ✅

---

### Phase C — P1 : Tests E2E backend (Brevo + scheduler + PDFs)
**Objectif** : valider l’ensemble backend hors Stripe.

**Résultats (réalisés)**
- **25/25 tests backend passés (100%)**. ✅
- Rapport : `/app/test_reports/iteration_1.json`. ✅

---

### Phase D — P2 : Corrections & stabilisation
**Objectif** : corriger tout bug issu des tests et figer une version “production-ready”.

**Correctifs appliqués (réalisés)**
- `/api/contact` : auth optionnelle (support messages anonymes). ✅
  - `backend/auth.py` : ajout `optional_user_id`
  - `backend/server.py` : `/api/contact` utilise `optional_user_id`

---

### Phase E — P1 : Stripe Checkout (hosted) — COMPLETED ✅
**Objectif** : permettre un paiement **simple et rassurant** (public seniors) via une page Stripe hébergée, pour :
1) régler une **facture impayée**, 2) verser un **acompte** (10€) lié à une réservation.

#### E1 — Backend Stripe (réalisé)
- Ajout config :
  - `STRIPE_API_KEY=sk_test_emergent` (test)
  - `BOOKING_DEPOSIT_EUR=10.0`
- Nouveau module `backend/payments.py` :
  - `POST /api/payments/checkout/invoice/{invoice_id}`
  - `POST /api/payments/checkout/deposit/{booking_id}`
  - `GET /api/payments/status/{session_id}` (polling)
  - `POST /api/webhook/stripe` (webhook)
- Modèle + collection audit : `models.PaymentTransaction` → `payment_transactions`.
- **Sécurité** : aucun montant accepté du client (le frontend envoie uniquement `origin_url`).
- Webhook : vérification signature via SDK (emergentintegrations).
- Robustesse : `/api/payments/status/{session_id}` supporte un **fallback DB** si la récupération de status Stripe échoue (pas de blocage UX).
- Emails : ajout `send_payment_confirmation_email` (Brevo) pour confirmation de paiement (facture / acompte).

#### E2 — Frontend Stripe (réalisé)
- Onglet Factures : bouton **« Payer en ligne »** pour chaque facture impayée → création session côté backend → redirection Stripe Checkout.
- Onglet Suivi : bouton **« Payer 10€ en sécurité »** (acompte) si non versé.
- Retour Stripe :
  - lecture des paramètres URL (`payment`, `session_id`)
  - polling backend `/api/payments/status/{session_id}`
  - toast de confirmation + refresh (booking/invoices)

#### E3 — Tests & validation (réalisé)
- **42/42 tests backend (100%)** sur Stripe + non-régression. ✅
  - Rapport : `/app/test_reports/iteration_2.json`
- Validation visuelle : redirection vers Stripe Sandbox (ex : facture à **40€**). ✅

**Livrables**
- Stripe Checkout intégré (facture + acompte), endpoints + UI + tests. ✅

## 4) Backlog (hors scope immédiat)
- Dashboard admin/pro (Jordan) pour gérer les RDV.
- Parrainage.
- (Refactor futur) Découpage de `frontend/src/App.js` en composants.
- (Sécurité prod) Remplacer le gating de `/api/admin/*` par une vraie auth admin + désactiver le bypass OTP en production.

## 5) Critères d’acceptation (definition of done)
- Frontend : zéro crash, parcours complet (auth → réservation → suivi → facture → paiement). ✅
- Backend :
  - OTP bypass `1234` OK (tests) ✅
  - Emails envoyés sur tous les événements listés ✅
  - SMS rappel J-1 envoyé à 18h, sans doublons ✅
  - PDF facture téléchargeable ✅
  - Stripe : création session facture + acompte + status + webhook + audit `payment_transactions` ✅
- Tests :
  - Backend hors Stripe : 25/25 ✅
  - Backend Stripe + non-régression : 42/42 ✅

## 6) Passage en production (reste à faire)
- Remplacer `STRIPE_API_KEY=sk_test_emergent` par vos clés Stripe (idéalement `sk_test_...` perso, puis `sk_live_...`).
- Configurer le webhook Stripe dans le Dashboard Stripe (URL publique) :
  - `https://<votre-app>.preview.emergentagent.com/api/webhook/stripe`
- (Optionnel recommandé) Ajouter une vraie authentification admin pour les endpoints `/api/admin/*`.
- Décider de la politique acompte (10€ fixe vs % du net) et de la gestion remboursement automatisé si annulation.
