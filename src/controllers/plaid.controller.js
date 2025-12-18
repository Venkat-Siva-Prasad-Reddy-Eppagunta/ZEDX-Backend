import { pool } from '../config/db.js';
import { plaidClient } from '../config/plaid.js';
import { dwollaClient } from '../config/dwolla.js';

/**
 * Create Plaid Link Token (Cards OR Bank)
 */
export const createLinkToken = async (req, res) => {
  try {
    const userId = req.userId;
    const { flow } = req.query;

    if (!flow) {
      return res.status(400).json({ error: 'flow query param is required' });
    }

  let products;
  let account_filters;

  if (flow === 'cards') {
    products = ['transactions', 'liabilities'];
    account_filters = {
      credit: {
        account_subtypes: ['credit card']
      }
  };

  } else if (flow === 'bank') {
      products = ['auth'];
      account_filters = {
        depository: {
          account_subtypes: ['checking', 'savings']
        }
    };

  } else {
      return res.status(400).json({ error: 'Invalid flow type' });
  }

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: String(userId) },
    client_name: 'ZEDX App',
    products,
    country_codes: ['US'],
    language: 'en',
    account_filters
  });

    res.json(response.data);
  } catch (err) {
    console.error('createLinkToken error:', err.response?.data ?? err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Exchange Public Token → Credit Cards
 */
export const exchangeCardToken = async (req, res) => {
  try {
    const userId = req.userId;
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token required' });
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    await pool.query(
      `INSERT INTO plaid_items (user_id, access_token, item_id, type)
       VALUES ($1,$2,$3,'cards')
       ON CONFLICT (user_id, type)
       DO UPDATE SET access_token=EXCLUDED.access_token, item_id=EXCLUDED.item_id`,
      [userId, access_token, item_id]
    );

    const accountsRes = await plaidClient.accountsGet({ access_token });
    const accounts = accountsRes.data.accounts;

    let liabilities = null;
    try {
      const liabRes = await plaidClient.liabilitiesGet({ access_token });
      liabilities = liabRes.data.liabilities;
    } catch {}

    const creditAccounts = accounts.filter(a => a.type === 'credit');

    for (const acc of creditAccounts) {
      const liabilityMatch = liabilities?.credit?.find(
        l => l.account_id === acc.account_id
      );
      await upsertCreditCard(userId, acc, liabilityMatch);
    }

    const savedCards = await pool.query(
      'SELECT * FROM credit_cards WHERE user_id=$1',
      [userId]
    );

    res.json({ success: true, cards: savedCards });
  } catch (err) {
    console.error('exchangeCardToken error:', err.response?.data ?? err);
    res.status(500).json({ error: err.message });
  }
};





/**
 * Exchange Public Token → Bank Account → Dwolla Processor Token
 */
export const linkBankAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token required' });
    }

    /**
     * 1️⃣ Fetch Dwolla Customer
     */
    const customerRes = await pool.query(
      'SELECT dwolla_customer_id FROM dwolla_customers WHERE user_id = $1',
      [userId]
    );
    console.log("customerRes:", customerRes);
    if (!customerRes[0].dwolla_customer_id) {
      return res.status(404).json({ error: 'Dwolla customer not found' });
    }

    const dwollaCustomerId = customerRes[0].dwolla_customer_id;

    /**
     * 2️⃣ Check if funding source already exists in DB
     */
    const existingFs = await pool.query(
      `
      SELECT *
      FROM dwolla_funding_sources
      WHERE user_id = $1 AND status != 'removed'
      LIMIT 1
      `,
      [userId]
    );

    console.log("existingFs:", existingFs[0]);

    if (existingFs.length > 0) {
      return res.json({
        success: true,
        fundingSource: existingFs[0],
        reused: true
      });
    }

    /**
     * 3️⃣ Exchange public_token → access_token
     */
    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token
    });

    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    /**
     * 4️⃣ Persist Plaid Item
     */
    await pool.query(
      `
      INSERT INTO plaid_items (user_id, access_token, item_id, type)
      VALUES ($1, $2, $3, 'bank')
      ON CONFLICT (user_id, type)
      DO UPDATE SET access_token = EXCLUDED.access_token,
                    item_id = EXCLUDED.item_id
      `,
      [userId, access_token, item_id]
    );

    /**
     * 5️⃣ Fetch accounts & enforce EXACTLY ONE depository account
     */
    const accountsRes = await plaidClient.accountsGet({ access_token });

    const depositoryAccounts = accountsRes.data.accounts.filter(
      a => a.type === 'depository'
    );

    if (depositoryAccounts.length !== 1) {
      return res.status(400).json({
        error: 'Please select exactly one checking or savings account'
      });
    }

    const bankAccount = depositoryAccounts[0];

    /**
     * 6️⃣ Create Plaid → Dwolla processor token
     */
    const processorRes = await plaidClient.processorTokenCreate({
      access_token,
      account_id: bankAccount.account_id,
      processor: 'dwolla'
    });

    const processorToken = processorRes.data.processor_token;

    /**
     * 7️⃣ Fetch Dwolla Exchange Partner (Plaid)
     */
    const partnersRes = await dwollaClient.get('exchange-partners');

    const partners = partnersRes.body._embedded['exchange-partners'];
    const plaidPartner = partners.find(p => p.name === 'Plaid');

    if (!plaidPartner) {
      throw new Error('Plaid exchange partner not found');
    }

    const exchangePartnerHref = plaidPartner._links.self.href;

    /**
     * 8️⃣ Create Dwolla Exchange
     */
    const exchangeDwollaRes = await dwollaClient.post(
      `customers/${dwollaCustomerId}/exchanges`,
      {
        _links: {
          'exchange-partner': {
            href: exchangePartnerHref
          }
        },
        token: processorToken
      }
    );

    const exchangeUrl = exchangeDwollaRes.headers.get('location');

    /**
     * 9️⃣ Create Dwolla Funding Source
     */
    const bankAccountType =
      bankAccount.subtype === 'savings' ? 'savings' : 'checking';

    let fundingSourceId;

    try {
      const fsRes = await dwollaClient.post(
        `customers/${dwollaCustomerId}/funding-sources`,
        {
          _links: {
            exchange: {
              href: exchangeUrl
            }
          },
          bankAccountType,
          name: bankAccount.name || 'Bank Account'
        }
      );

      const fsUrl = fsRes.headers.get('location');
      fundingSourceId = fsUrl.split('/').pop();

      const fundingRes = await pool.query(
      `
      INSERT INTO dwolla_funding_sources
      (user_id, dwolla_customer_id, last4, funding_source_id, name, type, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'verified')
      ON CONFLICT (funding_source_id)
      DO NOTHING
      `,
      [userId, dwollaCustomerId, bankAccount.mask, fundingSourceId, bankAccount.name || 'Bank Account', bankAccountType]
    );

    /**
     * ✅ Success
     */
    res.json({
      success: true,
      fundingSource: fundingRes[0]
    });

    } catch (err) {
      /**
       * 🔁 Handle DuplicateResource (bank already exists in Dwolla)
       */
      const dwollaErr = err?.body;

      if (dwollaErr?.code === 'DuplicateResource') {
        const existingUrl = dwollaErr._links?.about?.href;
        fundingSourceId = existingUrl.split('/').pop();
      } else {
        throw err;
      }
    }

    /**
     * 🔟 Persist Funding Source (idempotent)
     */
    const fsRes = await pool.query(
      `
      INSERT INTO dwolla_funding_sources
      (user_id, dwolla_customer_id, last4, funding_source_id, name, type, status)
      VALUES ($1, $2, $3, $4, $5, $6,'verified')
      ON CONFLICT (funding_source_id)
      DO NOTHING
      `,
      [userId, dwollaCustomerId, bankAccount.mask, fundingSourceId, bankAccount.name || 'Bank Account', bankAccountType]
    );

    /**
     * ✅ Success
     */
    res.json({
      success: true,
      fundingSource: fsRes[0]
    });

  } catch (err) {
    console.error('linkBankAccount error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
};


export const exchangeBankToken = async (req, res) => {
  try {
    const userId = req.userId;
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token required' });
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    await pool.query(
      `INSERT INTO plaid_items (user_id, access_token, item_id, type)
       VALUES ($1,$2,$3,'bank')
       ON CONFLICT (user_id, type)
       DO UPDATE SET access_token=EXCLUDED.access_token, item_id=EXCLUDED.item_id`,
      [userId, access_token, item_id]
    );

    const accountsRes = await plaidClient.accountsGet({ access_token });

    const bankAccount = accountsRes.data.accounts.find(
      a => a.type === 'depository'
    );

    if (!bankAccount) {
      return res.status(400).json({ error: 'No bank account found' });
    }

    const processorRes = await plaidClient.processorTokenCreate({
      access_token,
      account_id: bankAccount.account_id,
      processor: 'dwolla'
    });

    res.json({
      success: true,
      processorToken: processorRes.data.processor_token
    });
  } catch (err) {
    console.error('exchangeBankToken error:', err.response?.data ?? err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Helper: Upsert Credit Card
 */
async function upsertCreditCard(userId, account, liability) {
  const {
    account_id,
    balances: { current = 0, limit = 0 } = {},
    name,
    mask
  } = account;

  const total_due = liability?.last_statement_balance || 0;
  const min_due = liability?.minimum_payment_amount || 0;
  const next_due_date = liability?.next_payment_due_date || null;
  const available_balance = account.balances.available ?? (limit - current);

  const existing = await pool.query(
    'SELECT id FROM credit_cards WHERE account_id=$1',
    [account_id]
  );

  if (existing[0]) {
    await pool.query(
      `UPDATE credit_cards SET
        user_id=$1, name=$2, mask=$3, current_balance=$4,
        available_balance=$5, credit_limit=$6,
        total_due=$7, min_due=$8, next_due_date=$9,
        updated_at=NOW()
       WHERE account_id=$10`,
      [
        userId, name, mask, current,
        available_balance, limit,
        total_due, min_due, next_due_date,
        account_id
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO credit_cards
        (user_id, account_id, name, mask, current_balance,
         available_balance, credit_limit, total_due,
         min_due, next_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        userId, account_id, name, mask,
        current, available_balance, limit,
        total_due, min_due, next_due_date
      ]
    );
  }
}