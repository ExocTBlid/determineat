import express from 'express';

const app = express();

// Parse JSON request bodies
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check — unauthenticated, used by ECS health checks and local dev
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// API routes (to be added in subsequent tasks)
// ---------------------------------------------------------------------------
// Task 3: auth middleware + /api/me
// Task 4: /api/restaurants CRUD

export default app;
