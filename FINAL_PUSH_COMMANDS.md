# FINAL_PUSH_COMMANDS

## Current branch
- `backup/pre-push-snapshot`

## Verify branch and working tree
```bash
git status --short
git branch --show-current
```

## Stage only deployment preparation files
```bash
git add .gitignore vercel.json frontend/package.json REPO_CLEANUP_REPORT.md PRE_PUSH_CHECKLIST.md PRODUCTION_DEPLOYMENT_NOTES.md PUSH_READY_REPORT.md FINAL_PUSH_COMMANDS.md FINAL_VERCEL_SETUP.md ROLLBACK_GUIDE.md
```

## Commit deployment preparation files
```bash
git commit -m "chore: add final deployment and rollback documentation"
```

## Push branch to GitHub
```bash
git push origin backup/pre-push-snapshot
```

## Merge into `main` after review
```bash
git checkout main
git pull origin main
git merge backup/pre-push-snapshot
git push origin main
```

## Optional: create a production-ready branch
```bash
git checkout -b production-ready
git push origin production-ready
```

## Notes
- Review any modified source files before performing the merge.
- Replace `YOUR_BACKEND_URL` in `vercel.json` before pushing if you want deployment-ready configuration.
