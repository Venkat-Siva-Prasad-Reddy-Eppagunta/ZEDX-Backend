import Dwolla from 'dwolla-v2';

export const dwollaClient = new Dwolla.Client({
  key: process.env.DWOLLA_KEY,
  secret: process.env.DWOLLA_SECRET,
  environment: process.env.DWOLLA_ENV === 'production'
    ? 'production'
    : 'sandbox'
});