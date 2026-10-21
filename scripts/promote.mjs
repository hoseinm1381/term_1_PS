// Local server operator only. No HTTP endpoint can promote accounts.
import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const username=process.argv[2];
if(!username)throw new Error('Existing test username required');
const db=new DatabaseSync(process.env.DB_FILE||resolve(dirname(fileURLToPath(import.meta.url)),'../data/requests.sqlite'));
const result=db.prepare("UPDATE users SET role='manager' WHERE username=?").run(username);
db.close();if(result.changes!==1)throw new Error('Account not found');console.log('Existing account promoted; sign out and sign in.');
