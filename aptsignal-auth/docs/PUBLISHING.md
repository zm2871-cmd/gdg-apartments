# Publish only AptSignal Auth

No Git repository was initialized, no remotes were changed, and nothing was pushed by the implementation.

First create an **empty** GitHub repository named `aptsignal-auth` (do not initialize a README there). Then run these commands yourself. Choose a destination folder that does not already contain another project:

```sh
mkdir -p "$HOME/Projects/aptsignal-auth"
rsync -av \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='out/' \
  --exclude='.vercel/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='coverage/' \
  --include='.env.example' \
  --exclude='.env*' \
  --exclude='*.tsbuildinfo' \
  --exclude='.DS_Store' \
  '/Users/puerto/Desktop/GDG Apartment Thing/aptsignal-auth/' \
  "$HOME/Projects/aptsignal-auth/"

cd "$HOME/Projects/aptsignal-auth"
git init -b main
git add .
git diff --cached --stat
# Review staged files and confirm no credentials, user records or generated artifacts.
git commit -m "Build standalone AptSignal Supabase authentication"
git remote add origin https://github.com/YOUR_USERNAME/aptsignal-auth.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username or organization. These commands publish the auth project only. The included `.gitignore` excludes local credentials/build/dependency files. Never use `git add -f` on `.env.local`.

Fresh clone verification:

```sh
npm ci
cp .env.example .env.local
# Add your own Supabase public settings; do not commit this file.
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```
