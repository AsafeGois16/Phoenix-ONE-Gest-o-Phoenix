import {randomUUID} from 'node:crypto'
import {isolatedConfig,isolatedClient,authorizedAdmin,centralStore,uuidOk} from '../server/orchestration-central-store.js'
import {resolveFixtureProtocol} from '../server/orchestration-protocol-strategy.js'
import {runOrchestrationPreview} from './v1/conversations/respond.js'

export const config={maxDuration:15}
function send(res,status,payload){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 return res.status(status).json(payload)
}
function validHistory(messages){
 return Array.isArray(messages)&&messages.length>=1&&messages.length<=20&&
  messages.every(m=>m&&typeof m.text==='string'&&m.text.length>=1&&m.text.length<=500&&
   ((m.direction==='inbound'&&m.author==='contact')||(m.direction==='outbound'&&m.author==='agent')))&&
  messages.at(-1).direction==='inbound'
}
export default async function handler(req,res){
 if(process.env.VERCEL_GIT_COMMIT_REF==='feat/orquestracao-agentes-fase5-joint')return res.status(503).json({error:'joint_environment_not_ready'})
 // Never enabled on production, main, or an unconfigured preview.
 const cfg=isolatedConfig(process.env)
 if(!cfg)return send(res,503,{error:'isolated_environment_not_configured'})
 if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'})
 try{
  const connection=isolatedClient(process.env,req.headers.authorization)
  if(!connection)return send(res,401,{error:'unauthorized'})
  const actor=await authorizedAdmin(connection.client,req.headers.authorization)
  if(!actor)return send(res,401,{error:'unauthorized'})
  const store=centralStore(connection.client),body=req.body||{}
  if(body.action==='get')return send(res,200,await store.get())
  if(body.action==='set'){
   const row=await store.set(body.mode,body.expectedRevision,actor)
   return send(res,row.conflict?409:200,row)
  }
  if(body.action==='new_protocol')return send(res,200,await store.pin(randomUUID(),true))
  if(body.action==='resolve_fixture')return send(res,200,await resolveFixtureProtocol(store,body.fixtureProtocol))
  if(body.action==='decide'){
   if((!body.fixtureProtocol&&!uuidOk(body.protocolRef))||!validHistory(body.messages))return send(res,400,{error:'invalid_simulation'})
   // No client-supplied mode, revision, map, stage, real protocol or contact.
   // Data are fictitious; no message is stored. Unknown IDs get legacy default.
   const pin=body.fixtureProtocol?await resolveFixtureProtocol(store,body.fixtureProtocol):await store.pin(body.protocolRef,false)
   // Adaptador de teste: os identificadores e o modo operacional são sintéticos.
   // O handler usa exatamente os guardas determinísticos, sem consultar o Junior.
   const fixture={conversation_id:pin.protocol_ref,protocolo:pin.protocol||'20990101-0001',mode:'sugestao',
    contact:{kind:'lead'},messages:body.messages.map(m=>({direction:m.direction,author:m.author,type:'texto',text:m.text}))}
   let status=500,result=null
   const capture={setHeader(){},status(n){status=n;return this},json(value){result=value;return value}}
   await runOrchestrationPreview(fixture,pin,capture)
   if(status!==200||!result)return send(res,status,{error:result?.error||'engine_preview_failed'})
   return send(res,200,{pin,decision:{...result,humanHandoff:false,handoff:null,executed:false},previewOnly:true})
  }
  return send(res,400,{error:'invalid_action'})
 }catch(e){
  const clientErrors=['invalid_configuration','invalid_protocol']
  return send(res,clientErrors.includes(e?.message)?400:503,{error:clientErrors.includes(e?.message)?e.message:'central_store_unavailable'})
 }
}
