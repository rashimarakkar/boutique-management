# Boutique Manager

A private workspace for managing boutique clients, orders, measurements, designs, and delivery dates.

## Run locally

1. Install [Node.js 22+](https://nodejs.org/).
2. In `apps/api`, copy `.env.example` to `.env` and paste your MongoDB Atlas connection string as `MONGODB_URI`.
3. In MongoDB Atlas, add the computer or server that will run this app to **Network Access**, and create a database user with read/write access to the `boutique-manager` database.
4. Run `npm install` in this folder.
5. Run `npm run dev` and open `http://localhost:3000`. This starts both the website and API together.

The API runs on `http://localhost:3001`. `docker-compose.yml` remains available only if a local MongoDB database is ever useful for testing; it is not needed when using Atlas.

## First delivery scope

- Private owner/staff workspace (no client accounts)
- Client and order records
- Flexible measurements per order
- Delivery dashboard and work statuses
- Reference links and uploaded design/image URLs

Email scheduling and WhatsApp are intentionally provider-based additions after the core workflow is approved.
