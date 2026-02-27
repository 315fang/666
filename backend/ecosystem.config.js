module.exports = {
    apps: [{
        name: 's2b2c-backend',
        script: 'server.js',

        // ★ 单进程模式：避免集群模式下内存锁失效，导致佣金结算等定时任务被多个进程重复执行
        // 如需多核性能，请先将 taskLock.js 改为数据库锁或 Redis 锁，再改回 'max' + 'cluster'
        instances: 1,
        exec_mode: 'fork',

        // 生产环境配置
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },

        // 开发环境配置
        env_development: {
            NODE_ENV: 'development',
            PORT: 3000
        },

        // 内存限制：超过 500M 自动重启，防止内存泄漏导致服务器卡死
        max_memory_restart: '500M',

        // 日志配置
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/error.log',
        out_file: './logs/output.log',
        merge_logs: true,   // 集群模式下合并日志

        // 故障恢复
        autorestart: true,  // 进程崩溃自动重启
        exp_backoff_restart_delay: 100, // 重启延时策略

        // 忽略监听的文件（防止日志变化导致重载）
        ignore_watch: ['node_modules', 'logs', 'uploads', 'backups'],
        watch: false // 生产环境通常关闭 watch
    }]
};
