import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Define the Redis connection URL (defaults to local Docker instance)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize the Redis client
const redisClient = createClient({
    url: redisUrl
});

// Event listeners for monitoring connection health
redisClient.on('connect', () => {
    console.log('[Redis] Client connected successfully.');
});

redisClient.on('error', (err) => {
    console.error('[Redis] Client connection error:', err);
});

redisClient.on('reconnecting', () => {
    console.log('[Redis] Client reconnecting...');
});

// Establish the connection
export const connectRedis = async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (error) {
        console.error('[Redis] Failed to connect:', error);
        // Do not exit process here to allow the app to run even if cache is down,
        // unless Redis is absolutely strictly required for your architecture.
    }
};

export { redisClient };