const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV ? process.env.NODE_ENV : null,
  entry: path.resolve(__dirname, "src/js/app.js"),
  output: {
    filename: "app.js",
    path: path.resolve(__dirname, "dist-web")
  },
  module: {
    rules: [
      {
        test: /\.s[ac]ss$/i,
        use: [
          "style-loader",
          "css-loader",
          "sass-loader"
        ]
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: "dist-web/*"
    })
  ]
}
