import jsPDF from 'jspdf'
import 'jspdf-autotable'

// Type declaration for jspdf-autotable to satisfy TypeScript
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
    lastAutoTable: { finalY: number }
  }
}

interface ReportData {
  companyName: string
  totalEvents: number
  blockedCount: number
  warnedCount: number
  typeBreakdown: { name: string, count: number }[]
  toolBreakdown: { name: string, count: number }[]
}

export function generateComplianceReport(data: ReportData) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  
  // --- HEADER ---
  doc.setFontSize(22)
  doc.setTextColor(37, 99, 235) // Brand Blue
  doc.text('ShadowAI Guard', 14, 22)
  
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text('Data Leak Prevention Compliance Report', 14, 30)
  
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 38)
  doc.text(`Organization: ${data.companyName}`, 14, 44)
  
  // Divider line
  doc.setDrawColor(220, 220, 220)
  doc.line(14, 48, pageWidth - 14, 48)
  
  // --- SECTION 1: EXECUTIVE SUMMARY ---
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text('1. Executive Summary', 14, 58)
  
  doc.setFontSize(10)
  doc.text('During the reporting period, ShadowAI Guard monitored all web inputs across your organization.', 14, 66)
  doc.text(`Total sensitive data submission attempts intercepted: ${data.totalEvents}`, 14, 74)
  
  doc.setTextColor(220, 38, 38) // Red for blocked
  doc.text(`• Blocked (Prevented from sending): ${data.blockedCount}`, 18, 82)
  
  doc.setTextColor(245, 158, 11) // Yellow/Orange for warned
  doc.text(`• Warned (User prompted before sending): ${data.warnedCount}`, 18, 90)
  
  doc.setTextColor(0, 0, 0)
  
  // --- SECTION 2: DATA TYPE BREAKDOWN ---
  doc.setFontSize(14)
  doc.text('2. Sensitive Data Types Detected', 14, 106)
  
  if (data.typeBreakdown.length > 0) {
    doc.autoTable({
      head: [['Data Type', 'Incident Count']],
      body: data.typeBreakdown.map(t => [t.name.replace('_', ' '), t.count.toString()]),
      startY: 112,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    })
  } else {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text('No incidents recorded in this period.', 14, 112)
    doc.setTextColor(0, 0, 0)
  }
  
  // --- SECTION 3: TOOL BREAKDOWN ---
  const currentY = doc.lastAutoTable?.finalY || 120
  doc.setFontSize(14)
  doc.text('3. Destination Websites / AI Tools', 14, currentY + 14)
  
  if (data.toolBreakdown.length > 0) {
    doc.autoTable({
      head: [['Website / Tool', 'Incident Count']],
      body: data.toolBreakdown.map(t => [t.name, t.count.toString()]),
      startY: currentY + 20,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    })
  }
  
  // --- SECTION 4: COMPLIANCE ALIGNMENT ---
  const finalY = doc.lastAutoTable?.finalY || currentY + 40
  doc.setFontSize(14)
  doc.text('4. Regulatory Compliance Alignment (UAE PDPL & GDPR)', 14, finalY + 14)
  
  doc.setFontSize(10)
  const complianceText = [
    'This report demonstrates your organization\'s proactive technical measures to prevent unauthorized',
    'data disclosure, aligning with key principles of the UAE Personal Data Protection Law (PDPL) and',
    'the EU General Data Protection Regulation (GDPR).',
    '',
    '• Data Minimization & Privacy by Design: ShadowAI Guard operates 100% locally in the browser.',
    '  Raw sensitive text is NEVER transmitted to our servers. Only anonymized metadata (counts and',
    '  categories) is recorded for auditing.',
    '• Security of Processing: Automated technical measures are in place to prevent accidental or',
    '  unlawful destruction, loss, or alteration of personal data.',
    '• Accountability: This audit log provides verifiable proof of your DLP policies and employee',
    '  awareness, satisfying regulatory audit requirements.'
  ]
  doc.text(complianceText, 14, finalY + 22)
  
  // --- FOOTER ---
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `ShadowAI Guard Compliance Report | Confidential | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }
  
  // Trigger download
  doc.save(`ShadowAI_Guard_Report_${new Date().toISOString().split('T')[0]}.pdf`)
}
