import { hashPassword } from '../src/lib/auth/password';
import * as readline from 'node:readline';

async function main() {
  const arg = process.argv[2];
  if (arg) {
    const hash = await hashPassword(arg);
    console.log('\nGenerated APP_PASSWORD_HASH:');
    console.log(hash);
    console.log('\nAdd this to your .env file:');
    console.log(`APP_PASSWORD_HASH=${hash}\n`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter password to hash: ', async (answer) => {
    rl.close();
    if (!answer || answer.trim() === '') {
      console.error('Password cannot be empty.');
      process.exit(1);
    }
    const hash = await hashPassword(answer.trim());
    console.log('\nGenerated APP_PASSWORD_HASH:');
    console.log(hash);
    console.log('\nAdd this to your .env file:');
    console.log(`APP_PASSWORD_HASH=${hash}\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
