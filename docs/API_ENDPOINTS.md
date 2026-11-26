# Référence API REST & Temps Réel Socket.io — +HR

Toutes les routes applicatives (hors authentification publique et `/api/health`) exigent un JWT valide (`Authorization: Bearer <token>` ou cookie `HttpOnly`) et appliquent un cloisonnement strict par `company_id` et par rôle.

## Authentification & Sécurité (`/api/auth/*`)
- `POST /api/auth/login` — Connexion par email ou matricule
- `POST /api/auth/refresh` — Renouvellement silencieux via cookie `HttpOnly`
- `POST /api/auth/logout` — Révocation du refresh token
- `GET /api/auth/me` — Profil de l'utilisateur connecté
- `POST /api/auth/change-password` — Changement de mot de passe (obligatoire au 1er login)
- `POST /api/auth/otp/request` — Génération d'un code OTP à 6 chiffres (validité 5 min)
- `POST /api/auth/otp/verify-reset` — Vérification OTP (max 5 essais) et réinitialisation
- `PUT /api/auth/profile` — Mise à jour langue (`fr`/`en`/`ar`), thème (`light`/`dark`), coordonnées
- `POST /api/auth/webauthn/register` — Enregistrement d'un identifiant WebAuthn / Passkey

## Plateforme Super Admin (`/api/platform/*`)
- `GET /api/platform/overview` — KPIs globaux SaaS, entreprises, abonnements, incidents
- `POST /api/platform/companies` — Création d'entreprise cliente + Admin initial
- `PATCH /api/platform/companies/:id/status` — Activation / suspension
- `PATCH /api/platform/incidents/:id` — Mise à jour statut incident technique

## Employés, Onboarding & Organisation
- `GET /api/employees`, `GET /api/employees/:id`, `PUT /api/employees/:id`
- `POST /api/employees/:id/documents` — Upload sécurisé de pièces justificatives
- `POST /api/employees/import` — Import en masse CSV / Excel
- `GET /api/registration-requests`, `POST /api/registration-requests`, `POST /api/registration-requests/:id/review`
- `GET /api/departments`, `POST /api/departments`, `PUT /api/departments/:id`, `POST /api/positions`

## Opérations RH (Présences, Congés, Sorties, Plannings, Tâches)
- `GET /api/attendance`, `POST /api/attendance/check-in`, `POST /api/attendance/check-out`, `PUT /api/attendance/:id/correct`
- `GET /api/leaves`, `POST /api/leaves`, `POST /api/leaves/:id/review`, `POST /api/leaves/:id/cancel`
- `GET /api/exits`, `POST /api/exits`, `POST /api/exits/:id/review`
- `GET /api/schedules`, `POST /api/schedules/assignments`
- `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`

## Contrats, Paie, Communication & Rapports
- `GET /api/contracts`, `POST /api/contracts`, `POST /api/contracts/:id/archive`
- `GET /api/payroll`, `POST /api/payroll/generate`, `POST /api/payroll/:id/validate`
- `GET /api/announcements`, `POST /api/announcements`, `PATCH /api/announcements/:id/pin`, `DELETE /api/announcements/:id`
- `POST /api/announcements/:id/comments`, `DELETE /api/announcements/:id/comments/:commentId`
- `GET /api/meetings`, `POST /api/meetings`, `POST /api/meetings/:id/cancel`
- `GET /api/messages/workspace`, `POST /api/messages/conversations`, `GET/POST /api/messages/conversations/:id`, `PUT/DELETE /api/messages/:messageId`
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `PUT /api/notifications/preferences`
- `GET /api/reports?type=...&departmentId=...&from=...&to=...`
- `GET /api/settings`, `PUT /api/settings`

## Modules IA Gemini (`gemini-4-hydrogen`)
- `POST /api/ai/chat`, `GET /api/ai/conversations`
- `GET /api/ai/analytics`
- `GET /api/ai/schedule-suggestions`, `POST /api/ai/schedule-suggest`, `POST /api/ai/schedule-suggestions/:id/decision`

## Événements Socket.io (`/socket.io`)
- `presence:update` — Liste des utilisateurs en ligne dans l'entreprise
- `chat:message` — Nouveau message temps réel
- `chat:updated` — Message modifié ou supprimé
- `chat:typing` — Indicateur de saisie
- `notification:new` — Nouvelle notification instantanée
