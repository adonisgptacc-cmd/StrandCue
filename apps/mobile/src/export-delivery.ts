import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ExportDownload } from './export-api';

export class ExportDeliveryError extends Error {
  constructor() {
    super('Export file could not be prepared or shared. Please try again.');
    this.name = 'ExportDeliveryError';
  }
}

function serialize(download: ExportDownload): string {
  if (download.format === 'csv') {
    if (typeof download.document !== 'string') throw new ExportDeliveryError();
    return download.document;
  }

  const contents = JSON.stringify(download.document, null, 2);
  if (contents === undefined) throw new ExportDeliveryError();
  return `${contents}\n`;
}

export async function shareExportDownload(download: ExportDownload): Promise<void> {
  let file: File | undefined;
  try {
    if (!await Sharing.isAvailableAsync()) throw new ExportDeliveryError();
    file = new File(Paths.cache, `strandcue-export-${download.jobId}.${download.format}`);
    file.write(serialize(download));
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Save or share your StrandCue export',
      mimeType: download.format === 'json' ? 'application/json' : 'text/csv',
    });
  } catch (caught) {
    if (caught instanceof ExportDeliveryError) throw caught;
    throw new ExportDeliveryError();
  } finally {
    if (file) {
      try { file.delete(); } catch { /* The OS also clears its temporary cache. */ }
    }
  }
}
