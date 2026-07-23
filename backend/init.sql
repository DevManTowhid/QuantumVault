-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Clean up existing tables in correct order of dependency
DROP POLICY IF EXISTS tenant_isolation_policy ON documents;
DROP TABLE IF EXISTS document_access CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- 1. Tenants Table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content_encrypted TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Document Access (Collaborators) Table
CREATE TABLE document_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    access_level VARCHAR(50) NOT NULL
);

-- 5. Enable Row-Level Security (RLS) on Documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policy for Tenant & User Isolation
CREATE POLICY tenant_isolation_policy ON documents
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        AND (
            owner_id = current_setting('app.current_user_id', true)::uuid
            OR id IN (
                SELECT document_id FROM document_access 
                WHERE user_id = current_setting('app.current_user_id', true)::uuid
            )
        )
    );

-- ==========================================
-- 7. INSERT DUMMY TEST DATA
-- ==========================================

-- Insert Tenants
INSERT INTO tenants (id, name) VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Acme Corp'),
    ('a0000000-0000-0000-0000-000000000099', 'Global Industries');

-- Insert Users (Replaced 'u' with 'b' to be valid hex)
INSERT INTO users (id, tenant_id, email, full_name) VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'alice@acme.com', 'Alice Owner'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'bob@acme.com', 'Bob Collaborator'),
    ('b0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', 'charlie@global.com', 'Charlie Rival');

-- Insert Documents
INSERT INTO documents (id, tenant_id, owner_id, title, content_encrypted, encryption_iv, is_deleted) VALUES 
    (
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'Secret Architecture Blueprint',
        'encrypted_payload_string_abc123',
        'iv_bytes_hex_789',
        FALSE
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'Project Roadmap Q3',
        'encrypted_payload_roadmap_999',
        'iv_bytes_hex_456',
        FALSE
    ),
    (
        'd0000000-0000-0000-0000-000000000003',
        'a0000000-0000-0000-0000-000000000099',
        'b0000000-0000-0000-0000-000000000099',
        'Competitor Secret Plans',
        'encrypted_payload_forbidden_000',
        'iv_bytes_hex_111',
        FALSE
    );

-- Insert Document Access (Collaborators)
INSERT INTO document_access (id, document_id, user_id, access_level) VALUES 
    (
        'f0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000002',
        'editor'
    );