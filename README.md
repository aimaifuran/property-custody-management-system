# Property Accountability Management System

This workspace contains a production-style full-stack Property Accountability Management System for a government supply office.

## Stack
- Frontend: React 19, Vite, Tailwind CSS, React Router, React Query, Framer Motion
- Backend: Node.js, Express, MongoDB, Mongoose, JWT, bcrypt, Helmet, Validator

## Run locally

### Backend
```bash
cd backend
npm install
node server.js
```

### Seed data
```bash
cd backend
node seed.js
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Default credentials
- Username: admin
- Password: Admin123!

## Notes
- The backend uses MongoDB on localhost:27017.
- The frontend expects the API on http://localhost:5000/api.

## Vercel and merge compatibility

- Deploy the backend with `backend` as its project root. `backend/vercel.json` routes `/api/*` to `api/index.js`.
- Set `MONGODB_URI` and the existing JWT secrets in the backend environment. The database name remains `pcms`.
- Report APIs support both `/api/reports` and `/api/dashboard`, including `/summary`. The frontend uses `/api/dashboard` for live routing compatibility.
- Existing list requests return arrays. Supplying `page`, `limit`, or `search` opts into `{ items, pagination }` responses.
- Login accepts existing `pcms_auth_token` storage and migrates it to `pais_auth_token`.
- Password recovery and email changes require `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and `FRONTEND_URL` as appropriate for your mail provider. Set `FRONTEND_URL` to the deployed frontend so reset links point to the correct site.
- Automatic initialization retains the current account/settings setup without generating sample inventory or slips. It skips initialization when the existing admin is found.
- User navigation remains limited to **My Issues Items** and **Returned Items**. The incoming profile screen is available to admins.

## Form creation, annual office documents, and password approval

- Document pages offer **New Form**. IAR-generated Property Cards, ICS/PAR drafts, and returns continue to be created automatically; admins can also save standalone forms. Monthly forms copy server-recorded items for the selected month without changing the automatic monthly report.
- Annual Reports group office items by type (for example, Air Conditioners), with office, quantity, custodian, property/stock number, and source document. Each group exports as one PDF. The default includes records through the selected year; the filter also supports records from that year only. Confirmed linked returns reduce issued quantities. Legacy records without dated movement history use recorded assignments and are not a complete historical inventory snapshot.
- User password recovery enters a pending approval queue. Admins receive an in-app notification and sidebar count, then approve or reject in User Management. Approval emails a one-use reset link to the registered address. Failed email delivery leaves the request pending for retry. Admin accounts retain direct email recovery.
- Schema additions: `PasswordResetRequest` records with a unique sparse `activeKey` index; optional `office` on ICS and PAR; `PropertyCard.iar` is optional for standalone forms. Existing linked records remain valid. No manual SQL migration is needed; provision the Mongoose indexes when deploying if automatic index creation is disabled.
