# Architecture, ERD (47 Tables) & Diagrammes UML — +HR

## 1. Diagramme d'Architecture 3-Tiers

```mermaid
flowchart TB
  subgraph Client["Couche Présentation (React 19 + TypeScript + Tailwind v4)"]
    UI[Pages & Composants +HR]
    Router[React Router + Garde RBAC]
    SocketClient[Socket.io Client]
    Exports[jsPDF / SheetJS Exports]
  end

  subgraph Server["Couche Application (Node.js + Express + Port 3000)"]
    AuthMW[JWT Auth + HttpOnly Cookies + Rate Limit]
    RBAC[Multi-Tenant Guard & Role Permissions]
    Controllers[Controllers REST]
    SocketSrv[Socket.io Realtime Server]
    GeminiSvc[Gemini AI Service - gemini-4-hydrogen]
  end

  subgraph Data["Couche Données"]
    SQLite[(SQLite - plushr.db via better-sqlite3, défaut dev)]
    MySQL[(MySQL 8 - schema.sql, optionnel prod)]
  end

  UI --> Router --> AuthMW --> RBAC --> Controllers
  SocketClient <--> SocketSrv
  Controllers --> GeminiSvc
  Controllers --> SQLite
  Controllers -. Optionnel si DB_MODE=mysql .-> MySQL
```

---

## 2. Modèle Entité-Association (ERD — Vue Globale des 47 Tables)

```mermaid
erDiagram
  COMPANIES ||--o{ SUBSCRIPTIONS : has
  COMPANIES ||--o{ COMPANY_SETTINGS : configures
  COMPANIES ||--o{ USERS : employs_accounts
  COMPANIES ||--o{ DEPARTMENTS : organizes
  COMPANIES ||--o{ EMPLOYEES : contains
  ROLES ||--o{ USERS : assigns
  ROLES ||--o{ ROLE_PERMISSIONS : grants
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : defines
  DEPARTMENTS ||--o{ POSITIONS : defines
  DEPARTMENTS ||--o{ EMPLOYEES : hosts
  EMPLOYEES ||--o{ CONTRACTS : signs
  EMPLOYEES ||--o{ ATTENDANCE_RECORDS : logs
  ATTENDANCE_RECORDS ||--o{ ATTENDANCE_CORRECTIONS : tracks
  EMPLOYEES ||--o{ LEAVE_BALANCES : holds
  LEAVE_TYPES ||--o{ LEAVE_BALANCES : categorizes
  EMPLOYEES ||--o{ LEAVE_REQUESTS : submits
  EMPLOYEES ||--o{ EXIT_REQUESTS : submits
  EXIT_TYPES ||--o{ EXIT_REQUESTS : categorizes
  SHIFTS ||--o{ SHIFT_ASSIGNMENTS : schedules
  EMPLOYEES ||--o{ SHIFT_ASSIGNMENTS : assigned_to
  PROJECTS ||--o{ TASKS : groups
  TASKS ||--o{ TASK_ASSIGNMENTS : assigns
  EMPLOYEES ||--o{ TASK_ASSIGNMENTS : works_on
  PAYROLLS ||--o{ PAYROLL_ITEMS : contains
  PAYROLL_ITEMS ||--|| PAYSLIPS : generates
  ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_COMMENTS : receives
  MEETINGS ||--o{ MEETING_PARTICIPANTS : invites
  CONVERSATIONS ||--o{ CONVERSATION_MEMBERS : includes
  CONVERSATIONS ||--o{ MESSAGES : stores
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AI_CONVERSATIONS : initiates
  AI_CONVERSATIONS ||--o{ AI_MESSAGES : records
  DEPARTMENTS ||--o{ AI_SCHEDULE_SUGGESTIONS : targets
```

> Le DDL SQL complet des **47 tables** (`companies`, `subscriptions`, `roles`, `permissions`, `role_permissions`, `users`, `password_reset_otps`, `refresh_tokens`, `audit_logs`, `company_settings`, `holidays`, `departments`, `positions`, `employees`, `employee_registration_requests`, `employee_documents`, `attendance_records`, `attendance_corrections`, `leave_types`, `leave_balances`, `leave_requests`, `exit_types`, `exit_requests`, `approval_history`, `shifts`, `shift_assignments`, `projects`, `tasks`, `task_assignments`, `task_comments`, `contracts`, `contract_alerts`, `payrolls`, `payroll_items`, `payslips`, `announcements`, `announcement_comments`, `meetings`, `meeting_participants`, `calendar_events`, `conversations`, `conversation_members`, `messages`, `notifications`, `notification_preferences`, `ai_conversations`, `ai_messages`, `ai_schedule_suggestions`, `technical_incidents`) se trouve dans [`database/migrations/schema.sql`](../database/migrations/schema.sql).

---

## 3. Diagramme de Cas d'Utilisation UML

```mermaid
flowchart LR
  SA((Super Admin))
  CA((Company Admin))
  HR((HR Manager))
  MG((Manager))
  EM((Employee))

  UC1([Gérer Entreprises & Incidents])
  UC2([Demander Création Compte Employé])
  UC3([Valider Compte & Activer Accès])
  UC4([Pointer Entrée / Sortie])
  UC5([Demander Congé / Sortie])
  UC6([Valider Étape 1 Manager])
  UC7([Validation Finale RH & Paie])
  UC8([Planifier Shifts & AI Schedule])
  UC9([Générer Rapports & Bulletins PDF])
  UC10([Messagerie Temps Réel & Assistant IA])

  SA --> UC1
  CA --> UC2
  CA --> UC9
  HR --> UC3
  HR --> UC7
  HR --> UC8
  HR --> UC9
  MG --> UC6
  MG --> UC8
  EM --> UC4
  EM --> UC5
  CA --> UC10
  HR --> UC10
  MG --> UC10
  EM --> UC10
```

---

## 4. Diagrammes de Séquence UML

### 4.1 Workflow d'Onboarding Employé en 6 Étapes

```mermaid
sequenceDiagram
  actor Admin as Admin Entreprise
  participant API as +HR Backend API
  actor HR as Responsable RH
  actor Emp as Nouvel Employé

  Admin->>API: POST /api/registration-requests (infos + poste + salaire)
  API->>HR: Notification temps réel Socket.io (new_employee_request)
  HR->>API: POST /api/registration-requests/:id/review (approved)
  API->>API: Génère User (must_change_password=true) + Employee + Contract + LeaveBalances
  API-->>HR: Retourne matricule & mot de passe temporaire
  Emp->>API: POST /api/auth/login (identifiant + mot de passe temporaire)
  API-->>Emp: Session active (must_change_password=true)
  Emp->>API: POST /api/auth/change-password (nouveau mot de passe fort)
  API-->>Emp: Compte activé définitivement
```

### 4.2 Workflow de Validation de Congé en 2 Étapes

```mermaid
sequenceDiagram
  actor Emp as Employé
  participant API as +HR Backend API
  actor Mgr as Manager Département
  actor HR as Responsable RH

  Emp->>API: POST /api/leaves (vérif solde, chevauchement, jours fériés)
  API-->>Mgr: Notification demande (status: pending_manager)
  Mgr->>API: POST /api/leaves/:id/review (approve)
  API-->>HR: Notification validation étape 1 (status: pending_hr)
  HR->>API: POST /api/leaves/:id/review (approve)
  API->>API: Déduction atomique du solde + statut approved
  API-->>Emp: Notification temps réel décision finale
```
