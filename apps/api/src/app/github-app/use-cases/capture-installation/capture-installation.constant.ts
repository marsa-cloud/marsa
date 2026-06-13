/**
 * GitHub's `setup_action` value for a fresh install. The post-install redirect
 * can also carry `request` (org-approval flow); this endpoint only handles a
 * real install, so the command rejects anything else at the DTO boundary.
 */
export const INSTALL_SETUP_ACTION = 'install'
