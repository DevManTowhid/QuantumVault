import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'secretpassword',
    database: process.env.DB_NAME || 'quantum_vault',
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
    process.exit(-1);
});

// Export a robust query wrapper
export const db = {
    /**
     * Standard query execution
     */
    query: (text: string, params?: any[]): Promise<QueryResult> => {
        return pool.query(text, params);
    },

    /**
     * Executes a transaction block, crucial for setting RLS session variables
     * before running the actual queries for tenant isolation.
     */
    async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },
    
    // Expose the raw pool if needed for advanced use cases
    pool
};