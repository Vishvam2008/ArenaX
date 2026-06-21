# ROLLBACK_GUIDE

## 1) Rollback branch deployment
If the pushed branch or deployment has issues, revert to the previous stable branch.

### Reset local branch to remote main
```bash
git checkout main
git fetch origin
git reset --hard origin/main
```

### Delete the temporary cleanup branch locally
```bash
git branch -D backup/pre-push-snapshot
```

### Delete the temporary branch on GitHub if pushed
```bash
git push origin --delete backup/pre-push-snapshot
```

## 2) Rollback production deployment in Vercel
- Open the Vercel project dashboard.
- Select the production deployment history.
- Roll back to the last successful deployment.
- Confirm the old deployment is active.

## 3) Undo the last commit locally
```bash
git checkout backup/pre-push-snapshot
git reset --hard HEAD~1
```

## 4) Restore a deleted file from remote
```bash
git checkout origin/main -- <path/to/file>
```

## 5) Notes
- Always use `git status` before performing hard resets.
- Keep `backup/pre-push-snapshot` until deployment stability is confirmed.
