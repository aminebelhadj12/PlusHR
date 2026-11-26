import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToExcel(filename: string, sheetName: string, rows: Array<Record<string, unknown>>): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportToCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: {
  filename: string;
  title: string;
  companyName: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}): void {
  const doc = new jsPDF({ orientation: params.columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`+HR  |  ${params.companyName}`, 14, 11);
  doc.setFontSize(10);
  doc.text(params.title, 14, 18);
  doc.setFontSize(8);
  doc.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, doc.internal.pageSize.getWidth() - 62, 18);

  const body = params.rows.map((r) => params.columns.map((c) => String(r[c] ?? '-')));

  autoTable(doc, {
    startY: 30,
    head: [params.columns],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(params.filename.endsWith('.pdf') ? params.filename : `${params.filename}.pdf`);
}

export function exportPayslipPdf(params: {
  companyName: string;
  reference: string;
  periodLabel: string;
  employeeName: string;
  matricule: string;
  baseSalary: number;
  bonuses: number;
  overtimePay: number;
  allowances: number;
  deductions: number;
  contributions: number;
  grossSalary: number;
  netSalary: number;
}): void {
  const doc = new jsPDF();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('+HR — Bulletin de Paie Confidentiel', 14, 13);
  doc.setFontSize(10);
  doc.text(`${params.companyName}  ·  Période ${params.periodLabel}  ·  Réf. ${params.reference}`, 14, 21);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`Employé : ${params.employeeName}`, 14, 40);
  doc.text(`Matricule : ${params.matricule}`, 14, 47);
  doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, 14, 54);

  autoTable(doc, {
    startY: 64,
    head: [['Rubrique', 'Gain (MAD)', 'Retenue (MAD)']],
    body: [
      ['Salaire de base', params.baseSalary.toFixed(2), '—'],
      ['Primes', params.bonuses.toFixed(2), '—'],
      ['Heures supplémentaires', params.overtimePay.toFixed(2), '—'],
      ['Indemnités', params.allowances.toFixed(2), '—'],
      ['Cotisations & retenues configurées', '—', params.contributions.toFixed(2)],
      ['Déductions validées', '—', params.deductions.toFixed(2)],
    ],
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 10, cellPadding: 4 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 130;
  doc.setFontSize(11);
  doc.text(`Salaire Brut : ${params.grossSalary.toFixed(2)} MAD`, 14, finalY + 14);
  doc.setFontSize(13);
  doc.setTextColor(22, 163, 74);
  doc.text(`Net à Payer : ${params.netSalary.toFixed(2)} MAD`, 14, finalY + 23);

  doc.save(`${params.reference}.pdf`);
}
