import { plaidClient } from '../config/plaid.js';
import { pool } from '../config/db.js';

export const createLinkToken = async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "123" },
      client_name: "ZEDX App",
      language: "en",
      country_codes: ["US"],
      products: ["transactions", "liabilities"]
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const exchangePublicToken = async (req, res) => {
  const { public_token, userId } = req.body;

  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });

    const { access_token, item_id } = response.data;

    // Save to Neon DB
    await pool.query(
      `INSERT INTO plaid_items(user_id, access_token, item_id)
       VALUES($1, $2, $3)
       ON CONFLICT(user_id)
       DO UPDATE SET access_token = EXCLUDED.access_token`,
      [userId, access_token, item_id]
    );

    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ error: err.message });
  }
};

export const getCreditCardAccounts = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT access_token FROM plaid_items WHERE user_id=$1",
      [userId]
    );

    const access_token = result.rows[0].access_token;

    const response = await plaidClient.accountsGet({ access_token });

    const creditCards = response.data.accounts.filter(
      acc => acc.type === "credit"
    );

    res.json(creditCards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getLiabilities = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT access_token FROM plaid_items WHERE user_id=$1",
      [userId]
    );

    const access_token = result.rows[0].access_token;

    const response = await plaidClient.liabilitiesGet({ access_token });

    res.json(response.data.liabilities.credit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTransactions = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT access_token FROM plaid_items WHERE user_id=$1",
      [userId]
    );

    const access_token = result.rows[0].access_token;

    const response = await plaidClient.transactionsGet({
      access_token,
      start_date: "2024-01-01",
      end_date: "2025-01-01",
      options: { count: 100 }
    });

    res.json(response.data.transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



