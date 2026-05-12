# Plan — Le Bon Clic (SPA React + FastAPI + MongoDB)

## 0) Résumé & état actuel
- **Objectif produit** : SPA “Le Bon Clic” (assistance informatique à domicile, -50% crédit d’impôt), **public seniors**, UI minimaliste, accessible, sans jargon.
- **Stack** : Frontend React/Tailwind (SPA monolithique dans `src/App.js`), Backend FastAPI + Motor/MongoDB, OTP SMS via Brevo (bypass `1234`), PDF factures via ReportLab.
- **Dernier changement majeur** : réécriture massive de `App.js` + `App.css` + `manifest.json` pour intégrer **22 améliorations UI/UX/Accessibilité** (non testées).
- **Risque principal** : régression/erreur de compilation ou écran blanc suite au gros overwrite.

## 1) Décisions utilisateur (confirmées)
- (a) **Oui** : d’abord **P0 vérification stabilité frontend**, puis **P1 emails Brevo**.
- (b) Emails Brevo sur **tous les événements** : réservation, modification, annulation, facture, rappel J-1.
- (c) SMS rappel **J-1 à 18h00 fixe** la veille du rendez-vous.
- (d) Conserver le bypass OTP **`1234`** pour les tests.
- (e) Pas de nouvelles fonctionnalités (Stripe/Admin/Parrainage) pour l’instant.

## 2) Travail déjà réalisé (référence)
### Frontend
- Landing + Auth SMS OTP + Dashboard (Wizard réservation, Devis, Suivi, Factures).
- Chatbot “Lumi”.
- Accessibilité : lecture vocale (Web Speech API).
- Implémentation (code) des **22 améliorations** (calendrier visuel, autocomplete adresse, dialogues de confirmation, mode contraste élevé, PWA, etc.) — **à valider**.

### Backend
- FastAPI + MongoDB (index assurés).
- OTP SMS Brevo (avec bypass `1234`).
- Gestion réservations.
- Génération PDF factures ReportLab.

## 3) Plan mis à jour (phases)

### Phase A — P0 : Vérification stabilité frontend (immédiat)
**Objectif** : confirmer que la réécriture de `App.js` compile et que l’app est utilisable (aucun crash React, flux principal intact).

**Étapes**
1. **Logs & compilation**
   - Vérifier `frontend.err.log` / `frontend.out.log` (warnings OK, erreurs KO).
   - Identifier rapidement les imports manquants (DayPicker, composants, icônes, etc.).
2. **Vérification visuelle (captures)**
   - Landing → Auth (téléphone) → OTP (entrer `1234`) → Dashboard.
   - Ouvrir le **wizard réservation** (calendrier visuel), vérifier validation champs, dialogues.
   - Vérifier : mode contraste élevé, tailles de police, focus visible, boutons gros, états loading.
3. **Smoke test fonctionnel**
   - Créer une réservation.
   - Vérifier “Devis” (sidebar) et “Suivi”.
   - Générer/ouvrir une facture PDF (si accessible via UI).
4. **Corrections P0**
   - Corriger en priorité tout ce qui bloque : écran blanc, crash, routes, appels API.

**Livrables**
- Frontend stable (pas d’erreurs runtime), flux principal complet.

---

### Phase B — P1 : Backend Brevo Transactional Email + APScheduler (rappels)
**Objectif** : emails transactionnels complets + rappel SMS J-1 à 18h, reliés aux événements métier.

#### B1 — Emails transactionnels Brevo
**Événements à couvrir (TOUS)**
1. Réservation créée (confirmation)
2. Réservation modifiée
3. Réservation annulée
4. Facture disponible (PDF générée / statut “disponible”)
5. Rappel J-1 (email)

**Approche**
- Ajouter un module email (ex : `brevo_email.py`) utilisant l’API Brevo Transactional Email.
- Centraliser l’envoi dans des fonctions : `send_booking_created_email`, `send_booking_updated_email`, `send_booking_cancelled_email`, `send_invoice_ready_email`, `send_reminder_j1_email`.
- Définir une configuration claire (FROM, reply-to, variables, template IDs ou HTML inline).
- Inclure du texte **simple, senior-friendly**, et les infos clés : date, créneau, adresse, contact Jordan, lien vers l’app.

**Points techniques**
- Gestion des erreurs (log + pas de crash API si email échoue).
- Mise en place d’un “event dispatch” : au moment où le backend crée/modifie/annule, déclencher email.

#### B2 — Rappels SMS J-1 à 18h (APScheduler)
**Règle**
- Envoyer un SMS la veille du RDV à **18h00** (heure locale) pour les RDV du lendemain.

**Approche**
- Ajouter APScheduler au backend (job périodique : ex. toutes les 5–10 minutes) qui :
  - Calcule la fenêtre “demain” et filtre les bookings.
  - À 18h, envoie les SMS aux réservations concernées.
  - Marque un flag (ex : `reminder_j1_sent_at`) pour éviter les doublons.
- Conserver le bypass `1234` (auth) tel quel.

**Livrables**
- Emails transactionnels opérationnels.
- Job scheduler opérationnel + logs.
- Champs DB éventuels ajoutés (ex : `reminder_j1_sent_at`, `last_notification_error`).

---

### Phase C — P1 : Tests E2E complets (testing_agent_v3)
**Objectif** : valider de bout en bout (frontend + backend) après P0 + P1.

**Scénarios**
1. Auth : OTP réel (si possible) + bypass `1234` (obligatoire tests).
2. Profil : MAJ des infos (adresse, détails d’accès).
3. Réservation : création, modification, annulation.
4. Notifications :
   - Emails sur les événements (création/modif/annulation/facture/rappel).
   - SMS rappel J-1 à 18h (test via date “demain” + simulation/override si nécessaire).
5. Factures : génération PDF, téléchargement/visualisation.
6. Accessibilité : focus, contraste élevé, tailles, lecture vocale.
7. Chatbot Lumi : interactions de base + handoff contact.

**Livrables**
- Rapport de tests + liste de bugs priorisée.

---

### Phase D — P2 : Corrections & stabilisation
**Objectif** : corriger tout bug issu des tests et figer une version “production-ready”.

**Étapes**
- Corriger P0/P1 bloquants.
- Repasser un mini smoke test.
- Ajuster UX (microcopy, erreurs, états loading) uniquement si nécessaire.

## 4) Backlog (hors scope immédiat)
- Paiement Stripe.
- Dashboard admin/pro (Jordan) pour gérer les RDV.
- Parrainage.

## 5) Critères d’acceptation (definition of done)
- Frontend : zéro crash, parcours complet (auth → réservation → suivi → facture).
- Backend :
  - OTP bypass `1234` OK.
  - Emails envoyés sur tous les événements listés.
  - SMS rappel J-1 envoyé à 18h, sans doublons.
  - PDF facture téléchargeable.
- Tests E2E : passés (ou bugs résiduels documentés et non bloquants).
