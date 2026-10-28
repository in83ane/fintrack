// PostgreSQL 18 raw parser only: no server, SQL execution or catalog access.
import { loadModule, parseSync } from 'libpg-query';
import { requireSafe } from './guard.mjs';

await loadModule();
export const SYNTAX_VALIDATION = Object.freeze({
 parser: 'libpg-query', packageVersion: '18.2.1', serverMajor: 18,
 scope: 'Top-level SQL grammar only; no function-body, catalog, privilege or runtime validation',
});

export function assertSqlSyntax(sql, path) {
 let parsed;
 try { parsed = parseSync(sql); }
 catch { throw new Error(`SOURCE_SQL_SYNTAX_INVALID: ${path}`); }
 requireSafe(parsed.version >= 180000 && parsed.version < 190000, 'SQL_PARSER_VERSION_MISMATCH');
 requireSafe(parsed.stmts.length > 0, 'SOURCE_SQL_EMPTY');
 return parsed.stmts.length;
}

// Only for generated wrappers, after source metacommands have been rejected.
// psql directives and its one prompt variable are not PostgreSQL grammar.
export function assertGeneratedSyntax(script, path) {
 const sql = script.split('\n').filter(line => !line.startsWith('\\')).join('\n')
   .replaceAll(":'local_confirmation'", "'offline-parser-placeholder'");
 return assertSqlSyntax(sql, path);
}
