const { mergeWithRules } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');
const common = require('./webpack.common.js');

module.exports = (env) =>
  mergeWithRules({
    module: {
      rules: {
        test: 'match',
        exclude: 'replace',
      },
    },
  })(common(env), {
    mode: 'production',
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: false, // 保留 console，方便调试
              drop_debugger: true,
              pure_funcs: ['console.debug'], // 移除 console.debug
            },
            format: {
              comments: false, // 移除注释
            },
          },
          extractComments: false, // 不提取注释到单独文件
        }),
      ],
      // 启用 tree shaking
      usedExports: true,
      sideEffects: false,
    },
    // 性能提示
    performance: {
      hints: 'warning',
      maxEntrypointSize: 512000, // 512KB
      maxAssetSize: 512000, // 512KB
    },
  });
