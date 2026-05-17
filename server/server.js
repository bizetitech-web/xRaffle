import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool, { testConnection } from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logError, logInfo } from './utils/logger.js';
// Import admin routes
import adminRoutes from './routes/adminRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import winnerRoutes from './routes/winnerRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envFilePath = join(__dirname, '.env');

// Load environment variables from server folder
dotenv.config({ path: envFilePath });

const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');

  if (missing.length > 0) {
    logError('Server startup aborted: required environment configuration is missing', {
      error: new Error('Missing required environment variables'),
      startup: {
        envFilePath,
        nodeEnv: process.env.NODE_ENV || 'development',
        cwd: process.cwd(),
        missingVariables: missing,
      },
      remediation: [
        'Copy server/.env.example to server/.env',
        'Set all required variables listed in startup.missingVariables',
        'Restart the server process',
      ],
    });
    process.exit(1);
  }
}

validateEnvironment();

const app = express();
const PORT = process.env.PORT || 5000;
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// ✅ Serve static files from the client folder (React build)
app.use(express.static(join(__dirname, '../client')));

// Test database connection on startup
testConnection();

// Add admin routes
app.use('/api/admin', adminRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/winners', winnerRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Database status with starter-safe details
app.get('/api/db-status', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
      [process.env.DB_NAME]
    );
    
    const [orgCount] = await connection.query('SELECT COUNT(*) as count FROM hotel_companies');
    const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
    const [roleCount] = await connection.query('SELECT COUNT(*) as count FROM roles');
    
    connection.release();
    
    res.json({ 
      status: 'connected',
      database: process.env.DB_NAME,
      tables: tables.map(t => t.TABLE_NAME),
      hotel_companiesCount: orgCount[0].count,
      usersCount: userCount[0].count,
      rolesCount: roleCount[0].count,
      timestamp: new Date()
    });
  } catch (error) {
    logError('Database status endpoint failed', {
      error,
      request: {
        method: req.method,
        path: req.originalUrl || req.url,
      },
    });
    res.status(500).json({ 
      status: 'disconnected', 
      error: error.message,
      code: error.code
    });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// ✅ IMPORTANT: This catch-all route MUST come AFTER all API routes
// It handles client-side routing by serving index.html for any non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes (they should have been handled above)
  if (!req.path.startsWith('/api')) {
    const indexPath = join(__dirname, '../client/index.html');
    console.log(`📄 Serving index.html for: ${req.path}`);
    res.sendFile(indexPath);
  }
});

// Global error middleware should be registered after routes.
app.use(errorHandler);

app.listen(PORT, () => {
  logInfo('Server started', {
    port: PORT,
    staticPath: join(__dirname, '../client'),
    environmentFile: envFilePath,
    endpoints: {
      health: `http://localhost:${PORT}/api/health`,
      dbStatus: `http://localhost:${PORT}/api/db-status`,
      app: `http://localhost:${PORT}/`,
    },
  });
});