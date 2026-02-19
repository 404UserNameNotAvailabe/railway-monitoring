/**
 * Sequelize configuration
 * Uses environment variables. Dialect: postgres. logging: false.
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'postgres',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'River-78-Desk-Safe',
  {
    host: process.env.DB_HOST || '100.69.2.77',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
  }
);

export default sequelize;
