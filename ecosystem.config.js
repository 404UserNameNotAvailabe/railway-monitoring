module.exports = {
  apps: [{
    name: "railway-monitoring",
    script: "./src/server.js",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    watch: false,
    max_memory_restart: "800M", // Restart if it exceeds typical VPS limits
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
}
