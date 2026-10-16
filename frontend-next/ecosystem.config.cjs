module.exports = {
  apps: [
    {
      name: 'baznas-frontend-next',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      cwd: '/home/xruncy/repo/frontend-next',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
