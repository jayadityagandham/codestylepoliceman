# Code Style Policeman (CSP) — Complete Project Documentation

> **A full-stack team project command center** that integrates GitHub, Discord, and AI to provide real-time visibility into software project health, team dynamics, and development velocity.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Design System](#4-design-system)
5. [Authentication System](#5-authentication-system)
6. [Database Schema](#6-database-schema)
7. [GitHub Integration](#7-github-integration)
8. [Webhook System](#8-webhook-system)
9. [AI Features (Groq)](#9-ai-features-groq)
10. [NLP Engine](#10-nlp-engine)
11. [Semantic Commit Analysis](#11-semantic-commit-analysis)
12. [Heuristics Engine](#12-heuristics-engine)
13. [Health Score Algorithm](#13-health-score-algorithm)
14. [Bus Factor & Knowledge Concentration](#14-bus-factor--knowledge-concentration)
15. [Cycle Time Metrics (DORA)](#15-cycle-time-metrics-dora)
16. [Discord Bot Integration](#16-discord-bot-integration)
17. [Frontend — Pages & Components](#17-frontend--pages--components)
18. [Dashboard Tabs (Detailed)](#18-dashboard-tabs-detailed)
19. [API Reference](#19-api-reference)
20. [Real-Time Features](#20-real-time-features)
21. [Testing](#21-testing)
22. [Security](#22-security)
23. [Environment Variables](#23-environment-variables)
24. [Deployment](#24-deployment)
25. [Glossary of Terms](#25-glossary-of-terms)

---

## 1. Project Overview

**Code Style Policeman (CSP)** is a team project command center built for software engineering teams. It connects to a team's GitHub repository and communication channels (Discord, WhatsApp) to provide:

- **Real-time project health monitoring** — a weighted multi-signal health score from 0–100
- **Commit & PR tracking** — with semantic classification of every commit type
- **AI-powered insights** — project analysis, task generation, commit summarization with task-matching
- **Automated alerting** — heuristic rules detect stale PRs, inactive branches, blocker escalation, and more
- **Bus factor analysis** — identifies knowledge concentration risks across files and contributors
- **Cycle time metrics** — DORA-style engineering velocity tracking
- **Team chat** — in-app messaging with AI intent classification
- **Task management** — CRUD tasks with AI generation from project descriptions

### Why CSP Exists

Software teams often lack a single view into project health. Code lives in GitHub, conversations in Discord/Slack, tasks in various tools. CSP unifies these into one dashboard with automated intelligence:

- **Managers** see at a glance whether the project is healthy or at risk.
- **Developers** get alerted to stale PRs, inactive branches, and bottlenecks before they become problems.
- **AI** surfaces patterns humans miss — like whether commits actually address planned tasks.

---

## 2. Tech Stack

### Core Framework

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 15.5.7 | Full-stack React framework with App Router, API routes, server components |
| **React** | 19.2.0 | UI library — uses latest features (use(), server components) |
| **TypeScript** | 5.x | Type safety across the entire codebase |
| **Turbopack** | Built-in | Next.js bundler for fast development builds |

**Why Next.js 15?** The App Router provides file-system-based routing for both pages and API endpoints in a single project. Server-side API routes handle auth, webhooks, and database operations without a separate backend. Turbopack dramatically speeds up development HMR.

### Database & Auth

| Technology | Purpose |
|---|---|
| **Supabase** | PostgreSQL database + Realtime subscriptions + Row-Level Security |
| **jose** | JWT signing/verification (HS256 algorithm, 7-day token expiry) |
| **bcryptjs** | Password hashing (cost factor 12) |

**Why Supabase?** Provides a managed PostgreSQL database with a JavaScript client, real-time WebSocket subscriptions (used for live alerts/messages), and a service role key for server-side operations that bypass RLS.

### AI

| Technology | Purpose |
|---|---|
| **Groq API** | LLM inference (OpenAI-compatible endpoint) |
| **llama-3.3-70b-versatile** | The AI model used for all AI features |

**Why Groq + Llama 3.3?** Groq provides extremely fast inference (~10x faster than typical OpenAI latency) for the 70B parameter Llama model. The OpenAI-compatible API means the integration code is standard. The 70B model is powerful enough for intent classification, project analysis, and commit summarization.

### UI & Design

| Technology | Purpose |
|---|---|
| **Tailwind CSS v4** | Utility-first CSS framework |
| **shadcn/ui** | 50+ pre-built Radix-based components (buttons, cards, dialogs, etc.) |
| **Radix UI** | 27 accessible headless primitives underlying shadcn/ui |
| **Aceternity UI** | 4 custom animated components (Spotlight, FlipWords, TextGenerateEffect, MovingBorder) |
| **Framer Motion** | Animation library powering Aceternity UI components |
| **Lucide React** | Icon library (550+ icons) |
| **class-variance-authority** | Type-safe component variant management |
| **clsx + tailwind-merge** | Conditional class composition with Tailwind deduplication |

**Why this combination?** shadcn/ui provides production-ready accessible components that are fully customizable (they live in your codebase, not node_modules). Aceternity UI adds visually striking landing page animations. The monochromatic OKLCH palette ensures consistent grayscale aesthetics.

### Charts & Visualization

| Technology | Purpose |
|---|---|
| **Chart.js** | Canvas-based charting library |
| **react-chartjs-2** | React wrapper for Chart.js |
| **Custom Canvas** | Force-directed graph for bus factor visualization |

**Why Chart.js?** Lightweight, performant canvas rendering for the 4 dashboard charts. The force-directed graph is custom-built (120-frame physics simulation) to avoid heavy graph library dependencies.

### Validation & Forms

| Technology | Purpose |
|---|---|
| **Zod** | Runtime schema validation for API inputs |
| **React Hook Form** | Form state management |
| **@hookform/resolvers** | Zod-to-React-Hook-Form adapter |

### Utilities

| Technology | Purpose |
|---|---|
| **date-fns** | Date formatting and relative time ("3 hours ago") |
| **html2canvas + jsPDF** | PDF/screenshot export capability |
| **react-day-picker** | Calendar date picker component |
| **input-otp** | OTP input component |
| **sonner** | Toast notification library |
| **cmdk** | Command palette component |
| **vaul** | Drawer component |

### Testing

| Technology | Purpose |
|---|---|
| **Vitest** | Test runner (compatible with Jest API, native TypeScript) |
| **@testing-library/react** | Component testing utilities |
| **jsdom** | Browser DOM simulation for tests |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                               │
│                                                                          │
│  Landing Page ─► GitHub/Discord OAuth ─► Auth Callback ─► Dashboard      │
│                                                                          │
│  Dashboard (/dashboard/[workspaceId])                                    │
│  ├── 10 Tabs: Overview, Commits, PRs, Issues, Alerts,                   │
│  │            Bus Factor, Team, Messages, AI Insights, Settings          │
│  ├── Chart.js charts (4 types)                                          │
│  ├── Canvas force-directed graph                                        │
│  ├── Supabase Realtime subscriptions                                    │
│  └── 3-second polling fallback                                          │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTP (REST API)
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      SERVER (Next.js API Routes)                         │
│                                                                          │
│  /api/auth/*          ─── JWT auth, GitHub/Discord OAuth                │
│  /api/workspaces/*    ─── CRUD workspaces, members, todos, messages     │
│  /api/webhooks/*      ─── GitHub, Discord, WhatsApp event ingestion     │
│  /api/github/*        ─── GitHub repo listing                           │
│                                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐    │
│  │   Groq AI   │  │  Heuristics  │  │  NLP Engine  │  │ Semantic │    │
│  │  (Llama 3.3)│  │   Engine     │  │  (Pattern)   │  │ Analysis │    │
│  └─────────────┘  └──────────────┘  └──────────────┘  └──────────┘    │
└──────────────┬───────────────┬───────────────────────────────────────────┘
               │               │
    ┌──────────▼──────┐  ┌─────▼──────────┐
    │   Supabase      │  │  GitHub API    │
    │   (PostgreSQL)  │  │  (REST v3)     │
    │   + Realtime    │  │                │
    └─────────────────┘  └────────────────┘
               ▲
    ┌──────────┤
    │  External Webhooks
    │  ├── GitHub (push, PR, issues, deploy, member)
    │  ├── Discord Bot (MESSAGE_CREATE)
    │  └── WhatsApp Relay
    └───────────────────
```

### Data Flow

1. **User signs in** via GitHub OAuth → JWT token issued → stored in localStorage
2. **Dashboard loads** → API fetches live data from GitHub + Supabase in parallel
3. **GitHub webhooks fire** on push/PR/issue events → data upserted to Supabase → heuristics run → alerts generated
4. **Discord messages arrive** → NLP classifies intent → stored with entities → blocker alerts auto-created
5. **AI features triggered** on-demand → Groq API called → results returned to client
6. **Supabase Realtime** pushes new alerts, commits, and messages to connected clients

---

## 4. Design System

### Color Philosophy

The entire application uses a **monochromatic black-and-white** design system. All colors are defined using the OKLCH color space with **zero chroma** (pure grayscale).

```css
/* Light Mode */
--background: oklch(0.985 0 0);   /* Near-white */
--foreground: oklch(0.09 0 0);    /* Near-black */

/* Dark Mode (default) */
--background: oklch(0.07 0 0);    /* Near-black */
--foreground: oklch(0.95 0 0);    /* Near-white */
```

**Why monochrome?** The B&W palette removes visual noise and makes the data the focus. Semantic meaning comes from layout, weight, and spacing — not color. The only color accents are in commit type badges and line diff indicators (green/red for +/-).

### Typography

- **Geist Sans** — Primary typeface (variable font, loaded via `next/font`)
- **Geist Mono** — Monospace for code/technical content

### Component Library

50+ shadcn/ui components built on Radix primitives. These are **source-available** — the component files live in `src/components/ui/` and can be modified directly. Key components used:

- `Card`, `CardContent`, `CardHeader` — Dashboard panels
- `Button` (multiple variants: default, ghost, outline, destructive)
- `Avatar` + `AvatarImage` + `AvatarFallback` — User/contributor photos
- `Badge` — Status indicators
- `Dialog` — Modal dialogs
- `DropdownMenu` — Context menus
- `Input`, `Textarea`, `Select` — Form controls
- `Tooltip` — Hover information
- `Switch` — Toggle settings
- `Separator` — Visual dividers

### Aceternity UI Components

Four custom animated components for the landing page:

| Component | Animation | Usage |
|---|---|---|
| **Spotlight** | Radial gradient that follows cursor movement | Hero section background |
| **FlipWords** | Words flip/rotate through a list with spring physics | Hero headline cycling through "full visibility", "flow metrics", "AI insights", "team health" |
| **TextGenerateEffect** | Words fade in one-by-one with staggered timing | Hero subtitle reveal |
| **MovingBorderButton** | Border that continuously animates around button perimeter using conic gradients | Primary CTA button |

---

## 5. Authentication System

### Overview

CSP supports three authentication methods:
1. **GitHub OAuth** (primary — also grants API access for repo operations)
2. **Discord OAuth** (alternative sign-in)
3. **Email/Password** (traditional — with bcrypt hashing)

All methods produce a **JWT token** (HS256, 7-day expiry) stored in the client's `localStorage`.

### GitHub OAuth Flow

```
Browser                    CSP Server                   GitHub
  │                            │                           │
  ├─ GET /api/auth/github ────►│                           │
  │                            ├─ Generate state ─────────►│
  │                            │  Store in httpOnly cookie  │
  │◄── Redirect to GitHub ─────┤                           │
  │                            │                           │
  ├─ User authorizes ─────────────────────────────────────►│
  │                            │                           │
  │◄── Redirect with code ─────────────────────────────────┤
  │                            │                           │
  ├─ GET /callback?code=... ──►│                           │
  │                            ├─ Exchange code for token ─►│
  │                            │◄── Access token ──────────┤
  │                            ├─ Fetch /user + /user/emails│
  │                            │◄── User profile ──────────┤
  │                            ├─ Upsert user in Supabase   │
  │                            ├─ Sign JWT                  │
  │                            ├─ Set github_token cookie   │
  │◄── Redirect /auth-callback?token=... ──────────────────┤
  │                            │                           │
  ├─ Store JWT in localStorage │                           │
  ├─ Redirect to /dashboard    │                           │
```

**OAuth Scopes:** `user:email`, `read:user`, `read:org`, `admin:repo_hook`

The `github_token` cookie (30-day, httpOnly) enables the server to make GitHub API calls on behalf of the user (fetching repos, live dashboard data, setting up webhooks).

### Discord OAuth Flow

Same pattern as GitHub. Scopes: `identify`, `email`. Upserts user by `discord_id`.

### Email/Password Flow

- **Register:** Zod validates input (name 2-100 chars, valid email, password with uppercase + lowercase + digit + 8 min length) → bcrypt hash (cost 12) → insert user → sign JWT
- **Login:** Zod validates → fetch user by email → bcrypt compare → sign JWT
- **Rate limited:** Registration: 5 requests/hour per IP. Login: 10 requests/15 minutes per IP.

### JWT Structure

```json
{
  "sub": "<user_id>",
  "email": "<user_email>",
  "name": "<user_name>",
  "iat": 1708000000,
  "exp": 1708604800
}
```

Signed with `HS256` using `JWT_SECRET` environment variable. Every authenticated API route calls `requireAuth(req)` which extracts the `Authorization: Bearer <token>` header and verifies via `jose.jwtVerify()`.

### Auth Context (Client-Side)

The `useAuth()` hook provides:
- `user` — Current user object (id, email, name, avatar_url, github_username)
- `token` — JWT string
- `loading` — Auth state loading indicator
- `login(email, password)` — Email login
- `register(name, email, password)` — Email registration
- `logout()` — Clear localStorage + state
- `setTokenAndUser(token, user)` — Direct token injection (used by OAuth callback)

On app mount, the hook reads the token from `localStorage` and verifies it via `GET /api/auth/me` with 2 retries (500ms delay between attempts).

---

## 6. Database Schema

CSP uses Supabase (PostgreSQL) with 15 tables:

### Core Tables

**`users`** — User accounts
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| email | text (unique) | User email |
| name | text | Display name |
| avatar_url | text | Profile picture URL |
| password_hash | text | bcrypt hash (null for OAuth-only users) |
| github_id | text | GitHub user ID (for OAuth matching) |
| github_username | text | GitHub login username |
| github_access_token | text | GitHub OAuth access token |
| discord_id | text | Discord user ID |
| discord_username | text | Discord username |

**`workspaces`** — Team workspaces
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| name | text | Workspace display name |
| description | text | Optional description |
| github_repo_url | text | Full GitHub repo URL |
| github_repo_owner | text | GitHub owner (e.g., "octocat") |
| github_repo_name | text | GitHub repo name (e.g., "hello-world") |
| github_repo_id | text | GitHub repo ID |
| github_repo_default_branch | text | Default branch name |
| github_repo_private | boolean | Private repo flag |
| github_access_token | text | Token used for webhook setup |
| github_webhook_id | text | Registered webhook ID |
| github_webhook_secret | text | HMAC signing secret for webhook verification |
| discord_channel_id | text | Mapped Discord channel |
| collaborators | jsonb | Cached collaborator data from GitHub |
| collaborators_updated_at | timestamp | Last collaborator refresh |
| created_by | uuid (FK) | User who created the workspace |

**`workspace_members`** — Membership (many-to-many)
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | → workspaces.id |
| user_id | uuid (FK) | → users.id |
| role | text | "admin" or "member" |
| joined_at | timestamp | Join timestamp |

### Git Data Tables

**`commits`** — Individual git commits (populated by webhooks)
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| sha | text (unique per workspace) | Git commit SHA |
| message | text | Full commit message |
| author_name | text | Git author name |
| author_email | text | Git author email |
| author_github_username | text | Mapped GitHub username |
| branch | text | Branch name |
| repo_owner, repo_name | text | Repository coordinates |
| lines_added, lines_deleted | integer | Line change counts (fetched per-commit from GitHub API) |
| files_changed | integer | Number of files changed |
| files_list | text[] | Array of changed file paths |
| commit_type | text | Classified type (feat, fix, refactor, etc.) |
| commit_summary | text | AI-generated summary |
| is_high_impact | boolean | High-impact path flag |
| committed_at | timestamp | Commit timestamp |
| raw_payload | jsonb | Full GitHub webhook payload |

**`pull_requests`** — PRs tracked for cycle time
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| github_pr_number | integer | PR number |
| title | text | PR title |
| body | text | PR description |
| state | text | open / closed / merged |
| author_github_username | text | PR author |
| head_branch, base_branch | text | Source/target branches |
| lines_added, lines_deleted | integer | Total line changes |
| opened_at | timestamp | When PR was opened |
| closed_at | timestamp | When PR was closed |
| merged_at | timestamp | When PR was merged |
| first_review_at | timestamp | When first review was requested |
| raw_payload | jsonb | Full webhook payload |

**`issues`** — GitHub issues
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| github_issue_number | integer | Issue number |
| title | text | Issue title |
| state | text | open / closed |
| author_github_username | text | Issue author |
| assignee_github_username | text | Assigned developer |
| labels | text[] | Issue labels array |
| opened_at, closed_at | timestamp | Lifecycle timestamps |

**`branches`** — Branch tracking
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| name | text | Branch name |
| author_github_username | text | Branch creator |
| last_commit_at | timestamp | Most recent commit |
| is_merged | boolean | Whether branch was merged |
| merged_at | timestamp | Merge timestamp |

**`file_authorship`** — Per-file per-author code ownership
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| file_path | text | File path in repo |
| author_github_username | text | Contributing author |
| lines_added | integer | Lines added by this author to this file |
| lines_modified | integer | Lines modified by this author |
| commit_count | integer | Number of commits touching this file |
| last_modified_at | timestamp | Last modification |

### Intelligence Tables

**`alerts`** — Heuristic-generated alerts
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| type | text | Alert rule ID (e.g., "AR-HEU-001") |
| severity | text | "critical", "warning", or "info" |
| title | text | Human-readable alert title |
| description | text | Detailed alert description |
| metadata | jsonb | Contextual data (branch name, PR number, etc.) |
| resolved | boolean | Whether alert is resolved |
| resolved_at | timestamp | Resolution timestamp |
| created_at | timestamp | Alert creation time |

**`cycle_time_metrics`** — DORA-style engineering metrics
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| pull_request_id | text (FK) | Associated PR |
| coding_time_seconds | integer | Time from first commit to PR open |
| pickup_time_seconds | integer | Time from PR open to first review request |
| review_time_seconds | integer | Time from first review to merge/close |
| deployment_time_seconds | integer | Time from merge to deployment |
| total_cycle_time_seconds | integer | Full PR lifecycle duration |
| exceeds_threshold | boolean | Whether total > 72 hours |
| calculated_at | timestamp | When metrics were calculated |

**`health_snapshots`** — Historical health scores
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| score | integer | Overall health score (0–100) |
| commit_score | integer | Commit velocity component |
| pr_score | integer | PR throughput component |
| issue_score | integer | Issue resolution component |
| bus_factor_score | integer | Bus factor component |
| alert_penalty | integer | Alert deduction |
| snapshot_at | timestamp | When snapshot was taken |

### Communication Tables

**`discord_messages`** — Chat messages (Discord + in-app)
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Parent workspace |
| message_id | text | Unique message ID |
| channel_id | text | Discord channel ID (or "in-app") |
| channel_name | text | Channel display name |
| author_discord_id | text | Discord author ID |
| author_username | text | Display username |
| user_id | uuid | CSP user ID (for in-app messages) |
| content | text | Message text |
| intent | text | AI-classified intent |
| entities | jsonb | NLP-extracted entities |
| is_blocker | boolean | Whether message is a blocker |
| sent_at | timestamp | Message timestamp |

**`workspace_todos`** — Task management
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| workspace_id | uuid (FK) | Parent workspace |
| created_by | uuid (FK) | Creator user |
| assigned_to | uuid (FK) | Assigned member (nullable) |
| title | text | Task title |
| description | text | Task description |
| status | text | "pending" / "in-progress" / "completed" |
| priority | text | "low" / "medium" / "high" / "critical" |
| deadline | timestamp | Due date (nullable) |
| completed_at | timestamp | Completion timestamp |
| created_at | timestamp | Creation timestamp |

**`workspace_invitations`** — Invite tokens
| Column | Type | Description |
|---|---|---|
| workspace_id | uuid (FK) | Target workspace |
| token | text (unique) | Invite token string |
| role | text | Role to assign on join |
| created_by | uuid (FK) | Admin who created invite |
| expires_at | timestamp | Expiry (default 48 hours) |
| used_at | timestamp | When invite was used |
| used_by | uuid (FK) | User who accepted invite |

---

## 7. GitHub Integration

### Repository Binding

When a user binds a GitHub repository to a workspace, the following orchestration happens:

1. **Verify access** — `GET /repos/{owner}/{repo}` to confirm the user has read access
2. **Store binding** — Save `github_repo_owner`, `github_repo_name`, `github_repo_id`, `github_repo_default_branch`, `github_repo_private` to workspace
3. **Setup webhook** — `POST /repos/{owner}/{repo}/hooks` with events: `push`, `pull_request`, `issues`, `deployment_status`, `member`. Uses HMAC-SHA256 secret for verification.
4. **Historical sync** — Fetches up to 500 historical commits, all PRs, and all issues to backfill the database
5. **Collaborator sync** — Fetches repo collaborators with permission levels (admin, push, pull)
6. **File authorship** — Builds per-file per-author ownership data from historical commits

### Live Data vs. Stored Data

CSP uses **two data sources** for dashboard display:

| Source | When Used | Data |
|---|---|---|
| **GitHub API (live)** | When `github_token` cookie exists + repo is bound | Contributors, recent commits, PRs, issues — fetched in real-time |
| **Supabase (stored)** | Fallback when no GitHub token, or for webhook-populated data | Historical commits, alerts, messages, file authorship, cycle time |

The dashboard attempts the live path first. If the GitHub token is missing or expired, it falls back to Supabase-stored data.

### Repo Browser

The settings tab includes a GitHub repo picker that:
1. Fetches all accessible repos via `GET /api/github/repos` (paginated, up to 1000 repos)
2. Shows repo name, owner, privacy status, language, description
3. Supports search/filter
4. On selection, triggers the full binding orchestration

---

## 8. Webhook System

### GitHub Webhooks

The GitHub webhook handler (`POST /api/webhooks/github?workspace_id=X`) processes 5 event types:

**Push Events** (new commits)
1. Extract branch name from `ref`
2. Upsert branch record in `branches` table
3. For each commit:
   - Fetch per-commit line stats from GitHub API (`GET /repos/{owner}/{repo}/commits/{sha}`)
   - Classify commit type using semantic analysis (conventional commit prefix + fallback patterns)
   - Upsert into `commits` table with full metadata
   - Update `file_authorship` for each changed file (lines added/modified per author)
4. Run heuristic detection asynchronously

**Pull Request Events** (opened, closed, merged, review_requested)
1. Upsert PR data into `pull_requests` table
2. On `review_requested` action: set `first_review_at` timestamp
3. On merge: mark associated branch as merged
4. Calculate cycle time metrics and store in `cycle_time_metrics`
5. Run heuristic detection

**Issue Events** (opened, closed, reopened)
1. Upsert issue data into `issues` table
2. Run heuristic detection

**Deployment Status Events**
1. On `success` status: find associated PR via commit SHA + branch matching
2. Calculate deployment time (merge → deploy)
3. Update `cycle_time_metrics` with deployment segment

**Member Events** (added, removed)
1. Trigger collaborator refresh from GitHub API
2. Update cached collaborator data in workspace

**Security:** Every webhook request is verified using HMAC-SHA256 signature comparison against the stored `github_webhook_secret`.

### Discord Webhook

The Discord webhook (`POST /api/webhooks/discord`) receives messages from the Discord bot:

1. Validate authorization (Bearer token = `DISCORD_BOT_TOKEN`)
2. Validate message structure with Zod schema
3. Look up workspace by `discord_channel_id`
4. Run NLP pipeline:
   - `classifyMessageIntent()` via Groq AI (with NLP fallback)
   - `extractEntities()` — tech terms, mentioned users, task claims, NER
5. Store in `discord_messages` table with intent + entities
6. If message is a blocker → auto-create alert with severity "warning"

### WhatsApp Webhook

The WhatsApp webhook (`POST /api/webhooks/whatsapp`) receives relayed messages:

1. Validate `x-relay-secret` header against `WHATSAPP_RELAY_SECRET`
2. Validate with Zod schema
3. Run same NLP pipeline as Discord
4. Store in `communication_messages` table
5. If blocker → auto-create alert

---

## 9. AI Features (Groq)

All AI features use **Groq API** with the **llama-3.3-70b-versatile** model. Parameters: `temperature=0.3`, `max_tokens=2048`, `top_p=0.8`.

### 9.1 Message Intent Classification

**What it does:** Classifies every chat message into one of 6 categories.

**Categories:**
| Intent | Description | Example |
|---|---|---|
| `blocker` | Person is stuck or needs help | "I'm blocked on the auth integration" |
| `task_claim` | Person volunteering to work on something | "I'll handle the payment module" |
| `progress_update` | Reporting progress or completion | "Pushed the fix for #123" |
| `question` | Asking a question | "How do we configure the CI pipeline?" |
| `announcement` | FYI or general announcement | "Heads up, deploying v2.1 at 3pm" |
| `general` | Casual chat or unclassifiable | "Good morning everyone" |

**How it works:**
1. Message sent via in-app chat or Discord webhook
2. First attempt: Groq AI classifies with confidence score (0–1)
3. Fallback: Pattern-based NLP classifier (if AI fails or rate-limited)
4. Intent stored alongside message in database
5. Displayed as a colored badge next to each message in the chat UI

**Why it matters:** Blocker intents automatically generate alerts. Task claims help track who's working on what. The team can quickly scan chat to find blockers or progress updates.

### 9.2 AI Project Analysis

**What it does:** Generates an executive summary of the project's current state with risks, suggestions, and next steps.

**Input context sent to AI:**
- Health score (0–100)
- Team size
- Total commits, open PRs, open issues
- Bus factor
- Recent commit type breakdown
- Last 15 tasks (with status, priority, deadline)
- Last 20 messages (with intent classification)

**Output:**
```json
{
  "summary": "3-sentence executive summary",
  "risks": ["risk 1", "risk 2", ...],
  "suggestions": ["actionable suggestion 1", ...],
  "teamDynamics": "observation about team communication",
  "nextSteps": ["recommended next step 1", ...]
}
```

### 9.3 AI Todo Generation

**What it does:** Given a project description, generates 5–12 actionable tasks with priorities.

**How it works:**
1. User types a project description in the AI Insights tab
2. Existing task titles are sent along to avoid duplicates
3. AI generates tasks ordered by logical execution sequence
4. Tasks are bulk-inserted into `workspace_todos` with status "pending"

**Priority assignment logic (from AI prompt):**
- `critical` — Blocking or foundational work
- `high` — Core features
- `medium` — Important but not blocking
- `low` — Nice-to-have, polish, documentation

### 9.4 AI Commit Summarization + Task Matching

**What it does:** Analyzes recent commits against the task list to measure what percentage of planned work is being done.

**How it works:**
1. Fetches up to 50 recent commits (live from GitHub API, with Supabase fallback)
2. Fetches all workspace todos
3. Sends both to Groq AI with a prompt to semantically match commits to tasks
4. AI determines for each task: `addressed`, `partially-addressed`, or `not-addressed`
5. Calculates completion percentage: `(addressed × 100 + partially × 50) / total_tasks`

**Output:**
```json
{
  "summary": "Executive summary of project activity and alignment with planned work",
  "highlights": ["Notable change 1", "Notable change 2"],
  "authorBreakdown": { "author1": "summary of contributions" },
  "taskProgress": [
    {
      "taskId": "uuid",
      "taskTitle": "Implement auth flow",
      "status": "addressed",
      "evidence": "Commits #3, #7 implement GitHub OAuth and JWT signing"
    }
  ],
  "completionPercent": 73,
  "workInsight": "Most commits align with planned tasks, but 2 unplanned refactors suggest emerging tech debt"
}
```

**Why it matters:** This answers the question "Are we working on what we planned?" without manual status updates. The completion percentage gives an instant view of progress, and the task-to-commit mapping shows concrete evidence.

---

## 10. NLP Engine

The NLP engine (`src/lib/nlp.ts`) provides pattern-based text analysis as a fallback when AI is unavailable and for lightweight local processing.

### Intent Detection

Uses regular expression pattern matching with confidence scoring:

| Pattern Group | Count | Examples |
|---|---|---|
| Blocker patterns | 12 | `stuck on`, `blocked by`, `help needed`, `merge conflict`, `can't figure out`, `breaking change` |
| Task claim patterns | 5 | `I'll handle`, `working on`, `taking over`, `I can do`, `on it` |
| Progress patterns | 5 | `done with`, `completed`, `pushed`, `merged`, `PR is ready` |
| Question detection | — | Presence of `?` character |
| Announcement detection | — | Starts with `fyi`, `heads up`, `announcement` |

**Confidence boosting:** If a message contains urgency keywords (`urgent`, `critical`, `ASAP`, `emergency`, `hotfix`, `production down`), the blocker confidence gets a +0.2 boost.

### Named Entity Recognition (NER)

`performNER()` extracts structured entities from messages:

| Entity Type | Pattern | Example |
|---|---|---|
| File paths | `/path/to/file.ts` or `src/file.ts` | `src/lib/auth.ts` |
| Issue/PR refs | `#123` | `#456` |
| URLs | `https://...` | `https://github.com/...` |
| Version numbers | `v1.2.3` or `1.2.3` | `v2.1.0` |
| Error codes | `E1234`, `ERR_*`, HTTP codes | `E0001`, `404` |
| Environment names | `production`, `staging`, `dev` | `staging` |
| Branch names | `feature/*`, `fix/*`, `release/*` | `feature/auth` |
| Time expressions | `today`, `yesterday`, `tomorrow`, `EOD`, relative times | `by EOD` |

### Technical Term Detection

Checks messages against 60+ known technical terms across categories: languages (TypeScript, Python, Rust...), frameworks (React, Next.js, Django...), tools (Docker, Kubernetes, Redis...), patterns (REST, GraphQL, WebSocket...).

### Entity Extraction (Composite)

`extractEntities()` combines all NLP functions:
```json
{
  "technicalTerms": ["React", "TypeScript"],
  "mentionedUsers": ["@alice", "@bob"],
  "tasks": [{ "task": "fix the login page", "assignee": "alice" }],
  "isBlocker": true,
  "ner": { "filePaths": ["src/auth.ts"], "issueRefs": ["#123"] },
  "intentConfidence": 0.85
}
```

---

## 11. Semantic Commit Analysis

The semantic analysis engine (`src/lib/semantic-analysis.ts`) classifies and scores every commit.

### Commit Type Classification

12 recognized types with pattern matching:

| Type | Conventional Prefix | Semantic Fallback Patterns |
|---|---|---|
| `feat` | `feat:` / `feat(scope):` | "add", "implement", "introduce", "create", "new" |
| `fix` | `fix:` | "fix", "resolve", "patch", "repair", "correct", "bug" |
| `refactor` | `refactor:` | "refactor", "restructure", "reorganize", "clean up", "simplify" |
| `docs` | `docs:` | "document", "readme", "comment", "jsdoc", "changelog" |
| `test` | `test:` | "test", "spec", "coverage", "assert", "mock" |
| `chore` | `chore:` | "chore", "update deps", "bump version", "maintenance" |
| `style` | `style:` | "style", "format", "lint", "prettier", "whitespace" |
| `perf` | `perf:` | "perf", "optimize", "speed", "cache", "lazy load" |
| `ci` | `ci:` | "ci", "pipeline", "github action", "workflow", "deploy config" |
| `revert` | `revert:` | "revert", "rollback", "undo" |
| `security` | `security:` | "security", "vulnerability", "CVE", "auth", "permission", "XSS", "CSRF", "injection" |
| `deploy` | `deploy:` | "deploy", "release", "ship", "publish" |

**Priority:** Conventional commit prefix is checked first. If no prefix matches, semantic fallback patterns are evaluated. Default: `chore`.

### High-Impact Path Detection

Certain file paths are flagged as high-impact:

| Category | Patterns |
|---|---|
| Schema/DB | `schema`, `migration`, `prisma`, `drizzle` |
| Auth | `auth`, `login`, `session`, `middleware` |
| Config | `package.json`, `.env`, `config`, `tsconfig` |
| API | `api/`, `routes/`, `endpoint` |
| Core | `index.ts`, `main.ts`, `app.ts` |

### Per-File Impact Scoring

Each changed file gets a score (0–100):
- **Base score** = `min(100, linesChanged × 2)`
- **High-impact path bonus** = +40
- **Test file penalty** = -20
- **Non-code file penalty** = -30 (images, fonts, etc.)

### Diff Risk Analysis

When diff content is available, 6 pattern categories are checked:

| Category | Risk Weight | Patterns |
|---|---|---|
| Security | 3 | `password`, `secret`, `token`, `api_key`, `jwt`, `bcrypt` |
| Database | 2 | `CREATE TABLE`, `ALTER TABLE`, `DROP`, `migration` |
| API | 1 | `endpoint`, `route`, `middleware`, `cors` |
| Test | 0 | `describe(`, `it(`, `expect(`, `test(` |
| Config | 1 | `env`, `config`, `port`, `host` |
| Dependency | 1 | `dependencies`, `package.json`, `install` |

Risk level: sum of (matched_weight) → `low` (<3), `medium` (3-5), `high` (>5).

If diff touches security patterns, the commit type is auto-overridden to `security`.

---

## 12. Heuristics Engine

The heuristics engine (`src/lib/heuristics.ts`) runs automated detection rules after every webhook event.

### Detection Rules

| Rule ID | Name | Severity | Trigger Condition |
|---|---|---|---|
| **AR-HEU-001** | Inactive Branch | warning | Un-merged branch with no commits for 3+ days |
| **AR-HEU-002** | Stale Pull Request | warning | Open PR older than 48 hours |
| **AR-HEU-003** | Assigned Issue, No Commits | info | Issue assigned 48+ hours ago, assignee has no recent commits |
| **AR-HEU-005** | Multiple Blockers | critical | 2+ unique authors reported blockers within 24 hours |
| **AR-HEU-006** | Circular Dependencies | warning | DFS cycle detection on co-modified file graph (files changed in same commit form edges) |
| **AR-HEU-007** | High WIP | warning | Single author has more than 3 open PRs simultaneously |
| **AR-HEU-007b** | Dependency Overlap | warning | 3+ different authors modified the same file within 48 hours |
| **AR-HEU-008** | Escalation | critical | An existing critical alert remains unresolved for 4+ hours |

### How Heuristics Run

1. `runHeuristicDetection(workspaceId)` is called asynchronously after every webhook event
2. Each rule queries the relevant Supabase tables
3. Detected issues generate alerts in the `alerts` table
4. **Deduplication:** Alerts with the same `type + title` within a 1-hour window are skipped to prevent spam
5. Resolved alerts are ignored (only unresolved alerts are visible)

### Thresholds

| Constant | Value | Meaning |
|---|---|---|
| `INACTIVE_BRANCH_DAYS` | 3 | Days of inactivity before branch alert |
| `STALE_PR_HOURS` | 48 | Hours before PR is considered stale |
| `CYCLE_TIME_THRESHOLD_HOURS` | 72 | Max acceptable total cycle time |
| `WIP_THRESHOLD` | 3 | Max open PRs per developer |
| `CODING_TIME_THRESHOLD_HOURS` | 48 | Max acceptable coding phase |
| `DEPLOYMENT_TIME_THRESHOLD_HOURS` | 24 | Max acceptable deployment phase |

---

## 13. Health Score Algorithm

The health score is a **weighted multi-signal formula** that produces a value from 0 to 100.

### Primary Mode (Live GitHub Data)

When the GitHub API is accessible:

$$H = 0.30C + 0.20P + 0.20I + 0.15A + 0.15D$$

| Signal | Weight | Formula | What It Measures |
|---|---|---|---|
| **C** — Commit Velocity | 30% | $\min(100,\; \frac{\text{commits in last 7 days}}{14} \times 100)$ | Are developers actively shipping code? 14 commits/week = perfect score. |
| **P** — PR Throughput | 20% | $\frac{\text{closed PRs}}{\text{total PRs}} \times 100 \times (1 - \min(0.5,\; \frac{\text{open PRs}}{20}))$ | Are PRs being reviewed and merged? Penalizes large open PR backlog. |
| **I** — Issue Resolution | 20% | $\frac{\text{closed issues}}{\text{total issues}} \times 80 + \text{bonus}$ | Are issues being resolved? Bonus: +20 if ≤5 open, +10 if ≤15. |
| **A** — Activity Spread | 15% | ≥4 contributors→100, 3→80, 2→60, 1→30, 0→0 | Are multiple people contributing? Single-person dependency = low score. |
| **D** — Contributor Health | 15% | $\frac{\text{healthy contributors}}{\text{total contributors}} \times 100$ | Are contributors recently active? Active (≤48h) or moderate (≤168h) = healthy. |

Result is clamped to $[0, 100]$ and rounded to the nearest integer.

### Fallback Mode (Supabase Data Only)

When no GitHub token is available:

$$H = \frac{C_{score} + PR_{score} + I_{score} + BF_{score}}{4} - \text{alertPenalty}$$

| Signal | Formula |
|---|---|
| Commit Score | $\min(100,\; \text{commits in 7d} \times 5)$ |
| PR Score | >10 open → 40, >5 open → 70, else → 100 |
| Issue Score | >20 open → 50, >10 open → 75, else → 100 |
| Bus Factor Score | >5 critical files → 40, >2 → 70, else → 100 |
| Alert Penalty | $\min(50,\; \text{critical alerts} \times 15)$ |

### Health History

A health snapshot is saved to `health_snapshots` on every dashboard load, enabling a trend chart that shows health score over time.

### UI Representation

The health score is displayed as:
- **Circular SVG gauge** with animated stroke-dasharray
- Color coding: ≥75 = "Healthy", ≥50 = "At Risk", <50 = "Critical"
- Signal breakdown bars showing individual component scores

---

## 14. Bus Factor & Knowledge Concentration

### What is Bus Factor?

The **bus factor** is the minimum number of team members who would need to leave (or "be hit by a bus") before the project loses critical knowledge. A bus factor of 1 means a single developer's departure could cripple the project.

### How CSP Calculates It

1. **Per-file authorship data** is collected from `file_authorship` table (populated during repo bind + webhook commits)
2. For each file, sum `lines_added + lines_modified` per author
3. Sort authors by total contribution (descending)
4. **Bus Factor** = minimum number of top authors needed to cover **50%** of total contributions
5. **Knowledge Concentration** = `(dominant_author_contribution / total) × 100`

### Critical File Detection

Files with knowledge concentration > 80% are flagged as "critical" — meaning a single developer owns more than 80% of the code in that file.

### Visualization

- **Force-directed graph** — A custom Canvas physics simulation showing contributors as nodes and shared file ownership as links. Node size reflects contribution volume. Runs a 120-frame animation with:
  - Repulsion forces between all nodes
  - Attraction forces along links (shared files)
  - Center gravity to keep the graph centered
  - Velocity damping (0.8) for smooth convergence

- **Concentration table** — Lists critical files with: file path, bus factor number, dominant author, concentration percentage, total author count

- **Codebase bus factor** — Single number summarizing how many top contributors cover 50% of all project commits

---

## 15. Cycle Time Metrics (DORA)

### What is Cycle Time?

Cycle time measures how long it takes for code to go from first commit to production deployment. CSP tracks four segments aligned with DORA (DevOps Research and Assessment) metrics:

### The Four Segments

```
First Commit → PR Opened → First Review → Merged/Closed → Deployed
     │              │             │              │             │
     └──Coding──────┘             │              │             │
                    └──Pickup─────┘              │             │
                                  └──Review──────┘             │
                                                 └──Deploy─────┘
     └──────────────────Total Cycle Time──────────────────────┘
```

| Segment | Calculation | Threshold |
|---|---|---|
| **Coding Time** | First commit on branch → PR opened | 48 hours |
| **Pickup Time** | PR opened → First review requested | — |
| **Review Time** | First review → PR merged/closed | — |
| **Deployment Time** | PR merged → Deployment success webhook | 24 hours |
| **Total Cycle Time** | PR opened → PR closed/merged | 72 hours |

### How It Works

1. When a PR is opened, `opened_at` is recorded
2. When `review_requested` action fires, `first_review_at` is set
3. When PR is merged/closed, all segments are calculated
4. When `deployment_status: success` fires, deployment time is added
5. Metrics stored in `cycle_time_metrics` table

### Dashboard Display

- **Average cycle time** shown as stat card in Overview
- **Cycle time trend chart** (Chart.js line chart) shows per-PR breakdown of all 4 segments
- Threshold flags highlight PRs that exceed limits

---

## 16. Discord Bot Integration

### Architecture

The Discord bot is a **separate long-running process** (not a serverless function) that connects to Discord via WebSocket (Gateway v10).

### How It Works

1. Bot connects to Discord Gateway with `GUILD_MESSAGES | MESSAGE_CONTENT` intents
2. Receives `MESSAGE_CREATE` dispatch events
3. Checks if the message's channel maps to a workspace (`isDesignatedChannel()`)
4. Normalizes the message to CSP's internal format
5. POSTs to CSP's `/api/webhooks/discord` endpoint
6. CSP processes with AI + NLP pipeline → stores with intent classification

### Message Flow

```
Discord Server → Discord Gateway → CSP Bot Process → POST /api/webhooks/discord → NLP + AI → Supabase
```

### Features
- Ignores bot messages
- Auto-reconnects on WebSocket close (5-second delay)
- Validates channel-to-workspace mapping before forwarding

---

## 17. Frontend — Pages & Components

### Landing Page (`/`)

The landing page uses Aceternity UI for visual impact:

1. **Hero Section** — Full-viewport with:
   - `Spotlight` effect (radial gradient following cursor)
   - `FlipWords` cycling: "full visibility" → "flow metrics" → "AI insights" → "team health"
   - `TextGenerateEffect` for subtitle word-by-word reveal
   - `MovingBorderButton` CTA: "Continue with GitHub"
   - Dot-grid background pattern

2. **Features Grid** — 6 cards:
   - Git Tracking (commits, PRs, issues)
   - Flow Metrics (DORA cycle times)
   - Bus Factor (knowledge concentration risk)
   - Team Chat (Discord integration)
   - AI Insights (Groq-powered analysis)
   - Health Score (weighted multi-signal)

3. **How It Works** — 3 steps: Connect → Monitor → Improve

4. **Auto-redirect** — If user is already authenticated, redirects to `/dashboard`

### Dashboard — Workspace List (`/dashboard`)

- Lists all workspaces the user belongs to (fetched from `GET /api/workspaces`)
- **Create Workspace** flow:
  1. Click "New Workspace" → modal opens
  2. Enter workspace name
  3. GitHub repo picker appears (fetches repos from `GET /api/github/repos`)
  4. Search/filter repos by name
  5. Select repo → triggers `POST /api/workspaces` → binding orchestration
- **Delete Workspace** — Admin-only, with confirmation dialog, cascades deletion across 11 related tables
- User dropdown menu with avatar, name, and sign-out option

### Auth Callback (`/auth-callback`)

- Receives `?token=` from OAuth redirect
- Calls `GET /api/auth/me` to verify the token
- Stores token in `localStorage` via AuthProvider
- Redirects to `/dashboard`
- Shows loading spinner during verification

### Invite Page (`/invite/[token]`)

- Token extracted from URL path
- Calls `POST /api/workspaces/invite/join` with the token
- On success: redirects to the workspace dashboard
- On error: shows error message with link to dashboard

---

## 18. Dashboard Tabs (Detailed)

The workspace dashboard (`/dashboard/[workspaceId]`) is a single page with **10 tabs**.

### Tab 1: Overview

The main dashboard view showing project health at a glance.

**Components:**
- **Health Gauge** — SVG circular progress meter (0–100) with animated arc, color-coded label (Healthy/At Risk/Critical)
- **5 Stat Cards:**
  - Total Commits (with freshness indicator)
  - Open Pull Requests
  - Open Issues
  - Average Cycle Time (formatted as hours/days)
  - WIP Count (total work-in-progress items)
- **Health Signal Breakdown** — Bar chart showing individual component scores (Commit Velocity, PR Throughput, Issue Resolution, Activity Spread, Contributor Health)
- **Contributor Activity** — Horizontal bars per contributor showing relative contribution
- **Active Alerts** — List of unresolved alerts with severity badges
- **Contributor Health** — Cards per contributor with status indicator (🟢 active, 🟡 moderate, 🔴 inactive) and "last active" time
- **Commit Type Chart** — Chart.js bar chart showing distribution of commit types (feat, fix, refactor, etc.)
- **PR Lifecycle Timeline** — Visual timeline of PR states and durations
- **Cycle Time Trend** — Chart.js line chart with 4 series (coding, pickup, review, deploy time per PR)
- **WIP Per User** — Bar chart of open PRs per developer

### Tab 2: Commits

Paginated list of recent commits. Each entry shows:
- **Commit type badge** — Color-coded pill (feat=green, fix=red, refactor=purple, etc.)
- **Author avatar** — GitHub profile picture
- **Author username**
- **Commit message** — First line, truncated
- **Line diff** — Green `+N` / Red `-N` indicators
- **Relative time** — "3 hours ago", "2 days ago"
- **Analyze Progress button** — Triggers AI commit summarization with task matching

**AI Progress Analysis panel** (when triggered):
- Completion percentage with progress bar
- Work insight (alignment between commits and planned tasks)
- Executive summary
- Task-to-commit mapping with per-task status (Done/In Progress/Not Started)
- Highlights list
- Per-author contribution breakdown

### Tab 3: Pull Requests

Paginated list of PRs showing:
- State badge (open/merged/closed)
- PR number and title
- Author username
- Line additions/deletions
- Open/merge/close timestamps

### Tab 4: Issues

Paginated list of issues showing:
- State badge (open/closed)
- Issue number and title
- Author, assignee
- Labels
- Open/close timestamps

### Tab 5: Alerts

All heuristic-generated alerts with:
- Severity icon and color (🔴 critical, 🟡 warning, 🔵 info)
- Alert title and description
- Creation timestamp
- **Resolve button** — marks alert as resolved
- **Run Heuristics button** — manually triggers heuristic detection (admin only)

### Tab 6: Bus Factor

Visual knowledge concentration analysis:
- **Force-directed graph** — Custom Canvas visualization showing contributor relationships
- **Critical files table** — Files with >80% concentration, showing: file path, bus factor, dominant author, concentration %, author count
- **Codebase bus factor** — Single-number summary

### Tab 7: Team

Per-contributor statistics table:
| Column | Data |
|---|---|
| Contributor | Avatar + username |
| Commits | Total commit count |
| PRs Opened | Count of authored PRs |
| PRs Merged | Count of merged PRs |
| PRs Closed | Count of closed (not merged) PRs |
| Lines Added | Total lines added |
| Lines Deleted | Total lines deleted |
| Issues | Count of assigned issues |
| Avg PR Duration | Average time from open to close |
| Active Branches | Count of un-merged branches |
| Status | Active / Moderate / Inactive badge |

### Tab 8: Messages

Real-time team chat with:
- **Message list** — Author avatar, username, content, timestamp, intent badge
- **Intent badges** — Color-coded per classification (blocker=red, task_claim=blue, progress=green, question=yellow, announcement=orange, general=gray)
- **Entity display** — Technical terms, mentioned users, file paths extracted via NLP
- **Search** — Filter messages by content
- **Send message** — Input with send button, AI intent classification on send
- **Admin delete** — Admins can delete any message
- **Optimistic UI** — Messages appear instantly before server confirmation

**Real-time updates:**
- Primary: Supabase Realtime subscription on `discord_messages` table
- Fallback: 3-second polling interval

### Tab 9: AI Insights

Three sections:

**1. Project Analysis**
- "Analyze Project" button
- Displays: executive summary, risks, suggestions, team dynamics, next steps
- Rate limit handling with countdown timer

**2. Tasks & Deadlines**
- Full CRUD task management (create, edit status/priority, delete)
- Priority badges (critical/high/medium/low)
- Status management (pending → in-progress → completed)
- Deadline support with date display
- **AI Task Generator** — Textarea to describe project + "Generate Tasks" button → AI produces 5–12 tasks with priorities

**3. Commit Analysis**
- Also accessible from the Commits tab via "Analyze Progress" button

### Tab 10: Settings

**Profile Section:**
- Edit display name
- Avatar display

**Workspace Section (admin only):**
- Edit workspace name
- Repository binding/unbinding
- GitHub repo picker (search, filter, select)
- Collaborator list with permissions
- Refresh collaborators from GitHub
- External contributor detection

**Team Management:**
- Generate invite link (48-hour expiry, copyable URL)
- Member list with role badges (admin/member)
- Role management (admin can promote/demote)
- Remove members (admin)
- Leave workspace (self)

**Notifications:**
- Toggle alerts, messages, heuristics notifications (cosmetic preferences)

**Danger Zone:**
- Delete workspace (admin only, with confirmation)

---

## 19. API Reference

### Authentication

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register with email/password | No |
| `POST` | `/api/auth/login` | Login with email/password | No |
| `GET` | `/api/auth/me` | Get current user profile | Yes |
| `PATCH` | `/api/auth/me` | Update profile (name, avatar) | Yes |
| `GET` | `/api/auth/github` | Start GitHub OAuth flow | No |
| `GET` | `/api/auth/github/callback` | Handle GitHub OAuth callback | No |
| `GET` | `/api/auth/discord` | Start Discord OAuth flow | No |
| `GET` | `/api/auth/discord/callback` | Handle Discord OAuth callback | No |

### Workspaces

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces` | List user's workspaces | Yes |
| `POST` | `/api/workspaces` | Create workspace + bind repo | Yes |
| `GET` | `/api/workspaces/[id]` | Get workspace details | Yes (member) |
| `PATCH` | `/api/workspaces/[id]` | Update workspace name/settings | Yes (admin) |
| `DELETE` | `/api/workspaces/[id]` | Delete workspace (cascades all data) | Yes (admin) |

### Dashboard & Analysis

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/dashboard` | Full dashboard data | Yes (member) |
| `POST` | `/api/workspaces/[id]/heuristics` | Run heuristic detection | Yes (admin) |
| `POST` | `/api/workspaces/[id]/ai-analyze` | AI project analysis | Yes (member) |
| `POST` | `/api/workspaces/[id]/commits/summarize` | AI commit + task analysis | Yes (member) |
| `GET` | `/api/workspaces/[id]/bus-factor` | Per-file knowledge concentration | Yes (member) |

### Tasks

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/todos` | List all tasks | Yes (member) |
| `POST` | `/api/workspaces/[id]/todos` | Create task | Yes (member) |
| `PATCH` | `/api/workspaces/[id]/todos` | Update task (status, priority, etc.) | Yes (member) |
| `DELETE` | `/api/workspaces/[id]/todos` | Delete task | Yes (member) |
| `POST` | `/api/workspaces/[id]/todos/generate` | AI-generate tasks from description | Yes (member) |

### Alerts

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/alerts` | List unresolved alerts | Yes (member) |
| `PATCH` | `/api/workspaces/[id]/alerts` | Resolve an alert | Yes (member) |

### Messages

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/messages` | Get messages (limit 100) | Yes (member) |
| `POST` | `/api/workspaces/[id]/messages` | Send in-app message (AI classified) | Yes (member) |
| `DELETE` | `/api/workspaces/[id]/messages` | Delete message | Yes (admin) |

### Team & Invites

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/members` | List members with user info | Yes (member) |
| `PATCH` | `/api/workspaces/[id]/members` | Update member role | Yes (admin) |
| `DELETE` | `/api/workspaces/[id]/members` | Remove member or self-leave | Yes (member) |
| `POST` | `/api/workspaces/[id]/invite` | Generate invite link | Yes (admin) |
| `POST` | `/api/workspaces/invite/join` | Accept invite and join workspace | Yes |

### Repository

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/workspaces/[id]/repo` | Get repo binding info | Yes (member) |
| `POST` | `/api/workspaces/[id]/repo` | Bind GitHub repo | Yes (admin) |
| `DELETE` | `/api/workspaces/[id]/repo` | Unbind repo | Yes (admin) |
| `GET` | `/api/workspaces/[id]/collaborators` | Get collaborators + external contributors | Yes (member) |
| `POST` | `/api/workspaces/[id]/collaborators` | Refresh from GitHub | Yes (admin) |
| `GET` | `/api/github/repos` | Fetch user's accessible GitHub repos | Yes |

### Webhooks (External)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/webhooks/github?workspace_id=X` | GitHub events (HMAC-SHA256 verified) | Webhook secret |
| `POST` | `/api/webhooks/discord` | Discord bot messages | Bearer token |
| `POST` | `/api/webhooks/whatsapp` | WhatsApp relay messages | x-relay-secret header |

---

## 20. Real-Time Features

### Supabase Realtime

CSP subscribes to PostgreSQL changes via Supabase Realtime:

| Subscription | Table | Filter | Trigger |
|---|---|---|---|
| Alerts | `alerts` | `workspace_id=eq.{id}` | New alert → toast notification + refetch |
| Commits | `commits` | `workspace_id=eq.{id}` | New commit → refetch dashboard data |
| Messages | `discord_messages` | `workspace_id=eq.{id}` | New message → append to chat list |

### Polling Fallback

For messages, a 3-second polling interval runs as a fallback when Realtime subscriptions fail or for environments where WebSocket connections are unreliable.

### Optimistic Updates

When sending a message in the chat, the message is immediately appended to the local state before the server confirms. If the server returns an error, a toast notification alerts the user.

---

## 21. Testing

### Framework

- **Vitest** with jsdom environment
- Located in `src/lib/__tests__/`

### Test Suites

| File | Tests |
|---|---|
| `github-api.test.ts` | GitHub API functions: fetch repos, verify access, setup webhook, historical sync |
| `heuristics.test.ts` | Heuristic rules: inactive branches, stale PRs, WIP limits, escalation |
| `nlp.test.ts` | NLP: intent detection, NER, technical terms, entity extraction |
| `rate-limit.test.ts` | Rate limiter: sliding window, IP tracking, cleanup |
| `semantic-analysis.test.ts` | Commit classification, file impact scoring, diff analysis, sprint summary |
| `validation.test.ts` | Zod schemas: login, register, workspace creation, webhook payloads |

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

---

## 22. Security

### Authentication Security
- **JWT tokens** signed with HS256 (7-day expiry)
- **bcrypt** password hashing with cost factor 12
- **OAuth state parameter** with httpOnly cookie to prevent CSRF during OAuth flows
- **Rate limiting** on auth endpoints (IP-based sliding window)

### Webhook Security
- **GitHub:** HMAC-SHA256 signature verification using per-workspace secret
- **Discord:** Bearer token validation against `DISCORD_BOT_TOKEN`
- **WhatsApp:** Secret header validation against `WHATSAPP_RELAY_SECRET`

### HTTP Headers
All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- Content Security Policy restricting script/connect sources

### CORS
API routes include `Access-Control-Allow-Origin` header set to `NEXT_PUBLIC_APP_URL`.

### Input Validation
All API inputs validated with Zod schemas before processing.

---

## 23. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side, bypasses RLS) |
| `JWT_SECRET` | Yes | Secret for signing/verifying JWT tokens |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth application client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth application client secret |
| `GROQ_API_KEY` | Yes | Groq API key for AI features (llama-3.3-70b-versatile) |
| `NEXT_PUBLIC_APP_URL` | Yes | Application URL (for OAuth callbacks, invite links, CORS) |
| `DISCORD_CLIENT_ID` | Optional | Discord OAuth application client ID |
| `DISCORD_CLIENT_SECRET` | Optional | Discord OAuth application client secret |
| `DISCORD_BOT_TOKEN` | Optional | Discord bot token (for bot process + webhook auth) |
| `WHATSAPP_RELAY_SECRET` | Optional | WhatsApp relay webhook authentication secret |

---

## 24. Deployment

### Platform

Deployed on **Vercel** at `https://codestylepoliceman.vercel.app`

### Build Configuration

- **Framework:** Next.js (auto-detected by Vercel)
- **Build command:** `next build`
- **TypeScript errors ignored during build** (`typescript.ignoreBuildErrors: true`)
- **ESLint errors ignored during build** (`eslint.ignoreDuringBuilds: true`)

### Required Setup

1. Set all environment variables in Vercel project settings
2. Configure GitHub OAuth app with callback URL: `{APP_URL}/api/auth/github/callback`
3. Configure Discord OAuth app with callback URL: `{APP_URL}/api/auth/discord/callback`
4. Supabase tables must be created (see schema section)
5. GitHub webhooks are auto-configured when binding a repo

---

## 25. Glossary of Terms

| Term | Definition |
|---|---|
| **Bus Factor** | The minimum number of team members who would need to leave before critical project knowledge is lost. A bus factor of 1 is high risk. |
| **Knowledge Concentration** | Percentage of a file's code owned by its dominant author. >80% is flagged as critical. |
| **DORA Metrics** | DevOps Research and Assessment metrics — industry standard for measuring software delivery performance. CSP tracks Cycle Time. |
| **Cycle Time** | Total time from first commit to deployment, broken into coding, pickup, review, and deployment phases. |
| **Coding Time** | Time between the first commit on a branch and when a PR is opened. |
| **Pickup Time** | Time between a PR being opened and the first review being requested. |
| **Review Time** | Time between first review request and PR merge/close. |
| **Deployment Time** | Time between PR merge and successful deployment (detected via GitHub webhook). |
| **Health Score** | A 0–100 weighted score combining commit velocity, PR throughput, issue resolution, activity spread, and contributor health. |
| **Heuristics** | Automated detection rules that analyze project data and generate alerts when problems are detected (stale PRs, inactive branches, etc.). |
| **WIP (Work In Progress)** | Number of open PRs a developer has simultaneously. High WIP indicates context-switching risk. |
| **Conventional Commits** | A commit message convention using prefixes like `feat:`, `fix:`, `docs:` to describe the type of change. CSP auto-classifies commits using this convention with semantic fallbacks. |
| **Semantic Analysis** | Automated classification of commits by analyzing the commit message content against known patterns (not just prefix matching). |
| **Intent Classification** | AI-powered categorization of chat messages into types (blocker, task claim, progress update, question, announcement, general). |
| **NER (Named Entity Recognition)** | NLP technique to extract structured entities from unstructured text (file paths, issue references, version numbers, etc.). |
| **OAuth** | Open Authorization protocol used for GitHub and Discord sign-in without sharing passwords. |
| **JWT (JSON Web Token)** | A signed token format used for stateless authentication. CSP uses HS256-signed JWTs with 7-day expiration. |
| **HMAC-SHA256** | Hash-based Message Authentication Code used to verify GitHub webhook payloads haven't been tampered with. |
| **Supabase Realtime** | WebSocket-based service that pushes database changes to connected clients in real-time. |
| **RLS (Row-Level Security)** | PostgreSQL feature restricting which rows users can access. CSP uses a service role key to bypass RLS on the server. |
| **Turbopack** | Next.js's Rust-based bundler for fast development builds. |
| **OKLCH** | A perceptual color space used in CSP's design system. The "0 chroma" setting produces pure grayscale. |
| **Groq** | An AI inference provider offering extremely fast LLM inference via an OpenAI-compatible API. |
| **Llama 3.3** | Meta's open-source large language model (70B parameter version used by CSP for all AI features). |
| **Aceternity UI** | A collection of animated React components using Framer Motion for visual effects (Spotlight, FlipWords, TextGenerateEffect, MovingBorder). |
| **shadcn/ui** | A component library that provides customizable, accessible components built on Radix UI primitives. Components are copied into your project (not imported from node_modules). |
| **Radix UI** | A set of unstyled, accessible React primitives (dialogs, dropdowns, tooltips, etc.) that shadcn/ui builds upon. |
| **Force-Directed Graph** | A physics-based graph visualization where nodes repel each other and links attract connected nodes, finding a natural layout through simulation. |
| **Optimistic UI** | A pattern where the UI updates immediately (before server confirmation) to feel faster, with rollback on error. |
| **Rate Limiting** | Restricting the number of requests a client can make in a time window to prevent abuse. CSP uses IP-based sliding windows. |
| **Webhook** | An HTTP callback — a URL that receives POST requests when events occur (e.g., GitHub sends a POST when a commit is pushed). |
| **Zod** | A TypeScript-first schema validation library used to validate API request bodies at runtime. |

---

*Generated for the Code Style Policeman project. Last updated: February 2026.*
