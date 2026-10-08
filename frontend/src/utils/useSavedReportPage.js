import { useEffect } from 'react';
import { savedReportPage } from './savedReportOrder';

export default function useSavedReportPage(records, savedUpdate, perPage, setPage) {
  const savedId = typeof savedUpdate === 'object' ? savedUpdate?.id : savedUpdate;
  const targetPage = savedReportPage(records, savedId, perPage);
  useEffect(() => {
    if (targetPage !== null) setPage(targetPage);
  }, [targetPage, savedUpdate, setPage]);
}
