/* eslint-disable import/no-extraneous-dependencies */
const webpack = require('webpack');
const path = require('path');
const env = require('./env');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { compact } = require('lodash');
const autoprefixer = require('autoprefixer');
const { GenerateSW } = require('workbox-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const pkg = require('./package.json');

const BUILD_PATH = path.resolve(__dirname, process.env.BUILD_PATH || 'build');

const prod = p => (env.isProd ? p : null);
const hot = p => (env.isHot ? p : null);

// css-loader configured to keep CommonJS-style `const x = require('./style.scss')`
// returning the locals object directly (esModule: false) for the existing source.
const cssModuleLoader = {
  loader: 'css-loader',
  options: {
    esModule: false,
    modules: {
      namedExport: false,
      exportLocalsConvention: 'asIs',
      localIdentName: '[name]_[local]_[hash:base64:5]',
    },
  },
};

const cssGlobalLoader = {
  loader: 'css-loader',
  options: { esModule: false },
};

const postcssLoader = {
  loader: 'postcss-loader',
  options: {
    postcssOptions: {
      plugins: [autoprefixer],
    },
  },
};

const sassLoader = {
  loader: 'sass-loader',
  options: {
    sourceMap: true,
    sassOptions: {
      // Resolve project-absolute imports like `@import 'src/_theme.scss'`.
      loadPaths: [__dirname],
      // Legacy stylesheets (and office-ui-fabric-core) still use `@import` and
      // global built-in functions; silence the Dart Sass 3 deprecation noise.
      silenceDeprecations: ['import', 'global-builtin'],
    },
  },
};

const localCSSLoaders = ['style-loader', cssModuleLoader, postcssLoader];
const globalCSSLoaders = ['style-loader', cssGlobalLoader, postcssLoader];

const excludedPatterns = compact([
  /node_modules/,
  prod(/\.test\.tsx?$/),
  prod(/\.test\.jsx?$/),
]);

const buildPath = env.isProd ? '' : '/';

const config = {
  mode: env.isProd ? 'production' : 'development',

  bail: env.isProd || env.isTest,

  devtool: env.isDev ? 'eval-cheap-module-source-map' : 'source-map',

  entry: {
    bundle: compact([
      hot('webpack-hot-middleware/client'),
      path.resolve(__dirname, './src/index.tsx'),
    ]),
  },

  performance: false,

  output: {
    path: BUILD_PATH,
    filename: env.isProd ? '[name]_[chunkhash].js' : '[name]_[fullhash].js',
    publicPath: buildPath,
    globalObject: 'self',
  },

  resolve: {
    extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js'],
    modules: [path.join(__dirname, 'src'), 'node_modules'],
    // Webpack 5 no longer polyfills Node core modules. The browser bundle does
    // not use them (jszip references its Node stream adapters but the app only
    // uses the browser Blob path), so stub them out.
    fallback: {
      fs: false,
      path: false,
      crypto: false,
      stream: false,
      util: false,
    },
  },

  module: {
    rules: compact([
      {
        test: /\.tsx?$/,
        exclude: excludedPatterns,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // Phase 1: build only. Strict type-checking is handled separately
              // via `npm run tsc` (Phase 2). transpileOnly keeps the legacy
              // TS 2.1-era source compiling under TypeScript 5.
              transpileOnly: true,
              compilerOptions: {
                module: 'esnext',
              },
            },
          },
        ],
      },
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.css$/,
        use: localCSSLoaders,
      },
      {
        test: /\.scss$/,
        include: [
          path.resolve(__dirname, 'src/components'),
          path.resolve(__dirname, 'src/transitions'),
        ],
        use: [...localCSSLoaders, sassLoader],
      },
      {
        test: /\.scss$/,
        include: [path.resolve(__dirname, 'src/layout')],
        use: [...globalCSSLoaders, sassLoader],
      },
      {
        test: /\.html$/,
        use: ['html-loader'],
      },
    ]),
  },

  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        lib: {
          test: /[\\/]node_modules[\\/]/,
          name: 'lib',
          priority: -10,
        },
        common: {
          name: 'common',
          minChunks: 2,
          minSize: 100000,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },

  plugins: compact([
    hot(new webpack.HotModuleReplacementPlugin()),
    // Keep *.test.* files out of dynamic require/import contexts (analyses,
    // locales) so test-only deps like `expect` never enter the app bundle.
    // Matches both explicit paths (`foo.test.ts`) and the extensionless
    // requests webpack generates inside require/import contexts (`./foo.test`).
    new webpack.IgnorePlugin({ resourceRegExp: /\.test(\.[jt]sx?)?$/ }),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.resolve(__dirname, 'src/index.html'),
      inject: 'body',
      minify: env.isProd
        ? {
            html5: true,
            collapseBooleanAttributes: true,
            collapseInlineTagWhitespace: true,
            collapseWhitespace: true,
          }
        : false,
    }),
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIMESTAMP__: JSON.stringify(Date.now()),
      __DEBUG__: JSON.stringify(env.isDev),
      'process.env.ENVIRONMENT': JSON.stringify('BROWSER'),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      isBrowser: true,
      isHot: JSON.stringify(env.isHot),
    }),
    // svgo config preserved from the legacy build for inline svg-react usage.
    new webpack.LoaderOptionsPlugin({
      options: {
        svgoConfig: {
          plugins: [
            { removeXMLNS: true },
            { cleanupIDs: false },
            { convertShapeToPath: false },
            { removeEmptyContainers: false },
            { removeViewBox: false },
            { mergePaths: false },
            { convertStyleToAttrs: false },
            { convertPathData: false },
            { convertTransform: false },
            { removeUnknownsAndDefaults: false },
            { collapseGroups: false },
            { moveGroupAttrsToElems: false },
            { moveElemsAttrsToGroup: false },
            { cleanUpEnableBackground: false },
            { removeHiddenElems: false },
            { removeNonInheritableGroupAttrs: false },
            { removeUselessStrokeAndFill: false },
            { transformsWithOnePath: false },
          ],
        },
      },
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/assets/icons', to: 'icons' },
        { from: 'src/manifest.json', to: 'manifest.json' },
      ],
    }),
    // Replaces serviceworker-webpack-plugin + sw-toolbox. GenerateSW precaches
    // the build output and serves navigations cache-first, mirroring the old
    // `toolbox.precache(...)` + `toolbox.router.get('/*', cacheFirst)` behaviour.
    prod(
      new GenerateSW({
        swDest: 'service-worker.js',
        clientsClaim: true,
        skipWaiting: false,
        // Large on-demand assets (e.g. the onnxruntime WASM) are not precached;
        // they are runtime-cached by the CacheFirst route when first fetched.
        exclude: [/\.wasm$/, /\.map$/],
        runtimeCaching: [
          {
            urlPattern: /.*/,
            handler: 'CacheFirst',
          },
        ],
      })
    ),
  ]),
};

module.exports = config;
