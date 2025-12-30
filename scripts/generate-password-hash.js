#!/usr/bin/env node

import bcrypt from 'bcrypt';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node generate-password-hash.js <password>');
  process.exit(1);
}

const saltRounds = 12;
bcrypt.hash(password, saltRounds).then(hash => {
  console.log('Password Hash:');
  console.log(hash);
  console.log('\nSQL to update:');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = '<username>';`);
});
