from pathlib import Path

import pythoncom
import win32com.client


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "templates" / "ai-assistant-monthly-report-template.docx"
TARGET = ROOT / "output" / "templates" / "ai-assistant-monthly-report-template.hwpx"
PREVIEW = ROOT / "tmp" / "pdfs" / "hwpx-render" / "ai-assistant-monthly-report-template.pdf"


def main():
    pythoncom.CoInitialize()
    hwp = None
    try:
        hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = False
        opened = hwp.Open(str(SOURCE), "", "forceopen:true;suspendpassword:true")
        if not opened:
            raise RuntimeError(f"한글에서 DOCX를 열지 못했습니다: {SOURCE}")
        saved = hwp.SaveAs(str(TARGET), "HWPX", "")
        if not saved:
            raise RuntimeError(f"한글에서 HWPX를 저장하지 못했습니다: {TARGET}")
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        rendered = hwp.SaveAs(str(PREVIEW), "PDF", "")
        if not rendered:
            raise RuntimeError(f"한글에서 검증용 PDF를 저장하지 못했습니다: {PREVIEW}")
        print(TARGET)
    finally:
        if hwp is not None:
            try:
                hwp.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    main()
