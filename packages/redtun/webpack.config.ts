import * as path from "path";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";
import * as webpack from "webpack";

const isProduction = process.env.NODE_ENV === "production";

const config: webpack.Configuration = {
  target: "node",
  externalsPresets: {
    node: true,
  },
  externals: {
    "utf-8-validate": "commonjs utf-8-validate",
    bufferutil: "commonjs bufferutil",
  },
  entry: {
    client: "./src/index.ts",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /canvas/,
      contextRegExp: /jsdom$/,
    }),
    new webpack.IgnorePlugin({ resourceRegExp: /pty.js/, contextRegExp: /blessed\/lib\/widgets$/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /term.js/, contextRegExp: /blessed\/lib\/widgets$/ }),
  ],
  module: {
    rules: [
      {
        // Match js, jsx, ts & tsx files
        test: /\.[jt]sx?$/,
        loader: "ts-loader",
        exclude: [/node_modules/],
        options: {
          projectReferences: true,
          configFile: path.resolve(__dirname, "tsconfig.build.json"),
        },
      },
      {
        test: /\.node$/,
        loader: "node-loader",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    plugins: [new TsconfigPathsPlugin()],
  },
  optimization: {
    splitChunks: {
      chunks: "async",
      cacheGroups: {
        commons: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendors",
          chunks: "all",
        },
      },
    },
  },
};

module.exports = () => {
  if (isProduction) {
    config.mode = "production";
  } else {
    config.mode = "development";
  }
  return config;
};
