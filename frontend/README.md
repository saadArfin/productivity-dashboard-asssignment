# Frontend

Next.js dashboard for the Worker Productivity Dashboard application.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Features

- Real-time worker and workstation productivity metrics
- Factory-level aggregated metrics
- Time range selection for historical analysis
- Responsive design with Tailwind CSS

## Project Structure

- `app/` — Next.js App Router pages and layout
- `components/` — Reusable React components
- `hooks/` — Custom React hooks for API calls and data management
- `services/` — API client and type definitions
- `types/` — TypeScript type definitions
- `public/` — Static assets

## Development

The dashboard connects to the backend API at `http://localhost:4000/api`. Make sure the backend is running before starting the development server.

For production builds:

```bash
npm run build
npm start
```
