import express from 'express';
import { payCreditCard } from '../controllers/payments.controller.js';
import { requireAuth } from '../middleware/auth.js';
const router = express.Router();
router.post('/pay', requireAuth, payCreditCard);

export default router;