// src/server.ts
import dotenv from 'dotenv';
import path from 'path';

console.log('Starting server initialization...');
console.log('Current directory:', __dirname);

const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.log('No .env file found, using system environment variables.');
} else {
    console.log('Environment variables loaded from .env file successfully');
}

// Now import app after environment variables are loaded
import app from './app';
import { webhookWorker } from './services/worker';

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('HTTP server closed');
    });
    
    try {
        await webhookWorker.close();
        console.log('Webhook worker closed');
    } catch (error) {
        console.error('Error closing webhook worker:', error);
    }
    
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('HTTP server closed');
    });
    
    try {
        await webhookWorker.close();
        console.log('Webhook worker closed');
    } catch (error) {
        console.error('Error closing webhook worker:', error);
    }
    
    process.exit(0);
});