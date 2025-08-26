import { Router } from 'express';
import { signin, verifyToken } from '../controllers/auth.controller.js';

const router = Router();

// POST /api/auth/signin
router.post('/signin', signin);

// GET /api/auth/verify
router.get('/verify', verifyToken);

export default router;