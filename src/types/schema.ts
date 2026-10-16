/**
 * Global interface that can be augmented by users or grist-typegen
 * to register document table schemas for bracketless typing.
 *
 * @example
 * ```ts
 * declare module 'grist-api-sdk' {
 *   interface RegisterGristTables {
 *     tables: GristTables;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RegisterGristTables {}

/**
 * Resolves the registered Grist tables from `RegisterGristTables`,
 * falling back to `Record<string, any>` if not augmented.
 */
export type DefaultGristTables = RegisterGristTables extends { tables: infer T }
  ? T extends Record<string, object>
    ? T
    : Record<string, any>
  : Record<string, any>;
