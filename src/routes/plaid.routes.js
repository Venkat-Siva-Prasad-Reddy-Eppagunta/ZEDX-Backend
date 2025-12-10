import express from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  getCreditCardAccounts,
  getLiabilities,
  getTransactions
} from '../controllers/plaid.controller.js';

const router = express.Router();

router.get('/create-link-token', createLinkToken);
router.post('/exchange-public-token', exchangePublicToken);
router.get('/credit-cards/:userId', getCreditCardAccounts);
router.get('/liabilities/:userId', getLiabilities);
router.get('/transactions/:userId', getTransactions);

export default router;