// Metro 모노레포 설정.
// expo/metro-config 는 npm workspaces 를 자동 인식하지만, 저장소 루트의 data/ 와
// packages/core 를 감시·해석하도록 명시해 둔다.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
