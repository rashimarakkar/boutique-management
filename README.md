# Boutique Manager

A private workspace for managing boutique clients, orders, measurements, designs, and delivery dates.

## Run locally

1. Install [Node.js 22+](https://nodejs.org/).
2. In `apps/api`, copy `.env.example` to `.env`, paste your MongoDB Atlas connection string as `MONGODB_URI`, and set a unique `JWT_SECRET` (at least 32 characters). Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. In MongoDB Atlas, add the computer or server that will run this app to **Network Access**, and create a database user with read/write access to the `boutique-manager` database.
4. Run `npm install` in this folder.
5. Run `npm run dev` and open `http://localhost:3000`. This starts both the website and API together.

The API runs on `http://localhost:3001`. `docker-compose.yml` remains available only if a local MongoDB database is ever useful for testing; it is not needed when using Atlas.

## First delivery scope

- Private owner/staff workspace (no client accounts)
- Searchable client directory and client profiles with order history, payment totals, and status summaries
- Create orders for existing clients or add a new client during order entry
- Select saved garment types or add new types for future orders
- Flexible measurements per order
- Delivery dashboard and work statuses
- Reference links and uploaded design/image URLs

Email scheduling and WhatsApp are intentionally provider-based additions after the core workflow is approved.

## Sign in

On the first visit, create the admin account from the sign-in page. The API permits this only once, while no admin account exists; use a 3–32 character username or a valid email address, and choose a password with at least 12 characters. Later visits use that username/email and password to sign in. The session is an eight-hour JWT stored in an HTTP-only cookie, and **Log out** clears it. All client, order, and dashboard API routes require a valid session.

Keep `JWT_SECRET` private and stable. Changing it signs out every active session. Set `WEB_ORIGIN` to the exact origin serving the web app when deploying.

Order photos and sketches are stored as files in `apps/api/uploads` by default, while MongoDB stores their API paths. Set `UPLOADS_DIR` to a persistent local volume in deployment; include that directory in backups. Files are served through authenticated API routes. Existing embedded photos and sketches are moved to files when their order is next opened and saved.
