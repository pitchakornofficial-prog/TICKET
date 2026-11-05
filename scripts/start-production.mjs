import { productionConfigErrors } from './check-production-env.mjs';

const errors = productionConfigErrors(process.env);
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  // Run in the same process so ECS SIGTERM reaches Next directly.
  await import('../server.js');
}
