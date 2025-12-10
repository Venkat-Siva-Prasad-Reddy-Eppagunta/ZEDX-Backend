// src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth.routes.js';
import plaidRoutes from './routes/plaid.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// routes
app.use('/api', authRoutes);
app.use('/api/plaid', plaidRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});