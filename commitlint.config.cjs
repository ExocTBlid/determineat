// Commitlint — enforces Conventional Commits so semantic-release can compute
// the next version from commit prefixes:
//   fix:   -> patch (0.0.x)
//   feat:  -> minor (0.x.0)
//   feat!: or "BREAKING CHANGE:" footer -> major (x.0.0)
// Other types (chore, docs, test, refactor, ci, build, perf, style) don't
// trigger a release on their own.
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
