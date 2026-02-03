// src/routes/auth.routes.js
import express from 'express';
import { register, login, getMe} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getMe);

export default router;