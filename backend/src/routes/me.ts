import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/me
 *
 * Returns the decoded Cognito claims for the authenticated user.
 * Used by the frontend to confirm auth is working and display the user's email.
 */
router.get('/', requireAuth, (req: Request, res: Response) => {
  // req.user is guaranteed non-null after requireAuth
  const { sub, username, email } = req.user!;
  res.json({ sub, username, email });
});

export default router;
