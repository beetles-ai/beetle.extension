import * as vscode from 'vscode';
import { LENS_API_BASE_URL_DEFAULT, LENS_API_KEY_DEFAULT } from '../utils/constants';

// ── Response shapes matching beetle-lens-server metrics.controller ────────────

export interface FunctionMetrics {
  functionName:  string;
  filePath:      string;
  lineNumber:    number | null;
  serviceName:   string;
  environment:   string;
  window:        string;
  sampleCount:   number;
  lowConfidence: boolean;
  metrics: {
    qps:          number;
    errorRatePct: number;
    avgLatencyMs: number;
    p50Ms:        number;
    p95Ms:        number;
    p99Ms:        number;
    maxLatencyMs: number;
  };
  callers: Array<{
    httpMethod:        string;
    httpRoute:         string;
    callCount:         number;
    trafficPct:        number;
    fnAvgLatencyMs:    number;
    routeAvgLatencyMs: number;
  }>;
}

export interface FileFunctionEntry {
  functionName:  string;
  lineNumber:    number | null;
  sampleCount:   number;
  lowConfidence: boolean;
  avgLatencyMs:  number;
  p95Ms:         number;
  errorRatePct:  number;
  qps:           number;
}

export interface FileMetrics {
  filePath:    string;
  serviceName: string;
  environment: string;
  window:      string;
  functions:   FileFunctionEntry[];
}

export interface RouteMetrics {
  httpMethod:    string;
  httpRoute:     string;
  serviceName:   string;
  environment:   string;
  window:        string;
  sampleCount:   number;
  lowConfidence: boolean;
  metrics: {
    qps:          number;
    errorRatePct: number;
    avgLatencyMs: number;
    p95Ms:        number;
    p99Ms:        number;
    maxLatencyMs: number;
  };
  functions: Array<{
    functionName:     string;
    filePath:         string;
    lineNumber:       number | null;
    callCount:        number;
    fnAvgLatencyMs:   number;
    pctOfRequestTime: number;
  }>;
}

function cfg(): { baseUrl: string; apiKey: string; serviceName: string; environment: string } {
  const c = vscode.workspace.getConfiguration('beetle.lens');
  return {
    baseUrl:     c.get<string>('serverUrl')     ?? LENS_API_BASE_URL_DEFAULT,
    apiKey:      c.get<string>('apiKey')        ?? LENS_API_KEY_DEFAULT,
    serviceName: c.get<string>('serviceName')   ?? '',
    environment: c.get<string>('environment')   ?? 'development',
  };
}

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const { baseUrl, apiKey } = cfg();
  const qs = new URLSearchParams(params).toString();
  const url = `${baseUrl}${path}?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export async function fetchFileMetrics(filePath: string): Promise<FileMetrics | null> {
  const { serviceName, environment } = cfg();
  if (!serviceName) return null;

  return get<FileMetrics>('/api/metrics/file', { serviceName, filePath, environment });
}

export async function fetchRouteMetrics(httpMethod: string, httpRoute: string): Promise<RouteMetrics | null> {
  const { serviceName, environment } = cfg();
  if (!serviceName) return null;

  return get<RouteMetrics>('/api/metrics/route', { serviceName, httpMethod, httpRoute, environment });
}

export interface RouteSummary {
  httpMethod:    string;
  httpRoute:     string;
  sampleCount:   number;
  avgLatencyMs:  number;
  p95Ms:         number;
  errorRatePct:  number;
  lowConfidence: boolean;
}

export async function fetchAllRoutes(): Promise<RouteSummary[]> {
  const { serviceName, environment } = cfg();
  if (!serviceName) return [];

  const result = await get<RouteSummary[]>('/api/metrics/routes', { serviceName, environment });
  return result ?? [];
}
