import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import replace from 'replace-in-file';
import inquirer from 'inquirer';
import semver from 'semver';
import {
  displayErrorMessage,
  displayConfirmationMessage
} from './index.mjs';

import hotPackageJson from '../../package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacePackages = hotPackageJson.workspaces.packages;

/**
 * Check if the provided version number is a valid semver version number.
 *
 * @param {string} version Version number.
 * @returns {boolean} `true` if the version number is a valid semver version number, `false` otherwise.
 */
export function isVersionValid(version) {
  return !!semver.valid(version);
}

/**
 * Check if the provided release date in a format of 'DD/MM/YYYY' is a valid future date.
 *
 * @param {string} date The date in format of 'DD/MM/YYYY'.
 * @returns {object} Object containing information about the release validity in a form of `{valid: boolean, error:
 * string}`.
 */
export function validateReleaseDate(date) {
  const dateObj = moment(date, 'DD/MM/YYYY', true);
  const now = moment();
  const returnObj = {
    valid: true,
    error: null
  };

  if (!dateObj.isValid()) {
    returnObj.valid = false;
    returnObj.error = 'The provided date is invalid.';

  } else if (!dateObj.isAfter(now)) {
    returnObj.valid = false;
    returnObj.error = 'The release date has to be a future date.';
  }

  return returnObj;
}

/**
 * Set the provided version number to the Handsontable's `package.json` and other packages' `dependency` fields.
 *
 * @param {string} version The version number.
 * @param {Array} [packages] Array of package paths. Defaults to the workspace config.
 */
export function setVersion(version, packages = workspacePackages) {
  let versionReplaced = true;

  packages.forEach((packagesLocation) => {
    const replacementStatus = replace.sync({
      files: `${packagesLocation}${packagesLocation === '.' ? '' : '*'}/package.json`,
      from: [/"version": "(.*)"/, /"handsontable": "([^\d]*)((\d+)\.(\d+).(\d+)(.*))"/g],
      to: (fullMatch, ...[semverPrefix, previousVersion]) => {
        if (fullMatch.indexOf('version') > 0) {
          // Replace the version with the new version.
          return `"version": "${version}"`;

        } else {
          const maxSatisfyingVersion = `${semver.major(semver.maxSatisfying([version, previousVersion], '*'))}.0.0`;

          // Replace the `handsontable` dependency with the current major (or previous major, if it's a prerelease).
          return `"handsontable": "${semverPrefix}${maxSatisfyingVersion}"`;
        }
      },
      ignore: [
        `${packagesLocation}*/node_modules/**/*`,
        `${packagesLocation}*/projects/hot-table/package.json`,
        `${packagesLocation}*/dist/hot-table/package.json`,
      ],
    });

    replacementStatus.forEach((infoObj) => {
      const filePath = infoObj.file.replace('./', '');

      if (!infoObj.hasChanged) {
        displayErrorMessage(`${filePath} was not modified.`);
        versionReplaced = false;

      } else {
        displayConfirmationMessage(`- Saved the new version (${version}) to ${filePath}.`);
      }
    });
  });

  if (!versionReplaced) {
    process.exit(1);
  }
}

/**
 * Set the provided release date in the `hot.config.js` file.
 *
 * @param {string} date The release date in a format of 'DD/MM/YYYY'.
 */
export function setReleaseDate(date) {
  const hotConfigPath = path.resolve(__dirname, '../../hot.config.js');
  const replacementStatus = replace.sync({
    files: hotConfigPath,
    from: /HOT_RELEASE_DATE: '(.*)'/,
    to: `HOT_RELEASE_DATE: '${date}'`,
  });
  const notModifiedFiles = [];

  replacementStatus.forEach((infoObj) => {
    const filePath = infoObj.file.replace('./', '');

    if (!infoObj.hasChanged) {
      notModifiedFiles.push(filePath);
    }
  });

  if (notModifiedFiles.length) {
    notModifiedFiles.forEach((url) => {
      displayErrorMessage(`${url} was not modified.`);
    });

    process.exit(1);

  } else {
    const rootPath = `${path.resolve(__dirname, '../..')}/`;

    displayConfirmationMessage(
      `- Saved the new date (${date}) to ${replacementStatus[0].file.replace(rootPath, '')}.`
    );
  }
}

