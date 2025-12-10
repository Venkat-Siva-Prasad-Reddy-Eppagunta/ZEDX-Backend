import dotenv from 'dotenv';
dotenv.config();

import { plaidClient } from '../config/plaid.js';
import { pool } from '../config/db.js';

async function runSandboxTest() {
  try {
    const userId = 1; // use your test user id

    // 1️⃣ Create Link Token
const linkTokenResponse = await plaidClient.linkTokenCreate({
  user: { client_user_id: `${userId}` },
  client_name: "Your App",
  language: "en",
  country_codes: ["US"],
  products: ["transactions", "liabilities"]
});
const linkToken = linkTokenResponse.data.link_token;
console.log("Link Token:", linkToken);

// 2️⃣ Create sandbox public token
const sandboxPublicTokenResponse = await plaidClient.sandboxPublicTokenCreate({
  institution_id: "ins_109508",
  initial_products: ["transactions", "liabilities"]
});
const publicToken = sandboxPublicTokenResponse.data.public_token;
console.log("Public Token (sandbox):", publicToken);

// 3️⃣ Exchange public token
const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
const { access_token, item_id } = exchangeResponse.data;
console.log("Access Token:", access_token);

    // 4️⃣ Save to Neon DB
    await pool.query(
      `INSERT INTO plaid_items(user_id, access_token, item_id)
       VALUES($1, $2, $3)
       ON CONFLICT(user_id) DO UPDATE SET access_token = EXCLUDED.access_token`,
      [userId, access_token, item_id]
    );

    console.log("Access token saved to DB successfully!");

    // 5️⃣ OPTIONAL: Fetch credit card accounts
    const accountsResponse = await plaidClient.accountsGet({ access_token });
    const creditCards = accountsResponse.data.accounts.filter(acc => acc.type === "credit");
    console.log("Credit Cards:", creditCards);

    // 6️⃣ OPTIONAL: Fetch liabilities
    const liabilitiesResponse = await plaidClient.liabilitiesGet({ access_token });
    console.log("Liabilities:", liabilitiesResponse.data.liabilities.credit);

    // 7️⃣ OPTIONAL: Fetch transactions
    const txResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: "2024-01-01",
      end_date: "2025-01-01",
      options: { count: 100 }
    });
    console.log("Transactions:", txResponse.data.transactions);

    console.log("✅ Sandbox test completed successfully!");

  } catch (err) {
    console.error("Error in sandbox test:", err.response?.data || err.message);
  }
}

runSandboxTest();