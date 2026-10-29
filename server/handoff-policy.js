/**
 * O sistema do Junior pausa a IA imediatamente quando humanHandoff=true.
 * Pedir PERMISSÃO para encaminhar e, ao mesmo tempo, acionar handoff=true
 * interrompe a conversa antes de o cliente poder responder.
 * Estas regras operam sobre texto público final, nunca dados de cliente.
 */
export function normalizeHandoffDecision(decision,departments){
 const handoff=decision?.humanHandoff===true&&decision?.handoff
 const department=handoff?.department
 if(!handoff||!departments.includes(department))return {handoff:null,suppressed:false}
 const reply=String(decision?.reply||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const asksPermission=/(?:\b(?:deseja|gostaria|quer|queria)\b[^?!.]{0,140}\b(?:encaminh|transfer|passar para|chamar (?:um|uma)|colocar em contato)\w*|\b(?:posso|poderia)\b[^?!.]{0,140}\b(?:encaminh|transfer|passar para)\w*)\s*\?/i.test(reply)
 // A intenção expressa na resposta ainda é perguntar, não efetuar o handoff.
 if(asksPermission)return {handoff:null,suppressed:true}
 return {handoff:decision.handoff,suppressed:false}
}
