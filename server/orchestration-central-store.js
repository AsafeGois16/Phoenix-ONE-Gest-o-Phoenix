import {createClient} from '@supabase/supabase-js'
import {MODES} from './orchestration-preview.js'

const PRODUCTION_REF='cxyxrhmpjehrqhwihxul'
const BRANCH='feat/orquestracao-agentes-fase2-preview'
export const uuidOk=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
export function isolatedConfig(env){
 const ref=env.PHX_ORCH_TEST_REF
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BRANCH||env.PHX_ORCH_TEST_ENABLED!=='true'||
    typeof ref!=='string'||!/^[a-z0-9]{20}$/.test(ref)||ref===PRODUCTION_REF||!env.PHX_ORCH_TEST_SERVICE_ROLE_KEY)
  return null
 const admins=String(env.PHX_ORCH_TEST_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(uuidOk)
 if(!admins.length)return null
 return {url:'https://'+ref+'.supabase.co',key:env.PHX_ORCH_TEST_SERVICE_ROLE_KEY,admins}
}
export function isolatedClient(env=process.env){
 const cfg=isolatedConfig(env)
 if(!cfg)return null
 return {cfg,client:createClient(cfg.url,cfg.key,{auth:{persistSession:false,autoRefreshToken:false}})}
}
export async function authorizedAdmin(client,admins,authorization){
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return null
 const {data,error}=await client.auth.getUser(authorization.slice(7))
 return !error&&uuidOk(data?.user?.id)&&admins.includes(data.user.id)?data.user.id:null
}
function validConfig(row){
 return row&&Object.values(MODES).includes(row.mode)&&Number.isSafeInteger(row.revision)&&row.revision>=1
}
export function centralStore(client){
 const rpc=async(name,args)=>{
  const {data,error}=await client.rpc(name,args)
  if(error||!validConfig(data))throw Error('central_store_unavailable')
  return data
 }
 return {
  get:()=>rpc('phx_orch_test_get',{}),
  set:(mode,revision,actor)=>{
   if(!Object.values(MODES).includes(mode)||!Number.isSafeInteger(revision)||revision<1||!uuidOk(actor))throw Error('invalid_configuration')
   return rpc('phx_orch_test_set',{p_mode:mode,p_expected_revision:revision,p_actor:actor})
  },
  pin:async(ref,isNew)=>{
   if(!uuidOk(ref)||typeof isNew!=='boolean')throw Error('invalid_protocol')
   const row=await rpc('phx_orch_test_pin',{p_protocol_ref:ref,p_new_protocol:isNew})
   if(row.protocol_ref!==ref)throw Error('invalid_protocol_pin')
   return row
  }
 }
}
