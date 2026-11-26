-- GitHub's MCP row is retired. The coding agent's GitHub App is now the single
-- door to a member's repositories: its installation token is short-lived,
-- repo-scoped and revocable, and it works from accounts the hosted MCP gateway
-- refuses with "forbidden: access denied". No sync recreates the row because it
-- is no longer in `CURATED_SERVERS`.
--
-- Existing GitHub MCP connections cannot work and would only advertise a dead
-- door in the apps list, so they are revoked with a sentence that points at the
-- replacement. Their stored credentials are left untouched: the row is the
-- member's to delete, and revocation must not destroy data it may still read.

update public.mcp_catalog_servers
   set status = 'deleted',
       fetched_at = now()
 where registry_name = 'com.github/mcp';

update public.mcp_connections
   set status = 'revoked',
       last_error = 'GitHub متاح الآن عبر المساعد المبرمج فقط.'
 where registry_name = 'com.github/mcp'
   and status <> 'revoked';
