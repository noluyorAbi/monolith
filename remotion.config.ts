import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensions: [...(config.resolve?.extensions ?? []), ".ts", ".tsx"],
  },
}));
