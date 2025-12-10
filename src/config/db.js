import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

//Create a DB connection using the connection string from environment variables
export const pool = neon(process.env.DB_URL);