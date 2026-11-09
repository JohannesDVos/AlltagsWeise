import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { WishInput } from '../shared/wish.js';
import { tokenDigest, verifyPassword } from './auth.js';

const month = 30 * 86400;
const schema = {
  type:'object', additionalProperties:false, required:['title'],
  properties:{
    title:{type:'string',minLength:1,maxLength:160},
    link:{type:['string','null'],maxLength:2048},
    note:{type:['string','null'],maxLength:2000},
    priceCents:{type:['integer','null'],minimum:0,maximum:999999999}
  }
};
function parseWish(body: Partial<WishInput> & {title:string}): WishInput | null {
  const title = body.title.trim();
  const link = body.link?.trim() || null;
  if (!title) return null;
  if (link) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    } catch { return null; }
  }
  return {title, link, note:body.note?.trim() || null, priceCents:body.priceCents ?? null};
}

export async function createApp(db: DatabaseSync, origin: string, plannerUrl: string, webRoot?: string, now = Date.now) {
  const app = Fastify({logger:false, bodyLimit:16384, ajv:{customOptions:{coerceTypes:false,removeAdditional:false}}});
  await app.register(cookie);
  const secure = origin.startsWith('https:');
  const cookieName = secure ? '__Host-alltagsweise' : 'alltagsweise-local';
  const cookieOptions = {path:'/', secure, httpOnly:true, sameSite:'strict' as const};
  const base = '/api/v1';
  const login = base + '/login';
  const list = base + '/wishes';
  let attempts = 0;
  let resetAt = 0;
  let checking = false;
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options','nosniff')
      .header('Referrer-Policy','no-referrer')
      .header('Content-Security-Policy',"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.origin !== origin) {
      return reply.code(403).send({message:'Diese Anfrage wurde blockiert.'});
    }
    if (!path.startsWith(base + '/') || path === login) return;
    const token = request.cookies[cookieName];
    if (!token || !db.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?').get(tokenDigest(token), now())) {
      return reply.code(401).send({message:'Bitte melde dich an.'});
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as {statusCode?:number}).statusCode;
    const status = code && code < 500 ? code : 500;
    if (status === 500) console.error('Interner Fehler bei einer Anfrage.');
    return reply.code(status).send({message:status === 500 ? 'Speichern oder Laden derzeit nicht möglich.' : 'Bitte prüfe deine Eingaben.'});
  });
  app.get('/health',async (_request,reply) => {
    db.prepare('SELECT count(*) FROM wishes').get();
    return reply.header('Cache-Control','no-store').send({status:'ok'});
  });
  app.post<{Body:{password:string}}>(login,{schema:{body:{type:'object',required:['password'],additionalProperties:false,properties:{password:{type:'string',minLength:1,maxLength:256}}}}},async (request,reply) => {
    const time = now();
    if (time >= resetAt) { attempts = 0; resetAt = time + 600000; }
    if (attempts >= 10 || checking) return reply.code(429).header('Retry-After',checking ? '1' : String(Math.ceil((resetAt-time)/1000))).send({message:'Zu viele Versuche. Bitte warte und versuche es erneut.'});
    attempts++;
    checking = true;
    try {
      const owner = db.prepare('SELECT hash FROM owner WHERE id=1').get();
      if (!await verifyPassword(request.body.password, owner?.hash as string | undefined)) {
        return reply.code(401).send({message:'Das Passwort stimmt nicht.'});
      }
      attempts = 0;
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(time);
      const old = request.cookies[cookieName];
      if (old) db.prepare('DELETE FROM sessions WHERE token=?').run(tokenDigest(old));
      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions VALUES (?,?)').run(tokenDigest(token), time + month*1000);
      return reply.setCookie(cookieName,token,{...cookieOptions,maxAge:month}).code(204).send();
    } finally { checking = false; }
  });
  app.get(base + '/session', async () => ({plannerUrl}));
  app.post(base + '/logout', async (request,reply) => {
    const token = request.cookies[cookieName];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(tokenDigest(token));
    return reply.clearCookie(cookieName,cookieOptions).code(204).send();
  });
  app.get(list,async () => db.prepare('SELECT * FROM wishes ORDER BY createdAt DESC, rowid DESC').all().map(row => ({...row,fulfilled:row.fulfilled===1})));
  app.post<{Body:WishInput}>(list,{schema:{body:schema}},async (request,reply) => {
    const wish = parseWish(request.body);
    if (!wish) return reply.code(400).send({message:'Titel und Webadresse prüfen.'});
    const id = randomUUID();
    const timestamp = new Date(now()).toISOString();
    db.prepare('INSERT INTO wishes(id,title,link,priceCents,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').run(id,wish.title,wish.link,wish.priceCents,wish.note,timestamp,timestamp);
    return reply.code(201).send({id,...wish,fulfilled:false,createdAt:timestamp,updatedAt:timestamp});
  });
  app.put<{Params:{id:string};Body:WishInput}>(list+'/:id',{schema:{body:schema}},async (request,reply) => {
    const wish = parseWish(request.body);
    if (!wish) return reply.code(400).send({message:'Titel und Webadresse prüfen.'});
    const result = db.prepare('UPDATE wishes SET title=?, link=?, priceCents=?, note=?, updatedAt=? WHERE id=?').run(wish.title,wish.link,wish.priceCents,wish.note,new Date(now()).toISOString(),request.params.id);
    return result.changes ? reply.code(204).send() : reply.code(404).send({message:'Wunsch nicht gefunden.'});
  });
  app.patch<{Params:{id:string};Body:{fulfilled:boolean}}>(list+'/:id',{schema:{body:{type:'object',required:['fulfilled'],additionalProperties:false,properties:{fulfilled:{type:'boolean'}}}}},async (request,reply) => {
    const result = db.prepare('UPDATE wishes SET fulfilled=?, updatedAt=? WHERE id=?').run(Number(request.body.fulfilled),new Date(now()).toISOString(),request.params.id);
    return result.changes ? reply.code(204).send() : reply.code(404).send({message:'Wunsch nicht gefunden.'});
  });
  app.delete<{Params:{id:string}}>(list+'/:id',async (request,reply) => {
    db.prepare('DELETE FROM wishes WHERE id=?').run(request.params.id);
    return reply.code(204).send();
  });
  if (webRoot) {
    await app.register(staticFiles,{root:webRoot});
    app.get('/wunschliste',(_,reply) => reply.sendFile('index.html',{maxAge:0}));
  }
  app.setNotFoundHandler((_request,reply) => reply.code(404).send({message:'Seite nicht gefunden.'}));
  return app;
}

