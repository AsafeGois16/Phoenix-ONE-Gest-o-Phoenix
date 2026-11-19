import {createHash} from 'node:crypto'
import {validJuniorProtocol} from './protocol-contract.js'
// A data de ativação é uma decisão futura, não um relógio de produção.
// O namespace da prévia não colide com os UUID aleatórios das fases 2/3.
export const FIXTURE_ACTIVATION='20990102'
export function protocolBase(protocol){
 if(!validJuniorProtocol(protocol))throw Error('invalid_protocol')
 const base=protocol.slice(0,13),date=base.slice(0,8)
 const iso=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)
 const parsed=new Date(iso+'T00:00:00Z')
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw Error('invalid_protocol')
 return {base,date,derived:protocol!==base}
}
export function previewProtocolRef(base){
 const h=createHash('sha256').update('phx-orch-test-v4:'+base).digest('hex')
 return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32)
}
// Somente o adaptador confiável pode fornecer ativação e reconhecimento histórico.
// Pin da base é atômico via RPC existente; reabertura/renumeração reusa a base.
// Base derivada desconhecida é conservadoramente legada, jamais recebe modo novo por engano.
export async function resolveProtocolStrategy(store,{protocol,activationDate,knownBeforeActivation=false}){
 const {base,date,derived}=protocolBase(protocol)
 if(!/^\d{8}$/.test(activationDate||''))throw Error('invalid_activation')
 protocolBase(activationDate+'-0001')
 const ref=previewProtocolRef(base)
 const eligible=!derived&&!knownBeforeActivation&&date>=activationDate
 const pin=await store.pin(ref,eligible)
 return {...pin,protocol,base,derived,activationDate}
}
export function resolveFixtureProtocol(store,protocol){
 // Exclusivamente datas reservadas fictícias; nunca aceitar protocolos de clientes.
 if(typeof protocol!=='string'||!/^2099010[123]-\d{4}(?:-[1-9]\d*)?$/.test(protocol))throw Error('invalid_protocol')
 return resolveProtocolStrategy(store,{protocol,activationDate:FIXTURE_ACTIVATION})
}