/**
 * Get the new version from the provided release type (major/minor/patch).
 *
 * @param {string} type 'major'/'minor'/'patch'.
 * @param {string} currentVersion Current version string.
 * @returns {string} A new semver-based version.
 */
export function getVersionFromReleaseType(type, currentVersion) {
  return semver.inc(currentVersion, type);
}

/**
 * Schedule the release by setting the version number to the `package.json` files in all of the packages and release
 * date in the Handsontable config.
 *
 * @param {string} [version] Version number.
 * @param {string} [releaseDate] Release date in the `DD/MM/YYYY` format.
 */
export async function scheduleRelease(version, releaseDate) {
  const currentVersion = hotPackageJson.version;
  const questions = [
    {
      type: 'list',
      name: 'changeType',
      message: 'Select the type of the release.',
      choices: [
        'Major',
        'Minor',
        'Patch',
        'Custom',
      ],
      filter: value => value.toLowerCase(),
    },
    {
      type: 'input',
      name: 'customVersion',
      message: 'Enter the custom version number.',
      when: answers => answers.changeType === 'custom',
      validate: (value) => {
        if (!!semver.valid(value)) {
          return true;
        }

        return 'The provided version is not a proper semver version number.';
      },
    },
    {
      type: 'input',
      name: 'releaseDate',
      message: 'Enter the release date in a form of DD/MM/YYYY.',
      validate: (value) => {
        const releaseDateValidity = validateReleaseDate(value);

        if (releaseDateValidity.valid) {
          return true;
        }

        return releaseDateValidity.error;
      },
    }
  ];
  const getConfirmationQuestion = (newVersion, formattedDate) => [
    {
      type: 'confirm',
      name: 'isReleaseDateConfirmed',
      message: `

* New version: ${newVersion}
* Release date: ${formattedDate}

Are the version number and release date above correct?`,
      default: true,
    },
  ];

  // Version and release date were passed as arguments.
  if (version && releaseDate) {
    const semverBumpOptions = ['major', 'minor', 'patch'];
    const releaseDateValidity = validateReleaseDate(releaseDate);
    let newVersion = '';

    if (!releaseDateValidity.valid) {
      displayErrorMessage(releaseDateValidity.error);
      process.exit(1);
    }

    if (isVersionValid(version)) {
      newVersion = version;

    } else if (semverBumpOptions.includes(version)) {
      newVersion = semver.inc(currentVersion, version);

    } else {
      displayErrorMessage(
        `${version} is not a valid version number, nor a semver change type (major/minor/patch).`);
      process.exit(1);
    }

    if (!newVersion) {
      displayErrorMessage(`Something went wrong while updating the version number with semver.`);
      process.exit(1);
    }

    displayConfirmationMessage(
      `\nChanging the version number to ${newVersion}, to be released on ${releaseDate}. \n`
    );

    setVersion(newVersion, workspacePackages);
    setReleaseDate(releaseDate);

  } else {
    await inquirer.prompt(questions).then(async (answers) => {
      const releaseDateObj = moment(answers.releaseDate, 'DD/MM/YYYY', true);

      const newVersion =
        answers.changeType !== 'custom' ?
          getVersionFromReleaseType(answers.changeType, currentVersion) :
          answers.customVersion;

      await inquirer.prompt(
        getConfirmationQuestion(newVersion, releaseDateObj.format('DD MMMM YYYY'))
      ).then((confirmationAnswers) => {
        if (confirmationAnswers.isReleaseDateConfirmed) {
          setVersion(newVersion);
          setReleaseDate(answers.releaseDate);
        }
      });
    });
  }
}
