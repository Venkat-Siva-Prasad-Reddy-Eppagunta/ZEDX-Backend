import express from 'express';
import { createDwollaCustomer, syncDwollaCustomerStatus, createFundingSource, createPayment } from '../controllers/dwolla.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.post('/customers', requireAuth, createDwollaCustomer);
router.get('/customers/status', requireAuth, syncDwollaCustomerStatus);
router.post('/funding-sources', requireAuth, createFundingSource);
router.post('/transfers', requireAuth, createPayment);

export default router;