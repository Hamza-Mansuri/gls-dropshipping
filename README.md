# dropshipping-c — Gomzi Life Sciences Webinar

A **new, independent project** using the supplied HTML/CSS design. The earlier Dropshipping project is not modified.

## Project structure

- `frontend/` — Vite-served HTML/CSS/JS from your friend's source. Video is **1:1**.
- `backend/` — Express REST API + **MongoDB Atlas only** (`mongodb` official driver). No PostgreSQL, Prisma or local database.

## Run the frontend (PowerShell)

```powershell
cd dropshipping-c\frontend
npm install
npm run dev
```

Visit http://localhost:5173. No database is required to preview the landing page.

## Run the backend (separate terminal)

```powershell
cd dropshipping-c\backend
npm install
Copy-Item .env.example .env
npm run dev
```

The backend starts without Atlas, but `/api/registrations` returns HTTP 503 until configured. **No fake success is shown.**

## Connect company MongoDB Atlas when ready

1. Obtain the authorized company's Atlas connection string, database access and network permissions from the administrator.
2. Set `MONGODB_URI` and `MONGODB_DB` in `backend/.env` (never commit `.env`).
3. Set `FRONTEND_ORIGIN` to your actual frontend URL in production.
4. Set `window.DROPSHIPPING_API_URL` in `frontend/public/config.js` to the deployed backend URL.
5. Restart backend and check `/api/health`, then test registration end to end.

## Hero video

Place an approved, optimized `sir1_1.mp4` in `frontend/public/`. The file was not supplied and is **not included**. Video is 1:1 with `object-fit: contain`, `preload=none`, and a lightweight poster so the original aspect ratio isn't distorted.

## Notes before going live

- The supplied design and copy are preserved, including its webinar date: **18 October 2026, 12 PM IST**. Update this when the schedule changes.
- Verify business, founder, manufacturing, certification, no-MOQ, and fulfillment claims internally.
- Obtain a real founder photo; the source's duplicate autoplay video was replaced with a placeholder.
- Email/WhatsApp confirmations and reminders are **not implemented**; the site only saves registrations to Atlas when configured.
- The backend has basic validation, rate limiting and security headers. Review production privacy/security requirements before launch.
