import os
import re
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfgen import canvas

def get_storage_dir() -> Path:
    storage_path = Path(os.getenv("INTERNFLOW_STORAGE_DIR", Path(__file__).resolve().parents[2] / "storage" / "certificates"))
    storage_path.mkdir(parents=True, exist_ok=True)
    return storage_path

def sanitize_certificate_id(certificate_id: str) -> str:
    # Ensure safe filename without path traversal risk
    return re.sub(r'[^A-Za-z0-9\-]', '', certificate_id)

class NumberedCanvas(canvas.Canvas):
    """Custom Canvas to draw decorative certificate borders and watermark."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_certificate_frame()
            super().showPage()
        super().save()

    def draw_certificate_frame(self):
        self.saveState()
        width, height = landscape(letter)

        # Outer background glow
        self.setFillColor(colors.HexColor("#0f172a")) # Dark slate header bar
        self.rect(0, height - 12, width, 12, fill=1, stroke=0)

        # Outer border
        self.setStrokeColor(colors.HexColor("#0f172a"))
        self.setLineWidth(4)
        self.rect(20, 20, width - 40, height - 40)

        # Inner gold/teal accent border
        self.setStrokeColor(colors.HexColor("#0ea5e9"))
        self.setLineWidth(1.5)
        self.rect(26, 26, width - 52, height - 52)

        # Corner embellishments
        corner_size = 12
        # Top-left corner
        self.line(26, height - 26 - corner_size, 26 + corner_size, height - 26)
        # Top-right corner
        self.line(width - 26 - corner_size, height - 26, width - 26, height - 26 - corner_size)
        # Bottom-left corner
        self.line(26, 26 + corner_size, 26 + corner_size, 26)
        # Bottom-right corner
        self.line(width - 26 - corner_size, 26, width - 26, 26 + corner_size)

        # Watermark / Footer seal accent line
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(1)
        self.line(50, 65, width - 50, 65)

        self.restoreState()


def generate_certificate_pdf(
    certificate_id: str,
    candidate_name: str,
    internship_title: str,
    provider_name: str,
    issue_date: str,
    verified_skills: list[str] | None = None,
    verification_url: str | None = None,
) -> str:
    """Generates a real PDF certificate artifact and returns the absolute file path on disk."""
    safe_id = sanitize_certificate_id(certificate_id)
    if not safe_id:
        raise ValueError("Invalid certificate ID provided for PDF generation.")

    target_dir = get_storage_dir()
    file_path = target_dir / f"certificate_{safe_id}.pdf"

    # PDF Document setup
    page_width, page_height = landscape(letter)
    doc = SimpleDocTemplate(
        str(file_path),
        pagesize=landscape(letter),
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CertBrand',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#0f172a'),
        alignment=1, # Center
    )

    subtitle_style = ParagraphStyle(
        'CertSub',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#0ea5e9'),
        alignment=1,
    )

    present_style = ParagraphStyle(
        'CertPresent',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#64748b'),
        alignment=1,
    )

    name_style = ParagraphStyle(
        'CertName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=32,
        textColor=colors.HexColor('#1e293b'),
        alignment=1,
    )

    body_style = ParagraphStyle(
        'CertBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#334155'),
        alignment=1,
    )

    role_style = ParagraphStyle(
        'CertRole',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        alignment=1,
    )

    provider_style = ParagraphStyle(
        'CertProvider',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0284c7'),
        alignment=1,
    )

    skills_style = ParagraphStyle(
        'CertSkills',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        alignment=1,
    )

    meta_style = ParagraphStyle(
        'CertMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748b'),
        alignment=0,
    )

    meta_right_style = ParagraphStyle(
        'CertMetaRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748b'),
        alignment=2,
    )

    story = []

    story.append(Spacer(1, 15))
    story.append(Paragraph("INTERNFLOW", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("CERTIFICATE OF COMPLETION", subtitle_style))
    story.append(Spacer(1, 15))
    story.append(Paragraph("This is to certify that", present_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(candidate_name, name_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("has successfully completed the internship program as", body_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(internship_title, role_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"hosted by <b>{provider_name}</b>", provider_style))
    story.append(Spacer(1, 12))

    if verified_skills:
        skills_str = ", ".join(verified_skills)
        story.append(Paragraph(f"<b>Verified Skills & Competencies:</b> {skills_str}", skills_style))
        story.append(Spacer(1, 12))
    else:
        story.append(Spacer(1, 12))

    # Bottom Metadata Table
    v_url = verification_url or f"https://internflow.com/verify/{safe_id}"
    date_str = issue_date.split('T')[0] if 'T' in issue_date else issue_date

    left_meta = f"<b>Certificate ID:</b> {safe_id}<br/><b>Issue Date:</b> {date_str}"
    right_meta = f"<b>Verification URL:</b><br/>{v_url}<br/><i>InternFlow Verified Document</i>"

    table_data = [
        [Paragraph(left_meta, meta_style), Paragraph(right_meta, meta_right_style)]
    ]

    table = Table(table_data, colWidths=[340, 340])
    table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))

    story.append(table)

    # Build document with custom frame canvas
    doc.build(story, canvasmaker=NumberedCanvas)

    return str(file_path.resolve())
