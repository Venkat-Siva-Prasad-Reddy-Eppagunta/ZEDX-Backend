import { pool } from '../config/db.js';
import { dwollaClient } from '../config/dwolla.js';
import { encrypt } from '../utils/encryption.js';
import { plaidClient } from '../config/plaid.js';

/**
 * Create Dwolla Customer (Individual)
 */
export const createDwollaCustomer = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      legal_first_name,
      legal_last_name,
      dob,
      ssn_last4,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      email
    } = req.body;

    if (
      !legal_first_name ||
      !legal_last_name ||
      !dob ||
      !ssn_last4 ||
      !address_line1 ||
      !city ||
      !state ||
      !postal_code ||
      !email
    ) {
      return res.status(400).json({ error: 'Missing required KYC fields' });
    }

    // 1️⃣ Check DB first
    const existing = await pool.query(
      `SELECT * FROM dwolla_customers WHERE user_id = $1`,
      [userId]
    );

    if (existing.length > 0) {
      return res.json({
        success: true,
        dwolla_customer_id: existing[0].dwolla_customer_id,
        status: existing[0].status
      });
    }

    const encryptedSSN = encrypt(ssn_last4);

    let dwollaCustomerId;

    try {
      // 2️⃣ Attempt Dwolla creation
      const response = await dwollaClient.post('customers', {
        firstName: legal_first_name,
        lastName: legal_last_name,
        email,
        type: 'personal',
        dateOfBirth: dob,
        ssn: ssn_last4, // ❗ Dwolla needs raw last4, NOT encrypted
        address1: address_line1,
        address2: address_line2 || undefined,
        city,
        state,
        postalCode: postal_code,
        country: 'US'
      });

      const location = response.headers.get('location');
      dwollaCustomerId = location.split('/').pop();

    } catch (err) {
      // 3️⃣ Customer already exists in Dwolla
      if (
        err.body?.code === 'ValidationError' &&
        err.body?._embedded?.errors?.some(e =>
          e.message?.toLowerCase().includes('already exists')
        )
      ) {
        // Fetch by email
        const search = await dwollaClient.get(
          `customers?search=${encodeURIComponent(email)}`
        );

        dwollaCustomerId = search.body._embedded.customers[0].id;
      } else {
        throw err;
      }
    }

    // 4️⃣ Insert into DB (single source of sync)
    await pool.query(
      `
      INSERT INTO dwolla_customers (
        user_id,
        dwolla_customer_id,
        legal_first_name,
        legal_last_name,
        dob,
        ssn_last4,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        email,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'verified')
      `,
      [
        userId,
        dwollaCustomerId,
        legal_first_name,
        legal_last_name,
        dob,
        encryptedSSN,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        email
      ]
    );

    await pool.query(
      `UPDATE users
       SET is_verified = TRUE
       WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      dwolla_customer_id: dwollaCustomerId,
      status: 'verified'
    });


  } catch (err) {
    console.error('Dwolla customer sync error:', err.body || err);
    res.status(500).json({ error: 'Failed to create or sync Dwolla customer' });
  }
};

/**
 * Sync Dwolla Customer Status
 */
export const syncDwollaCustomerStatus = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { rows } = await pool.query(
      'SELECT dwolla_customer_id FROM dwolla_customers WHERE user_id=$1',
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dwolla customer not found' });

    const dwollaCustomerId = rows[0].dwolla_customer_id;
    const customer = await dwollaClient.get(`customers/${dwollaCustomerId}`);
    const status = customer.body.status;

    await pool.query(
      'UPDATE dwolla_customers SET status=$1, updated_at=NOW() WHERE user_id=$2',
      [status, userId]
    );

    res.json({ success: true, status });
  } catch (err) {
    console.error('Sync Dwolla customer error:', err.body || err);
    res.status(500).json({ error: 'Failed to sync Dwolla customer status' });
  }
};

/**
 * Create Dwolla Funding Source using Plaid processor token
 */
export const createFundingSource = async (req, res) => {
  try {
    const userId = req.userId;
    const { public_token, account_id } = req.body;

    if (!public_token || !account_id) {
      return res.status(400).json({ error: 'Missing Plaid token or account id' });
    }

    // 1️⃣ Get Dwolla customer
    const { rows } = await pool.query(
      'SELECT dwolla_customer_id FROM dwolla_customers WHERE user_id = $1',
      [userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Dwolla customer not found' });
    }

    const dwollaCustomerId = rows[0].dwolla_customer_id;

    // 2️⃣ Exchange public token
    const tokenRes = await plaidClient.itemPublicTokenExchange({
      public_token
    });

    const accessToken = tokenRes.data.access_token;

    // 3️⃣ Create Plaid processor token for Dwolla
    const processorRes = await plaidClient.processorTokenCreate({
      access_token: accessToken,
      account_id,
      processor: 'dwolla'
    });

    const processorToken = processorRes.data.processor_token;

    // 4️⃣ Create Dwolla funding source
    const fsRes = await dwollaClient.post(
      `customers/${dwollaCustomerId}/funding-sources`,
      {
        plaidProcessorToken: processorToken,
        name: 'Primary Bank Account'
      }
    );

    const location = fsRes.headers.get('location');
    const dwollaFundingSourceId = location.split('/').pop();

    // 5️⃣ Save in DB
    await pool.query(
      `
      INSERT INTO dwolla_funding_sources
      (user_id, dwolla_funding_source_id, name, status)
      VALUES ($1, $2, $3, 'unverified')
      `,
      [userId, dwollaFundingSourceId, 'Primary Bank Account']
    );

    res.json({
      success: true,
      dwolla_funding_source_id: dwollaFundingSourceId
    });

  } catch (err) {
    console.error('Funding source error:', err.body || err);
    res.status(500).json({ error: 'Failed to create funding source' });
  }
};

/**
 * Create ACH Transfer (Bank → Dwolla Balance)
 */
/**
 * Create Credit Card Bill Payment (ACH Debit)
 */
export const createPayment = async (req, res) => {
  try {
    const userId = req.userId;
    const { creditCardId, fundingSourceId, amount } = req.body;

    if (!creditCardId || !fundingSourceId || !amount) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    // 1️⃣ Get Dwolla customer
    const customerRes = await pool.query(
      'SELECT dwolla_customer_id FROM dwolla_customers WHERE user_id = $1',
      [userId]
    );

    if (!customerRes[0]) {
      return res.status(404).json({ error: 'Dwolla customer not found' });
    }

    const dwollaCustomerId = customerRes[0].dwolla_customer_id;

    // 2️⃣ Get Dwolla funding source ID (IMPORTANT)
    const fsRes = await pool.query(
      'SELECT dwolla_funding_source_id FROM dwolla_funding_sources WHERE id = $1 AND user_id = $2',
      [fundingSourceId, userId]
    );

    if (!fsRes[0]) {
      return res.status(404).json({ error: 'Funding source not found' });
    }

    const dwollaFundingSourceId = fsRes[0].dwolla_funding_source_id;

    // 3️⃣ Create Dwolla transfer
    const transferRes = await dwollaClient.post('transfers', {
      _links: {
        source: {
          href: `https://api.dwolla.com/funding-sources/${dwollaFundingSourceId}`
        },
        destination: {
          href: `https://api.dwolla.com/customers/${dwollaCustomerId}`
        }
      },
      amount: {
        currency: 'USD',
        value: amount
      }
    });

    const location = transferRes.headers.get('location');
    const dwollaTransferId = location.split('/').pop();

    // 4️⃣ Save payment record
    await pool.query(
      `
      INSERT INTO payments
      (user_id, credit_card_id, funding_source_id, amount, dwolla_transfer_id, status)
      VALUES ($1,$2,$3,$4,$5,'pending')
      `,
      [
        userId,
        creditCardId,
        fundingSourceId,
        amount,
        dwollaTransferId
      ]
    );

    res.json({
      success: true,
      payment_id: dwollaTransferId,
      status: 'pending'
    });

  } catch (err) {
    console.error('Create payment error:', err.body || err);
    res.status(500).json({ error: 'Payment failed' });
  }
};