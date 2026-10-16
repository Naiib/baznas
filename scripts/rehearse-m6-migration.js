import { runM6Rehearsal } from './rehearse-m6-logical-restore.js';

try {
  await runM6Rehearsal();
} catch (error) {
  console.error('Rehearsal failed:', error);
  process.exitCode = 1;
}
