// Server operator only. This creates a coherent local snapshot, not off-site backup.
import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {mkdirSync,chmodSync,existsSync} from 'node:fs';
const source=process.env.DB_FILE;
if(!source||!existsSync(source))throw new Error('Existing DB_FILE required');
const folder=resolve(dirname(source),'backups');mkdirSync(folder,{recursive:true,mode:0o700});
const target=resolve(folder,'snapshot-'+Date.now()+'.sqlite');
const db=new DatabaseSync(source);db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");db.close();chmodSync(target,0o600);
console.log('Consistent private snapshot created. Keep an independent private copy before any destructive operation.');
