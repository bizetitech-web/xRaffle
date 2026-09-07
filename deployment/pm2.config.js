module.exports = {
  apps: [
    {
      name: 'xraffle-server',
      cwd: './server',
      script: 'server.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        JOB_QUEUE_ENABLED: 'true',
      },
    },
    {
      name: 'xraffle-worker',
      cwd: './server',
      script: 'src/worker.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        JOB_QUEUE_ENABLED: 'true',
      },
    },
  ],
};
