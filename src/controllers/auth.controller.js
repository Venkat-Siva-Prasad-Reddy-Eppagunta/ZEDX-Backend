import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = "7d";

const signToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: EXPIRES_IN });
};

export const register = async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const normalizedEmail = email.toLowerCase();

    // Check existing
    const exists = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [normalizedEmail]
    );

    if (exists && exists.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Insert
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, is_verified, credit_score)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, first_name, last_name, email, credit_score`,
      [first_name, last_name || null, normalizedEmail, hashed, true, 720]  // force 720 for now
    );
    const user = result[0];
    const token = signToken(user.id);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "server_error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [normalizedEmail]
    );

    const user = result[0];
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        credit_score: user.credit_score,
        is_verified: user.is_verified
      }
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "server_error" });
  }
};


export const getMe = async (req, res) => {
  try {
    const userId = req.userId;

    // 1️⃣ User
    const userRes = await pool.query(
      `SELECT id, email, first_name, last_name, credit_score, is_verified
       FROM users WHERE id=$1`,
      [userId]
    );

    if (!userRes[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2️⃣ Credit Cards
    const cards = await pool.query(
      `SELECT * FROM credit_cards WHERE user_id=$1 ORDER BY id DESC`,
      [userId]
    );

    // 3️⃣ Dwolla Customer
    const dwollaCustomer = await pool.query(
      `SELECT dwolla_customer_id, status
       FROM dwolla_customers
       WHERE user_id=$1`,
      [userId]
    );

    // 4️⃣ Funding Sources
    const fundingSources = await pool.query(
      `
      SELECT *
      FROM dwolla_funding_sources
      WHERE user_id=$1 AND status != 'removed'
      ORDER BY id DESC
      `,
      [userId]
    );

    // 5️⃣ Payments (latest 20)
    const payments = await pool.query(
      `
      SELECT p.*, c.name AS card_name, fs.name AS bank_name
      FROM payments p
      LEFT JOIN credit_cards c ON p.credit_card_id = c.id
      LEFT JOIN dwolla_funding_sources fs ON p.funding_source_id = fs.id
      WHERE p.user_id=$1
      ORDER BY p.created_at DESC
      LIMIT 20
      `,
      [userId]
    );

    res.json({
      user: userRes[0],
      cards,
      fundingSources,
      payments,
      dwolla: dwollaCustomer[0] || null
    });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ error: 'Failed to load user data' });
  }
};