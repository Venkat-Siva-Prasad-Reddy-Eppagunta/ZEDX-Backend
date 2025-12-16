import { pool } from '../config/db.js';
import { dwollaClient } from '../config/dwolla.js';

export const payCreditCard = async (req, res) => {
  try {
    const userId = req.userId;
    const { creditCardId, fundingSourceId, amount } = req.body;
    if (!creditCardId || !fundingSourceId || !amount)
      return res.status(400).json({ error: 'Missing parameters' });

    const fsResult = await pool.query(
      'SELECT dwolla_funding_source_id FROM dwolla_funding_sources WHERE id=$1 AND user_id=$2',
      [fundingSourceId, userId]
    );
    if (!fsResult[0]) return res.status(404).json({ error: 'Funding source not found' });

    const dwollaFundingSourceId = fsResult[0].dwolla_funding_source_id;

    // **TODO:** Replace DESTINATION_ID with actual processor funding source (Dwolla)
    const transferRes = await dwollaClient.post('transfers', {
      _links: {
        source: { href: `https://api-sandbox.dwolla.com/funding-sources/${dwollaFundingSourceId}` },
        destination: { href: 'https://api-sandbox.dwolla.com/funding-sources/DESTINATION_ID' }
      },
      amount: { value: amount, currency: 'USD' }
    });

    const location = transferRes.headers.get('location');
    const transferId = location.split('/').pop();

    await pool.query(
      `INSERT INTO payments (user_id, credit_card_id, funding_source_id, amount, dwolla_transfer_id, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, creditCardId, fundingSourceId, amount, transferId, 'pending']
    );

    res.json({ success: true, transferId });
  } catch (err) {
    console.error('payCreditCard error:', err.body || err);
    res.status(500).json({ error: 'Failed to pay credit card' });
  }
};