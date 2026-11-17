import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReportTask = {
  id?: string;
  work_date: string;
  task_title: string;
  description?: string | null;
  tag: string;
  hours_spent: number;
  status: string;
  project_or_lead_ref?: string | null;
};

export type ReportTagStat = {
  tag: string;
  hours: number;
  percentage: number;
};

export type EmployeeReportData = {
  companyName: string;
  employeeName: string;
  employeeCode: string;
  departmentName?: string;
  designationName?: string;
  periodLabel: string;
  totalHours: number;
  totalTasks: number;
  clockedHours: number;
  presentDays: number;
  leaveDays: number;
  tagsSummary: ReportTagStat[];
  tasks: ReportTask[];
};

export function downloadEmployeeReportPdf(data: EmployeeReportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 14;
  let y = margin;

  // Header Banner
  doc.setFillColor(11, 15, 25);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((data.companyName || 'MARVELSOFTWARE').toUpperCase(), margin + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Employee Work Log & Performance Summary • ${data.periodLabel}`, margin + 6, y + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(96, 165, 250);
  doc.text('WORK REPORT', pageWidth - margin - 6, y + 10, { align: 'right' });
  y += 30;

  // Employee Metadata
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  const left = margin + 2;
  const right = margin + 100;

  const printMeta = (label: string, val: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val, x + 30, yy);
  };

  printMeta('Employee:', data.employeeName, left, y);
  printMeta('Code:', data.employeeCode, right, y);
  y += 6;
  printMeta('Department:', data.departmentName || '—', left, y);
  printMeta('Designation:', data.designationName || '—', right, y);
  y += 6;
  printMeta('Reporting Period:', data.periodLabel, left, y);
  printMeta('Generated At:', new Date().toLocaleDateString('en-IN'), right, y);
  y += 10;

  // KPI Tiles Table
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    head: [['Total Task Hours', 'Total Tasks', 'Clocked Hours', 'Present Days', 'Leave Days']],
    body: [
      [
        `${data.totalHours.toFixed(1)} hrs`,
        String(data.totalTasks),
        `${data.clockedHours.toFixed(1)} hrs`,
        `${data.presentDays} days`,
        `${data.leaveDays} days`,
      ],
    ],
  });
  // @ts-expect-error autoTable adds lastAutoTable to doc
  y = (doc.lastAutoTable?.finalY || y + 20) + 8;

  // Category Breakdown Table
  if (data.tagsSummary && data.tagsSummary.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Hours Distribution by Task Category', margin, y);
    y += 4;

    const tagRows = data.tagsSummary.map((t) => [
      `#${t.tag}`,
      `${t.hours.toFixed(1)} hrs`,
      `${t.percentage.toFixed(1)}%`,
    ]);

    autoTable(doc, {
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 },
      head: [['Category / Tag', 'Hours Logged', 'Allocation %']],
      body: tagRows,
    });
    // @ts-expect-error autoTable adds lastAutoTable to doc
    y = (doc.lastAutoTable?.finalY || y + 20) + 8;
  }

  // Itemized Completed Tasks Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Detailed Task Completion Log', margin, y);
  y += 4;

  const taskRows = (data.tasks || []).map((t) => [
    t.work_date,
    t.task_title,
    `#${t.tag}`,
    `${Number(t.hours_spent || 0).toFixed(1)}h`,
    (t.status || 'completed').toUpperCase(),
    t.description || '—',
  ]);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 50 },
      2: { cellWidth: 26 },
      3: { cellWidth: 16 },
      4: { cellWidth: 22 },
      5: { cellWidth: 'auto' },
    },
    head: [['Date', 'Task Title', 'Tag', 'Hours', 'Status', 'Description / Details']],
    body: taskRows.length > 0 ? taskRows : [['—', 'No tasks logged for this period', '—', '—', '—', '—']],
  });

  const filename = `Work_Report_${data.employeeCode || 'EMP'}_${data.periodLabel.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}

export function downloadTasksCsv(tasks: ReportTask[], filename = 'tasks_completed.csv') {
  const headers = ['Date', 'Task Title', 'Category Tag', 'Hours Spent', 'Status', 'Project / Reference', 'Description'];
  const rows = tasks.map((t) => [
    `"${t.work_date || ''}"`,
    `"${(t.task_title || '').replace(/"/g, '""')}"`,
    `"${(t.tag || '').replace(/"/g, '""')}"`,
    t.hours_spent || 0,
    `"${t.status || 'completed'}"`,
    `"${(t.project_or_lead_ref || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
