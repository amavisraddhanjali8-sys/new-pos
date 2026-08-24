import { Pool, PoolConfig } from 'pg';
import { 
  Product, 
  PriceHistory, 
  Branch, 
  Vehicle, 
  TransportRules, 
  SiteLocation, 
  Quotation, 
  BranchPriceOverride, 
  CustomerPriceOverride, 
  DiscountApprovalRequest, 
  Customer, 
  CompanySettings, 
  SystemUser, 
  CategoryConfig, 
  CustomerTypeConfig, 
  LocationConfig 
} from '../shared/types';

export interface FullDatabaseState {
  products: Product[];
  priceHistory: PriceHistory[];
  branches: Branch[];
  vehicles: Vehicle[];
  transportRules: TransportRules;
  locations: SiteLocation[];
  quotations: Quotation[];
  branchPrices: BranchPriceOverride[];
  customerPrices: CustomerPriceOverride[];
  discountRequests: DiscountApprovalRequest[];
  customers: Customer[];
  companySettings: CompanySettings;
  systemUsers: SystemUser[];
  categories: CategoryConfig[];
  customerTypes: CustomerTypeConfig[];
  locationConfigs: LocationConfig[];
}

export interface AwsDbConfig {
  accountId: string;
  region: string;
  resourceArn: string;
  roleArn: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  sslMode: string;
  connectionString?: string;
}

// Config retrieval with priority: innovistapos_* -> inposdbaws_* -> standard PG* -> defaults from AWS cluster
export function getAwsDbConfig(): AwsDbConfig {
  const host = process.env.innovistapos_PGHOST || process.env.inposdbaws_PGHOST || process.env.PGHOST || process.env.POSTGRES_HOST || 'innovistaposdbaws.cluster-cct88acowp78.us-east-1.rds.amazonaws.com';
  const port = parseInt(process.env.innovistapos_PGPORT || process.env.inposdbaws_PGPORT || process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10);
  const database = process.env.innovistapos_PGDATABASE || process.env.inposdbaws_PGDATABASE || process.env.PGDATABASE || process.env.POSTGRES_DATABASE || 'postgres';
  const user = process.env.innovistapos_PGUSER || process.env.inposdbaws_PGUSER || process.env.PGUSER || process.env.POSTGRES_USER || 'postgres';
  const password = process.env.innovistapos_PGPASSWORD || process.env.inposdbaws_PGPASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.AWS_RDS_PASSWORD || undefined;
  const sslMode = process.env.innovistapos_PGSSLMODE || process.env.inposdbaws_PGSSLMODE || process.env.PGSSLMODE || 'require';
  
  const accountId = process.env.innovistapos_AWS_ACCOUNT_ID || process.env.inposdbaws_AWS_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID || '041436772015';
  const region = process.env.innovistapos_AWS_REGION || process.env.inposdbaws_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
  const resourceArn = process.env.innovistapos_AWS_RESOURCE_ARN || process.env.inposdbaws_AWS_RESOURCE_ARN || process.env.AWS_RDS_RESOURCE_ARN || 'arn:aws:rds:us-east-1:041436772015:cluster:innovistaposdbaws';
  const roleArn = process.env.innovistapos_AWS_ROLE_ARN || process.env.inposdbaws_AWS_ROLE_ARN || process.env.AWS_IAM_ROLE_ARN || 'arn:aws:iam::041436772015:role/Vercel/access-innovistaposdbaws';
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  return {
    accountId,
    region,
    resourceArn,
    roleArn,
    host,
    port,
    database,
    user,
    password,
    sslMode,
    connectionString
  };
}

let pool: Pool | null = null;
let isConnected = false;
let lastError: string | null = null;
let lastSyncTime: string | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const config = getAwsDbConfig();

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.sslMode === 'disable' ? false : {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10
  };

  if (config.connectionString) {
    pool = new Pool({
      connectionString: config.connectionString,
      ssl: { rejectUnauthorized: false }
    });
  } else {
    pool = new Pool(poolConfig);
  }

  pool.on('error', (err) => {
    console.warn('[AWS RDS PostgreSQL Pool Error]:', err.message);
    isConnected = false;
    lastError = err.message;
  });

  return pool;
}

