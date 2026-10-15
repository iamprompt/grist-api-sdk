import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { GristClient, parseDocUrl } from '../client/GristClient';
import { fetchDocSchema, generateTypeScriptDeclarations } from './typegen';

export * from './typegen';

export interface CliOptions {
  client?: GristClient;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

const HELP_TEXT = `Usage: grist-sdk [typegen] [options]

Commands:
  typegen                  Generate TypeScript declarations from Grist document schema (default)

Options:
  -d, --doc <docId|url>    Grist document ID or document URL (required)
  -o, --out <path>         Output .d.ts file path, or "-" for stdout (default: grist.d.ts)
  -k, --api-key <key>      Grist API key (or set GRIST_API_KEY env var)
  -s, --server <url>       Grist server URL (or set GRIST_SERVER env var)
  -h, --help               Show help
`;

/**
 * Main CLI entrypoint for grist-sdk / grist-typegen.
 */
export async function runCli(
  args: string[] = process.argv.slice(2),
  options?: CliOptions
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      doc: { type: 'string', short: 'd' },
      out: { type: 'string', short: 'o', default: 'grist.d.ts' },
      'api-key': { type: 'string', short: 'k' },
      server: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals[0] === 'help') {
    if (options?.stdout) {
      options.stdout(HELP_TEXT);
    } else {
      process.stdout.write(HELP_TEXT);
    }
    return;
  }

  // Resolve subcommand and doc ID
  let docInput: string | undefined =
    typeof values.doc === 'string' ? values.doc : undefined;
  if (!docInput) {
    if (positionals[0] === 'typegen') {
      docInput = positionals[1];
    } else if (positionals[0] && !positionals[0].startsWith('-')) {
      docInput = positionals[0];
    }
  }

  if (!docInput) {
    throw new Error(
      'Document ID or URL is required. Specify via --doc <docId|url> or as a positional argument.'
    );
  }

  let docId: string = docInput;
  let parsedServerUrl: string | undefined;

  if (docInput.includes('://') || docInput.includes('/')) {
    try {
      const parsed = parseDocUrl(docInput);
      docId = parsed.docId;
      parsedServerUrl = parsed.serverUrl;
    } catch {
      // If parsing as URL fails, use docInput as raw docId
    }
  }

  const apiKey =
    typeof values['api-key'] === 'string'
      ? values['api-key']
      : process.env.GRIST_API_KEY;
  const explicitServer =
    typeof values.server === 'string' ? values.server : undefined;
  const serverUrl =
    explicitServer || parsedServerUrl || process.env.GRIST_SERVER;

  const client =
    options?.client ??
    new GristClient({
      apiKey,
      serverUrl,
    });

  const schema = await fetchDocSchema(client, docId);
  const declarations = generateTypeScriptDeclarations(schema);

  const out = typeof values.out === 'string' ? values.out : 'grist.d.ts';
  if (out === '-') {
    if (options?.stdout) {
      options.stdout(declarations);
    } else {
      process.stdout.write(declarations);
    }
  } else {
    const resolvedOut = path.resolve(process.cwd(), out);
    await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
    await fs.writeFile(resolvedOut, declarations, 'utf-8');
    const msg = `Successfully generated TypeScript declarations to ${out}\n`;
    if (options?.stdout) {
      options.stdout(msg);
    } else {
      process.stdout.write(msg);
    }
  }
}
