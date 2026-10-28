/** Health of the deployed app, NOT a live database credentialed probe.
 * No client data, keys, service status of Junior, or operational integrations are exposed. */
export default function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'})
  res.setHeader('Cache-Control','no-store')
  return res.status(200).json({
    service:'phoenix-one',version:'0.2.0',mode:'demo_ui',
    database:{project:'shared_infrastructure_only',schema:'provisioned',tables:11,rls:true,pgvector:true,panelPersistence:'local_browser_only'},
    agents:{clara:'draft',murilo:'draft'},
    rag:{privateSearchFunction:'provisioned',embeddingProvider:'not_configured',documentIndex:'empty'},
    integrations:{juniorManagement:'disabled',crmLeads:'never_integrate',whatsappGateway:'owned_by_junior',openai:'not_configured'},
    ticketHandling:'junior_system_only'
  })
}
