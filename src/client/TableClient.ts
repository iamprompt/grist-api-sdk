import { ColumnsResource } from '../resources/ColumnsResource';
import { RecordsResource } from '../resources/RecordsResource';
import { HttpTransport } from '../transport/HttpTransport';
import { ColumnPayload, ColumnSummary } from '../types/rest';
import { RecordManager } from './RecordManager';

/**
 * Scoped client for table operations in a specific Grist document.
 */
export class TableClient<T extends Record<string, any> = Record<string, unknown>> {
  readonly tableId: string;
  readonly records: RecordManager<T>;
  readonly columns: {
    /**
     * Lists all columns in this table.
     */
    list: () => Promise<ColumnSummary[]>;
    /**
     * Creates one or more columns in this table.
     */
    create: (
      columns: ColumnPayload | ColumnPayload[] | { columns: ColumnPayload[] }
    ) => Promise<void>;
  };

  constructor(
    _transport: HttpTransport,
    private readonly docId: string,
    tableId: string,
    resources?: {
      records?: RecordsResource;
      columns?: ColumnsResource;
    }
  ) {
    this.tableId = tableId;
    const recordsResource = resources?.records ?? new RecordsResource(_transport);
    const columnsResource = resources?.columns ?? new ColumnsResource(_transport);

    this.records = new RecordManager<T>(_transport, docId, tableId, recordsResource);

    this.columns = {
      list: () => columnsResource.list(this.docId, this.tableId),
      create: (columns) => {
        let colList: ColumnPayload[];
        if (
          columns &&
          typeof columns === 'object' &&
          'columns' in columns &&
          Array.isArray((columns as { columns: ColumnPayload[] }).columns)
        ) {
          colList = (columns as { columns: ColumnPayload[] }).columns;
        } else if (Array.isArray(columns)) {
          colList = columns;
        } else {
          colList = [columns as ColumnPayload];
        }
        return columnsResource.create(this.docId, this.tableId, { columns: colList });
      },
    };
  }
}
