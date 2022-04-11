const {
  getSidebars,
  getLatestVersion,
  parseVersion,
  parseFramework,
  getBuildDocsFramework,
  getBuildDocsVersion,
  getDocsFrameworkedVersions,
  getDocsNonFrameworkedVersions,
  isEnvDev,
} = require('../../helpers');
const { collectAllUrls, getCanonicalUrl } = require('./canonicals');

const buildMode = process.env.BUILD_MODE;
const pluginName = 'hot/extend-page-data';

const DOCS_VERSION = getBuildDocsVersion();
const DOCS_FRAMEWORK = getBuildDocsFramework();

collectAllUrls();

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const twoDigitDay = date.getDate();
  const shortMonthName = date.toLocaleString('default', { month: 'short' });

  return `${shortMonthName} ${twoDigitDay}, ${date.getFullYear()}`;
};

module.exports = (options, context) => {
  return {
    name: pluginName,

    ready() {
      context.themeConfig.sidebar = getSidebars(buildMode);
    },

    /**
     * Extends and updates a page with additional information for versioning.
     *
     * @param {object} $page The $page value 6of the page you’re currently reading.
     */
    extendPageData($page) {
      $page.DOCS_VERSION = DOCS_VERSION;
      $page.DOCS_FRAMEWORK = DOCS_FRAMEWORK;
      $page.frameworkedVersions = getDocsFrameworkedVersions(buildMode);
      $page.nonFrameworkedVersions = getDocsNonFrameworkedVersions(buildMode);
      $page.latestVersion = getLatestVersion();
      $page.currentVersion = parseVersion($page.path);
      // Framework isn't stored in PATH for full build. However, it's defined in ENV variable.
      $page.currentFramework = DOCS_FRAMEWORK || parseFramework($page.path);
      $page.lastUpdatedFormat = formatDate($page.lastUpdated);
      $page.frontmatter.canonicalUrl = getCanonicalUrl($page.frontmatter.canonicalUrl);

      if ((DOCS_VERSION || $page.currentVersion === $page.latestVersion) && $page.frontmatter.permalink) {
        $page.frontmatter.permalink = $page.frontmatter.permalink.replace(/^\/[^/]*\//, '/');
      }

      // Only dev script perform build to proper subdirectory. Full build script perform moving directory separately.
      if (isEnvDev() && $page.frontmatter.permalink &&
        getDocsFrameworkedVersions(buildMode).includes($page.currentVersion)) {
        $page.frontmatter.permalink = `/${$page.currentFramework}${$page.frontmatter.permalink}`;
      }
    },
  };
};
