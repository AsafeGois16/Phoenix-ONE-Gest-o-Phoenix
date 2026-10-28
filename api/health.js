/** Health of the deployed app, NOT a live database credentialed probe.
 * No client data, keys, service status of Junior, or operational integrations are exposed. */
export default function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'})
  res.setHeader('Cache-Control','no-store')
  return res.status(200).json({
    service:'phoenix-one',version:'0.5.1',mode:'authenticated_persistent',
    database:{project:'shared_infrastructure_only',schema:'provisioned',tables:11,rls:true,pgvector:true,panelPersistence:'supabase_private_schema'},
    agents:{clara:'original_4.6_sandbox',murilo:'original_1.0_sandbox'},
    rag:{privateSearchFunction:'provisioned',embeddingProvider:'text_retrieval',documentIndex:'populated'},
    integrations:{juniorManagement:'configuration_available',crmLeads:'never_integrate',whatsappGateway:'owned_by_junior',openai:'lab_endpoint_configured'},
    ticketHandling:'junior_system_only'
  })
}
