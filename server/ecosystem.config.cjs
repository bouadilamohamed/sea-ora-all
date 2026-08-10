module.exports = {
  apps: [
    {
      name: 'seaora-api',
      script: 'src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M'
    }
  ]
};
