# Vercel Deployment Instructions

Follow these simple steps to deploy this full-stack application (Express + Vite + React) to **Vercel**:

---

## Method 1: Deploy via Vercel Dashboard & GitHub (Recommended)

1. **Push Code to GitHub**:
   - Push your code to your GitHub repository (e.g. `main` branch).

2. **Import into Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..."** -> **"Project"**.
   - Select your GitHub repository.

3. **Build & Framework Settings**:
   - Vercel will automatically detect the configuration from `vercel.json` and `package.json`.
   - **Framework Preset**: `Vite` or `Other`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Environment Variables**:
   Add the following environment variables in the **Environment Variables** section on Vercel:
   ```env
   innovistapos_AWS_ACCOUNT_ID="041436772015"
   innovistapos_AWS_REGION="us-east-1"
   innovistapos_AWS_RESOURCE_ARN="arn:aws:rds:us-east-1:041436772015:cluster:innovistaposdbaws"
   innovistapos_AWS_ROLE_ARN="arn:aws:iam::041436772015:role/Vercel/access-innovistaposdbaws"
   innovistapos_PGDATABASE="postgres"
   innovistapos_PGHOST="innovistaposdbaws.cluster-cct88acowp78.us-east-1.rds.amazonaws.com"
   innovistapos_PGPORT="5432"
   innovistapos_PGSSLMODE="require"
   innovistapos_PGUSER="postgres"
   innovistapos_PGPASSWORD=""
   ```

5. **Deploy**:
   - Click **Deploy**. Vercel will build and deploy your Express backend and Vite React frontend in seconds.

---

## Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Preview**:
   Run from the project root:
   ```bash
   vercel
   ```

4. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

---

## Technical Details

- **`vercel.json`**: Pre-configured to route API requests to the Express server (`server.ts`) and serve static assets and SPA routes correctly.
- **Node.js Runtime**: Requires Node.js 18+ or 20+ (set automatically by Vercel).
