# Property Custody Management System

This workspace contains a production-style full-stack Property Custody Management System for a government supply office.

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
