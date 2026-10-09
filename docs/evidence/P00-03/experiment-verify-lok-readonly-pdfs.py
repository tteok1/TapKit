import json,pathlib,hashlib,ctypes as c
from pypdf import PdfReader
import pypdfium2 as pdfium
root=pathlib.Path("D:/TapKit");out=root/"docs/evidence/P00-03"
r=json.loads((out/"lok-readonly-alias-verified.json").read_text(encoding="utf-8"));w=pathlib.Path(r["workspace"]);result=[]
for ext in ["docx","xlsx","pptx"]:
    p=w/("converted-"+ext+".pdf");reader=PdfReader(p);text="\n".join(page.extract_text() for page in reader.pages);doc=pdfium.PdfDocument(str(p))
    pixels=doc[0].render(scale=1.2).to_pil();from PIL import Image
    previous=Image.open(out/("lok-three-"+ext+"-1.png"));same=pixels.tobytes()==previous.tobytes()
    result.append({"format":ext,"pages":len(reader.pages),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"titlePresent":"TapKit 隔离转换验收" in text,"pixelsMatchVisuallyReviewedOutput":same})
k=c.WinDLL("kernel32",use_last_error=True);k.QueryDosDeviceW.argtypes=[c.c_wchar_p,c.c_wchar_p,c.c_uint];devices=[]
for drive in ["X:","Y:","Z:"]:
    buf=c.create_unicode_buffer(32768);c.set_last_error(0);n=k.QueryDosDeviceW(drive,buf,len(buf));devices.append({"drive":drive,"exists":bool(n),"target":buf.value if n else None,"error":c.get_last_error() if not n else 0})
report={"files":result,"temporaryDrivesAfterCleanup":devices,"visualReview":"Prior three rendered PNGs inspected: Chinese readable without missing glyphs. Current PDF renders must match pixel-for-pixel."}
(out/"lok-readonly-pdf-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report))
assert all(x["pages"]==1 and x["titlePresent"] and x["pixelsMatchVisuallyReviewedOutput"] for x in result)
assert all(not x["exists"] and x["error"]==2 for x in devices)
