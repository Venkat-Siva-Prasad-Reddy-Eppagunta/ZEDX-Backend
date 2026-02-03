import express from 'express';
import {
  createLinkToken,
  exchangeCardToken,
  linkBankAccount
} from '../controllers/plaid.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Link Token (cards or bank)
router.post('/create-link-token', requireAuth, createLinkToken);

// Credit Cards
router.post('/exchange-card-token', requireAuth, exchangeCardToken);

// Bank Account → Dwolla
router.post('/exchange-bank-token', requireAuth, linkBankAccount);

export default router;