/**
 * Initialize table schema on AWS RDS PostgreSQL
 */
export async function initPostgresSchema(): Promise<boolean> {
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS innovista_app_state (
          key VARCHAR(100) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS innovista_audit_events (
          id VARCHAR(120) PRIMARY KEY,
          timestamp VARCHAR(50) NOT NULL,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          product_code VARCHAR(100),
          branch_name VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      isConnected = true;
      lastError = null;
      console.log('✅ AWS RDS PostgreSQL schema initialized successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    lastError = err.message;
    console.warn('⚠️ AWS RDS PostgreSQL connection not ready (using local disk persistence fallback):', err.message);
    return false;
  }
}

/**
 * Load full application state from AWS RDS PostgreSQL
 */
export async function loadStateFromPostgres(): Promise<FullDatabaseState | null> {
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      const res = await client.query('SELECT key, data FROM innovista_app_state');
      if (res.rows.length === 0) {
        return null;
      }

      const stateMap: Record<string, any> = {};
      for (const row of res.rows) {
        stateMap[row.key] = row.data;
      }

      isConnected = true;
      lastError = null;
      lastSyncTime = new Date().toISOString();

      return {
        products: stateMap['products'] || [],
        priceHistory: stateMap['priceHistory'] || [],
        branches: stateMap['branches'] || [],
        vehicles: stateMap['vehicles'] || [],
        transportRules: stateMap['transportRules'] || null,
        locations: stateMap['locations'] || [],
        quotations: stateMap['quotations'] || [],
        branchPrices: stateMap['branchPrices'] || [],
        customerPrices: stateMap['customerPrices'] || [],
        discountRequests: stateMap['discountRequests'] || [],
        customers: stateMap['customers'] || [],
        companySettings: stateMap['companySettings'] || null,
        systemUsers: stateMap['systemUsers'] || [],
        categories: stateMap['categories'] || [],
        customerTypes: stateMap['customerTypes'] || [],
        locationConfigs: stateMap['locationConfigs'] || []
      } as FullDatabaseState;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    lastError = err.message;
    return null;
  }
}

/**
 * Save full application state to AWS RDS PostgreSQL
 */
export async function saveStateToPostgres(state: FullDatabaseState): Promise<boolean> {
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      
      const keys = Object.keys(state) as (keyof FullDatabaseState)[];
      for (const k of keys) {
        const jsonVal = JSON.stringify(state[k]);
        await client.query(
          `INSERT INTO innovista_app_state (key, data, updated_at) 
           VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET data = $2::jsonb, updated_at = CURRENT_TIMESTAMP`,
          [k, jsonVal]
        );
      }

      await client.query('COMMIT');
      isConnected = true;
      lastError = null;
      lastSyncTime = new Date().toISOString();
      return true;
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    lastError = err.message;
    console.warn('⚠️ Could not sync to AWS RDS PostgreSQL (saved to local disk cache):', err.message);
    return false;
  }
}

/**
 * Diagnostics & status information for AWS PostgreSQL integration
 */
export async function getDatabaseDiagnostics() {
  const config = getAwsDbConfig();
  let pingMs: number | null = null;
  let serverVersion: string | null = null;
  let tableCount = 0;

  try {
    const p = getPool();
    const start = Date.now();
    const client = await p.connect();
    try {
      pingMs = Date.now() - start;
      const verRes = await client.query('SELECT version();');
      if (verRes.rows.length > 0) {
        serverVersion = verRes.rows[0].version;
      }
      const countRes = await client.query(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
      );
      if (countRes.rows.length > 0) {
        tableCount = parseInt(countRes.rows[0].count, 10);
      }
      isConnected = true;
      lastError = null;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    lastError = err.message;
  }

  return {
    provider: 'AWS RDS PostgreSQL (Aurora)',
    status: isConnected ? 'CONNECTED' : 'DISCONNECTED_FALLBACK',
    isConnected,
    lastError,
    lastSyncTime,
    pingMs,
    serverVersion,
    tableCount,
    config: {
      accountId: config.accountId,
      region: config.region,
      resourceArn: config.resourceArn,
      roleArn: config.roleArn,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      sslMode: config.sslMode,
      hasPasswordConfigured: Boolean(config.password || config.connectionString)
    }
  };
}
