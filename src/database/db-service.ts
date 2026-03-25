import * as mysql from 'mysql2/promise';
import { DbConfig, QueryResult, FieldInfo } from '../types/electron';

/**
 * Database Service for MySQL connections to AzerothCore databases
 * 
 * Supports connecting to:
 * - auth database (account management)
 * - characters database (player data)
 * - world database (game data)
 */
export class DatabaseService {
  private pool: mysql.Pool | null = null;
  private _config: DbConfig | null = null;
  private _connected = false;
  private transactionConnection: mysql.PoolConnection | null = null;

  get config(): DbConfig | null {
    return this._config;
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connect to a MySQL database
   */
  async connect(config: DbConfig): Promise<{ success: boolean; message: string }> {
    try {
      this._config = config;
      
      this.pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this._connected = true;
      return { success: true, message: `Connected to ${config.database} on ${config.host}:${config.port}` };
    } catch (error) {
      this._connected = false;
      this.pool = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${errorMessage}` };
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._connected = false;
      this._config = null;
    }
  }

  /**
   * Test the database connection
   */
  async testConnection(config: DbConfig): Promise<boolean> {
    let connection: mysql.Connection | null = null;
    try {
      connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
      });
      await connection.ping();
      await connection.end();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a SELECT query and return results
   */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool || !this._connected) {
      throw new Error('Not connected to database');
    }

    try {
      const [rows, fields] = await this.pool.execute<mysql.RowDataPacket[]>(sql, params);
      
      return {
        rows: rows as T[],
        fields: fields?.map((f) => ({
          name: f.name,
          type: this.getFieldType(f.type),
          length: f.length,
          nullable: (f.flags & 1) === 0, // NOT_NULL_FLAG
        })) ?? [],
      };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   */
  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool || !this._connected) {
      throw new Error('Not connected to database');
    }

    try {
      const [result] = await this.pool.execute<mysql.ResultSetHeader>(sql, params);
      
      return {
        rows: [],
        fields: [],
        affectedRows: result.affectedRows,
        insertId: result.insertId,
      };
    } catch (error) {
      console.error('Execute error:', error);
      throw error;
    }
  }

  /**
   * Get list of all tables in the database
   */
  async getTables(): Promise<string[]> {
    if (!this.pool || !this._connected) {
      throw new Error('Not connected to database');
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SHOW TABLES'
    );
    
    const dbName = this._config?.database;
    return rows.map((row) => String(row[`Tables_in_${dbName}`] || Object.values(row)[0]));
  }

  /**
   * Get schema information for a table
   */
  async getSchema(table: string): Promise<FieldInfo[]> {
    if (!this.pool || !this._connected) {
      throw new Error('Not connected to database');
    }

    const escapedTable = this.escapeIdentifier(table);
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(`DESCRIBE ${escapedTable}`);

    return rows.map((row) => ({
      name: row.Field,
      type: row.Type,
      nullable: row.Null === 'YES',
    }));
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    if (!this.pool || !this._connected) {
      throw new Error('Not connected to database');
    }
    if (this.transactionConnection) {
      throw new Error('Transaction already in progress');
    }
    this.transactionConnection = await this.pool.getConnection();
    await this.transactionConnection.beginTransaction();
  }

  /**
   * Commit a transaction
   */
  async commit(): Promise<void> {
    if (!this.transactionConnection) {
      throw new Error('No active transaction');
    }
    try {
      await this.transactionConnection.commit();
    } finally {
      this.transactionConnection.release();
      this.transactionConnection = null;
    }
  }

  /**
   * Rollback a transaction
   */
  async rollback(): Promise<void> {
    if (!this.transactionConnection) {
      throw new Error('No active transaction');
    }
    try {
      await this.transactionConnection.rollback();
    } finally {
      this.transactionConnection.release();
      this.transactionConnection = null;
    }
  }

  /**
   * Convert MySQL field type to string representation
   */
  private getFieldType(type: number): string {
    const types: Record<number, string> = {
      [mysql.Types.DECIMAL]: 'DECIMAL',
      [mysql.Types.TINY]: 'TINYINT',
      [mysql.Types.SHORT]: 'SMALLINT',
      [mysql.Types.LONG]: 'INT',
      [mysql.Types.FLOAT]: 'FLOAT',
      [mysql.Types.DOUBLE]: 'DOUBLE',
      [mysql.Types.NULL]: 'NULL',
      [mysql.Types.TIMESTAMP]: 'TIMESTAMP',
      [mysql.Types.LONGLONG]: 'BIGINT',
      [mysql.Types.INT24]: 'MEDIUMINT',
      [mysql.Types.DATE]: 'DATE',
      [mysql.Types.TIME]: 'TIME',
      [mysql.Types.DATETIME]: 'DATETIME',
      [mysql.Types.YEAR]: 'YEAR',
      [mysql.Types.NEWDATE]: 'NEWDATE',
      [mysql.Types.VARCHAR]: 'VARCHAR',
      [mysql.Types.BIT]: 'BIT',
      [mysql.Types.JSON]: 'JSON',
      [mysql.Types.NEWDECIMAL]: 'NEWDECIMAL',
      [mysql.Types.ENUM]: 'ENUM',
      [mysql.Types.SET]: 'SET',
      [mysql.Types.TINY_BLOB]: 'TINYBLOB',
      [mysql.Types.MEDIUM_BLOB]: 'MEDIUMBLOB',
      [mysql.Types.LONG_BLOB]: 'LONGBLOB',
      [mysql.Types.BLOB]: 'BLOB',
      [mysql.Types.VAR_STRING]: 'VAR_STRING',
      [mysql.Types.STRING]: 'STRING',
      [mysql.Types.GEOMETRY]: 'GEOMETRY',
    };
    return types[type] || `UNKNOWN(${type})`;
  }

  /**
   * Escape a MySQL identifier such as a table or column name.
   */
  private escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
}

// Singleton instance
let dbService: DatabaseService | null = null;

export function getDbService(): DatabaseService {
  if (!dbService) {
    dbService = new DatabaseService();
  }
  return dbService;
}

export default DatabaseService;
