import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2';
import * as path from 'path';
import { LogMonitorConfig, LogMonitorInspectionResult, LogMonitorAppenderInfo, LogMonitorFileInfo, LogMonitorFileTailResult, LogMonitorLoggerInfo } from './types/electron';

const LOG_LEVEL_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Fatal',
  2: 'Error',
  3: 'Warning',
  4: 'Info',
  5: 'Debug',
  6: 'Trace',
};

const APPENDER_TYPE_LABELS: Record<number, LogMonitorAppenderInfo['type']> = {
  0: 'none',
  1: 'console',
  2: 'file',
  3: 'db',
};

interface RemoteStats {
  size?: number;
  mtime?: number;
  isFile(): boolean;
  isDirectory(): boolean;
}

interface RemoteDirEntry {
  filename: string;
  longname: string;
  attrs: RemoteStats;
}

function normalizeRemotePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  return path.posix.normalize(normalized || '.');
}

function stripQuotes(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function splitCsvRespectingQuotes(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if ((char === '"' || char === "'") && (!inQuotes || quoteChar === char)) {
      if (inQuotes && quoteChar === char) {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
      current += char;
      continue;
    }

    if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current.trim());
  return parts;
}

function parseWorldserverConfig(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9._-]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    values.set(match[1], match[2].trim());
  }

  return values;
}

function levelLabel(level: number): string {
  return LOG_LEVEL_LABELS[level] ?? `Level ${level}`;
}

function resolveBaseDirectory(configPath: string): string {
  const normalizedPath = normalizeRemotePath(configPath);
  const directory = path.posix.dirname(normalizedPath);
  return directory === '.' ? '/' : directory;
}

function resolveLogsDirectory(configPath: string, logsDir: string | null): string {
  const configDirectory = resolveBaseDirectory(configPath);
  if (!logsDir) {
    return configDirectory;
  }

  const normalizedLogsDir = normalizeRemotePath(logsDir);
  if (normalizedLogsDir.startsWith('/')) {
    return normalizedLogsDir;
  }

  return normalizeRemotePath(path.posix.join(configDirectory, normalizedLogsDir));
}

function resolveLogFilePath(configPath: string, logsDir: string | null, fileName: string | null): string | null {
  if (!fileName) return null;

  const cleanedFile = stripQuotes(fileName);
  if (!cleanedFile) return null;

  const normalizedFile = normalizeRemotePath(cleanedFile);
  if (normalizedFile.startsWith('/')) {
    return normalizedFile;
  }

  return normalizeRemotePath(path.posix.join(resolveLogsDirectory(configPath, logsDir), normalizedFile));
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/%s/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function buildConnectConfig(config: LogMonitorConfig): ConnectConfig {
  return {
    host: config.host.trim(),
    port: Number(config.port),
    username: config.username.trim(),
    password: config.password,
    readyTimeout: 20_000,
    tryKeyboard: false,
  };
}

function connectClient(config: LogMonitorConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;

    client.on('ready', () => {
      settled = true;
      resolve(client);
    });

    client.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    client.connect(buildConnectConfig(config));
  });
}

function getSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error || !sftp) {
        reject(error ?? new Error('Unable to open SFTP session.'));
        return;
      }

      resolve(sftp);
    });
  });
}

function statRemotePath(sftp: SFTPWrapper, remotePath: string): Promise<RemoteStats> {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (error, stats) => {
      if (error || !stats) {
        reject(error ?? new Error(`Unable to stat ${remotePath}`));
        return;
      }

      resolve(stats as RemoteStats);
    });
  });
}

function readDirectory(sftp: SFTPWrapper, remotePath: string): Promise<RemoteDirEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (error, entries) => {
      if (error || !entries) {
        reject(error ?? new Error(`Unable to read directory ${remotePath}`));
        return;
      }

      resolve(entries as unknown as RemoteDirEntry[]);
    });
  });
}

