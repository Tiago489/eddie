# Branch Protection Setup

Run these steps after pushing the CI workflow:

1. Go to: https://github.com/Tiago489/eddie/settings/branches
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable:
   - [x] Require a pull request before merging
     - Required approvals: 1 (or 0 for solo dev)
   - [x] Require status checks to pass before merging
     - Add required checks:
       - Test (1)
       - Test (2)
       - TypeScript
       - Build Web
   - [x] Require branches to be up to date before merging
   - [x] Do not allow bypassing the above settings
