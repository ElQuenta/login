// Runs only when the persistent MongoDB volume is first initialized.
// Mongoose owns the User schema and the unique email index.
const authDb = db.getSiblingDB('auth_db');
if (!authDb.getCollectionNames().includes('users')) {
  authDb.createCollection('users');
}