function openFile(sftp: SFTPWrapper, remotePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.open(remotePath, 'r', (error, handle) => {
      if (error || !handle) {
        reject(error ?? new Error(`Unable to open ${remotePath}`));
        return;
      }

      resolve(handle);
    });
  });
}

function closeFile(sftp: SFTPWrapper, handle: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.close(handle, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function readChunk(sftp: SFTPWrapper, handle: Buffer, buffer: Buffer, offset: number, length: number, position: number): Promise<number> {
  return new Promise((resolve, reject) => {
    sftp.read(handle, buffer, offset, length, position, (error, bytesRead) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(bytesRead);
    });
  });
}

async function readFileRange(sftp: SFTPWrapper, remotePath: string, start: number, length: number): Promise<Buffer> {
  const handle = await openFile(sftp, remotePath);
  try {
    const chunks: Buffer[] = [];
    let position = start;
    let remaining = length;

    while (remaining > 0) {
      const chunkSize = Math.min(remaining, 64 * 1024);
      const buffer = Buffer.alloc(chunkSize);
      const bytesRead = await readChunk(sftp, handle, buffer, 0, chunkSize, position);
      if (bytesRead <= 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      remaining -= bytesRead;
      position += bytesRead;
    }

    return Buffer.concat(chunks);
  } finally {
    await closeFile(sftp, handle);
  }
}

async function readUtf8File(sftp: SFTPWrapper, remotePath: string): Promise<string> {
  const stats = await statRemotePath(sftp, remotePath);
  const byteLength = Math.min(Math.max(Number(stats.size || 0), 0), 2 * 1024 * 1024);
  const buffer = await readFileRange(sftp, remotePath, 0, byteLength);
  return buffer.toString('utf8');
}

async function canReadFile(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  try {
    const handle = await openFile(sftp, remotePath);
    await closeFile(sftp, handle);
    return true;
  } catch {
    return false;
  }
}

async function withSftp<T>(config: LogMonitorConfig, callback: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
  const client = await connectClient(config);
  try {
    const sftp = await getSftp(client);
    return await callback(sftp);
  } finally {
    client.end();
  }
}

export async function inspectRemoteLogs(config: LogMonitorConfig): Promise<LogMonitorInspectionResult> {
  return withSftp(config, async (sftp) => {
    const normalizedConfigPath = normalizeRemotePath(config.worldserverConfigPath);
    const warnings: string[] = [];
    const configText = await readUtf8File(sftp, normalizedConfigPath);
    const configValues = parseWorldserverConfig(configText);
    const logsDirValue = stripQuotes(configValues.get('LogsDir')) || null;
    const packetLogFileValue = stripQuotes(configValues.get('PacketLogFile')) || null;
    const resolvedLogsDir = resolveLogsDirectory(normalizedConfigPath, logsDirValue);

    const appenders: LogMonitorAppenderInfo[] = [];
    for (const [key, rawValue] of configValues.entries()) {
      if (!key.startsWith('Appender.')) continue;

      const name = key.slice('Appender.'.length);
      const parts = splitCsvRespectingQuotes(rawValue);
      const typeId = Number(parts[0] || 0);
      const logLevel = Number(parts[1] || 0);
      const flags = Number(parts[2] || 0);
      const fileName = typeId === 2 ? stripQuotes(parts[3]) || null : null;
      const resolvedPath = typeId === 2 ? resolveLogFilePath(normalizedConfigPath, logsDirValue, fileName) : null;

      appenders.push({
        name,
        type: APPENDER_TYPE_LABELS[typeId] ?? 'none',
        typeId,
        logLevel,
        logLevelLabel: levelLabel(logLevel),
        flags,
        optionalValues: parts.slice(3).map(stripQuotes),
        fileName,
        mode: typeId === 2 ? stripQuotes(parts[4]) || null : null,
        maxFileSize: typeId === 2 && parts[5] ? Number(parts[5]) || null : null,
        resolvedPath,
        isDynamicFile: Boolean(fileName && fileName.includes('%s')),
      });
    }

    const appendersByName = new Map(appenders.map((appender) => [appender.name, appender]));

    const loggers: LogMonitorLoggerInfo[] = [];
    for (const [key, rawValue] of configValues.entries()) {
      if (!key.startsWith('Logger.')) continue;

      const name = key.slice('Logger.'.length);
      const splitIndex = rawValue.indexOf(',');
      const levelPart = splitIndex >= 0 ? rawValue.slice(0, splitIndex).trim() : rawValue.trim();
      const appenderList = splitIndex >= 0 ? rawValue.slice(splitIndex + 1).trim() : '';
      const logLevel = Number(levelPart || 0);
      const appenderNames = appenderList ? appenderList.split(/\s+/).filter(Boolean) : [];
      const resolvedFiles = [...new Set(appenderNames
        .map((appenderName) => appendersByName.get(appenderName)?.resolvedPath)
        .filter((resolvedPath): resolvedPath is string => Boolean(resolvedPath)))];

      loggers.push({
        name,
        logLevel,
        logLevelLabel: levelLabel(logLevel),
        appenderNames,
        resolvedFiles,
      });
    }

    const filesByPath = new Map<string, LogMonitorFileInfo>();
    const pushFile = (file: LogMonitorFileInfo): void => {
      const existing = filesByPath.get(file.path);
      if (existing) {
        existing.sourceHints = [...new Set([...existing.sourceHints, ...file.sourceHints])];
        existing.matchedAppenderNames = [...new Set([...existing.matchedAppenderNames, ...file.matchedAppenderNames])];
        if (existing.size === null && file.size !== null) existing.size = file.size;
        if (!existing.modifiedAt && file.modifiedAt) existing.modifiedAt = file.modifiedAt;
        existing.readable = existing.readable || file.readable;
        return;
      }

      filesByPath.set(file.path, file);
    };

    let directoryEntries: RemoteDirEntry[] = [];
    try {
      directoryEntries = await readDirectory(sftp, resolvedLogsDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not read logs directory ${resolvedLogsDir}: ${message}`);
    }

    for (const entry of directoryEntries) {
      if (!entry.attrs.isFile()) continue;
      const remotePath = normalizeRemotePath(path.posix.join(resolvedLogsDir, entry.filename));
      pushFile({
        path: remotePath,
        name: entry.filename,
        size: typeof entry.attrs.size === 'number' ? entry.attrs.size : null,
        modifiedAt: typeof entry.attrs.mtime === 'number' ? new Date(entry.attrs.mtime * 1000).toISOString() : null,
        readable: true,
        sourceHints: ['logs-dir'],
        matchedAppenderNames: [],
      });
    }

    const explicitFiles = new Map<string, string[]>();
    for (const appender of appenders) {
      if (!appender.resolvedPath) continue;
      const current = explicitFiles.get(appender.resolvedPath) ?? [];
      current.push(appender.name);
      explicitFiles.set(appender.resolvedPath, current);
    }

    const packetLogPath = resolveLogFilePath(normalizedConfigPath, logsDirValue, packetLogFileValue);
    if (packetLogPath) {
      const current = explicitFiles.get(packetLogPath) ?? [];
      current.push('PacketLogFile');
      explicitFiles.set(packetLogPath, current);
    }

    for (const [filePath, sources] of explicitFiles.entries()) {
      const existing = filesByPath.get(filePath);
      if (existing) {
        existing.matchedAppenderNames = [...new Set([...existing.matchedAppenderNames, ...sources])];
        existing.sourceHints = [...new Set([...existing.sourceHints, 'configured'])];
        continue;
      }

      try {
        const stats = await statRemotePath(sftp, filePath);
        const readable = stats.isFile() ? await canReadFile(sftp, filePath) : false;
        pushFile({
          path: filePath,
          name: path.posix.basename(filePath),
          size: typeof stats.size === 'number' ? stats.size : null,
          modifiedAt: typeof stats.mtime === 'number' ? new Date(stats.mtime * 1000).toISOString() : null,
          readable,
          sourceHints: ['configured'],
          matchedAppenderNames: sources,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Configured log path ${filePath} is not currently readable: ${message}`);
        pushFile({
          path: filePath,
          name: path.posix.basename(filePath),
          size: null,
          modifiedAt: null,
          readable: false,
          sourceHints: ['configured'],
          matchedAppenderNames: sources,
        });
      }
    }

    for (const appender of appenders.filter((candidate) => candidate.isDynamicFile && candidate.fileName)) {
      const matcher = patternToRegExp(appender.fileName!);
      const dynamicMatches = directoryEntries
        .filter((entry) => entry.attrs.isFile() && matcher.test(entry.filename))
        .map((entry) => normalizeRemotePath(path.posix.join(resolvedLogsDir, entry.filename)));

      appender.matchedDynamicFiles = dynamicMatches;
      if (!dynamicMatches.length) {
        warnings.push(`Appender ${appender.name} uses dynamic file pattern ${appender.fileName} but no current files matched in ${resolvedLogsDir}.`);
        continue;
      }

      for (const matchPath of dynamicMatches) {
        const existing = filesByPath.get(matchPath);
        if (existing) {
          existing.matchedAppenderNames = [...new Set([...existing.matchedAppenderNames, appender.name])];
          existing.sourceHints = [...new Set([...existing.sourceHints, 'dynamic-match'])];
        }
      }
    }

    const files = [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
    const readableFiles = files.filter((file) => file.readable);

    return {
      success: true,
      message: `Discovered ${appenders.length} appenders, ${loggers.length} loggers, and ${readableFiles.length} readable log files.`,
      inspectedAt: new Date().toISOString(),
      host: config.host.trim(),
      port: Number(config.port),
      username: config.username.trim(),
      configPath: normalizedConfigPath,
      configDirectory: resolveBaseDirectory(normalizedConfigPath),
      logsDir: logsDirValue,
      resolvedLogsDir,
      packetLogFile: packetLogFileValue,
      appenders,
      loggers,
      files,
      warnings,
    };
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Unable to inspect remote logs: ${message}`,
      inspectedAt: new Date().toISOString(),
      host: config.host.trim(),
      port: Number(config.port),
      username: config.username.trim(),
      configPath: normalizeRemotePath(config.worldserverConfigPath),
      configDirectory: resolveBaseDirectory(config.worldserverConfigPath),
      logsDir: null,
      resolvedLogsDir: null,
      packetLogFile: null,
      appenders: [],
      loggers: [],
      files: [],
      warnings: [],
    };
  });
}

export async function readRemoteLogTail(config: LogMonitorConfig, remotePath: string, maxBytes = 32 * 1024): Promise<LogMonitorFileTailResult> {
  return withSftp(config, async (sftp) => {
    const normalizedPath = normalizeRemotePath(remotePath);
    const stats = await statRemotePath(sftp, normalizedPath);
    if (!stats.isFile()) {
      return {
        success: false,
        path: normalizedPath,
        content: '',
        bytesRead: 0,
        truncated: false,
        message: 'The selected path is not a readable file.',
      };
    }

    const size = Math.max(Number(stats.size || 0), 0);
    const bytesToRead = Math.min(size, Math.max(1024, maxBytes));
    const start = Math.max(0, size - bytesToRead);
    const buffer = await readFileRange(sftp, normalizedPath, start, bytesToRead);

    return {
      success: true,
      path: normalizedPath,
      content: buffer.toString('utf8'),
      bytesRead: buffer.byteLength,
      truncated: start > 0,
      message: start > 0 ? `Showing the last ${buffer.byteLength.toLocaleString()} bytes.` : 'Showing the full file contents.',
    };
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      path: normalizeRemotePath(remotePath),
      content: '',
      bytesRead: 0,
      truncated: false,
      message: `Unable to read remote log tail: ${message}`,
    };
  });
}