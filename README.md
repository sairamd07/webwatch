# WebWatch — Website Change Detector

**WebWatch** is a production-grade, full-stack website change detection and monitoring system. It continuously monitors public web pages, filters out dynamic noise (timestamps, CSRF tokens, rotating advertisements, counters), computes stable content hashes, captures visual screenshots, generates Myers text diffs and pixel-level screenshot diffs, and alerts users via Discord Webhooks, Telegram Bot, and SMTP Email.

---

## 🏛️ Architecture Overview

```text
                                 ┌──────────────────────────────┐
                                 │       React + Vite SPA       │
                                 │ (Tailwind CSS v4 Dashboard)  │
                                 └──────────────┬───────────────┘
                                                │ REST API / Vite Dev Middleware
                                 ┌──────────────▼───────────────┐
                                 │    Express Node.js Server    │
                                 │  - SSRF Defense Engine       │
                                 │  - DOM Inspection / Picker   │
                                 │  - Diff / Pixelmatch Engine  │
                                 └───────┬──────────────┬───────┘
                                         │              │
                   ┌─────────────────────▼─┐          ┌─▼──────────────────────────┐
                   │   Scheduler & Queue   │          │     Database & Storage     │
                   │  - Local: Priority    │          │  - Local: SQLite           │
                   │    Scheduler (Zero-cfg│          │    (storage/webwatch.db)   │
                   │  - Prod: BullMQ+Redis │          │  - Prod: PostgreSQL 16     │
                   └───────────┬───────────┘          └────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
   ┌────────▼──────────────┐             ┌────────▼──────────────┐
   │  Browser Automation   │             │  Multi-Channel Alerts │
   │  - Playwright         │             │  - Discord Webhooks   │
   │    Chromium           │             │    (Ready out-of-box) │
   │  - Resilient DOM      │             │  - Telegram Bot API   │
   │    Normalizer         │             │  - SMTP Email         │
   │  - Anti-Bot / CAPTCHA │             │    (Optional config)  │
   │    Detection          │             │  - Idempotency &      │
   │                       │             │    Quiet Hours Check  │
   └───────────────────────┘             └───────────────────────┘
```

---

## ⚡ Zero-Config Local Development & Preview Mode

WebWatch is specifically designed to run out of the box in local development and AI Studio preview environments without requiring any external services or secrets:

- **Database**: Automatically runs using Node.js 22 built-in persistent **SQLite** (`storage/webwatch.db`). No PostgreSQL installation or fake credentials needed.
- **Queue & Scheduler**: Automatically runs using an active in-process **PriorityScheduler** with concurrency limits and per-domain rate limiting. No Redis server required.
- **Email Notifications**: **Completely optional**. If SMTP credentials are not configured in your `.env`, WebWatch safely skips email dispatch without crashing or erroring, while **Discord Webhooks** work immediately without any server-side credentials!
- **Target Page Checks**: Real HTTP DOM normalization, screenshot generation, and change detection are 100% active.

---

## ☁️ Hosting Environment & Background Job Transparency

> **Important Operating Notice**:
> In serverless, ephemeral, or scale-to-zero container environments (such as preview containers or serverless endpoints), the host platform pauses CPU execution when no incoming HTTP traffic is received.
>
> - **During Active Preview/Dev Traffic**: The background scheduler runs scheduled checks every 10 seconds.
> - **Manual On-Demand Execution**: Clicking **"Check Now"** on any page immediately executes a live check, fetches the page, normalizes content, evaluates meaningful changes, and captures diff snapshots.
> - **Continuous 24/7 Production Monitoring**: For unattended, round-the-clock monitoring, deploy the application using the included Docker Compose configuration with dedicated PostgreSQL and Redis background workers.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js 20 or 22+
- npm 9+

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```
The server will boot on `http://localhost:3000`. You can immediately:
- Add any public URL (e.g. `https://example.com` or any public news/documentation site).
- Click **"Check Now"** to run live page monitoring.
- Inspect DOM elements with the **Visual Region Picker**.
- View **Myers text diffs** and **pixelmatch screenshot diffs**.

---

## 🐳 Production Deployment with Docker Compose

When deploying to a production server with dedicated background worker daemons:

```bash
docker-compose up --build -d
```

This starts:
1. `postgres`: PostgreSQL 16 database with automated schema migration.
2. `redis`: Redis 7 server for persistent BullMQ queues.
3. `app`: Full-stack WebWatch application on port 3000 with Chromium Playwright support.

---

## 🧪 Testing

WebWatch includes 28 passing unit and integration tests across 5 test suites covering HTTP 403 / CAPTCHA classification, timeout and error isolation, recovery from blocked states, SSRF defense, noise normalization, hash determinism, version history preservation, and Myers diff calculations:

```bash
npm test
```

---

## 🛡️ Anti-SSRF Defense Specification

WebWatch strictly prohibits arbitrary URLs from accessing internal infrastructures:
- Resolves DNS asynchronously before opening any socket.
- Rejects Loopback: `127.0.0.0/8`, `::1`, `localhost`.
- Rejects RFC 1918 Private Ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- Rejects Cloud Provider Metadata: `169.254.169.254` (AWS, GCP, Azure).
- Rejects unsupported protocols (`file://`, `javascript:`, `ftp://`).
- Validates redirect target hosts.
