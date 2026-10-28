import {labAvailable,originMatches,sessionIsValid,passwordMatches,createSessionCookie,clearSessionCookie} from '../server/lab-auth.js'
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method==='GET')return res.status(200).json({configured:labAvailable(),authenticated:sessionIsValid(req)})
  if(req.method==='DELETE'){
    if(!originMatches(req))return res.status(403).json({error:'origin_not_allowed'})
    res.setHeader('Set-Cookie',clearSessionCookie())
    return res.status(200).json({ok:true})
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
  if(!originMatches(req))return res.status(403).json({error:'origin_not_allowed'})
  const code=req.body?.code
  if(typeof code!=='string' || code.length>200 || !passwordMatches(code))return res.status(401).json({error:'invalid_lab_access_code'})
  res.setHeader('Set-Cookie',createSessionCookie())
  return res.status(200).json({authenticated:true})
}
