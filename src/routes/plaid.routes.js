import express from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  getCreditCardAccounts,
//  getLiabilities,
//  getTransactions
} from '../controllers/plaid.controller.js';

import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// must be POST to match frontend
router.post('/create-link-token', requireAuth, createLinkToken);

router.post('/exchange-public-token', requireAuth,exchangePublicToken);
router.get('/credit-cards/:userId', requireAuth, getCreditCardAccounts);
//router.get('/liabilities/:userId', getLiabilities);
//router.get('/transactions/:userId', getTransactions);

export default router;