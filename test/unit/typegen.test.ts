import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateTypeScriptDeclarations,
  mapGristTypeToTs,
  sanitizeInterfaceName,
  formatPropertyKey,
  fetchDocSchema,
} from "../../src/cli/typegen";
import { runCli } from "../../src/cli/index";
import { GristClient } from "../../src/client/GristClient";
import { spawnSync, execSync } from "node:child_process";

describe("Typegen Generator", () => {
  it("maps Grist column types to TypeScript types correctly", () => {
    const schema = {
      tables: [
        {
          id: "Users",
          columns: [
            { id: "Name", fields: { type: "Text" } },
            { id: "Age", fields: { type: "Int" } },
            { id: "IsActive", fields: { type: "Bool" } },
            { id: "Tags", fields: { type: "ChoiceList" } },
          ],
        },
      ],
    };

    const output = generateTypeScriptDeclarations(schema);
    expect(output).toContain("export interface UsersRow {");
    expect(output).toContain("Name: string;");
    expect(output).toContain("Age: number;");
    expect(output).toContain("IsActive: boolean;");
    expect(output).toContain("Tags: string[];");
    expect(output).toContain("export interface GristTables {");
    expect(output).toContain("Users: UsersRow;");
  });

  describe("mapGristTypeToTs", () => {
    it("maps all standard and extended Grist column types", () => {
      expect(mapGristTypeToTs("Text")).toBe("string");
      expect(mapGristTypeToTs("String")).toBe("string");
      expect(mapGristTypeToTs("Numeric")).toBe("number");
      expect(mapGristTypeToTs("Int")).toBe("number");
      expect(mapGristTypeToTs("Integer")).toBe("number");
      expect(mapGristTypeToTs("ManualSortPos")).toBe("number");
      expect(mapGristTypeToTs("Bool")).toBe("boolean");
      expect(mapGristTypeToTs("Boolean")).toBe("boolean");
      expect(mapGristTypeToTs("Date")).toBe("string | number");
      expect(mapGristTypeToTs("Date:YYYY-MM-DD")).toBe("string | number");
      expect(mapGristTypeToTs("DateTime")).toBe("number");
      expect(mapGristTypeToTs("DateTime:America/New_York")).toBe("number");
      expect(mapGristTypeToTs("Choice")).toBe("string");
      expect(mapGristTypeToTs("ChoiceList")).toBe("string[]");
      expect(mapGristTypeToTs("Ref")).toBe("number");
      expect(mapGristTypeToTs("Ref:Customers")).toBe("number");
      expect(mapGristTypeToTs("RefList")).toBe("number[]");
      expect(mapGristTypeToTs("RefList:Orders")).toBe("number[]");
      expect(mapGristTypeToTs("Attachments")).toBe("number[]");
      expect(mapGristTypeToTs("Attachment")).toBe("number[]");
      expect(mapGristTypeToTs("UnknownType")).toBe("unknown");
      expect(mapGristTypeToTs(undefined)).toBe("unknown");
      expect(mapGristTypeToTs("")).toBe("unknown");
    });
  });

  describe("Identifier sanitization & quoting", () => {
    it("formats property keys correctly", () => {
      expect(formatPropertyKey("validName")).toBe("validName");
      expect(formatPropertyKey("_valid_123$")).toBe("_valid_123$");
      expect(formatPropertyKey("Order Total")).toBe("'Order Total'");
      expect(formatPropertyKey("user-id")).toBe("'user-id'");
      expect(formatPropertyKey("123start")).toBe("'123start'");
      expect(formatPropertyKey("it's ok")).toBe("'it\\\'s ok'");
    });

    it("sanitizes interface names safely", () => {
      expect(sanitizeInterfaceName("Users")).toBe("Users");
      expect(sanitizeInterfaceName("Order Details")).toBe("Order_Details");
      expect(sanitizeInterfaceName("123Table")).toBe("_123Table");
      expect(sanitizeInterfaceName("")).toBe("Table");
    });

    it("quotes column IDs with spaces, hyphens, and symbols in declarations", () => {
      const schema = {
        tables: [
          {
            id: "Orders",
            columns: [
              { id: "Order Total", fields: { type: "Numeric" } },
              { id: "customer-id", fields: { type: "Ref:Customers" } },
              { id: "Special/Notes", fields: { type: "Text" } },
            ],
          },
        ],
      };

      const output = generateTypeScriptDeclarations(schema);
      expect(output).toContain("'Order Total': number;");
      expect(output).toContain("'customer-id': number;");
      expect(output).toContain("'Special/Notes': string;");
    });

    it("generates registry for multiple tables and avoids interface name collisions", () => {
      const schema = {
        tables: [
          {
            id: "Order Items",
            columns: [{ id: "qty", fields: { type: "Int" } }],
          },
          {
            id: "Order-Items",
            columns: [{ id: "price", fields: { type: "Numeric" } }],
          },
        ],
      };

      const output = generateTypeScriptDeclarations(schema);
      expect(output).toContain("export interface Order_ItemsRow {");
      expect(output).toContain("export interface Order_Items_2Row {");
      expect(output).toContain("export interface GristTables {");
      expect(output).toContain("'Order Items': Order_ItemsRow;");
      expect(output).toContain("'Order-Items': Order_Items_2Row;");
    });
  });

  describe("fetchDocSchema", () => {
    it("fetches tables and columns from GristClient REST resources", async () => {
      const mockTablesList = vi.fn().mockResolvedValue([
        { id: "TableA" },
        { id: "TableB" },
      ]);
      const mockColumnsList = vi.fn().mockImplementation((_docId, tableId) => {
        if (tableId === "TableA") {
          return Promise.resolve([
            { id: "Col1", fields: { type: "Text" } },
          ]);
        }
        return Promise.resolve([
          { id: "Col2", fields: { type: "Int" } },
        ]);
      });

      const mockClient = {
        raw: {
          tables: { list: mockTablesList },
          columns: { list: mockColumnsList },
        },
      } as unknown as GristClient;

      const schema = await fetchDocSchema(mockClient, "docXYZ");

      expect(mockTablesList).toHaveBeenCalledWith("docXYZ");
      expect(mockColumnsList).toHaveBeenCalledWith("docXYZ", "TableA");
      expect(mockColumnsList).toHaveBeenCalledWith("docXYZ", "TableB");
      expect(schema).toEqual({
        tables: [
          {
            id: "TableA",
            columns: [{ id: "Col1", fields: { type: "Text" } }],
          },
          {
            id: "TableB",
            columns: [{ id: "Col2", fields: { type: "Int" } }],
          },
        ],
      });
    });
  });

  describe("CLI runner (runCli)", () => {
    let tempDir: string;
    const originalEnv = { ...process.env };

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grist-typegen-test-"));
      delete process.env.GRIST_API_KEY;
      delete process.env.GRIST_SERVER;
    });

    afterEach(async () => {
      process.env = { ...originalEnv };
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("displays help when --help is passed", async () => {
      const stdoutLines: string[] = [];
      await runCli(["--help"], {
        stdout: (msg) => stdoutLines.push(msg),
      });

      const joined = stdoutLines.join("\n");
      expect(joined).toContain("Usage: grist-sdk [typegen]");
      expect(joined).toContain("--doc <docId|url>");
    });

    it("throws error when document ID is missing", async () => {
      await expect(runCli([])).rejects.toThrow("Document ID or URL is required");
    });

    it("outputs declarations to stdout when --out - is specified", async () => {
      const mockClient = {
        raw: {
          tables: {
            list: vi.fn().mockResolvedValue([{ id: "Customers" }]),
          },
          columns: {
            list: vi.fn().mockResolvedValue([
              { id: "Name", fields: { type: "Text" } },
              { id: "Balance", fields: { type: "Numeric" } },
            ]),
          },
        },
      } as unknown as GristClient;

      const stdoutLines: string[] = [];
      await runCli(["--doc", "doc123", "--out", "-"], {
        client: mockClient,
        stdout: (msg) => stdoutLines.push(msg),
      });

      const output = stdoutLines.join("\n");
      expect(output).toContain("export interface CustomersRow {");
      expect(output).toContain("Name: string;");
      expect(output).toContain("Balance: number;");
    });

    it("supports positional syntax: grist-sdk typegen <docId>", async () => {
      const mockClient = {
        raw: {
          tables: {
            list: vi.fn().mockResolvedValue([{ id: "Items" }]),
          },
          columns: {
            list: vi.fn().mockResolvedValue([
              { id: "SKU", fields: { type: "Text" } },
            ]),
          },
        },
      } as unknown as GristClient;

      const stdoutLines: string[] = [];
      await runCli(["typegen", "myDocId", "--out", "-"], {
        client: mockClient,
        stdout: (msg) => stdoutLines.push(msg),
      });

      const output = stdoutLines.join("\n");
      expect(output).toContain("export interface ItemsRow {");
      expect(output).toContain("SKU: string;");
    });

    it("writes declarations to specified file path", async () => {
      const mockClient = {
        raw: {
          tables: {
            list: vi.fn().mockResolvedValue([{ id: "Tasks" }]),
          },
          columns: {
            list: vi.fn().mockResolvedValue([
              { id: "Title", fields: { type: "Text" } },
              { id: "Done", fields: { type: "Bool" } },
            ]),
          },
        },
      } as unknown as GristClient;

      const outFile = path.join(tempDir, "types", "grist.d.ts");
      const stdoutLines: string[] = [];

      await runCli(["--doc", "docTasks", "--out", outFile], {
        client: mockClient,
        stdout: (msg) => stdoutLines.push(msg),
      });

      const fileContent = await fs.readFile(outFile, "utf-8");
      expect(fileContent).toContain("export interface TasksRow {");
      expect(fileContent).toContain("Title: string;");
      expect(fileContent).toContain("Done: boolean;");
      expect(stdoutLines.join("\n")).toContain("Successfully generated TypeScript declarations");
    });

    it("runs bin/grist-sdk.js executable binary via node", () => {
      const binPath = path.resolve(__dirname, "../../bin/grist-sdk.js");
      const result = spawnSync(process.execPath, [binPath, "--help"], {
        encoding: "utf-8",
        env: process.env,
      });
      if (result.status !== 0) {
        // If dist hasn't been built yet in an isolated test run, build it and re-run
        execSync("pnpm run build", {
          cwd: path.resolve(__dirname, "../.."),
          stdio: "ignore",
        });
        const retryResult = spawnSync(process.execPath, [binPath, "--help"], {
          encoding: "utf-8",
          env: process.env,
        });
        expect(retryResult.status).toBe(0);
        expect(retryResult.stdout).toContain("Usage: grist-sdk [typegen]");
        return;
      }
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: grist-sdk [typegen]");
    });

    it("extracts doc ID and team server URL when doc URL is provided", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tables: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      globalThis.fetch = mockFetch;

      try {
        await runCli([
          "--doc",
          "https://myteam.getgrist.com/o/myteam/doc12345/My-Project",
          "--out",
          "-",
        ], {
          stdout: () => {},
        });

        expect(mockFetch).toHaveBeenCalledWith(
          "https://myteam.getgrist.com/o/myteam/api/docs/doc12345/tables",
          expect.anything()
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("prioritizes URL-extracted team server over ambient GRIST_SERVER", async () => {
      process.env.GRIST_SERVER = "https://ambient.getgrist.com";

      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tables: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      globalThis.fetch = mockFetch;

      try {
        await runCli([
          "--doc",
          "https://myteam.getgrist.com/o/myteam/doc12345/My-Project",
          "--out",
          "-",
        ], {
          stdout: () => {},
        });

        expect(mockFetch).toHaveBeenCalledWith(
          "https://myteam.getgrist.com/o/myteam/api/docs/doc12345/tables",
          expect.anything()
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("prioritizes explicit --server flag over URL-extracted team server", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tables: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      globalThis.fetch = mockFetch;

      try {
        await runCli([
          "--doc",
          "https://myteam.getgrist.com/o/myteam/doc12345/My-Project",
          "--server",
          "https://override.getgrist.com",
          "--out",
          "-",
        ], {
          stdout: () => {},
        });

        expect(mockFetch).toHaveBeenCalledWith(
          "https://override.getgrist.com/api/docs/doc12345/tables",
          expect.anything()
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
