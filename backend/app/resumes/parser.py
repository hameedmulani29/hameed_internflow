import io
import re
import logging

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def validate_pdf_file(file_bytes: bytes, filename: str | None = None) -> tuple[bool, str | None]:
    if not file_bytes or len(file_bytes) == 0:
        return False, 'Uploaded file is empty.'

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, f'File size exceeds the 10 MB limit ({len(file_bytes) // (1024 * 1024)} MB).'

    if filename and not filename.casefold().endswith('.pdf'):
        return False, 'Only PDF resume files (.pdf) are supported.'

    # Check PDF magic header
    if not file_bytes.startswith(b'%PDF-'):
        return False, 'File is not a valid PDF document.'

    return True, None


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    valid, err_msg = validate_pdf_file(file_bytes)
    if not valid:
        raise ValueError(err_msg)

    extracted_text = ''

    # Try PyPDF if available
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        page_texts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                page_texts.append(t)
        extracted_text = '\n'.join(page_texts).strip()
    except Exception as py_err:
        logger.warning(f'pypdf extraction skipped: {py_err}')

    # Fallback to stream regex extraction if pypdf didn't produce text
    if not extracted_text:
        try:
            # Extract plain text strings inside PDF stream objects
            matches = re.findall(b'\\((.*?)\\)\\s*TJ', file_bytes, flags=re.DOTALL)
            if matches:
                extracted_text = ' '.join(m.decode('utf-8', errors='ignore') for m in matches)
            else:
                matches_simple = re.findall(b'\\((.*?)\\)\\s*Tj', file_bytes, flags=re.DOTALL)
                extracted_text = ' '.join(m.decode('utf-8', errors='ignore') for m in matches_simple)
        except Exception as fallback_err:
            logger.warning(f'Fallback PDF regex extraction skipped: {fallback_err}')

    cleaned = re.sub(r'\s+', ' ', extracted_text).strip()
    if not cleaned:
        raise ValueError('Could not extract readable text from PDF file. Ensure the PDF contains selectable text.')

    return cleaned
