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

// Stub out packages that are required transitively by @tensorflow packages
// but are not used at runtime (MoveNet doesn't need MediaPipe, WebGPU, or react-native-fs).
const STUBBED_MODULES = {
  'react-native-fs':              path.resolve(projectRoot, 'stubs/react-native-fs.js'),
  '@mediapipe/pose':              path.resolve(projectRoot, 'stubs/mediapipe-pose.js'),
  '@tensorflow/tfjs-backend-webgpu': path.resolve(projectRoot, 'stubs/tfjs-backend-webgpu.js'),
};

// Also stub any @mediapipe/* package not explicitly listed above.
const STUB_PREFIXES = ['@mediapipe/'];

const originalResolveRequest = config.resolver.resolveRequest;

const GENERIC_STUB = path.resolve(projectRoot, 'stubs/react-native-fs.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (forcedPackagePaths[moduleName]) {
    return { filePath: forcedPackagePaths[moduleName], type: 'sourceFile' };
  }
  if (STUBBED_MODULES[moduleName]) {
    return { filePath: STUBBED_MODULES[moduleName], type: 'sourceFile' };
  }
  if (STUB_PREFIXES.some(prefix => moduleName.startsWith(prefix))) {
    return { filePath: GENERIC_STUB, type: 'sourceFile' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
