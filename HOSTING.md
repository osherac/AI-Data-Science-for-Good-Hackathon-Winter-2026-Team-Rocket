# Hosting Talkbridge on Cloudflare Workers (with Custom Domain)

This app is set up to run on **Cloudflare Workers** using the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare/get-started). You get a global edge deployment and can attach your own domain.

---

## 1. Prerequisites

- **Node.js** 20+
- **Cloudflare account** — [Sign up](https://dash.cloudflare.com/sign-up)
- **Custom domain** — either:
  - A domain already on Cloudflare (e.g. `talkbridge.com`), or
  - A domain elsewhere that you’ll point to Cloudflare

---

## 2. Install dependencies and local dev vars

From the project root:

```bash
npm install
```

For local preview (`npm run preview`), create a `.dev.vars` file in the project root (already gitignored) with:

```
NEXTJS_ENV=development
```

This makes the preview use your `.env` when loading environment variables. Production on Cloudflare uses the variables you set in the dashboard (step 7).

---

## 3. Log in to Cloudflare (first time only)

```bash
npx wrangler login
```

A browser window will open; sign in and authorize Wrangler. After that, deploys can run from the CLI without logging in again.

---

## 4. Set environment variables

The app needs these **server-side** secrets (never commit them):

| Variable             | Used for              |
|----------------------|------------------------|
| `GEMINI_API_KEY`     | Scenario + vision API  |
| `OPENAI_API_KEY`     | Whisper transcription |
| `CARTESIA_API_KEY`   | TTS (voice)            |

### Local development

Keep using your `.env` file (it’s gitignored). No change to how you run `npm run dev`.

### Production (Cloudflare)

You must add the same variables in Cloudflare **after the first deploy** (see step 6).  
Until then, the Worker will run but API routes that need these keys will return errors.

---

## 5. Build and deploy

From the project root:

```bash
npm run deploy
```

This will:

1. Run `next build`
2. Build the Worker with OpenNext (`opennextjs-cloudflare build`)
3. Deploy to Cloudflare (`opennextjs-cloudflare deploy`)

On success you’ll see a URL like:

```text
https://talkbridge.<your-subdomain>.workers.dev
```

Use that URL to confirm the app works before adding your custom domain.

---

## 6. Add your custom domain

### Option A: Domain already on Cloudflare

1. Open **[Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)**.
2. Click your **talkbridge** Worker.
3. Go to **Settings** → **Domains & routes** (or **Triggers** → **Custom Domains**).
4. Click **Add** / **Add Custom Domain**.
5. Enter the hostname you want (e.g. `app.yourdomain.com` or `talkbridge.yourdomain.com`).
6. Save. Cloudflare will create the DNS record in your zone if needed.

No CNAME by hand is required when the zone is on Cloudflare; the dashboard handles it.

### Option B: Domain on another registrar

1. In your domain’s DNS (at your registrar or DNS host), add a **CNAME** record:
   - **Name:** the subdomain you want (e.g. `app` for `app.yourdomain.com`).
   - **Target:** `talkbridge.<your-subdomain>.workers.dev`  
     (use the exact Workers URL from step 5; replace `<your-subdomain>` with your Cloudflare account subdomain).
2. In Cloudflare, add the custom domain to the Worker as in Option A, step 2–5.  
   If the domain is not yet on Cloudflare, you may need to add the site to Cloudflare first so the Worker can be attached to that hostname.

### After adding the domain

- DNS can take a few minutes to propagate.
- Use **HTTPS**; Cloudflare will issue a certificate for your custom domain.

---

## 7. Add production secrets (Cloudflare)

1. In **[Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)**, open the **talkbridge** Worker.
2. Go to **Settings** → **Variables and Secrets**.
3. Under **Environment Variables**, click **Add** (or **Edit**) for **Production**.
4. Add:
   - `GEMINI_API_KEY` = your Gemini API key  
   - `OPENAI_API_KEY` = your OpenAI API key  
   - `CARTESIA_API_KEY` = your Cartesia (private) API key  
5. Save. Redeploy if needed (e.g. **Deployments** → **Rollback** to latest, or run `npm run deploy` again).

Secrets are encrypted and only available at runtime in production.

---

## 8. Redeploys and previews

- **Deploy again (production):**
  ```bash
  npm run deploy
  ```
- **Preview locally (Worker runtime):**
  ```bash
  npm run preview
  ```
  Builds and serves the app locally using the same runtime as production.

---

## 9. Optional: deploy from Git (CI/CD)

1. In **Workers & Pages**, click **Create application** → **Connect to Git**.
2. Choose your repo and branch (e.g. `main`).
3. **Build settings:**
   - **Framework preset:** None (or Next.js if available; we use a custom build).
   - **Build command:** `npm run deploy` or split into:
     - Build: `opennextjs-cloudflare build` (after `npm ci`)
     - Publish: use the Cloudflare step that runs `opennextjs-cloudflare deploy` / Wrangler deploy.
4. Add the same **Environment variables** (e.g. `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CARTESIA_API_KEY`) in the project’s **Settings** → **Environment variables** for Production.

Exact UI may vary; the idea is: build with OpenNext, deploy the Worker, and set env vars for production.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Install deps, `wrangler login` |
| 2 | `npm run deploy` → get `*.workers.dev` URL |
| 3 | In Workers & Pages → your Worker → add **Custom domain** (e.g. `app.yourdomain.com`) |
| 4 | If domain is elsewhere, add CNAME to `talkbridge.<subdomain>.workers.dev` |
| 5 | In Worker **Settings** → **Variables and Secrets**, add `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CARTESIA_API_KEY` |

After that, your app is live on your custom domain with HTTPS.
