// PM2 process definition for the Zook backend.
// Used on the Azure server: `pm2 start ecosystem.config.js --env production`
module.exports = {
  apps: [
    {
      name: 'zook-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
