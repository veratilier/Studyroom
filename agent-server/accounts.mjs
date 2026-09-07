import {endpoint,seal,unseal} from './api-provider.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {resolve} from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
const reject=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const password=p=>{if(typeof p!=='string'||p.length<10||p.length>200)reject('密码需要 10–200 个字符。');return p;};
const encode=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')};
const verify=(p,stored)=>{if(typeof p!=='string'||p.length>200)return false;const [salt,key]=stored.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(key,'hex'))};
export function accounts(config){
 const db=new DatabaseSync(resolve(config.data,'accounts.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,password TEXT NOT NULL,legacy INTEGER NOT NULL DEFAULT 0); CREATE UNIQUE INDEX IF NOT EXISTS one_legacy ON accounts(legacy) WHERE legacy=1; CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,n INTEGER NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS ai_settings(account TEXT PRIMARY KEY,base_url TEXT NOT NULL,model TEXT NOT NULL,secret TEXT NOT NULL)');
 const getAI=a=>db.prepare('SELECT * FROM ai_settings WHERE account=?').get(a.id);
 const issue=a=>{const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),a.id,Date.now()+43200000);return {token,user:{id:a.id,name:a.name}}};
 const user=req=>db.prepare('SELECT a.* FROM accounts a JOIN sessions s ON s.account=a.id WHERE s.token=? AND s.expires>?').get(hash(req.headers.get('Authorization')?.replace(/^Bearer /,'')||''),Date.now());
 return {db,user,ai(a){const r=getAI(a);return r?{baseUrl:r.base_url,model:r.model,apiKey:unseal(config.secret,a.id,r.secret)}:null},async route(req){
  const path=new URL(req.url).pathname,a=user(req);
  if(path==='/account/ai'&&req.method==='GET'){if(!a)reject('请先登录。',401);const r=getAI(a);return {owner:!!a.legacy,configured:!!r,baseUrl:r?.base_url||'',model:r?.model||''}}
  if(path==='/account'&&req.method==='GET'){if(!a)reject('请先登录。',401);return {user:{id:a.id,name:a.name}}}
  if(!['/account/ai','/account/register','/account/login','/account/password','/account/logout'].includes(path)||req.method!=='POST')reject('没有这个接口。',404);
  const window=Math.floor(Date.now()/600000),key=String(window);
  db.prepare('DELETE FROM attempts WHERE key<?').run(String(window-1));
  const {n}=db.prepare('INSERT INTO attempts VALUES(?,1) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n').get(key);
  if(n>30)reject('尝试过多，请十分钟后再试。',429);
  let raw='';for await(const chunk of req.body||[]){raw+=Buffer.from(chunk).toString();if(raw.length>4096)reject('请求过大。',413)}
  let body;try{body=JSON.parse(raw||'{}')}catch{reject('请求格式不正确。')}
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  if(path==='/account/ai'){
   if(!a)reject('请先登录。',401);if(a.legacy)reject('你的账号继续使用现有 Codex 服务。',403);
   if(body.clear===true){db.prepare('DELETE FROM ai_settings WHERE account=?').run(a.id);return {ok:true}}
   const url=endpoint(body.baseUrl).href.replace(/\/chat\/completions$/,''),model=typeof body.model==='string'?body.model.trim():'';
   if(!model||model.length>200)reject('请填写模型名称。');
   const old=getAI(a),key=body.apiKey;
   if(key!==undefined&&typeof key!=='string')reject('密钥格式不正确。');
   if(key&&(key.length>4096||/[\r\n]/.test(key)))reject('密钥格式不正确。');
   if(!key&&(!old||old.base_url!==url))reject('新增连接或更换地址时请填写密钥。');
   db.prepare('INSERT INTO ai_settings VALUES(?,?,?,?) ON CONFLICT(account) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,secret=excluded.secret').run(a.id,url,model,key?seal(config.secret,a.id,key):old.secret);return {ok:true};
  }
  if(path==='/account/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.headers.get('Authorization')?.replace(/^Bearer /,'')||''));return {ok:true}}
  if(path==='/account/password'){
   if(!a)reject('请先登录。',401);if(!verify(body.currentPassword,a.password))reject('当前密码不正确。',403);
   const next=encode(password(body.password));db.exec('BEGIN');try{db.prepare('UPDATE accounts SET password=? WHERE id=?').run(next,a.id);db.prepare('DELETE FROM sessions WHERE account=?').run(a.id);const result=issue(a);db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
  }
  const name=typeof body.name==='string'?body.name.trim().toLowerCase():'';
  if(!/^[a-z0-9_-]{3,40}$/.test(name))reject('账号用 3–40 位字母、数字、下划线或短横线。');
  const found=db.prepare('SELECT * FROM accounts WHERE name=?').get(name);
  if(path==='/account/login'){if(!found||!verify(body.password,found.password))reject('账号或密码不正确。',401);return issue(found)}
  if(found)reject('这个账号已被使用。',409);
  const legacy=!!body.legacyPassword;
  if(legacy&&(hash(String(body.legacyPassword))!==hash(config.password)||db.prepare('SELECT id FROM accounts WHERE legacy=1').get()))reject('旧课件库口令不正确，或已被认领。',403);
  if(!legacy&&(!config.inviteCode||hash(String(body.inviteCode||''))!==hash(config.inviteCode)))reject('请输入维护者提供的注册邀请码。',403);
  const account={id:randomUUID(),name};db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(account.id,name,encode(password(body.password)),Number(legacy));return issue(account);
 },internalToken(){const payload=`${Date.now()+60000}.${randomUUID()}`;return payload+'.'+createHmac('sha256',config.secret).update(payload).digest('hex')}};
}
