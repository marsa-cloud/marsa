/** Parse seed-dev flags. `--user-only` seeds the operator + cookie but skips the
 *  fake sample apps (which fake DeployStatus.Succeeded — wrong for the real-deploy E2E). */
export const parseSeedDevArgs = (argv: string[]): { userOnly: boolean } => ({
  userOnly: argv.includes('--user-only'),
})
