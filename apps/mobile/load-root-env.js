// Expo CLI only loads .env files from apps/mobile. The monorepo keeps its env
// in the repo root (see /.env.example), so load those too — with lower
// precedence: the shell environment and apps/mobile/.env* always win, and
// .env.local wins over .env. Required from app.config.ts and metro.config.js so
// EXPO_PUBLIC_* values are in process.env before Metro inlines them.
const path = require('node:path');
const dotenv = require('dotenv');

const workspaceRoot = path.resolve(__dirname, '../..');

dotenv.config({
  path: [path.join(workspaceRoot, '.env.local'), path.join(workspaceRoot, '.env')],
  quiet: true,
});
