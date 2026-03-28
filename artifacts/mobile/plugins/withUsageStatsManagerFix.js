/**
 * withUsageStatsManagerFix
 *
 * Expo config plugin that patches @brighthustle/react-native-usage-stats-manager
 * android/build.gradle before Gradle runs.
 *
 * Root cause:
 *   The library ships a `buildscript` block that hard-pins the Android Gradle
 *   Plugin (AGP) to 7.2.1.  When Gradle includes this library as a sub-project,
 *   the extra `classpath "com.android.tools.build:gradle:7.2.1"` entry is added
 *   alongside the root project's AGP 8.x, creating a classpath conflict.
 *   This causes:
 *     - "Duplicate class com.android.build.api.*" errors
 *     - "Cannot load class com.android.Version" errors
 *     - assembleRelease failures with AGP version mismatch
 *
 * Fix:
 *   Remove the `buildscript` block entirely from the library's build.gradle.
 *   Sub-projects inherit the root project's AGP automatically — they never need
 *   their own buildscript.  All other contents of the file (namespace, sdk
 *   versions, dependencies) are left untouched.
 *
 * This plugin runs during `expo prebuild`, before Gradle is invoked.  EAS Build
 * always runs prebuild before compiling, so this patch is applied on every build.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PATCH_MARKER = '// [withUsageStatsManagerFix] buildscript block removed';

/**
 * Finds and removes the `buildscript { ... }` block from a Gradle file string.
 * Uses brace counting so it handles nested blocks correctly.
 *
 * @param {string} content  - Original file content.
 * @returns {string}        - Patched content (or original if block not found).
 */
function removeBuildscriptBlock(content) {
  if (content.includes(PATCH_MARKER)) {
    return content; // already patched on a previous run
  }

  const token = 'buildscript {';
  const startIdx = content.indexOf(token);
  if (startIdx === -1) {
    return content; // nothing to remove
  }

  let depth = 0;
  let endIdx = startIdx;

  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') {
      depth += 1;
    } else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        endIdx = i + 1;
        // consume any trailing blank lines
        while (endIdx < content.length && content[endIdx] === '\n') {
          endIdx += 1;
        }
        break;
      }
    }
  }

  return (
    content.substring(0, startIdx) +
    PATCH_MARKER + '\n' +
    content.substring(endIdx)
  );
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withUsageStatsManagerFix = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const buildGradlePath = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        '@brighthustle',
        'react-native-usage-stats-manager',
        'android',
        'build.gradle',
      );

      if (!fs.existsSync(buildGradlePath)) {
        console.warn(
          '[withUsageStatsManagerFix] ' +
          'android/build.gradle not found — skipping patch. ' +
          'This is expected if the library is not installed.'
        );
        return config;
      }

      const original = fs.readFileSync(buildGradlePath, 'utf8');
      const patched  = removeBuildscriptBlock(original);

      if (patched !== original) {
        fs.writeFileSync(buildGradlePath, patched, 'utf8');
        console.log(
          '[withUsageStatsManagerFix] Patched ' +
          '@brighthustle/react-native-usage-stats-manager/android/build.gradle ' +
          '— removed conflicting buildscript block.'
        );
      } else {
        console.log(
          '[withUsageStatsManagerFix] No changes needed (already patched or block absent).'
        );
      }

      return config;
    },
  ]);
};

module.exports = withUsageStatsManagerFix;
