// src/controllers/plaid.controller.js
import { pool } from '../config/db.js';
import { plaidClient } from '../config/plaid.js';

/**
 * Create a Link Token — Plaid Quickstart standard
 */
export const createLinkToken = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(userId) },
      client_name: "ZEDX App",
      products: ["transactions", "liabilities"], // Quickstart uses "auth" too
      country_codes: ["US"],
      language: "en",
    });

    return res.json(response.data); // { link_token, expiration, etc. }
  } catch (err) {
    console.error("createLinkToken err:", err.response?.data ?? err);
    return res.status(500).json({ error: err.response?.data ?? err.message });
  }
};

/**
 * Exchange public_token → access_token, persist token & fetch accounts/liabilities
 */
export const exchangePublicToken = async (req, res) => {
  try {
    const userId = req.userId;
    const { public_token } = req.body;

    if (!public_token || !userId) {
      return res.status(400).json({ error: "public_token required" });
    }

    // Exchange public_token → access_token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = exchangeRes.data.access_token;
    const item_id = exchangeRes.data.item_id;

    // Store/Upsert the access_token
    await pool.query(
      `INSERT INTO plaid_items (user_id, access_token, item_id)
        VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET access_token = EXCLUDED.access_token, item_id = EXCLUDED.item_id`,
      [userId, access_token, item_id]
    );

    // Fetch accounts
    const accountsRes = await plaidClient.accountsGet({ access_token });
    const accounts = accountsRes.data.accounts;

    // Optionally fetch liabilities
    let liabilitiesObj = null;
    try {
      const liabRes = await plaidClient.liabilitiesGet({ access_token });
      liabilitiesObj = liabRes.data.liabilities;
    } catch (liabErr) {
      console.warn(
        "Plaid liabilitiesGet product not ready (OK in sandbox)",
        liabErr.response?.data ?? liabErr.message
      );
      liabilitiesObj = null;
    }

    // Upsert credit cards + liabilities into DB
const creditAccounts = accounts.filter(a => a.type === "credit");

for (const acc of creditAccounts) {
  let liabilityMatch = null;
  if (liabilitiesObj && Array.isArray(liabilitiesObj.credit)) {
    liabilityMatch = liabilitiesObj.credit.find(
      liab =>
        liab.account_id === acc.account_id ||
        (liab.account_ids && liab.account_ids.includes(acc.account_id))
    );
  }

  await upsertCreditCard(userId, acc, liabilityMatch);
}

    // Return stored cards
    const savedCards = await pool.query(
      `SELECT *
       FROM credit_cards 
       WHERE user_id = $1`,
      [userId]
    );

    return res.json({ success: true, cards: savedCards });
  } catch (err) {
    console.error("exchangePublicToken err:", err.response?.data ?? err);
    return res.status(500).json({ error: err.response?.data ?? err.message });
  }
};

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
  const available_balance = account.balances.available == null ? (limit - current) : account.balances.available;

  const existing = await pool.query(
    "SELECT id FROM credit_cards WHERE account_id = $1",
    [account_id]
  );

  if (existing?.length) {
    const id = existing[0].id;
    await pool.query(
      `UPDATE credit_cards SET
         user_id=$1, name=$2, mask=$3, current_balance=$4,
         available_balance=$5, credit_limit=$6,
         total_due=$7, min_due=$8, next_due_date=$9,
         updated_at=NOW()
       WHERE id=$10`,
      [userId, name, mask, current, available_balance, limit, total_due, min_due, next_due_date, id]
    );
    return id;
  } else {
    const insert = await pool.query(
      `INSERT INTO credit_cards
         (user_id, account_id, name, mask, current_balance, available_balance, credit_limit, total_due, min_due, next_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [userId, account_id, name, mask, current, available_balance, limit, total_due, min_due, next_due_date]
    );
    return insert[0].id;
  }
}
export const getCreditCardAccounts = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT *
       FROM credit_cards
       WHERE user_id = $1`,
      [userId]
    );

    res.json({ creditCards: result });
  } catch (err) {
    console.error("getCreditCardAccounts error:", err);
    res.status(500).json({ error: "server_error" });
  }
}