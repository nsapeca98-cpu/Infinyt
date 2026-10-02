const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.json');
// O ADM não aparece no site público. Para produção, defina ADMIN_PATH no Render.
const ADMIN_PATH = process.env.ADMIN_PATH || 'painel-infinity-7k4m9x';
const defaultDb = { players: [], adminHistory: [], nextPlayerId: 1 };
function loadDb(){
  if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb,null,2));
  const d=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
  if(!Array.isArray(d.players)) d.players=[]; if(!Array.isArray(d.adminHistory)) d.adminHistory=[];
  d.nextPlayerId=d.nextPlayerId||d.players.reduce((m,p)=>Math.max(m,Number(p.id)||0),0)+1; return d;
}
function saveDb(){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}
let db=loadDb(); const sessions=new Map();
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function html(res,file){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'public',file)));}
function body(req){return new Promise((ok,no)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){no(e)}});req.on('error',no)})}
function cookie(req,name){const h=req.headers.cookie||'';const m=h.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return m?decodeURIComponent(m.split('=').slice(1).join('=')):null;}
function guest(req,res){let t=cookie(req,'guest'),s=t&&sessions.get(t);if(!s||s.role!=='player'){t=crypto.randomBytes(24).toString('hex');const p={id:db.nextPlayerId++,username:`Convidado ${db.nextPlayerId-1}`,balance:0,games:0,wins:0,wagered:0,prizes:0,history:[]};db.players.push(p);saveDb();s={role:'player',id:p.id};sessions.set(t,s);res.setHeader('Set-Cookie',`guest=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`)}return s}
function admin(req){return cookie(req,'adminKey')===ADMIN_PATH;}
function safe(p){return {...p};}
function play(game,bet,choice){const r=n=>Math.floor(Math.random()*n);let result='',win=false,payout=0;
if(game==='tiger'){const a=['🐯','💎','🍀','🔔','7️⃣','⭐'][r(6)],b=['🐯','💎','🍀','🔔','7️⃣','⭐'][r(6)],c=['🐯','💎','🍀','🔔','7️⃣','⭐'][r(6)];result=`${a} ${b} ${c}`;win=a===b&&b===c;payout=bet*5}
else if(game==='number'){const n=r(5)+1;result=String(n);win=Number(choice)===n;payout=bet*4}
else if(game==='dice'){const a=r(6)+1,b=r(6)+1,sum=a+b;result=`${a} + ${b} = ${sum}`;win=choice==='high'?sum>=8:choice==='low'?sum<=6:a===b;payout=bet*2.5}
else if(game==='coin'){result=r(2)?'CARA':'COROA';win=choice===result;payout=bet*1.9}
else if(game==='color'){result=['VERMELHO','PRETO','VERDE'][r(3)];win=choice===result;payout=choice==='VERDE'?bet*12:bet*2}
else if(game==='wheel'){const n=r(10)+1;result=String(n);win=Number(choice)===n;payout=bet*8}
else if(game==='lucky7'){const n=r(100)+1;result=String(n);win=n===7;payout=bet*10}
else if(game==='mines'){const safe=r(2)===1;result=safe?'SAFE':'MINE';win=safe;payout=bet*1.8}
else if(game==='cards'){const a=r(13)+1,b=r(13)+1;result=`${a} x ${b}`;win=choice==='maior'?a>b:a<b;payout=bet*1.9}
else if(game==='cups'){const n=r(3)+1;result=String(n);win=Number(choice)===n;payout=bet*3}
return {result,win,payout:win?payout:0};}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host}`),p=u.pathname;
if(req.method==='GET'){
if(p==='/')return html(res,'player.html'); if(p===`/${ADMIN_PATH}`||p===`/${ADMIN_PATH}/`)return html(res,'admin.html');
if(p==='/health')return json(res,200,{ok:true,virtualCredits:true});
if(p==='/api/me'){const s=guest(req,res),pl=db.players.find(x=>x.id===s.id);return json(res,200,{ok:true,role:'player',player:safe(pl)})}
if(p==='/api/admin/data'){if(!admin(req))return json(res,404,{error:'Não encontrado'});return json(res,200,{players:db.players.map(safe),adminHistory:db.adminHistory,adminPath:ADMIN_PATH});}
return json(res,404,{error:'Não encontrado'});}
if(req.method==='POST'){
let b={};try{b=await body(req)}catch{return json(res,400,{error:'JSON inválido'})}
if(p==='/api/play'){const s=guest(req,res),pl=db.players.find(x=>x.id===s.id),bet=Number(b.bet);if(!pl)return json(res,404,{error:'Jogador não encontrado'});if(!Number.isFinite(bet)||bet<.10)return json(res,400,{error:'Aposta virtual mínima: R$ 0,10'});if(bet>pl.balance)return json(res,400,{error:'Saldo virtual insuficiente'});const r=play(b.game,bet,b.choice);pl.balance-=bet;pl.games++;pl.wagered+=bet;if(r.win){pl.balance+=r.payout;pl.wins++;pl.prizes+=r.payout}pl.history.unshift({date:new Date().toLocaleString('pt-BR'),game:b.game,bet,choice:b.choice,result:r.result,win:r.win,payout:r.payout});pl.history=pl.history.slice(0,100);saveDb();return json(res,200,{ok:true,balance:pl.balance,result:r.result,win:r.win,payout:r.payout})}
if(p==='/api/admin/create'){if(!admin(req))return json(res,404,{error:'Não encontrado'});const name=String(b.username||'').trim()||`Convidado ${db.nextPlayerId}`;const pl={id:db.nextPlayerId++,username:name,balance:0,games:0,wins:0,wagered:0,prizes:0,history:[]};db.players.push(pl);db.adminHistory.unshift({date:new Date().toLocaleString('pt-BR'),admin:'ADM privado',player:name,action:'criar jogador',amount:0,note:''});saveDb();return json(res,200,{ok:true,player:pl})}
if(p==='/api/admin/credit'){if(!admin(req))return json(res,404,{error:'Não encontrado'});const pl=db.players.find(x=>x.id===Number(b.id));if(!pl)return json(res,404,{error:'Jogador não encontrado'});const amt=Number(b.amount)||0,old=pl.balance;if(b.action==='add'){if(amt<.1)return json(res,400,{error:'Valor inválido'});pl.balance+=amt}else if(b.action==='remove'){if(amt<.1)return json(res,400,{error:'Valor inválido'});pl.balance=Math.max(0,pl.balance-amt)}else if(b.action==='reset')pl.balance=0;else return json(res,400,{error:'Ação inválida'});db.adminHistory.unshift({date:new Date().toLocaleString('pt-BR'),admin:'ADM privado',player:pl.username,action:b.action,amount:pl.balance-old,note:b.note||''});saveDb();return json(res,200,{ok:true,balance:pl.balance})}
if(p==='/api/admin/delete'){if(!admin(req))return json(res,404,{error:'Não encontrado'});const id=Number(b.id),pl=db.players.find(x=>x.id===id);if(!pl)return json(res,404,{error:'Jogador não encontrado'});db.players=db.players.filter(x=>x.id!==id);db.adminHistory.unshift({date:new Date().toLocaleString('pt-BR'),admin:'ADM privado',player:pl.username,action:'excluir jogador',amount:0,note:''});saveDb();return json(res,200,{ok:true})}
if(p==='/api/admin/transfer'){if(!admin(req))return json(res,404,{error:'Não encontrado'});const from=db.players.find(x=>x.id===Number(b.from)),to=db.players.find(x=>x.id===Number(b.to)),amt=Number(b.amount);if(!from||!to||from.id===to.id)return json(res,400,{error:'Jogadores inválidos'});if(!Number.isFinite(amt)||amt<.1)return json(res,400,{error:'Valor inválido'});if(from.balance<amt)return json(res,400,{error:'Saldo insuficiente'});from.balance-=amt;to.balance+=amt;db.adminHistory.unshift({date:new Date().toLocaleString('pt-BR'),admin:'ADM privado',player:`${from.username} → ${to.username}`,action:'enviar créditos',amount:amt,note:''});saveDb();return json(res,200,{ok:true})}
}
return json(res,404,{error:'Não encontrado'});});
server.listen(PORT,()=>console.log(`Site: http://localhost:${PORT} | ADM privado: /${ADMIN_PATH}`));
