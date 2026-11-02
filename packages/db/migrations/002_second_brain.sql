-- Additive Second Brain V1. Existing operational tables and audit remain intact.
CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 slug text, name text NOT NULL, normalized_name text NOT NULL, description text, summary text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('idea','active','paused','completed','archived')),
 owner_user_id uuid REFERENCES users(id), started_at timestamptz, completed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), display_name text NOT NULL,
 normalized_name text NOT NULL, first_name text, last_name text, email text, phone text, title text, organization_name text, notes text,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), name text NOT NULL,
 normalized_name text NOT NULL, domain text, description text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE capture_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), raw_text text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','processing','processed','needs_review','failed','archived')),
 captured_by_type text NOT NULL CHECK(captured_by_type IN ('user','agent')), captured_by_id uuid NOT NULL,
 source_type text NOT NULL, source_id uuid, processing_agent_id uuid REFERENCES agents(id), processing_error text,
 parsed_result jsonb, sensitive boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE brain_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 kind text NOT NULL CHECK(kind IN ('note','fact','observation','decision','preference','idea','reference')),
 title text NOT NULL, body text NOT NULL, summary text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('proposed','active','superseded','archived')),
 importance text NOT NULL DEFAULT 'normal' CHECK(importance IN ('low','normal','high','critical')),
 confidence real CHECK(confidence BETWEEN 0 AND 1), occurred_at timestamptz, valid_from timestamptz, valid_until timestamptz,
 source_type text NOT NULL, source_id uuid, created_by_type text NOT NULL CHECK(created_by_type IN ('user','agent')),
 created_by_id uuid NOT NULL, supersedes_id uuid REFERENCES brain_items(id), metadata jsonb NOT NULL DEFAULT '{}',
 sensitive boolean NOT NULL DEFAULT false, restricted_channel_ids uuid[] NOT NULL DEFAULT '{}', revision_number integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 search_vector tsvector GENERATED ALWAYS AS (
 setweight(to_tsvector('english',coalesce(title,'')),'A') || setweight(to_tsvector('english',coalesce(summary,'')),'B') || setweight(to_tsvector('english',body),'C')
 ) STORED,
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE TABLE brain_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brain_item_id uuid NOT NULL REFERENCES brain_items(id), revision_number integer NOT NULL,
 snapshot jsonb NOT NULL, changed_by_type text NOT NULL, changed_by_id uuid NOT NULL, change_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(brain_item_id,revision_number)
);
CREATE TRIGGER brain_revisions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON brain_revisions FOR EACH STATEMENT EXECUTE FUNCTION prevent_event_mutation();
CREATE FUNCTION preserve_capture_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.raw_text IS DISTINCT FROM OLD.raw_text OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.captured_by_type IS DISTINCT FROM OLD.captured_by_type OR NEW.captured_by_id IS DISTINCT FROM OLD.captured_by_id OR NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
 RAISE EXCEPTION 'Raw capture source is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER capture_source_immutable BEFORE UPDATE ON capture_inbox FOR EACH ROW EXECUTE FUNCTION preserve_capture_source();
CREATE TABLE brain_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brain_item_id uuid NOT NULL REFERENCES brain_items(id),
 target_type text NOT NULL CHECK(target_type IN ('project','person','organization','task','message','run','artifact','approval','channel')),
 target_id uuid NOT NULL, relation text NOT NULL CHECK(relation IN ('ABOUT','SOURCE','SUPPORTS','FOLLOW_UP','RESULT')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(brain_item_id,target_type,target_id,relation)
);
CREATE TABLE entity_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 from_type text NOT NULL CHECK(from_type IN ('person','organization','project','task')), from_id uuid NOT NULL,
 to_type text NOT NULL CHECK(to_type IN ('person','organization','project','task')), to_id uuid NOT NULL,
 relation text NOT NULL CHECK(relation IN ('WORKS_AT','RELATED_TO','DEPENDS_ON','FOLLOW_UP')),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,from_type,from_id,to_type,to_id,relation), CHECK(from_type<>to_type OR from_id<>to_id)
);
CREATE INDEX brain_workspace_kind_status ON brain_items(workspace_id,kind,status,created_at DESC,id);
CREATE INDEX brain_workspace_recent ON brain_items(workspace_id,created_at DESC,id);
CREATE INDEX brain_occurred ON brain_items(workspace_id,occurred_at DESC);
CREATE INDEX brain_fts ON brain_items USING gin(search_vector);
CREATE INDEX brain_links_target ON brain_links(target_type,target_id,brain_item_id);
CREATE INDEX entity_links_from ON entity_links(workspace_id,from_type,from_id);
CREATE INDEX entity_links_to ON entity_links(workspace_id,to_type,to_id);
CREATE INDEX projects_workspace ON projects(workspace_id,status,updated_at DESC);
CREATE INDEX people_workspace ON people(workspace_id,display_name);
CREATE INDEX organizations_workspace ON organizations(workspace_id,name);
CREATE INDEX project_match ON projects(workspace_id,normalized_name);
CREATE INDEX person_match ON people(workspace_id,normalized_name);
CREATE INDEX person_email_match ON people(workspace_id,lower(email)) WHERE email IS NOT NULL;
CREATE INDEX organization_match ON organizations(workspace_id,normalized_name);
CREATE INDEX organization_domain_match ON organizations(workspace_id,lower(domain)) WHERE domain IS NOT NULL;
CREATE INDEX capture_workspace_status ON capture_inbox(workspace_id,status,created_at DESC);
CREATE INDEX capture_pending ON capture_inbox(created_at) WHERE status='new' AND sensitive=false;
CREATE INDEX projects_fts ON projects USING gin(to_tsvector('english',name || ' ' || coalesce(description,'') || ' ' || coalesce(summary,'')));
CREATE INDEX people_fts ON people USING gin(to_tsvector('english',display_name || ' ' || coalesce(organization_name,'') || ' ' || coalesce(notes,'')));
CREATE INDEX organizations_fts ON organizations USING gin(to_tsvector('english',name || ' ' || coalesce(description,'')));
-- Preserve workspace boundaries. Grokbot can read and propose, but cannot write active memory.
INSERT INTO agent_permissions(agent_id,workspace_id,permission)
 SELECT DISTINCT p.agent_id,p.workspace_id,b.permission FROM agent_permissions p JOIN agents a ON a.id=p.agent_id
 CROSS JOIN (VALUES ('brain.read'),('brain.propose'),('brain.write')) b(permission)
 WHERE p.permission='workspace.read' AND p.workspace_id IS NOT NULL AND p.namespace_id IS NULL
 AND a.slug IN ('chatgpt','muse','codex','grokbot') AND (b.permission<>'brain.write' OR a.slug<>'grokbot') ON CONFLICT DO NOTHING;
