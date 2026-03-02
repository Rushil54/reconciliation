# Bitespeed Backend Task - Identity Reconciliation

This service exposes `POST /identify` and reconciles contacts based on shared `email` and/or `phoneNumber`.

## Stack
- Node.js + TypeScript + Express
- SQLite (`sqlite3` + `sqlite`)

## API
### Endpoint
- `POST /identify`

### Request Body
```json
{
  "email": "string | null",
  "phoneNumber": "string | number | null"
}
```
At least one of `email` or `phoneNumber` must be present.

### Response
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

## Local Setup
1. Install dependencies:
```bash
npm install
```

2. Create `.env`:
```env
DATABASE_URL="file:./dev.db"
PORT=3000
```

3. Run server:
```bash
npm run dev
```

## Test
```bash
npm test
```
Tests run against `.env.test` (`file:./test.db`).

## Health Check
- `GET /health`

## Deploy
- You can deploy this as-is on a single-instance service with persistent disk.
- If your host does not guarantee persistent disk, switch to Postgres in production.

## Hosted Endpoint
- Add your deployed URL here:
  - `https://<your-app-domain>/identify`
