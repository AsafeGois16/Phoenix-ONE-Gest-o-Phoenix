import {hmacSignature,secureMatch,readRaw,bridge,uuidValid,jsonResponse} from '../../server/junior-v1.js'
export const config={api:{bodyParser:false}}
const types=new Set(['ticket.assigned.v1','ticket.updated.v1','ticket.returned_to_agent.v1','ticket.resolved.v1'])
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return jsonResponse(res,405,{error:'method_not_allowed'})
 const secret=process.env.PHOENIX_ONE_WEBHOOK_SECRET
 if(!secret)return jsonResponse(res,503,{error:'webhook_not_configured'})
 const ts=String(req.headers['x-phoenix-timestamp']||'')
 const eid=String(req.headers['x-phoenix-event-id']||'')
 const signature=String(req.headers['x-phoenix-signature']||'')
 if(!/^\d{10}$/.test(ts)||!uuidValid(eid)||!/^sha256=[a-f0-9]{64}$/i.test(signature))return jsonResponse(res,401,{error:'invalid_event_headers'})
 const now=Math.floor(Date.now()/1000)
 if(Math.abs(now-Number(ts))>300)return jsonResponse(res,401,{error:'event_timestamp_outside_window'})
 try{
  const raw=await readRaw(req,65536)
  const expected=hmacSignature(ts,raw,secret)
  if(!secureMatch(signature.toLowerCase(),expected))return jsonResponse(res,401,{error:'invalid_event_signature'})
  let event
  try{event=JSON.parse(raw)}catch{return jsonResponse(res,400,{error:'invalid_json'})}
  if(!event||event.event_id!==eid||!types.has(event.event_type)||!event.ticket||typeof event.ticket!=='object')return jsonResponse(res,400,{error:'invalid_event'})
  const ticket=event.ticket
  if(!/^\d{8}-\d{4}$/.test(String(ticket.id||''))||!uuidValid(ticket.conversation_id))return jsonResponse(res,400,{error:'invalid_ticket_reference'})
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000)
  try{
   const result=await bridge('event',{event:{
      event_id:event.event_id,event_type:event.event_type,occurred_at:event.occurred_at,
      ticket:{id:ticket.id,conversation_id:ticket.conversation_id,department:ticket.department,category:ticket.category,
              agent:ticket.agent,status:ticket.status,resolution_summary:ticket.resolution_summary,assigned_to:ticket.assigned_to?.type==='user'&&typeof ticket.assigned_to.id==='string'?{type:'user',id:ticket.assigned_to.id}:null}
    }},controller.signal)
   return jsonResponse(res,200,result)
  }finally{clearTimeout(timer)}
 }catch(error){
  const code=error?.name==='AbortError'?'bridge_timeout':error?.message||'event_unavailable'
  return jsonResponse(res,error?.httpStatus===400?400:503,{error:code})
 }
}