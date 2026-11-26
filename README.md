# +HR — Intelligent Human Resources Management System

> **Slogan :** *Human Resources, Made Smarter.*

**+HR** est une plateforme SaaS multi-entreprises (multi-tenant) de Gestion des Ressources Humaines (PFE), conçue selon une architecture 3-tiers avec contrôle d'accès par rôles (RBAC), workflows RH en 2 étapes, messagerie et notifications temps réel Socket.io, rapports exportables (PDF, Excel, CSV, Impression) et modules d'assistance IA propulsés par Google Gemini (`gemini-4-hydrogen`) côté serveur.

---

## Architecture 3-Tiers

1. **Couche Présentation (Frontend)** : React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts, Socket.io-client, Lucide React, `jsPDF` + `jspdf-autotable`, `xlsx`. Support complet **Français / Anglais / Arabe (RTL)** et **Mode Clair / Sombre**.
2. **Couche Application (Backend)** : Node.js, Express, REST API, Socket.io (port `3000`), `@google/genai` (côté serveur uniquement), JWT (`jsonwebtoken`) + cookies `HttpOnly`, `bcryptjs`, `multer`, `express-rate-limit`.
3. **Couche Données (Database)** :
   - **SQLite (`better-sqlite3` — défaut en développement)** : création automatique de `plushr.db`, initialisation du sch?ma relationnel (`database/migrations/sqlite_schema.sql`), indexation et jeu de données de démonstration injecté automatiquement au démarrage (aucun serveur MySQL ou SMTP requis).
   - **MySQL (optionnel pour déploiement dédié)** : schéma relationnel complet (`database/migrations/schema.sql`) et jeu de données SQL (`database/seeds/seed.sql`) activables via `DB_MODE=mysql`.

---

## Rôles & Isolation Multi-Tenant

- `SUPER_ADMIN` : Console plateforme SaaS (+HR) — création/suspension d'entreprises, abonnements, incidents techniques (sans accès aux données privées salariales internes non autorisées).
- `COMPANY_ADMIN` : Administration complète de son entreprise, demandes de création de comptes employés, paramétrage et validation.
- `HR_MANAGER` : Validation finale du recrutement (activation compte + mot de passe temporaire), validation finale des congés & sorties, contrats, génération & validation de la paie (MAD), rapports et paramètres.
- `MANAGER` : Supervision de son département, première étape de validation (congés / sorties), plannings d'équipe, tâches Kanban & charge hebdomadaire, AI Schedule.
- `EMPLOYEE` : Portail personnel — pointage entrée/sortie, soldes & demandes de congés, autorisations de sortie, planning, tâches, contrats, bulletins de paie confidentiels PDF, annonces, réunions, messagerie et assistant IA personnel.

---

## Installation & Lancement

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement (.env — optionnel en dev, SQLite plushr.db est prêt par défaut)
cp .env.example .env

# 3. Lancer en développement (crée et initialise automatiquement plushr.db sur le port 3000)
npm run dev

# 4. Optionnel : utiliser MySQL en production
# DB_MODE=mysql dans .env, puis :
# mysql -u root -p < database/migrations/schema.sql
# mysql -u root -p < database/seeds/seed.sql

# 5. Compiler pour la production
npm run build
npm start
```

---

## Comptes de Démonstration (Environnement Développement uniquement)

Activés lorsque `ENABLE_DEMO_ACCOUNTS=true` (désactivés en production) :

| Rôle | Entreprise | Identifiant / Matricule | Mot de passe |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Plateforme +HR | `superadmin@plushr.ma` / `SA-001` | `PlusHR#Super2026!` |
| **Admin Entreprise** | Atlas Industrial Group | `admin@atlas-industrial.ma` / `ATL-001` | `Atlas#Admin2026!` |
| **Responsable RH** | Atlas Industrial Group | `rh@atlas-industrial.ma` / `ATL-002` | `Atlas#HR2026!` |
| **Manager Production** | Atlas Industrial Group | `manager.prod@atlas-industrial.ma` / `ATL-003` | `Atlas#Mgr2026!` |
| **Employé** | Atlas Industrial Group | `employe@atlas-industrial.ma` / `ATL-010` | `Atlas#Emp2026!` |
| **Admin Entreprise 2** | Maghreb Tech Solutions | `admin@maghrebtech.ma` / `MGT-001` | `Maghreb#Admin2026!` |

---

## Exécution des Tests Fonctionnels

Le suite de tests (`tests/workflows.test.ts`) vérifie les 17 scénarios critiques (authentification des 5 rôles, blocages 403, isolation multi-tenant, onboarding en 6 étapes, pointage + retards, congés en 2 étapes + solde + chevauchement, sorties + règles HR Vision, conflits de planning, messagerie privée, notifications, rapports, IA RBAC et persistance) :

```bash
npm test
```

---

## Documentation Complémentaire

- [`docs/ARCHITECTURE_ERD_UML.md`](./docs/ARCHITECTURE_ERD_UML.md) : Diagrammes d'architecture 3-tiers, Modèle Entité-Association (47 tables) et diagrammes UML (Cas d'utilisation, Séquences, Composants).
- [`docs/API_ENDPOINTS.md`](./docs/API_ENDPOINTS.md) : Référence des routes REST et événements Socket.io.
