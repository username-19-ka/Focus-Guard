process.env.EXPO_ROUTER_APP_ROOT = 'app';

const path = require('path');
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const forcedPackagePaths = {
  'react': require.resolve('react', { paths: [projectRoot] }),
  'react-dom': require.resolve('react-dom', { paths: [projectRoot] }),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (forcedPackagePaths[moduleName]) {
    return {
      filePath: forcedPackagePaths[moduleName],
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
