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

    if (exists.rows && exists.rows.length > 0) {
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

    const cardRes = await pool.query(
      "SELECT * FROM credit_cards WHERE user_id=$1",
      [user.id]
    );

    const token = signToken(user.id);

    const safeUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      credit_score: user.credit_score,
      cards: cardRes
    };

    res.json({ user: safeUser, token });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "server_error" });
  }
};