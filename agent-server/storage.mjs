import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';

export function storage(directory){
  const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});
  const db=new DatabaseSync(resolve(root,'studyroom.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS applied_migrations(name TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS agent_threads(key TEXT PRIMARY KEY,thread_id TEXT NOT NULL);');
  const migrations=new URL('../worker/migrations/',import.meta.url);
  for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
    if(db.prepare('SELECT name FROM applied_migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN');try{db.exec(readFileSync(new URL(name,migrations),'utf8'));db.prepare('INSERT INTO applied_migrations VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e;}
  }
  const statement=(query,args=[])=>({bind(...values){return statement(query,values)},
    async first(){return db.prepare(query).get(...args)||null},async all(){return {results:db.prepare(query).all(...args)}},execute(){return {meta:{changes:Number(db.prepare(query).run(...args).changes)}}},async run(){return this.execute()}});
  const objects=resolve(root,'originals');
  const location=key=>{const p=resolve(objects,key);if(!p.startsWith(objects+sep))throw Error('Invalid object key');return p;};
  return {db,DB:{prepare:statement,async batch(items){db.exec('BEGIN');try{const out=[];for(const s of items)out.push(s.execute());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}},
    FILES:{async put(key,body){const path=location(key);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,new Uint8Array(body),{mode:0o600});},async get(key){try{return {body:await readFile(location(key))}}catch(e){if(e.code==='ENOENT')return null;throw e;}},async delete(key){await unlink(location(key));}},
    getThread:key=>db.prepare('SELECT thread_id FROM agent_threads WHERE key=?').get(key)?.thread_id,
    setThread:(key,id)=>db.prepare('INSERT INTO agent_threads VALUES(?,?) ON CONFLICT(key) DO UPDATE SET thread_id=excluded.thread_id').run(key,id)
  };
}
