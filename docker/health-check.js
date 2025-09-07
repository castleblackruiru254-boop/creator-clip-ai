#!/usr/bin/env node

const http = require('http');
const https = require('https');

const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// Simple health check for Docker
function healthCheck() {
  const options = {
    hostname: 'localhost',
    port: port,
    path: '/health',
    method: 'GET',
    timeout: 5000,
  };

  const protocol = port === 443 ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Health check failed: HTTP ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(new Error(`Health check error: ${error.message}`));
    });

    req.on('timeout', () => {
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

// Run health check
healthCheck()
  .then(() => {
    console.log('Health check passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Health check failed:', error.message);
    process.exit(1);
  });
