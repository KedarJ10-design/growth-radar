import * as XLSX from 'xlsx';

export function generateExcel(data) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Dimensions
  const dimRows = data.dimensions.map(d => ({
    Name: d.name,
    Category: d.category,
    Score: d.score,
    'Updated At': d.updated_at,
  }));
  const ws1 = XLSX.utils.json_to_sheet(dimRows);
  ws1['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Dimensions');

  // Sheet 2: Snapshots
  const snapRows = [];
  data.snapshots.forEach(snap => {
    snap.data.forEach(item => {
      const dim = data.dimensions.find(d => d.id === item.id);
      snapRows.push({
        Date: snap.date,
        Dimension: dim?.name || item.id,
        Score: item.score,
      });
    });
  });
  if (snapRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(snapRows);
    ws2['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Snapshots');
  }

  // Sheet 3: Daily Logs
  const logRows = data.dailyLogs.map(l => ({
    Date: l.date,
    Dimension: l.dim_name || '—',
    Category: l.dim_category || '—',
    Activity: l.activity,
    'Duration (min)': l.duration_min,
    Notes: l.notes || '',
    Done: l.completed ? 'Yes' : 'No',
  }));
  if (logRows.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(logRows);
    ws3['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 30 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Daily Logs');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function generateCSV(data) {
  const lines = ['Name,Category,Score,Updated At'];
  data.dimensions.forEach(d => {
    lines.push(`"${d.name}","${d.category}",${d.score},"${d.updated_at}"`);
  });
  return lines.join('\n');
}
