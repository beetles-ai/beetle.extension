import * as vscode from 'vscode';
import { fetchFileMetrics, fetchAllRoutes, FileFunctionEntry, RouteSummary } from './LensApiClient';

// ── Regex patterns to detect route/function definitions ──────────────────────

// Express route: router.get('/path', ...) or app.post('/path', ...)
const ROUTE_PATTERN = /(?:router|app)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/;

// Named function: async function foo( or const foo = async ( or export async function foo(
const FUNCTION_PATTERN = /(?:async\s+function\s+(\w+)|(?:const|let|export\s+const)\s+(\w+)\s*=\s*async\s*(?:\([^)]*\)|\w+)\s*=>)/;

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(0)}ms`;
}

function formatLabel(entry: FileFunctionEntry): string {
  const errPart = entry.errorRatePct > 0 ? `  ⚠ ${entry.errorRatePct.toFixed(1)}% err` : '';
  const conf = entry.lowConfidence ? '  · low data' : '';
  return `$(bug) ${entry.sampleCount} calls  |  ${formatMs(entry.avgLatencyMs)} avg  |  p95 ${formatMs(entry.p95Ms)}${errPart}${conf}`;
}

function formatRouteLabel(r: RouteSummary): string {
  const errPart = r.errorRatePct > 0 ? `  ⚠ ${r.errorRatePct.toFixed(1)}% err` : '';
  const conf = r.lowConfidence ? '  · low data' : '';
  return `$(bug) ${r.sampleCount} calls  |  ${formatMs(r.avgLatencyMs)} avg  |  p95 ${formatMs(r.p95Ms)}${errPart}${conf}`;
}

// Match by method + suffix: file has router.get('/slow') but ClickHouse stored /external/slow.
function matchRoute(method: string, pathSegment: string, allRoutes: RouteSummary[]): RouteSummary | undefined {
  const upperMethod = method.toUpperCase();
  const candidates = allRoutes.filter(r =>
    r.httpMethod === upperMethod &&
    (r.httpRoute === pathSegment || r.httpRoute.endsWith(pathSegment))
  );
  if (candidates.length === 0) return undefined;
  return candidates.find(r => r.httpRoute === pathSegment) ?? candidates[0];
}

export class LensCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Cache: filePath → function metrics, refreshed every 30s
  private fileCache = new Map<string, { functions: FileFunctionEntry[]; fetchedAt: number }>();
  // Cache: all routes for the configured service
  private routesCache: { routes: RouteSummary[]; fetchedAt: number } | null = null;

  private readonly CACHE_TTL_MS = 30_000;

  constructor() {}

  public refresh(): void {
    this.fileCache.clear();
    this.routesCache = null;
    this._onDidChangeCodeLenses.fire();
  }

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(document.languageId)) {
      return [];
    }

    const filePath = this.normaliseFilePath(document.uri.fsPath);
    const lenses: vscode.CodeLens[] = [];
    const lines = document.getText().split('\n');

    // Fetch both in parallel — one file call + one service-wide routes call (both cached 30s)
    const [fileMetrics, allRoutes] = await Promise.all([
      this.getFileMetrics(filePath),
      this.getAllRoutes(),
    ]);

    const fnMap = new Map<string, FileFunctionEntry>(
      fileMetrics.map(f => [f.functionName, f])
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const range = new vscode.Range(i, 0, i, 0);

      // ── Match Express route definitions ────────────────────────────────────
      const routeMatch = ROUTE_PATTERN.exec(line);
      if (routeMatch) {
        const method      = routeMatch[1];
        const pathSegment = routeMatch[2];

        const matched = matchRoute(method, pathSegment, allRoutes);
        if (matched) {
          lenses.push(new vscode.CodeLens(range, {
            title:     formatRouteLabel(matched),
            command:   'beetle.lens.showRouteDetail',
            arguments: [matched],
          }));
        } else {
          lenses.push(new vscode.CodeLens(range, {
            title:   '🌐 No data yet — hit this route to start profiling',
            command: '',
          }));
        }
        continue;
      }

      // ── Match named function definitions ───────────────────────────────────
      const fnMatch = FUNCTION_PATTERN.exec(line);
      if (fnMatch) {
        const fnName = fnMatch[1] ?? fnMatch[2];
        if (!fnName) continue;

        const entry = fnMap.get(fnName);
        if (entry) {
          lenses.push(new vscode.CodeLens(range, {
            title:     formatLabel(entry),
            command:   'beetle.lens.showFunctionDetail',
            arguments: [entry, filePath],
          }));
        }
      }
    }

    return lenses;
  }

  private async getFileMetrics(filePath: string): Promise<FileFunctionEntry[]> {
    const cached = this.fileCache.get(filePath);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return cached.functions;
    }
    const result = await fetchFileMetrics(filePath);
    const functions = result?.functions ?? [];
    this.fileCache.set(filePath, { functions, fetchedAt: Date.now() });
    return functions;
  }

  private async getAllRoutes(): Promise<RouteSummary[]> {
    if (this.routesCache && Date.now() - this.routesCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.routesCache.routes;
    }
    const routes = await fetchAllRoutes();
    this.routesCache = { routes, fetchedAt: Date.now() };
    return routes;
  }

  // Convert absolute fsPath to workspace-relative path matching what the SDK records.
  private normaliseFilePath(fsPath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return fsPath;

    for (const folder of workspaceFolders) {
      const root = folder.uri.fsPath;
      if (fsPath.startsWith(root)) {
        return fsPath.slice(root.length).replace(/^[/\\]/, '');
      }
    }
    return fsPath;
  }
}
